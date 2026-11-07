/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, transaction } from '../db/connection.ts';
import { signToken, requireAuth, AuthRequest } from '../middleware/auth.ts';
import { logAudit } from '../services/audit.ts';

export const authRouter = Router();

// Check if system requires initial super administrator setup
authRouter.get('/setup-status', async (req, res) => {
  try {
    const result = await query('SELECT COUNT(*) as count FROM users');
    const userCount = parseInt(result.rows[0].count, 10);
    return res.json({
      needsInitialSetup: userCount === 0,
      userCount
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to check setup status' });
  }
});

// Setup First Super Administrator
const setupFirstAdminSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  phoneNumber: z.string().min(9),
  nationalId: z.string().optional()
});

authRouter.post('/setup-first-admin', async (req, res) => {
  try {
    const checkUsers = await query('SELECT COUNT(*) as count FROM users');
    const count = parseInt(checkUsers.rows[0].count, 10);
    if (count > 0) {
      return res.status(403).json({ 
        error: 'Initial setup is already completed. Super Administrator exists.' 
      });
    }

    const parse = setupFirstAdminSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const { fullName, email, password, phoneNumber, nationalId } = parse.data;
    const passwordHash = await bcrypt.hash(password, 10);

    const insertRes = await query(
      `INSERT INTO users (full_name, email, password_hash, phone_number, national_id, role)
       VALUES ($1, $2, $3, $4, $5, 'super_admin')
       RETURNING id, full_name, email, role, created_at`,
      [fullName, email.toLowerCase(), passwordHash, phoneNumber, nationalId || '']
    );

    const user = insertRes.rows[0];

    await logAudit({
      userId: user.id,
      action: 'SYSTEM_INITIAL_ADMIN_CREATED',
      entityType: 'users',
      entityId: user.id,
      changes: { email: user.email, role: 'super_admin' },
      ipAddress: req.ip
    });

    const token = signToken({
      id: user.id,
      email: user.email,
      role: 'super_admin',
      fullName: user.full_name
    });

    await securityService.createUserSession(
      user.id, token, req.ip,
      req.headers['user-agent'] as string
    );

    return res.status(201).json({
      message: 'Super Administrator setup completed successfully.',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role
      }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Setup failed' });
  }
});

import { securityService } from '../services/securityService.ts';

// Login
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

authRouter.post('/login', async (req, res) => {
  try {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Please enter a valid email and password' });
    }

    const { email, password } = parse.data;
    const clientIp = (
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      req.ip ||
      '127.0.0.1'
    ).replace('::ffff:', '');

    // 1. Check Login Lockout (Brute-Force Protection)
    const settings = await securityService.getSecuritySettings();
    const lockout = await securityService.checkLoginLockout(
      email,
      clientIp,
      settings.login_brute_force_max_attempts || 5,
      settings.login_lockout_duration_minutes || 15
    );

    if (lockout.locked) {
      await securityService.logSecurityEvent({
        eventType: 'brute_force_login',
        severity: 'high',
        ipAddress: clientIp,
        userEmail: email,
        endpoint: '/api/auth/login',
        requestMethod: 'POST',
        payloadSample: `Exceeded ${settings.login_brute_force_max_attempts} failed login attempts`,
        actionTaken: 'blocked'
      });

      await securityService.recordIpStrike(clientIp, `Repeated brute force login failures on account: ${email}`, settings);

      return res.status(429).json({
        error: `Account temporarily locked due to ${lockout.failedAttempts} consecutive failed login attempts. Please try again in ${lockout.remainingMinutes} minutes or contact your Super Administrator.`,
        code: 'LOGIN_LOCKED_OUT',
        failedAttempts: lockout.failedAttempts
      });
    }

    let userRes = await query(
      `SELECT id, email, password_hash, full_name, role, is_active, status, last_login_at FROM users WHERE LOWER(email) = LOWER($1)`,
      [email]
    );


    if (userRes.rows.length === 0) {
      await securityService.recordLoginAttempt(email, clientIp, false, 'User account not found');
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userRes.rows[0];
    if (!user.is_active || user.status === 'suspended' || user.status === 'deactivated') {
      await securityService.recordLoginAttempt(email, clientIp, false, 'Deactivated account');
      return res.status(403).json({ error: 'This account has been deactivated or suspended. Please contact management.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await securityService.recordLoginAttempt(email, clientIp, false, 'Incorrect password');
      await securityService.logSecurityEvent({
        eventType: 'failed_login_attempt',
        severity: 'medium',
        ipAddress: clientIp,
        userEmail: email,
        userId: user.id,
        endpoint: '/api/auth/login',
        requestMethod: 'POST',
        payloadSample: `Failed login attempt for ${email}`,
        actionTaken: 'flagged'
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last_login_at timestamp
    await query(`UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1`, [user.id]);

    // Record successful login attempt
    await securityService.recordLoginAttempt(email, clientIp, true);

    // Retrieve tenant ID if user is tenant
    let tenantId = null;
    if (user.role === 'tenant') {
      const tenantRes = await query(`SELECT id FROM tenants WHERE user_id = $1`, [user.id]);
      if (tenantRes.rows.length > 0) {
        tenantId = tenantRes.rows[0].id;
      }
    }

    const token = signToken({
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      tenantId
    });

    // Create persistent user session in user_sessions table
    const sessionRecord = await securityService.createUserSession(
      user.id,
      token,
      clientIp,
      req.headers['user-agent'] as string
    );

    await logAudit({
      userId: user.id,
      action: 'USER_LOGIN',
      entityType: 'users',
      entityId: user.id,
      changes: { sessionId: sessionRecord?.id, ip: clientIp, role: user.role },
      ipAddress: clientIp
    });

    return res.json({
      message: 'Signed in successfully',
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        status: user.status || 'active',
        isActive: user.is_active,
        lastLoginAt: new Date().toISOString(),
        tenantId
      },
      session: {
        id: sessionRecord?.id,
        inactivityTimeoutMinutes: settings.session_inactivity_timeout_minutes || 30
      }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Authentication error' });
  }
});

// Secure One-Time Server-Side Initialization: Assign Super Admin to Existing Authenticated Account
authRouter.post('/claim-super-admin', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const clientEmail = user.email.toLowerCase().trim();
    const designatedEmail = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();
    const providedKey = req.headers['x-admin-claim-key'] || req.body?.claimKey;
    const expectedKey = process.env.ADMIN_CLAIM_KEY;

    // Verify authenticated identity: matching email OR matching secret claim key OR no other custom super admin
    const isMatchingEmail = Boolean(designatedEmail) && clientEmail === designatedEmail;
    const isValidKey = expectedKey && providedKey === expectedKey;

    if (!isMatchingEmail && !isValidKey) {
      return res.status(403).json({
        error: 'Forbidden: You do not have authorization to initialize Super Administrator privileges for this account.'
      });
    }

    // Permanently assign Super Admin role to this exact existing user ID
    await query(
      `UPDATE users
       SET role = 'super_admin', is_active = TRUE, status = 'active', updated_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    // Re-issue JWT session token with Super Admin role
    const refreshedToken = signToken({
      id: user.id,
      email: user.email,
      role: 'super_admin',
      fullName: user.fullName
    });

    await securityService.createUserSession(
      user.id, refreshedToken, req.ip,
      req.headers['user-agent'] as string
    );

    await logAudit({
      userId: user.id,
      action: 'CLAIM_SUPER_ADMIN_INITIALIZATION',
      entityType: 'users',
      entityId: user.id,
      changes: { previousRole: user.role, newRole: 'super_admin', email: user.email },
      ipAddress: req.ip
    });

    return res.json({
      success: true,
      message: `Account '${user.email}' (ID: ${user.id}) has been permanently assigned as Super Administrator!`,
      token: refreshedToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: 'super_admin',
        status: 'active',
        isActive: true
      }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to claim Super Admin role' });
  }
});

// Logout
authRouter.post('/logout', requireAuth, async (req: AuthRequest, res) => {
  if (req.user) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const tokenHash = (await import('node:crypto')).default.createHash('sha256').update(token).digest('hex');
      await query(`UPDATE user_sessions SET is_revoked = TRUE, revoked_at = NOW() WHERE token_hash = $1`, [tokenHash]);
    }

    await logAudit({
      userId: req.user.id,
      action: 'USER_LOGOUT',
      entityType: 'users',
      entityId: req.user.id,
      ipAddress: req.ip
    });
  }
  return res.json({ message: 'Signed out successfully' });
});

// Current User Details
authRouter.get('/me', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const userRes = await query(
      `SELECT id, email, full_name, phone_number, national_id, role, is_active, status, last_login_at, created_at, updated_at
       FROM users WHERE id = $1`,
      [user.id]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const dbUser = userRes.rows[0];

    let tenantInfo = null;

    if (dbUser.role === 'tenant') {
      const tenantRes = await query(
        `SELECT t.id, t.full_name, t.phone_number, t.national_id, t.emergency_contact_name, t.emergency_contact_phone,
                u.unit_number, p.name as property_name, p.address as property_address,
                ty.rent_amount_cents, ty.rent_due_day, ty.start_date, ty.id as tenancy_id
         FROM tenants t
         LEFT JOIN tenancies ty ON ty.tenant_id = t.id AND ty.is_active = TRUE
         LEFT JOIN rental_units u ON u.id = ty.unit_id
         LEFT JOIN properties p ON p.id = u.property_id
         WHERE t.user_id = $1`,
        [dbUser.id]
      );
      if (tenantRes.rows.length > 0) {
        tenantInfo = tenantRes.rows[0];
      }
    }

    return res.json({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        fullName: dbUser.full_name,
        phoneNumber: dbUser.phone_number,
        nationalId: dbUser.national_id,
        role: dbUser.role,
        status: dbUser.status || (dbUser.is_active ? 'active' : 'suspended'),
        isActive: dbUser.is_active,
        lastLoginAt: dbUser.last_login_at,
        createdAt: dbUser.created_at,
        updatedAt: dbUser.updated_at,
        tenantId: user.tenantId,
        tenantInfo
      }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch user' });
  }
});

// Password Change
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

authRouter.post('/change-password', requireAuth, async (req: AuthRequest, res) => {
  try {
    const parse = changePasswordSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    const { currentPassword, newPassword } = parse.data;
    const userRes = await query(`SELECT password_hash FROM users WHERE id = $1`, [req.user!.id]);
    
    const isMatch = await bcrypt.compare(currentPassword, userRes.rows[0].password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await query(`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, [newHash, req.user!.id]);

    await logAudit({
      userId: req.user!.id,
      action: 'USER_PASSWORD_CHANGED',
      entityType: 'users',
      entityId: req.user!.id,
      ipAddress: req.ip
    });

    return res.json({ message: 'Password updated successfully' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to update password' });
  }
});

// Verify Tenant Portal Invitation Token (Public)
authRouter.get('/invitation/:token', async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || token.length < 20) {
      return res.status(400).json({ valid: false, error: 'Invalid invitation token format.' });
    }

    const inviteRes = await query(
      `SELECT pi.*, t.full_name as tenant_name, t.email as tenant_email, t.phone_number,
              ru.unit_number, p.name as property_name
       FROM portal_invitations pi
       JOIN tenants t ON t.id = pi.tenant_id
       LEFT JOIN tenancies ty ON ty.tenant_id = t.id AND ty.is_active = TRUE
       LEFT JOIN rental_units ru ON ru.id = ty.unit_id
       LEFT JOIN properties p ON p.id = ru.property_id
       WHERE pi.token = $1`,
      [token]
    );

    if (inviteRes.rows.length === 0) {
      return res.status(404).json({ valid: false, error: 'Invitation link not found or has expired.' });
    }

    const invitation = inviteRes.rows[0];

    if (invitation.status === 'activated') {
      return res.status(400).json({
        valid: false,
        error: 'This invitation has already been activated. You can sign in directly to your tenant portal.'
      });
    }

    if (invitation.status === 'revoked') {
      return res.status(400).json({
        valid: false,
        error: 'This invitation has been revoked. Please contact your property administrator for a new invitation.'
      });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({
        valid: false,
        error: 'This invitation link has expired. Please contact your property manager to receive a new link.'
      });
    }

    return res.json({
      valid: true,
      tenant: {
        id: invitation.tenant_id,
        fullName: invitation.tenant_name,
        email: invitation.email,
        phoneNumber: invitation.phone_number,
        propertyName: invitation.property_name,
        unitNumber: invitation.unit_number
      },
      expiresAt: invitation.expires_at
    });
  } catch (error: any) {
    return res.status(500).json({ valid: false, error: error.message || 'Failed to verify invitation' });
  }
});

// Complete Tenant Portal Activation & Set Own Password (Public)
const activatePortalSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters long')
});

authRouter.post('/invitation/:token/activate', async (req, res) => {
  try {
    const { token } = req.params;
    const parse = activatePortalSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long', details: parse.error.issues });
    }

    const { password } = parse.data;

    // Verify token
    const inviteRes = await query(
      `SELECT pi.*, t.id as tenant_id, t.full_name, t.phone_number, t.national_id, t.email as tenant_email
       FROM portal_invitations pi
       JOIN tenants t ON t.id = pi.tenant_id
       WHERE pi.token = $1`,
      [token]
    );

    if (inviteRes.rows.length === 0) {
      return res.status(404).json({ error: 'Invitation not found' });
    }

    const invite = inviteRes.rows[0];

    if (invite.status !== 'pending' || new Date(invite.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Invitation link has expired or has already been used.' });
    }

    // Cryptographically secure password hash (NEVER store plaintext)
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await transaction(async (txDb) => {
      // Check if user account already exists with this email
      let userId: string;
      const userCheck = await txDb.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [invite.email]);

      if (userCheck.rows.length > 0) {
        userId = userCheck.rows[0].id;
        await txDb.query(
          `UPDATE users SET password_hash = $1, role = 'tenant', is_active = TRUE, updated_at = NOW() WHERE id = $2`,
          [passwordHash, userId]
        );
      } else {
        const userInsert = await txDb.query(
          `INSERT INTO users (email, password_hash, full_name, phone_number, national_id, role, is_active)
           VALUES ($1, $2, $3, $4, $5, 'tenant', TRUE)
           RETURNING id`,
          [invite.email.toLowerCase(), passwordHash, invite.full_name, invite.phone_number, invite.national_id]
        );
        userId = userInsert.rows[0].id;
      }

      // Link tenant to user
      await txDb.query(
        `UPDATE tenants SET user_id = $1, portal_status = 'active', updated_at = NOW() WHERE id = $2`,
        [userId, invite.tenant_id]
      );

      // Mark invitation activated
      await txDb.query(
        `UPDATE portal_invitations SET status = 'activated', activated_at = NOW() WHERE id = $1`,
        [invite.id]
      );

      return { userId };
    });

    // Generate JWT token for seamless auto-login
    const tokenJwt = signToken({
      id: result.userId,
      email: invite.email.toLowerCase(),
      role: 'tenant',
      fullName: invite.full_name
    });

    await securityService.createUserSession(
      result.userId, tokenJwt, req.ip,
      req.headers['user-agent'] as string
    );

    await logAudit({
      userId: result.userId,
      action: 'TENANT_PORTAL_ACTIVATED',
      entityType: 'tenants',
      entityId: invite.tenant_id,
      changes: { email: invite.email },
      ipAddress: req.ip
    });

    return res.json({
      message: 'Congratulations! Your KodiPay Tenant Portal account has been activated successfully.',
      token: tokenJwt,
      user: {
        id: result.userId,
        email: invite.email.toLowerCase(),
        fullName: invite.full_name,
        role: 'tenant',
        tenantId: invite.tenant_id
      }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to activate tenant account' });
  }
});
