/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { query } from '../db/connection.ts';

export interface AuditLogEntry {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, any>;
  ipAddress?: string;
}

export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, changes, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        entry.userId || null,
        entry.action,
        entry.entityType,
        entry.entityId,
        JSON.stringify(entry.changes || {}),
        entry.ipAddress || '127.0.0.1'
      ]
    );
  } catch (err) {
    console.error('Failed to write audit log:', err);
    // Non-fatal, audit log failure shouldn't kill operation unless critical
  }
}
