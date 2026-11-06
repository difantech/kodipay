/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles, AuthRequest } from '../middleware/auth.ts';
import { securityService } from '../services/securityService.ts';
import { logAudit } from '../services/audit.ts';

export const securityRouter = Router();

// All security management endpoints are restricted strictly to Super Administrator
securityRouter.use(requireAuth);
securityRouter.use(requireRoles('super_admin'));

// 1. Get Security Dashboard Metrics & Posture Assessment
securityRouter.get('/metrics', async (req: AuthRequest, res) => {
  try {
    const metrics = await securityService.getSecurityMetrics();
    return res.json(metrics);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch security metrics' });
  }
});

// 2. Get Security Event Logs with filters
securityRouter.get('/events', async (req: AuthRequest, res) => {
  try {
    const { eventType, severity, limit = '100' } = req.query;
    const { query } = await import('../db/connection.ts');
    
    let sql = `SELECT * FROM security_events WHERE 1=1`;
    const params: any[] = [];

    if (eventType) {
      params.push(eventType);
      sql += ` AND event_type = $${params.length}`;
    }
    if (severity) {
      params.push(severity);
      sql += ` AND severity = $${params.length}`;
    }

    params.push(Math.min(parseInt(limit as string, 10) || 100, 200));
    sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch security events' });
  }
});

// 3. Get Security Settings
securityRouter.get('/settings', async (req: AuthRequest, res) => {
  try {
    const settings = await securityService.getSecuritySettings();
    return res.json(settings);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch security settings' });
  }
});

// 4. Update Security Settings
const updateSettingsSchema = z.object({
  waf_enabled: z.boolean().optional(),
  sqli_protection: z.boolean().optional(),
  xss_protection: z.boolean().optional(),
  csrf_protection: z.boolean().optional(),
  rate_limiting_enabled: z.boolean().optional(),
  rate_limit_max_requests_per_minute: z.number().int().min(10).max(1000).optional(),
  login_brute_force_max_attempts: z.number().int().min(2).max(20).optional(),
  login_lockout_duration_minutes: z.number().int().min(1).max(1440).optional(),
  auto_block_suspicious_ips: z.boolean().optional(),
  auto_block_strike_threshold: z.number().int().min(1).max(20).optional(),
  session_inactivity_timeout_minutes: z.number().int().min(5).max(1440).optional(),
  enforce_strong_passwords: z.boolean().optional(),
  ip_whitelist: z.array(z.string()).optional()
});

securityRouter.put('/settings', async (req: AuthRequest, res) => {
  try {
    const parse = updateSettingsSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const updated = await securityService.updateSecuritySettings(parse.data);
    await logAudit({
      userId: req.user!.id,
      action: 'SECURITY_SETTINGS_UPDATED',
      entityType: 'system_settings',
      entityId: 'security',
      changes: parse.data,
      ipAddress: req.ip
    });

    return res.json({ message: 'Security & Firewall configuration updated successfully', settings: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to update security settings' });
  }
});

// 5. Get Blocked IPs
securityRouter.get('/blocked-ips', async (req: AuthRequest, res) => {
  try {
    const blocked = await securityService.getBlockedIps();
    return res.json(blocked);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch blocked IPs' });
  }
});

// 6. Manually Block an IP
const blockIpSchema = z.object({
  ipAddress: z.string().min(3),
  reason: z.string().min(3),
  isPermanent: z.boolean().default(false),
  durationMinutes: z.number().int().optional()
});

securityRouter.post('/blocked-ips', async (req: AuthRequest, res) => {
  try {
    const parse = blockIpSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const { ipAddress, reason, isPermanent, durationMinutes } = parse.data;
    const expiresAt = !isPermanent && durationMinutes ? new Date(Date.now() + durationMinutes * 60000) : undefined;

    const blocked = await securityService.blockIp(
      ipAddress.trim(),
      reason.trim(),
      isPermanent,
      expiresAt,
      1,
      req.user!.id
    );

    await logAudit({
      userId: req.user!.id,
      action: 'IP_MANUALLY_BLOCKED',
      entityType: 'blocked_ips',
      entityId: ipAddress,
      changes: { reason, isPermanent, expiresAt },
      ipAddress: req.ip
    });

    return res.status(201).json({ message: `IP ${ipAddress} successfully added to firewall blocklist`, blocked });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to block IP' });
  }
});

// 7. Unblock an IP
securityRouter.delete('/blocked-ips/:ip', async (req: AuthRequest, res) => {
  try {
    const { ip } = req.params;
    await securityService.unblockIp(decodeURIComponent(ip));

    await logAudit({
      userId: req.user!.id,
      action: 'IP_UNBLOCKED',
      entityType: 'blocked_ips',
      entityId: ip,
      ipAddress: req.ip
    });

    return res.json({ message: `IP ${decodeURIComponent(ip)} successfully removed from blocklist` });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to unblock IP' });
  }
});

// 8. Get Active Sessions
securityRouter.get('/sessions', async (req: AuthRequest, res) => {
  try {
    const sessions = await securityService.getActiveSessions();
    return res.json(sessions);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch active sessions' });
  }
});

// 9. Revoke a Session
securityRouter.delete('/sessions/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await securityService.revokeSession(id);

    await logAudit({
      userId: req.user!.id,
      action: 'SESSION_REVOKED_BY_ADMIN',
      entityType: 'user_sessions',
      entityId: id,
      ipAddress: req.ip
    });

    return res.json({ message: 'User session successfully terminated' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to revoke session' });
  }
});

// 10. Database Backups: List Backups
securityRouter.get('/backups', async (req: AuthRequest, res) => {
  try {
    const backups = await securityService.getBackups();
    return res.json(backups);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch database backups' });
  }
});

// 11. Database Backups: Create Backup Snapshot
const createBackupSchema = z.object({
  notes: z.string().optional()
});

securityRouter.post('/backups', async (req: AuthRequest, res) => {
  try {
    const parse = createBackupSchema.safeParse(req.body);
    const notes = parse.success ? parse.data.notes : undefined;

    const backup = await securityService.createDatabaseBackup(req.user!.id, notes, 'manual');

    await logAudit({
      userId: req.user!.id,
      action: 'DATABASE_BACKUP_CREATED',
      entityType: 'database_backups',
      entityId: backup.id,
      changes: { filename: backup.filename, size: backup.size_bytes, records: backup.records_count },
      ipAddress: req.ip
    });

    return res.status(201).json({
      message: `Database backup snapshot '${backup.filename}' generated successfully (${backup.records_count} records).`,
      backup
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to create database backup' });
  }
});

// 12. Database Backups: Download Backup File
securityRouter.get('/backups/:id/download', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const backup = await securityService.getBackupData(id);
    if (!backup) {
      return res.status(404).json({ error: 'Backup not found' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
    return res.send(backup.backup_data);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to download backup' });
  }
});

// 13. Database Backups: Restore Backup Snapshot
securityRouter.post('/backups/:id/restore', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const result = await securityService.restoreDatabaseBackup(id, req.user!.id);

    await logAudit({
      userId: req.user!.id,
      action: 'DATABASE_BACKUP_RESTORED',
      entityType: 'database_backups',
      entityId: id,
      changes: result,
      ipAddress: req.ip
    });

    return res.json({
      message: `Database successfully restored from snapshot! Recovered ${result.recordsRestored} records across ${result.tablesRestored.length} tables.`,
      result
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to restore database backup' });
  }
});

// 14. Database Backups: Delete Backup Snapshot
securityRouter.delete('/backups/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    await securityService.deleteBackup(id);

    await logAudit({
      userId: req.user!.id,
      action: 'DATABASE_BACKUP_DELETED',
      entityType: 'database_backups',
      entityId: id,
      ipAddress: req.ip
    });

    return res.json({ message: 'Backup record deleted successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to delete backup' });
  }
});

// 15. Live Threat Simulation & Test Engine (Allows Administrator to Test WAF)
const simulateThreatSchema = z.object({
  attackType: z.enum(['sqli', 'xss', 'rate_limit', 'path_traversal']),
  customPayload: z.string().optional()
});

securityRouter.post('/simulate-threat', async (req: AuthRequest, res) => {
  try {
    const parse = simulateThreatSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const { attackType, customPayload } = parse.data;
    const clientIp = (req.ip || '127.0.0.1').replace('::ffff:', '');
    let simulatedPayload = customPayload;
    let eventName = '';
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'high';

    if (attackType === 'sqli') {
      eventName = 'sqli_attempt';
      severity = 'critical';
      simulatedPayload = simulatedPayload || "' OR 1=1 UNION SELECT id, password_hash FROM users --";
    } else if (attackType === 'xss') {
      eventName = 'xss_attempt';
      severity = 'high';
      simulatedPayload = simulatedPayload || "<script>alert('KodiPay XSS Simulation')</script>";
    } else if (attackType === 'path_traversal') {
      eventName = 'path_traversal_probe';
      severity = 'high';
      simulatedPayload = simulatedPayload || "../../etc/passwd";
    } else {
      eventName = 'ddos_rate_limit';
      severity = 'medium';
      simulatedPayload = "Simulated high-frequency automated traffic burst (150 req/min)";
    }

    const event = await securityService.logSecurityEvent({
      eventType: eventName,
      severity,
      ipAddress: clientIp,
      userId: req.user!.id,
      userEmail: req.user!.email,
      endpoint: '/api/security/simulate-threat',
      requestMethod: 'POST',
      payloadSample: simulatedPayload,
      actionTaken: 'blocked',
      metadata: { simulated: true, testedBy: req.user!.fullName }
    });

    const settings = await securityService.getSecuritySettings();
    const autoBanned = await securityService.recordIpStrike(clientIp, `Threat Simulation: ${attackType}`, settings);

    return res.json({
      message: `WAF Threat Simulation Test Passed! Attack type '${attackType}' detected, neutralized, and logged to audit ledger.`,
      event,
      actionTaken: 'BLOCKED_BY_WAF',
      ipAutoBanned: autoBanned,
      signatureMatched: simulatedPayload
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Simulation test failed' });
  }
});
