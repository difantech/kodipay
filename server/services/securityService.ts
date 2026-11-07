/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import { query, transaction, getDb } from '../db/connection.ts';
import { v4 as uuidv4 } from 'uuid';

export interface SecuritySettings {
  waf_enabled: boolean;
  sqli_protection: boolean;
  xss_protection: boolean;
  csrf_protection: boolean;
  rate_limiting_enabled: boolean;
  rate_limit_max_requests_per_minute: number;
  login_brute_force_max_attempts: number;
  login_lockout_duration_minutes: number;
  auto_block_suspicious_ips: boolean;
  auto_block_strike_threshold: number;
  session_inactivity_timeout_minutes: number;
  enforce_strong_passwords: boolean;
  ip_whitelist: string[];
}

export interface SecurityEventInput {
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  ipAddress: string;
  userId?: string | null;
  userEmail?: string | null;
  endpoint: string;
  requestMethod: string;
  payloadSample?: string;
  actionTaken: 'blocked' | 'flagged' | 'rate_limited' | 'logged' | 'ip_banned';
  metadata?: any;
}

// In-memory rate limiting map: ip -> { count, windowStart }
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
// In-memory IP strikes map: ip -> { strikes: number, lastStrike: number }
const ipStrikesMap = new Map<string, { strikes: number; lastStrike: number }>();

// Default security settings
const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  waf_enabled: true,
  sqli_protection: true,
  xss_protection: true,
  csrf_protection: true,
  rate_limiting_enabled: true,
  rate_limit_max_requests_per_minute: 120,
  login_brute_force_max_attempts: 5,
  login_lockout_duration_minutes: 15,
  auto_block_suspicious_ips: true,
  auto_block_strike_threshold: 3,
  session_inactivity_timeout_minutes: 30,
  enforce_strong_passwords: true,
  ip_whitelist: ['127.0.0.1', '::1']
};

// Cached settings with TTL
let cachedSettings: SecuritySettings | null = null;
let lastSettingsFetch = 0;

export class SecurityService {
  /**
   * Fetch current Security & Firewall configuration from database
   */
  public async getSecuritySettings(): Promise<SecuritySettings> {
    const now = Date.now();
    if (cachedSettings && now - lastSettingsFetch < 10000) {
      return cachedSettings;
    }

    try {
      const res = await query(`SELECT value FROM system_settings WHERE key = 'security'`);
      if (res.rows.length > 0 && res.rows[0].value) {
        cachedSettings = { ...DEFAULT_SECURITY_SETTINGS, ...res.rows[0].value };
      } else {
        cachedSettings = { ...DEFAULT_SECURITY_SETTINGS };
        await query(
          `INSERT INTO system_settings (key, value, updated_at) 
           VALUES ('security', $1, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $1`,
          [JSON.stringify(DEFAULT_SECURITY_SETTINGS)]
        );
      }
      lastSettingsFetch = now;
      return cachedSettings || DEFAULT_SECURITY_SETTINGS;
    } catch (e: any) {
      console.warn('Failed to load security settings from DB, using fallback defaults:', e.message);
      return DEFAULT_SECURITY_SETTINGS;
    }
  }

  /**
   * Update Security & Firewall configuration
   */
  public async updateSecuritySettings(updates: Partial<SecuritySettings>): Promise<SecuritySettings> {
    const current = await this.getSecuritySettings();
    const updated = { ...current, ...updates };

    await query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('security', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(updated)]
    );

    cachedSettings = updated;
    lastSettingsFetch = Date.now();
    return updated;
  }

  /**
   * Log a security or firewall event
   */
  public async logSecurityEvent(event: SecurityEventInput): Promise<any> {
    try {
      const res = await query(
        `INSERT INTO security_events (
           event_type, severity, ip_address, user_id, user_email,
           endpoint, request_method, payload_sample, action_taken, metadata
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          event.eventType,
          event.severity,
          event.ipAddress,
          event.userId || null,
          event.userEmail || null,
          event.endpoint,
          event.requestMethod,
          event.payloadSample ? event.payloadSample.slice(0, 500) : null,
          event.actionTaken,
          JSON.stringify(event.metadata || {})
        ]
      );
      return res.rows[0];
    } catch (e: any) {
      console.error('Failed to log security event:', e.message);
      return null;
    }
  }

  /**
   * Check if an IP address is blocked
   */
  public async isIpBlocked(ip: string): Promise<{ blocked: boolean; reason?: string; expiresAt?: string }> {
    try {
      const res = await query(
        `SELECT * FROM blocked_ips 
         WHERE ip_address = $1 
           AND (is_permanent = TRUE OR expires_at IS NULL OR expires_at > NOW())`,
        [ip]
      );

      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          blocked: true,
          reason: row.reason,
          expiresAt: row.expires_at ? row.expires_at.toISOString() : undefined
        };
      }
      return { blocked: false };
    } catch (e: any) {
      console.warn('Error checking blocked IP status:', e.message);
      return { blocked: false };
    }
  }

  /**
   * Record a strike for an IP and automatically block if threshold exceeded
   */
  public async recordIpStrike(ip: string, reason: string, settings: SecuritySettings): Promise<boolean> {
    if (!settings.auto_block_suspicious_ips) return false;

    const now = Date.now();
    const entry = ipStrikesMap.get(ip) || { strikes: 0, lastStrike: now };
    
    // Reset strikes if last strike was over 1 hour ago
    if (now - entry.lastStrike > 3600000) {
      entry.strikes = 1;
    } else {
      entry.strikes += 1;
    }
    entry.lastStrike = now;
    ipStrikesMap.set(ip, entry);

    if (entry.strikes >= settings.auto_block_strike_threshold) {
      const lockDurationMinutes = 60; // 1 hour auto-block
      const expiresAt = new Date(now + lockDurationMinutes * 60 * 1000);
      
      await this.blockIp(
        ip,
        `Automated WAF Auto-Ban: ${entry.strikes} suspicious security violations detected. Latest: ${reason}`,
        false,
        expiresAt,
        entry.strikes
      );

      await this.logSecurityEvent({
        eventType: 'ip_auto_banned',
        severity: 'critical',
        ipAddress: ip,
        endpoint: '/waf',
        requestMethod: 'WAF',
        payloadSample: `Strikes: ${entry.strikes}, Threshold: ${settings.auto_block_strike_threshold}`,
        actionTaken: 'ip_banned'
      });

      return true;
    }
    return false;
  }

  /**
   * Block an IP address manually or automatically
   */
  public async blockIp(
    ip: string,
    reason: string,
    isPermanent = false,
    expiresAt?: Date,
    strikes = 1,
    blockedBy?: string
  ): Promise<any> {
    const res = await query(
      `INSERT INTO blocked_ips (
         ip_address, reason, strike_count, is_permanent, expires_at, blocked_by, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (ip_address) DO UPDATE SET
         reason = EXCLUDED.reason,
         strike_count = blocked_ips.strike_count + 1,
         is_permanent = EXCLUDED.is_permanent,
         expires_at = EXCLUDED.expires_at,
         updated_at = NOW()
       RETURNING *`,
      [ip, reason, strikes, isPermanent, expiresAt || null, blockedBy || null]
    );
    return res.rows[0];
  }

  /**
   * Unblock an IP address
   */
  public async unblockIp(ip: string): Promise<boolean> {
    await query(`DELETE FROM blocked_ips WHERE ip_address = $1`, [ip]);
    ipStrikesMap.delete(ip);
    return true;
  }

  /**
   * Get list of all blocked IPs
   */
  public async getBlockedIps(): Promise<any[]> {
    const res = await query(
      `SELECT b.*, u.full_name as blocked_by_name 
       FROM blocked_ips b 
       LEFT JOIN users u ON u.id = b.blocked_by
       ORDER BY b.created_at DESC`
    );
    return res.rows;
  }

  /**
   * Rate Limiting check (DDoS prevention)
   */
  public checkRateLimit(ip: string, maxRequestsPerMin: number): { allowed: boolean; current: number; limit: number } {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const record = rateLimitMap.get(ip);

    if (!record || now - record.windowStart > windowMs) {
      rateLimitMap.set(ip, { count: 1, windowStart: now });
      return { allowed: true, current: 1, limit: maxRequestsPerMin };
    }

    record.count += 1;
    if (record.count > maxRequestsPerMin) {
      return { allowed: false, current: record.count, limit: maxRequestsPerMin };
    }
    return { allowed: true, current: record.count, limit: maxRequestsPerMin };
  }

  /**
   * Brute-Force Login Prevention
   */
  public async checkLoginLockout(
    email: string,
    ip: string,
    maxAttempts = 5,
    lockoutDurationMinutes = 15
  ): Promise<{ locked: boolean; remainingMinutes?: number; failedAttempts: number }> {
    const since = new Date(Date.now() - lockoutDurationMinutes * 60 * 1000);
    const res = await query(
      `SELECT COUNT(*) as failed_count 
       FROM login_attempts 
       WHERE (LOWER(email) = LOWER($1) OR ip_address = $2)
         AND status = 'failed'
         AND created_at >= $3`,
      [email, ip, since]
    );

    const failedAttempts = parseInt(res.rows[0]?.failed_count || '0', 10);
    if (failedAttempts >= maxAttempts) {
      return {
        locked: true,
        remainingMinutes: lockoutDurationMinutes,
        failedAttempts
      };
    }
    return { locked: false, failedAttempts };
  }

  /**
   * Record login attempt result
   */
  public async recordLoginAttempt(
    email: string,
    ip: string,
    success: boolean,
    failureReason?: string
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO login_attempts (email, ip_address, status, failure_reason)
         VALUES ($1, $2, $3, $4)`,
        [email.toLowerCase(), ip, success ? 'success' : 'failed', failureReason || null]
      );
    } catch (e: any) {
      console.warn('Error recording login attempt:', e.message);
    }
  }

  /**
   * Session Management: Create User Session
   */
  public async createUserSession(
    userId: string,
    token: string,
    ip: string,
    userAgent = ''
  ): Promise<any> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const settings = await this.getSecuritySettings();
    const timeoutMinutes = settings.session_inactivity_timeout_minutes || 30;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days token limit

    // Simple device parsing from user-agent
    let deviceName = 'Desktop Browser';
    if (/mobile/i.test(userAgent)) deviceName = 'Mobile Device';
    else if (/tablet|ipad/i.test(userAgent)) deviceName = 'Tablet';
    if (/chrome/i.test(userAgent)) deviceName += ' (Chrome)';
    else if (/firefox/i.test(userAgent)) deviceName += ' (Firefox)';
    else if (/safari/i.test(userAgent)) deviceName += ' (Safari)';

    const res = await query(
      `INSERT INTO user_sessions (
         user_id, token_hash, ip_address, user_agent, device_name,
         last_activity_at, expires_at, is_revoked
       )
       VALUES ($1, $2, $3, $4, $5, NOW(), $6, FALSE)
       RETURNING *`,
      [userId, tokenHash, ip, userAgent.slice(0, 255), deviceName, expiresAt]
    );
    return res.rows[0];
  }

  /**
   * Validate Session and check for Inactivity Timeout
   */
  public async validateSession(token: string): Promise<{ valid: boolean; session?: any; reason?: string }> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const res = await query(
      `SELECT s.*, u.is_active, u.role, u.full_name, u.email 
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1`,
      [tokenHash]
    );

    if (res.rows.length === 0) {
      // Fail closed: JWTs without a persisted session must never be accepted.
      return { valid: false, reason: 'Session record not found. Please sign in again.' };
    }

    const session = res.rows[0];
    if (session.is_revoked) {
      return { valid: false, reason: 'Session has been revoked by an administrator or user logout' };
    }

    if (!session.is_active) {
      return { valid: false, reason: 'User account is currently deactivated' };
    }

    // Check inactivity timeout
    const settings = await this.getSecuritySettings();
    const timeoutMs = (settings.session_inactivity_timeout_minutes || 30) * 60 * 1000;
    const lastActive = new Date(session.last_activity_at).getTime();
    if (Date.now() - lastActive > timeoutMs) {
      // Revoke session due to inactivity
      await query(
        `UPDATE user_sessions SET is_revoked = TRUE, revoked_at = NOW() WHERE id = $1`,
        [session.id]
      );
      return { valid: false, reason: `Session expired due to ${settings.session_inactivity_timeout_minutes} minutes of inactivity` };
    }

    // Update last active timestamp
    await query(`UPDATE user_sessions SET last_activity_at = NOW() WHERE id = $1`, [session.id]);
    return { valid: true, session };
  }

  /**
   * Revoke a specific session
   */
  public async revokeSession(sessionId: string): Promise<boolean> {
    await query(
      `UPDATE user_sessions SET is_revoked = TRUE, revoked_at = NOW() WHERE id = $1`,
      [sessionId]
    );
    return true;
  }

  /**
   * Revoke all sessions for a user
   */
  public async revokeAllUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
    let sql = `UPDATE user_sessions SET is_revoked = TRUE, revoked_at = NOW() WHERE user_id = $1`;
    const params: any[] = [userId];
    if (exceptSessionId) {
      params.push(exceptSessionId);
      sql += ` AND id != $2`;
    }
    await query(sql, params);
  }

  /**
   * Get Active Sessions for Admin Security Monitor
   */
  public async getActiveSessions(): Promise<any[]> {
    const res = await query(
      `SELECT s.*, u.email, u.full_name, u.role 
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.is_revoked = FALSE AND s.expires_at > NOW()
       ORDER BY s.last_activity_at DESC
       LIMIT 50`
    );
    return res.rows;
  }

  /**
   * Database Backup Engine: Create Real Structured Backup Snapshot
   */
  public async createDatabaseBackup(userId?: string, notes?: string, backupType = 'manual'): Promise<any> {
    const db = await getDb();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `kodipay_backup_${timestamp}.json`;

    // Extract core data tables
    const tables = [
      'system_settings',
      'users',
      'properties',
      'rental_units',
      'tenants',
      'tenancies',
      'rent_charges',
      'payments',
      'payment_allocations',
      'receipts',
      'tenant_credit_transactions',
      'refund_requests',
      'tenancy_settlements',
      'notification_preferences',
      'notification_logs',
      'blocked_ips',
      'security_events'
    ];

    const backupDump: Record<string, any[]> = {};
    let totalRecords = 0;

    for (const table of tables) {
      try {
        const res = await db.query(`SELECT * FROM ${table}`);
        backupDump[table] = res.rows;
        totalRecords += res.rows.length;
      } catch (e: any) {
        console.warn(`Table ${table} export warning:`, e.message);
        backupDump[table] = [];
      }
    }

    const backupJson = JSON.stringify({
      version: '1.0',
      system: 'KodiPay Kenya Rental Payment Management System',
      generatedAt: new Date().toISOString(),
      timezone: 'Africa/Nairobi',
      totalRecords,
      data: backupDump
    });

    const sizeBytes = Buffer.byteLength(backupJson, 'utf8');
    const checksum = crypto.createHash('sha256').update(backupJson).digest('hex');

    const res = await query(
      `INSERT INTO database_backups (
         filename, size_bytes, checksum_sha256, records_count, backup_type,
         backup_data, created_by, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, filename, size_bytes, checksum_sha256, records_count, backup_type, created_by, notes, created_at`,
      [filename, sizeBytes, checksum, totalRecords, backupType, backupJson, userId || null, notes || 'Manual full system backup snapshot']
    );

    return res.rows[0];
  }

  /**
   * Database Recovery Engine: Restore from a Validated Backup Snapshot
   */
  public async restoreDatabaseBackup(
    backupId: string,
    userId?: string
  ): Promise<{ restored: boolean; tablesRestored: string[]; recordsRestored: number }> {
    const backupRes = await query(`SELECT * FROM database_backups WHERE id = $1`, [backupId]);
    if (backupRes.rows.length === 0) {
      throw new Error('Backup snapshot not found in system repository');
    }

    const backup = backupRes.rows[0];
    const backupJson = backup.backup_data;

    // Verify SHA-256 Checksum integrity
    const computedChecksum = crypto.createHash('sha256').update(backupJson).digest('hex');
    if (computedChecksum !== backup.checksum_sha256) {
      throw new Error('Backup integrity verification failed: Checksum SHA256 does not match! Snapshot might be corrupted.');
    }

    const parsed = JSON.parse(backupJson);
    const data = parsed.data || {};
    const tablesRestored: string[] = [];
    let recordsRestored = 0;

    await transaction(async (txDb) => {
      // Restore core tables if present
      for (const [table, rows] of Object.entries(data)) {
        if (!Array.isArray(rows) || rows.length === 0) continue;
        tablesRestored.push(table);

        for (const row of rows) {
          const keys = Object.keys(row);
          if (keys.length === 0) continue;

          const cols = keys.map(k => `"${k}"`).join(', ');
          const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
          const values = Object.values(row).map(v => typeof v === 'object' && v !== null && !(v instanceof Date) ? JSON.stringify(v) : v);

          // Update on conflict if table has primary key 'id' or 'key'
          let conflictClause = 'ON CONFLICT DO NOTHING';
          if (keys.includes('id')) {
            const updates = keys.filter(k => k !== 'id').map(k => `"${k}" = EXCLUDED."${k}"`).join(', ');
            if (updates) conflictClause = `ON CONFLICT (id) DO UPDATE SET ${updates}`;
          } else if (keys.includes('key')) {
            conflictClause = `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
          }

          try {
            await txDb.query(
              `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) ${conflictClause}`,
              values
            );
            recordsRestored++;
          } catch (rowErr: any) {
            console.warn(`Row restore warning in ${table}:`, rowErr.message);
          }
        }
      }
    });

    await this.logSecurityEvent({
      eventType: 'database_restore_completed',
      severity: 'critical',
      ipAddress: '127.0.0.1',
      userId: userId || null,
      endpoint: `/api/security/backups/${backupId}/restore`,
      requestMethod: 'POST',
      payloadSample: `Snapshot: ${backup.filename}, Records: ${recordsRestored}, Checksum: ${backup.checksum_sha256}`,
      actionTaken: 'logged'
    });

    return {
      restored: true,
      tablesRestored,
      recordsRestored
    };
  }

  /**
   * Get list of all Database Backups
   */
  public async getBackups(): Promise<any[]> {
    const res = await query(
      `SELECT id, filename, size_bytes, checksum_sha256, records_count, backup_type, created_by, notes, created_at
       FROM database_backups
       ORDER BY created_at DESC`
    );
    return res.rows;
  }

  /**
   * Get single backup data for download
   */
  public async getBackupData(backupId: string): Promise<any> {
    const res = await query(`SELECT * FROM database_backups WHERE id = $1`, [backupId]);
    if (res.rows.length === 0) return null;
    return res.rows[0];
  }

  /**
   * Delete backup snapshot
   */
  public async deleteBackup(backupId: string): Promise<boolean> {
    await query(`DELETE FROM database_backups WHERE id = $1`, [backupId]);
    return true;
  }

  /**
   * Calculate Real-time Security & Threat Metrics
   */
  public async getSecurityMetrics(): Promise<any> {
    const [
      eventsCountRes,
      blockedIpsCountRes,
      sessionsCountRes,
      backupsCountRes,
      recentEventsRes,
      attacksByTypeRes
    ] = await Promise.all([
      query(`
        SELECT 
          COUNT(*) as total_events,
          COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as events_24h,
          COUNT(CASE WHEN action_taken = 'blocked' THEN 1 END) as total_blocked,
          COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_count,
          COUNT(CASE WHEN severity = 'high' THEN 1 END) as high_count
        FROM security_events
      `),
      query(`SELECT COUNT(*) as blocked_count FROM blocked_ips WHERE is_permanent = TRUE OR expires_at IS NULL OR expires_at > NOW()`),
      query(`SELECT COUNT(*) as active_sessions FROM user_sessions WHERE is_revoked = FALSE AND expires_at > NOW()`),
      query(`SELECT COUNT(*) as total_backups, MAX(created_at) as last_backup FROM database_backups`),
      query(`SELECT * FROM security_events ORDER BY created_at DESC LIMIT 25`),
      query(`
        SELECT event_type, COUNT(*) as count 
        FROM security_events 
        GROUP BY event_type 
        ORDER BY count DESC 
        LIMIT 6
      `)
    ]);

    const settings = await this.getSecuritySettings();

    // Calculate dynamic security health score (0 to 100)
    let score = 100;
    if (!settings.waf_enabled) score -= 30;
    if (!settings.sqli_protection) score -= 20;
    if (!settings.xss_protection) score -= 15;
    if (!settings.csrf_protection) score -= 15;
    if (!settings.rate_limiting_enabled) score -= 10;
    if (!settings.auto_block_suspicious_ips) score -= 10;

    const criticals = parseInt(eventsCountRes.rows[0]?.critical_count || '0', 10);
    score = Math.max(10, score - Math.min(criticals * 2, 20));

    return {
      postureScore: score,
      postureRating: score >= 90 ? 'A+ Optimal' : score >= 75 ? 'B Good' : score >= 50 ? 'C Warning' : 'Critical',
      settings,
      stats: {
        totalThreatsRecorded: parseInt(eventsCountRes.rows[0]?.total_events || '0', 10),
        threats24h: parseInt(eventsCountRes.rows[0]?.events_24h || '0', 10),
        totalBlocked: parseInt(eventsCountRes.rows[0]?.total_blocked || '0', 10),
        criticalAlerts: criticals,
        highAlerts: parseInt(eventsCountRes.rows[0]?.high_count || '0', 10),
        activeBlockedIps: parseInt(blockedIpsCountRes.rows[0]?.blocked_count || '0', 10),
        activeUserSessions: parseInt(sessionsCountRes.rows[0]?.active_sessions || '0', 10),
        totalDatabaseBackups: parseInt(backupsCountRes.rows[0]?.total_backups || '0', 10),
        lastBackupAt: backupsCountRes.rows[0]?.last_backup || null
      },
      recentEvents: recentEventsRes.rows,
      attacksByType: attacksByTypeRes.rows
    };
  }
}

export const securityService = new SecurityService();
