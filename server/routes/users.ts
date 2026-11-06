/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, transaction } from '../db/connection.ts';
import { requireAuth, requireRoles, AuthRequest } from '../middleware/auth.ts';
import { logAudit } from '../services/audit.ts';

export const usersRouter = Router();

/**
 * GET /api/users/stats/summary
 * Super Administrator summary statistics of users, roles, and activity
 */
usersRouter.get('/stats/summary', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const totalRes = await query(`SELECT COUNT(*) as count FROM users`);
    const activeRes = await query(`SELECT COUNT(*) as count FROM users WHERE is_active = TRUE AND status != 'suspended'`);
    const suspendedRes = await query(`SELECT COUNT(*) as count FROM users WHERE is_active = FALSE OR status = 'suspended'`);
    const superAdminRes = await query(`SELECT COUNT(*) as count FROM users WHERE role = 'super_admin'`);
    const caretakerRes = await query(`SELECT COUNT(*) as count FROM users WHERE role = 'caretaker'`);
    const tenantRes = await query(`SELECT COUNT(*) as count FROM users WHERE role = 'tenant'`);

    const recent24hRes = await query(
      `SELECT COUNT(*) as count FROM users WHERE last_login_at >= NOW() - INTERVAL '24 hours'`
    );
    const recent7dRes = await query(
      `SELECT COUNT(*) as count FROM users WHERE last_login_at >= NOW() - INTERVAL '7 days'`
    );

    return res.json({
      totalUsers: parseInt(totalRes.rows[0]?.count || '0', 10),
      activeUsers: parseInt(activeRes.rows[0]?.count || '0', 10),
      suspendedUsers: parseInt(suspendedRes.rows[0]?.count || '0', 10),
      superAdmins: parseInt(superAdminRes.rows[0]?.count || '0', 10),
      caretakers: parseInt(caretakerRes.rows[0]?.count || '0', 10),
      tenants: parseInt(tenantRes.rows[0]?.count || '0', 10),
      recentLogins24h: parseInt(recent24hRes.rows[0]?.count || '0', 10),
      recentLogins7d: parseInt(recent7dRes.rows[0]?.count || '0', 10)
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch user statistics' });
  }
});

/**
 * GET /api/users
 * List Users with Search, Role, and Status Filtering (Super Administrator Only)
 */
usersRouter.get('/', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { search, role, status } = req.query;

    let sql = `
      SELECT id, email, full_name, phone_number, national_id, role,
             is_active, COALESCE(status, CASE WHEN is_active THEN 'active' ELSE 'suspended' END) as status,
             last_login_at, created_at, updated_at
      FROM users
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search && typeof search === 'string' && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (
        LOWER(full_name) LIKE $${params.length} OR
        LOWER(email) LIKE $${params.length} OR
        LOWER(COALESCE(phone_number, '')) LIKE $${params.length} OR
        LOWER(COALESCE(national_id, '')) LIKE $${params.length}
      )`;
    }

    if (role && typeof role === 'string' && ['super_admin', 'caretaker', 'tenant'].includes(role)) {
      params.push(role);
      sql += ` AND role = $${params.length}`;
    }

    if (status && typeof status === 'string') {
      if (status === 'active') {
        sql += ` AND is_active = TRUE AND COALESCE(status, 'active') = 'active'`;
      } else if (status === 'suspended') {
        sql += ` AND (is_active = FALSE OR status = 'suspended')`;
      } else if (status === 'deactivated') {
        sql += ` AND status = 'deactivated'`;
      }
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await query(sql, params);

    // Format response payload
    const users = result.rows.map((r: any) => ({
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      phoneNumber: r.phone_number,
      nationalId: r.national_id,
      role: r.role,
      isActive: r.is_active,
      status: r.status,
      lastLoginAt: r.last_login_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));

    return res.json(users);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch users' });
  }
});

/**
 * GET /api/users/:id
 * Retrieve specific user details, linked tenant, managed properties, and recent activity
 */
usersRouter.get('/:id', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userRes = await query(
      `SELECT id, email, full_name, phone_number, national_id, role,
              is_active, COALESCE(status, CASE WHEN is_active THEN 'active' ELSE 'suspended' END) as status,
              last_login_at, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User account not found' });
    }

    const user = userRes.rows[0];

    // Check linked tenant profile
    let tenantInfo = null;
    const tenantRes = await query(
      `SELECT t.*, ru.unit_number, p.name as property_name, ty.rent_amount_cents
       FROM tenants t
       LEFT JOIN tenancies ty ON ty.tenant_id = t.id AND ty.is_active = TRUE
       LEFT JOIN rental_units ru ON ru.id = ty.unit_id
       LEFT JOIN properties p ON p.id = ru.property_id
       WHERE t.user_id = $1`,
      [id]
    );
    if (tenantRes.rows.length > 0) {
      tenantInfo = tenantRes.rows[0];
    }

    // Check active sessions count
    const sessionsRes = await query(
      `SELECT COUNT(*) as count FROM user_sessions WHERE user_id = $1 AND is_revoked = FALSE`,
      [id]
    );

    // Recent audit logs for this user
    const auditRes = await query(
      `SELECT id, action, entity_type, entity_id, ip_address, created_at, changes
       FROM audit_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [id]
    );

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        phoneNumber: user.phone_number,
        nationalId: user.national_id,
        role: user.role,
        isActive: user.is_active,
        status: user.status,
        lastLoginAt: user.last_login_at,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      },
      tenantInfo,
      activeSessionsCount: parseInt(sessionsRes.rows[0]?.count || '0', 10),
      recentActivity: auditRes.rows
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch user details' });
  }
});

/**
 * POST /api/users
 * Create User (Super Administrator Only)
 */
const createUserSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  phoneNumber: z.string().min(9, 'Phone number must be at least 9 characters'),
  nationalId: z.string().optional(),
  role: z.enum(['super_admin', 'caretaker', 'tenant'])
});

usersRouter.post('/', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const parse = createUserSchema.safeParse(req.body);
    if (!parse.success) {
      const fieldErrors = parse.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      return res.status(400).json({ error: `Validation failed: ${fieldErrors}`, details: parse.error.issues });
    }

    const { fullName, email, password, phoneNumber, nationalId, role } = parse.data;

    // Check duplicate email
    const existingCheck = await query(`SELECT id, email FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
    if (existingCheck.rows.length > 0) {
      return res.status(409).json({ error: `A user account with email '${email}' already exists.` });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insertRes = await query(
      `INSERT INTO users (full_name, email, password_hash, phone_number, national_id, role, is_active, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'active', NOW(), NOW())
       RETURNING id, email, full_name, phone_number, national_id, role, is_active, status, created_at, updated_at`,
      [fullName, email.toLowerCase(), passwordHash, phoneNumber, nationalId || '', role]
    );

    const user = insertRes.rows[0];

    await logAudit({
      userId: req.user!.id,
      action: 'ADMIN_CREATED_USER',
      entityType: 'users',
      entityId: user.id,
      changes: { email: user.email, role: user.role, fullName: user.full_name },
      ipAddress: req.ip
    });

    return res.status(201).json({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      phoneNumber: user.phone_number,
      nationalId: user.national_id,
      role: user.role,
      isActive: user.is_active,
      status: user.status,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to create user' });
  }
});

/**
 * PUT /api/users/:id
 * Edit User Information & Role (Super Administrator Only with self-protection)
 */
const updateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phoneNumber: z.string().min(9).optional(),
  nationalId: z.string().optional(),
  role: z.enum(['super_admin', 'caretaker', 'tenant']).optional(),
  status: z.enum(['active', 'suspended', 'deactivated']).optional()
});

usersRouter.put('/:id', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const currentAdmin = req.user!;

    const parse = updateUserSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const data = parse.data;

    // Check existing target user
    const existingRes = await query(`SELECT * FROM users WHERE id = $1`, [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'User account not found' });
    }

    const targetUser = existingRes.rows[0];

    // Security: Prevent self-demotion from super_admin to prevent lockout
    if (id === currentAdmin.id && data.role && data.role !== 'super_admin') {
      return res.status(400).json({
        error: 'Security safeguard: You cannot remove your own Super Administrator privileges to prevent system lockout.'
      });
    }

    // Security: Prevent self-suspension/deactivation
    if (id === currentAdmin.id && data.status && data.status !== 'active') {
      return res.status(400).json({
        error: 'Security safeguard: You cannot suspend or deactivate your own administrative account.'
      });
    }

    // Check email uniqueness if email is changed
    if (data.email && data.email.toLowerCase() !== targetUser.email.toLowerCase()) {
      const emailDupCheck = await query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2`, [
        data.email,
        id
      ]);
      if (emailDupCheck.rows.length > 0) {
        return res.status(409).json({ error: `A user account with email '${data.email}' already exists.` });
      }
    }

    // Determine new field values
    const newFullName = data.fullName ?? targetUser.full_name;
    const newEmail = data.email ? data.email.toLowerCase() : targetUser.email;
    const newPhone = data.phoneNumber ?? targetUser.phone_number;
    const newNatId = data.nationalId ?? targetUser.national_id;
    const newRole = data.role ?? targetUser.role;
    const newStatus = data.status ?? (targetUser.status || (targetUser.is_active ? 'active' : 'suspended'));
    const newIsActive = newStatus === 'active';

    const updateRes = await query(
      `UPDATE users
       SET full_name = $1, email = $2, phone_number = $3, national_id = $4,
           role = $5, status = $6, is_active = $7, updated_at = NOW()
       WHERE id = $8
       RETURNING id, email, full_name, phone_number, national_id, role, is_active, status, created_at, last_login_at, updated_at`,
      [newFullName, newEmail, newPhone, newNatId, newRole, newStatus, newIsActive, id]
    );

    const updated = updateRes.rows[0];

    // If account was suspended, revoke all active sessions immediately
    if (newStatus !== 'active') {
      await query(`UPDATE user_sessions SET is_revoked = TRUE, revoked_at = NOW() WHERE user_id = $1`, [id]);
    }

    await logAudit({
      userId: currentAdmin.id,
      action: 'ADMIN_UPDATED_USER',
      entityType: 'users',
      entityId: id,
      changes: {
        previous: { email: targetUser.email, role: targetUser.role, status: targetUser.status },
        updated: { email: updated.email, role: updated.role, status: updated.status }
      },
      ipAddress: req.ip
    });

    return res.json({
      message: 'User account updated successfully',
      user: {
        id: updated.id,
        email: updated.email,
        fullName: updated.full_name,
        phoneNumber: updated.phone_number,
        nationalId: updated.national_id,
        role: updated.role,
        isActive: updated.is_active,
        status: updated.status,
        lastLoginAt: updated.last_login_at,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at
      }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to update user' });
  }
});

/**
 * PATCH /api/users/:id/toggle-status
 * Suspend or Reactivate Account (Super Administrator Only)
 */
usersRouter.patch('/:id/toggle-status', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    if (id === req.user!.id) {
      return res.status(400).json({ error: 'You cannot suspend or deactivate your own administrative account.' });
    }

    const checkRes = await query(`SELECT is_active, status, email FROM users WHERE id = $1`, [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentActive = checkRes.rows[0].is_active;
    const nextActive = !currentActive;
    const nextStatus = nextActive ? 'active' : 'suspended';

    const updateRes = await query(
      `UPDATE users
       SET is_active = $1, status = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, email, full_name, role, is_active, status`,
      [nextActive, nextStatus, id]
    );

    const user = updateRes.rows[0];

    // If suspended, revoke active user sessions
    if (!nextActive) {
      await query(`UPDATE user_sessions SET is_revoked = TRUE, revoked_at = NOW() WHERE user_id = $1`, [id]);
    }

    await logAudit({
      userId: req.user!.id,
      action: nextActive ? 'USER_REACTIVATED' : 'USER_SUSPENDED',
      entityType: 'users',
      entityId: id,
      changes: { isActive: nextActive, status: nextStatus, email: user.email },
      ipAddress: req.ip
    });

    return res.json({
      message: `User account is now ${nextActive ? 'Active' : 'Suspended'}`,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        isActive: user.is_active,
        status: user.status
      }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to toggle user status' });
  }
});

/**
 * POST /api/users/:id/reset-password
 * Admin Password Reset for User (Super Administrator Only)
 */
usersRouter.post('/:id/reset-password', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const updateRes = await query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, full_name`,
      [passwordHash, id]
    );

    if (updateRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Revoke all existing sessions so the user must authenticate with new password
    await query(`UPDATE user_sessions SET is_revoked = TRUE, revoked_at = NOW() WHERE user_id = $1`, [id]);

    await logAudit({
      userId: req.user!.id,
      action: 'ADMIN_RESET_PASSWORD',
      entityType: 'users',
      entityId: id,
      changes: { email: updateRes.rows[0].email },
      ipAddress: req.ip
    });

    return res.json({
      message: `Password reset successfully for ${updateRes.rows[0].email}. Previous sessions revoked.`
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to reset password' });
  }
});

/**
 * DELETE /api/users/:id
 * Delete User Account with Foreign Key Safety (Super Administrator Only)
 */
usersRouter.delete('/:id', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const currentAdmin = req.user!;

    // Security: Prevent self-deletion
    if (id === currentAdmin.id) {
      return res.status(400).json({ error: 'Security safeguard: You cannot delete your own administrative account.' });
    }

    // Security: Protect primary Super Admin account
    const designatedAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'joshkingtechnologies@gmail.com').toLowerCase().trim();
    const targetRes = await query(`SELECT id, email, full_name, role FROM users WHERE id = $1`, [id]);
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ error: 'User account not found' });
    }

    const targetUser = targetRes.rows[0];
    if (targetUser.email.toLowerCase() === designatedAdminEmail) {
      return res.status(403).json({ error: 'Cannot delete the primary designated Super Administrator account.' });
    }

    // Perform atomic deletion with relational integrity cleanup
    await transaction(async (txDb) => {
      // 1. Unlink managed properties
      await txDb.query(`UPDATE properties SET landlord_id = NULL WHERE landlord_id = $1`, [id]);

      // 2. Unlink tenant profile
      await txDb.query(`UPDATE tenants SET user_id = NULL WHERE user_id = $1`, [id]);

      // 3. Unlink recorded payments
      await txDb.query(`UPDATE payments SET recorded_by = NULL WHERE recorded_by = $1`, [id]);

      // 4. Delete user sessions
      await txDb.query(`DELETE FROM user_sessions WHERE user_id = $1`, [id]);

      // 5. Delete user
      await txDb.query(`DELETE FROM users WHERE id = $1`, [id]);
    });

    await logAudit({
      userId: currentAdmin.id,
      action: 'ADMIN_DELETED_USER',
      entityType: 'users',
      entityId: id,
      changes: { email: targetUser.email, role: targetUser.role, fullName: targetUser.full_name },
      ipAddress: req.ip
    });

    return res.json({
      message: `User account '${targetUser.email}' (${targetUser.full_name}) has been permanently deleted.`
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to delete user account' });
  }
});

/**
 * GET /api/users/:id/activity
 * View specific user's audit trail and login history
 */
usersRouter.get('/:id/activity', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userRes = await query(`SELECT id, email, full_name FROM users WHERE id = $1`, [id]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const auditRes = await query(
      `SELECT id, action, entity_type, entity_id, ip_address, created_at, changes
       FROM audit_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [id]
    );

    const sessionsRes = await query(
      `SELECT id, ip_address, user_agent, is_revoked, created_at, last_activity_at, revoked_at
       FROM user_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [id]
    );

    return res.json({
      user: userRes.rows[0],
      auditLogs: auditRes.rows,
      sessions: sessionsRes.rows
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch user activity' });
  }
});
