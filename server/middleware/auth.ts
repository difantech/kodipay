/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db/connection.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'kodipay-kenya-production-secure-key-2026';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: 'super_admin' | 'caretaker' | 'tenant';
  fullName: string;
  tenantId?: string | null;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export function signToken(user: AuthenticatedUser): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
      tenantId: user.tenantId || null
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

import { securityService } from '../services/securityService.ts';

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Validate active session against user_sessions table and check inactivity timeout
    const sessionCheck = await securityService.validateSession(token);
    if (!sessionCheck.valid) {
      return res.status(401).json({
        error: sessionCheck.reason || 'Session expired or revoked. Please sign in again.',
        code: 'SESSION_REVOKED_OR_EXPIRED'
      });
    }
    
    // Verify user is still active in database
    const userRes = await query(
      `SELECT id, email, full_name, role, is_active FROM users WHERE id = $1`,
      [decoded.id]
    );

    if (userRes.rows.length === 0 || !userRes.rows[0].is_active) {
      return res.status(401).json({ error: 'User account is inactive or no longer exists.' });
    }

    const dbUser = userRes.rows[0];

    // If tenant, retrieve tenant record id
    let tenantId = decoded.tenantId;
    if (dbUser.role === 'tenant' && !tenantId) {
      const tenantRes = await query(`SELECT id FROM tenants WHERE user_id = $1`, [dbUser.id]);
      if (tenantRes.rows.length > 0) {
        tenantId = tenantRes.rows[0].id;
      }
    }

    req.user = {
      id: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      fullName: dbUser.full_name,
      tenantId: tenantId || null
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired authentication session.' });
  }
}

/**
 * Guard routes by required user roles:
 * - super_admin: Full access to all modules, financial reporting, system settings, and user management.
 * - caretaker: Data entry only (recording payments, registering tenants, generating monthly billing charges).
 * - tenant: Dedicated tenant portal only.
 */
export function requireRoles(...roles: Array<'super_admin' | 'caretaker' | 'tenant' | 'landlord' | 'accountant'>) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Caretaker acts as data entry operator (mapping accountant/landlord data entry permissions)
    const userRole = req.user.role;
    const hasRole = roles.includes(userRole) || 
      (userRole === 'caretaker' && (roles.includes('accountant') || roles.includes('landlord'))) ||
      (userRole === 'super_admin' && (roles.includes('landlord') || roles.includes('accountant')));

    if (!hasRole) {
      return res.status(403).json({ 
        error: `Access denied. Caretaker role is restricted to data entry only. Role '${req.user.role}' lacks permission for this action.` 
      });
    }

    next();
  };
}

/**
 * Verify property-level authorization:
 * Super Admin & Caretaker (Data Entry) have access to record data for properties.
 */
export async function verifyPropertyAccess(user: AuthenticatedUser, propertyId: string): Promise<boolean> {
  if (user.role === 'super_admin' || user.role === 'caretaker') {
    return true;
  }

  return false;
}
