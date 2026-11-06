/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Response } from 'express';
import { query } from '../db/connection.ts';
import { requireAuth, requireRoles, AuthRequest } from '../middleware/auth.ts';

export const auditRouter = Router();

// List Audit Logs (Super Administrator Only)
auditRouter.get('/', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { action, entityType, limit = '50' } = req.query;

    let sql = `
      SELECT a.*, u.email as user_email, u.full_name as user_full_name, u.role as user_role
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (action) {
      params.push(action);
      sql += ` AND a.action = $${params.length}`;
    }

    if (entityType) {
      params.push(entityType);
      sql += ` AND a.entity_type = $${params.length}`;
    }

    params.push(Math.min(parseInt(limit as string, 10) || 50, 100));
    sql += ` ORDER BY a.created_at DESC LIMIT $${params.length}`;

    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch audit logs' });
  }
});
