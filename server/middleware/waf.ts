/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response, NextFunction } from 'express';
import { securityService } from '../services/securityService.ts';

// Comprehensive SQL Injection detection pattern
const SQLI_REGEX = new RegExp(
  '(\\b(SELECT|UNION|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|EXEC|EXECUTE)\\b.*?\\b(FROM|INTO|TABLE|DATABASE|WHERE|SET)\\b)|' +
  '(\\bOR\\s+[\\w\'"]+\\s*=\\s*[\\w\'"]+)|(\\bAND\\s+[\\w\'"]+\\s*=\\s*[\\w\'"]+)|' +
  '(--|/\\*|\\*/|;\\s*--|WAITFOR\\s+DELAY|BENCHMARK\\s*\\(|SLEEP\\s*\\()|(\\bxp_\\w+)',
  'i'
);

// Cross-Site Scripting (XSS) detection pattern
const XSS_REGEX = new RegExp(
  '(<script\\b[^>]*>.*?</script>)|(javascript:\\s*[\\w\\.\\(\\)]+)|(<.*?on\\w+\\s*=\\s*[\'"].*?>)|' +
  '(<iframe\\b[^>]*>)|(<svg.*?onload=)|(eval\\s*\\()|(document\\.cookie)|(window\\.location)',
  'i'
);

// Directory Traversal & Sensitive File Probe pattern
const PATH_TRAVERSAL_REGEX = new RegExp(
  '(\\.\\.[\\/\\\\])|(\\/etc\\/(passwd|shadow|hosts))|(\\.(env|git|htaccess|ssh|aws)\\b)|(boot\\.ini|win\\.ini)',
  'i'
);

/**
 * Recursively inspect payload strings in object/array/primitive
 */
function scanPayload(data: any): string | null {
  if (data === null || data === undefined) return null;
  if (typeof data === 'string') {
    return data;
  }
  if (typeof data === 'object') {
    const values: string[] = [];
    for (const key of Object.keys(data)) {
      // Don't scan passwords for SQLi/XSS keywords to prevent false positives on complex passwords
      if (/password/i.test(key)) continue;
      const scanned = scanPayload(data[key]);
      if (scanned) values.push(scanned);
    }
    return values.join(' ');
  }
  return null;
}

export async function wafMiddleware(req: Request, res: Response, next: NextFunction) {
  // Always attach security response headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-WAF-Protection', 'KodiPay-Shield-v2; Active');

  // Skip WAF for static frontend assets and health check
  if (
    req.path.startsWith('/@') ||
    req.path.startsWith('/node_modules') ||
    req.path.startsWith('/src') ||
    req.path.endsWith('.js') ||
    req.path.endsWith('.css') ||
    req.path.endsWith('.png') ||
    req.path.endsWith('.svg') ||
    req.path.endsWith('.ico') ||
    req.path === '/api/health'
  ) {
    return next();
  }

  const clientIp = (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    req.ip ||
    '127.0.0.1'
  ).replace('::ffff:', '');

  const settings = await securityService.getSecuritySettings();

  // 1. IP Whitelist Check (Bypass for whitelisted IP unless simulation requested)
  const isWhitelisted = settings.ip_whitelist && settings.ip_whitelist.includes(clientIp);
  const isSimulation = req.headers['x-simulate-threat'] === 'true';

  // 2. Blocked IP Check
  if (!isWhitelisted || isSimulation) {
    const blockCheck = await securityService.isIpBlocked(clientIp);
    if (blockCheck.blocked) {
      return res.status(403).json({
        error: 'Access Denied: Your IP address has been blocked by KodiPay Security Shield due to suspicious activity.',
        code: 'WAF_IP_BLOCKED',
        reason: blockCheck.reason,
        expiresAt: blockCheck.expiresAt,
        incidentRef: `WAF-${Date.now().toString(36).toUpperCase()}`
      });
    }
  }

  // If WAF is completely disabled, continue
  if (!settings.waf_enabled) {
    return next();
  }

  // 3. DDoS / Rate Limiting (Skip for local whitelist unless simulation)
  if (settings.rate_limiting_enabled && (!isWhitelisted || isSimulation)) {
    const limitResult = securityService.checkRateLimit(clientIp, settings.rate_limit_max_requests_per_minute || 120);
    if (!limitResult.allowed) {
      await securityService.logSecurityEvent({
        eventType: 'ddos_rate_limit',
        severity: 'high',
        ipAddress: clientIp,
        endpoint: req.originalUrl || req.path,
        requestMethod: req.method,
        payloadSample: `Rate exceeded: ${limitResult.current} requests/min (Limit: ${limitResult.limit})`,
        actionTaken: 'rate_limited'
      });

      await securityService.recordIpStrike(clientIp, 'DDoS / Excessive Request Rate Breach', settings);

      return res.status(429).json({
        error: 'Too Many Requests: Rate limit exceeded. KodiPay DDoS protection triggered.',
        retryAfterSeconds: 60,
        currentRequests: limitResult.current,
        limit: limitResult.limit
      });
    }
  }

  // 4. Directory Traversal / Probe Detection
  const rawUrl = decodeURIComponent(req.originalUrl || req.url || '');
  if (PATH_TRAVERSAL_REGEX.test(rawUrl)) {
    const sample = rawUrl.slice(0, 150);
    await securityService.logSecurityEvent({
      eventType: 'path_traversal_probe',
      severity: 'high',
      ipAddress: clientIp,
      endpoint: req.path,
      requestMethod: req.method,
      payloadSample: sample,
      actionTaken: 'blocked'
    });

    await securityService.recordIpStrike(clientIp, 'Directory traversal probe attempt', settings);

    return res.status(403).json({
      error: 'Access Denied: Path Traversal / Probe payload detected and neutralized.',
      code: 'WAF_PATH_PROBE_BLOCKED'
    });
  }

  // 5. Inspect Body and Query for Attacks
  const queryStr = JSON.stringify(req.query || {});
  const bodySample = scanPayload(req.body);
  const combinedPayload = `${rawUrl} ${queryStr} ${bodySample || ''}`;

  // 5A. SQL Injection (SQLi) Inspection
  if (settings.sqli_protection) {
    if (SQLI_REGEX.test(combinedPayload)) {
      const match = combinedPayload.match(SQLI_REGEX)?.[0] || 'SQLi signature';
      await securityService.logSecurityEvent({
        eventType: 'sqli_attempt',
        severity: 'critical',
        ipAddress: clientIp,
        endpoint: req.path,
        requestMethod: req.method,
        payloadSample: `Signature: ${match} | Context: ${combinedPayload.slice(0, 200)}`,
        actionTaken: 'blocked'
      });

      await securityService.recordIpStrike(clientIp, `SQL Injection Attempt (${match})`, settings);

      return res.status(403).json({
        error: 'Security Warning: Request blocked by KodiPay Web Application Firewall (SQL Injection Protection).',
        code: 'WAF_SQLI_BLOCKED',
        incidentRef: `SQLI-${Date.now().toString(36).toUpperCase()}`
      });
    }
  }

  // 5B. Cross-Site Scripting (XSS) Inspection
  if (settings.xss_protection) {
    if (XSS_REGEX.test(combinedPayload)) {
      const match = combinedPayload.match(XSS_REGEX)?.[0] || 'XSS signature';
      await securityService.logSecurityEvent({
        eventType: 'xss_attempt',
        severity: 'high',
        ipAddress: clientIp,
        endpoint: req.path,
        requestMethod: req.method,
        payloadSample: `Signature: ${match} | Context: ${combinedPayload.slice(0, 200)}`,
        actionTaken: 'blocked'
      });

      await securityService.recordIpStrike(clientIp, `XSS Script Injection Attempt (${match})`, settings);

      return res.status(403).json({
        error: 'Security Warning: Request blocked by KodiPay Web Application Firewall (XSS Protection).',
        code: 'WAF_XSS_BLOCKED',
        incidentRef: `XSS-${Date.now().toString(36).toUpperCase()}`
      });
    }
  }

  // 6. CSRF Protection for state-changing API endpoints
  if (
    settings.csrf_protection &&
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) &&
    req.path.startsWith('/api') &&
    !req.path.startsWith('/api/auth/login') &&
    !req.path.startsWith('/api/auth/setup-first-admin') &&
    !req.path.startsWith('/api/security/simulate-threat')
  ) {
    const hasAuth = req.headers.authorization?.startsWith('Bearer ');
    const hasCustomHeader = req.headers['x-requested-with'] || req.headers['x-kodipay-csrf'];
    const origin = req.headers.origin || req.headers.referer;

    // Reject if mutating without Bearer token, custom header, or local origin
    if (!hasAuth && !hasCustomHeader && !origin) {
      await securityService.logSecurityEvent({
        eventType: 'csrf_mismatch',
        severity: 'medium',
        ipAddress: clientIp,
        endpoint: req.path,
        requestMethod: req.method,
        payloadSample: 'Missing CSRF verification tokens, Authorization headers, and origin context',
        actionTaken: 'blocked'
      });

      return res.status(403).json({
        error: 'Security Alert: CSRF protection verification failed. Missing secure origin context.',
        code: 'CSRF_MISMATCH'
      });
    }
  }

  next();
}
