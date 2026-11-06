/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { query } from '../db/connection.ts';
import { requireAuth, requireRoles, AuthRequest } from '../middleware/auth.ts';
import { logAudit } from '../services/audit.ts';

export const tenantPortalRouter = Router();

// Helper to get tenant ID for authenticated tenant user with strict verification
async function getVerifiedTenantId(userId: string): Promise<string | null> {
  const res = await query(`SELECT id FROM tenants WHERE user_id = $1`, [userId]);
  if (res.rows.length === 0) return null;
  return res.rows[0].id;
}

// 1. Tenant Overview (Assigned Unit, Monthly Rent, Due Date, Total Arrears)
tenantPortalRouter.get('/overview', requireAuth, requireRoles('tenant'), async (req: AuthRequest, res) => {
  try {
    const tenantId = await getVerifiedTenantId(req.user!.id);
    if (!tenantId) {
      return res.status(404).json({ error: 'Tenant profile not linked to your user account. Please contact property management.' });
    }

    // Active Tenancy, Unit and Property Details
    const tenancyRes = await query(
      `SELECT ty.id as tenancy_id, ty.start_date, ty.rent_amount_cents, ty.rent_due_day, ty.deposit_cents, ty.status as tenancy_status,
              ru.id as unit_id, ru.unit_number, ru.floor, ru.unit_type,
              p.id as property_id, p.name as property_name, p.code as property_code, p.address as property_address,
              p.city, p.county, p.estate,
              t.id as tenant_id, t.full_name as tenant_name, t.phone_number, t.email, t.national_id,
              t.emergency_contact_name, t.emergency_contact_phone
       FROM tenants t
       LEFT JOIN tenancies ty ON ty.tenant_id = t.id AND ty.is_active = TRUE
       LEFT JOIN rental_units ru ON ru.id = ty.unit_id
       LEFT JOIN properties p ON p.id = ru.property_id
       WHERE t.id = $1`,
      [tenantId]
    );

    if (tenancyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant profile not found' });
    }

    const info = tenancyRes.rows[0];

    // Tenant Credit Balance
    const creditRes = await query(`SELECT credit_balance_cents FROM tenants WHERE id = $1`, [tenantId]);
    const creditBalanceCents = parseInt(creditRes.rows[0]?.credit_balance_cents || '0', 10);

    // Credit transactions
    const creditTxRes = await query(
      `SELECT * FROM tenant_credit_transactions WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [tenantId]
    );

    // Refund requests
    const refundRes = await query(
      `SELECT * FROM refund_requests WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [tenantId]
    );

    // Total Arrears / Outstanding Balance
    const arrearsRes = await query(
      `SELECT COALESCE(SUM(rc.balance_cents), 0) as total_arrears_cents,
              COUNT(CASE WHEN rc.status = 'overdue' THEN 1 END) as overdue_count
       FROM rent_charges rc
       JOIN tenancies ty ON ty.id = rc.tenancy_id
       WHERE ty.tenant_id = $1 AND rc.status != 'paid'`,
      [tenantId]
    );

    const totalArrearsCents = parseInt(arrearsRes.rows[0].total_arrears_cents, 10);
    const overdueCount = parseInt(arrearsRes.rows[0].overdue_count, 10);

    // Current or Upcoming Billing Charge
    const currentChargeRes = await query(
      `SELECT rc.*
       FROM rent_charges rc
       JOIN tenancies ty ON ty.id = rc.tenancy_id
       WHERE ty.tenant_id = $1
       ORDER BY rc.billing_month DESC, rc.due_date DESC
       LIMIT 1`,
      [tenantId]
    );

    return res.json({
      profile: info,
      financials: {
        totalArrearsCents,
        creditBalanceCents,
        overdueCount,
        currentCharge: currentChargeRes.rows[0] || null
      },
      creditTransactions: creditTxRes.rows,
      refundRequests: refundRes.rows
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch tenant overview' });
  }
});

// 2. Rent Statement / Charges History
tenantPortalRouter.get('/statement', requireAuth, requireRoles('tenant'), async (req: AuthRequest, res) => {
  try {
    const tenantId = await getVerifiedTenantId(req.user!.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'Tenant identity verification failed' });
    }

    const chargesRes = await query(
      `SELECT rc.*, ru.unit_number, p.name as property_name
       FROM rent_charges rc
       JOIN tenancies ty ON ty.id = rc.tenancy_id
       JOIN rental_units ru ON ru.id = ty.unit_id
       JOIN properties p ON p.id = ru.property_id
       WHERE ty.tenant_id = $1
       ORDER BY rc.billing_month DESC, rc.due_date DESC`,
      [tenantId]
    );

    return res.json(chargesRes.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch statement' });
  }
});

// 3. Payment History & Receipts
tenantPortalRouter.get('/payments', requireAuth, requireRoles('tenant'), async (req: AuthRequest, res) => {
  try {
    const tenantId = await getVerifiedTenantId(req.user!.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'Tenant identity verification failed' });
    }

    const paymentsRes = await query(
      `SELECT py.*, r.receipt_number, r.id as receipt_id, r.period_covered, r.remaining_balance_cents
       FROM payments py
       LEFT JOIN receipts r ON r.payment_id = py.id
       WHERE py.tenant_id = $1
       ORDER BY py.payment_date DESC, py.created_at DESC`,
      [tenantId]
    );

    return res.json(paymentsRes.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch payment history' });
  }
});

// 4. Update Permitted Contact Details
const updateContactSchema = z.object({
  phoneNumber: z.string().min(9),
  email: z.string().email(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional()
});

tenantPortalRouter.put('/contact-info', requireAuth, requireRoles('tenant'), async (req: AuthRequest, res) => {
  try {
    const tenantId = await getVerifiedTenantId(req.user!.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'Tenant verification failed' });
    }

    const parse = updateContactSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const { phoneNumber, email, emergencyContactName, emergencyContactPhone } = parse.data;

    // Update tenant contact record
    const updateRes = await query(
      `UPDATE tenants
       SET phone_number = $1, email = $2, emergency_contact_name = $3, emergency_contact_phone = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [phoneNumber, email.toLowerCase(), emergencyContactName || '', emergencyContactPhone || '', tenantId]
    );

    // Also update users table email and phone
    await query(
      `UPDATE users SET email = $1, phone_number = $2, updated_at = NOW() WHERE id = $3`,
      [email.toLowerCase(), phoneNumber, req.user!.id]
    );

    await logAudit({
      userId: req.user!.id,
      action: 'TENANT_CONTACT_INFO_UPDATED',
      entityType: 'tenants',
      entityId: tenantId,
      changes: { phoneNumber, email, emergencyContactName, emergencyContactPhone },
      ipAddress: req.ip
    });

    return res.json({
      message: 'Contact details updated successfully',
      tenant: updateRes.rows[0]
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to update contact info' });
  }
});
