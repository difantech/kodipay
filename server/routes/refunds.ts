/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db/connection.ts';
import { requireAuth, requireRoles, AuthRequest } from '../middleware/auth.ts';
import { logAudit } from '../services/audit.ts';

export const refundsRouter = Router();

// List Refund Requests
refundsRouter.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const { status, tenantId } = req.query;

    let sql = `
      SELECT rr.*,
             t.full_name as tenant_name,
             t.phone_number as tenant_phone,
             t.credit_balance_cents,
             ru.unit_number,
             p.name as property_name,
             u_req.full_name as requested_by_name,
             u_rev.full_name as reviewed_by_name
      FROM refund_requests rr
      JOIN tenants t ON t.id = rr.tenant_id
      LEFT JOIN tenancies ty ON ty.id = rr.tenancy_id
      LEFT JOIN rental_units ru ON ru.id = ty.unit_id
      LEFT JOIN properties p ON p.id = ru.property_id
      LEFT JOIN users u_req ON u_req.id = rr.requested_by
      LEFT JOIN users u_rev ON u_rev.id = rr.reviewed_by
      WHERE 1=1
    `;
    const params: any[] = [];

    // Tenant role isolation
    if (user.role === 'tenant') {
      params.push(user.tenantId);
      sql += ` AND rr.tenant_id = $${params.length}`;
    } else if (tenantId) {
      params.push(tenantId);
      sql += ` AND rr.tenant_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND rr.status = $${params.length}`;
    }

    sql += ` ORDER BY rr.created_at DESC`;

    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch refund requests' });
  }
});

// Request Refund (Tenant or Staff/Admin)
const requestRefundSchema = z.object({
  tenantId: z.string().uuid().optional(),
  amountKSh: z.number().positive('Refund amount must be greater than 0'),
  reason: z.string().min(5, 'A clear reason for the refund is required'),
  paymentMethod: z.enum(['mpesa', 'bank_transfer', 'cash', 'cheque']).default('mpesa'),
  recipientDetails: z.string().min(5, 'Recipient mobile phone or bank account is required')
});

refundsRouter.post('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const parse = requestRefundSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const data = parse.data;
    const targetTenantId = user.role === 'tenant' ? user.tenantId : (data.tenantId || user.tenantId);

    if (!targetTenantId) {
      return res.status(400).json({ error: 'Tenant ID is required for refund request' });
    }

    // Verify tenant and credit balance
    const tenantRes = await query(
      `SELECT t.*, ty.id as active_tenancy_id
       FROM tenants t
       LEFT JOIN tenancies ty ON ty.tenant_id = t.id AND ty.is_active = TRUE
       WHERE t.id = $1`,
      [targetTenantId]
    );

    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant record not found' });
    }

    const tenant = tenantRes.rows[0];
    const creditBalanceCents = parseInt(tenant.credit_balance_cents || '0', 10);
    const requestedCents = Math.round(data.amountKSh * 100);

    // Rule: Prevent refunds exceeding available credit balance
    if (requestedCents > creditBalanceCents) {
      return res.status(400).json({
        error: `Requested refund of KSh ${data.amountKSh.toLocaleString()} exceeds available credit balance of KSh ${(creditBalanceCents / 100).toLocaleString()}`
      });
    }

    // Check for existing pending refund requests to prevent double claiming
    const pendingRes = await query(
      `SELECT COALESCE(SUM(amount_cents), 0) as pending_cents
       FROM refund_requests
       WHERE tenant_id = $1 AND status IN ('pending', 'approved')`,
      [targetTenantId]
    );
    const existingPendingCents = parseInt(pendingRes.rows[0].pending_cents, 10);

    if (existingPendingCents + requestedCents > creditBalanceCents) {
      return res.status(400).json({
        error: `Existing pending refund requests of KSh ${(existingPendingCents / 100).toLocaleString()} leave insufficient available credit for this request.`
      });
    }

    const insertRes = await query(
      `INSERT INTO refund_requests (
         tenant_id, tenancy_id, amount_cents, reason, payment_method, recipient_details,
         status, requested_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING *`,
      [
        targetTenantId,
        tenant.active_tenancy_id || null,
        requestedCents,
        data.reason,
        data.paymentMethod,
        data.recipientDetails,
        user.id
      ]
    );

    await logAudit({
      userId: user.id,
      action: 'REFUND_REQUESTED',
      entityType: 'refund_requests',
      entityId: insertRes.rows[0].id,
      changes: {
        tenantId: targetTenantId,
        amountKSh: data.amountKSh,
        recipientDetails: data.recipientDetails,
        reason: data.reason
      },
      ipAddress: req.ip
    });

    return res.status(201).json({
      message: `Refund request for KSh ${data.amountKSh.toLocaleString()} submitted successfully. Awaiting administrator review.`,
      refund: insertRes.rows[0]
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to submit refund request' });
  }
});

// Approve Refund Request (Super Admin Only)
refundsRouter.post('/:id/approve', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const refundRes = await query(`SELECT * FROM refund_requests WHERE id = $1`, [id]);
    if (refundRes.rows.length === 0) {
      return res.status(404).json({ error: 'Refund request not found' });
    }

    const refund = refundRes.rows[0];
    if (refund.status !== 'pending') {
      return res.status(400).json({ error: `Cannot approve request with status '${refund.status}'` });
    }

    const updatedRes = await query(
      `UPDATE refund_requests
       SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [user.id, id]
    );

    await logAudit({
      userId: user.id,
      action: 'REFUND_APPROVED',
      entityType: 'refund_requests',
      entityId: id,
      changes: { status: 'approved' },
      ipAddress: req.ip
    });

    return res.json({
      message: 'Refund request approved. Ready for payment disbursement.',
      refund: updatedRes.rows[0]
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to approve refund' });
  }
});

// Reject Refund Request (Super Admin Only)
refundsRouter.post('/:id/reject', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const { rejectionReason } = req.body;

    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const refundRes = await query(`SELECT * FROM refund_requests WHERE id = $1`, [id]);
    if (refundRes.rows.length === 0) {
      return res.status(404).json({ error: 'Refund request not found' });
    }

    const refund = refundRes.rows[0];
    if (refund.status === 'completed') {
      return res.status(400).json({ error: 'Cannot reject an already completed refund' });
    }

    const updatedRes = await query(
      `UPDATE refund_requests
       SET status = 'rejected', reviewed_by = $1, reviewed_at = NOW(), rejection_reason = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [user.id, rejectionReason.trim(), id]
    );

    await logAudit({
      userId: user.id,
      action: 'REFUND_REJECTED',
      entityType: 'refund_requests',
      entityId: id,
      changes: { rejectionReason: rejectionReason.trim() },
      ipAddress: req.ip
    });

    return res.json({
      message: 'Refund request rejected.',
      refund: updatedRes.rows[0]
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to reject refund' });
  }
});

// Complete Refund Disbursal (Deducts credit balance and records credit transaction)
const completeRefundSchema = z.object({
  paymentReference: z.string().min(3, 'Disbursal transaction/reference code is required (e.g. M-Pesa code)')
});

refundsRouter.post('/:id/complete', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const user = req.user!;
    const parse = completeRefundSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const { paymentReference } = parse.data;

    let result: any = null;

    await transaction(async (txDb) => {
      const refundRes = await txDb.query(
        `SELECT rr.*, t.credit_balance_cents, t.full_name as tenant_name
         FROM refund_requests rr
         JOIN tenants t ON t.id = rr.tenant_id
         WHERE rr.id = $1`,
        [id]
      );

      if (refundRes.rows.length === 0) {
        throw new Error('Refund request not found');
      }

      const refund = refundRes.rows[0];
      if (refund.status === 'completed') {
        throw new Error('This refund has already been completed');
      }

      const currentCreditCents = parseInt(refund.credit_balance_cents || '0', 10);
      const refundAmountCents = parseInt(refund.amount_cents, 10);

      if (refundAmountCents > currentCreditCents) {
        throw new Error(`Tenant's current credit balance (KSh ${(currentCreditCents / 100).toLocaleString()}) is lower than refund amount (KSh ${(refundAmountCents / 100).toLocaleString()})`);
      }

      const newCreditBalanceCents = currentCreditCents - refundAmountCents;

      // 1. Deduct credit from tenant
      await txDb.query(
        `UPDATE tenants SET credit_balance_cents = $1, updated_at = NOW() WHERE id = $2`,
        [newCreditBalanceCents, refund.tenant_id]
      );

      // 2. Mark refund as completed
      const updateRefund = await txDb.query(
        `UPDATE refund_requests
         SET status = 'completed', reviewed_by = $1, reviewed_at = COALESCE(reviewed_at, NOW()),
             completed_at = NOW(), payment_reference = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [user.id, paymentReference.trim().toUpperCase(), id]
      );

      // 3. Record in tenant_credit_transactions ledger
      await txDb.query(
        `INSERT INTO tenant_credit_transactions (
           tenant_id, tenancy_id, type, amount_cents, running_balance_cents, refund_request_id, notes
         )
         VALUES ($1, $2, 'refund', $3, $4, $5, $6)`,
        [
          refund.tenant_id,
          refund.tenancy_id,
          refundAmountCents,
          newCreditBalanceCents,
          id,
          `Refund disbursed via ${refund.payment_method.toUpperCase()} (Ref: ${paymentReference.trim().toUpperCase()}). Recipient: ${refund.recipient_details}`
        ]
      );

      result = updateRefund.rows[0];
    });

    await logAudit({
      userId: user.id,
      action: 'REFUND_COMPLETED',
      entityType: 'refund_requests',
      entityId: id,
      changes: { paymentReference: paymentReference.trim().toUpperCase() },
      ipAddress: req.ip
    });

    return res.json({
      message: `Refund of KSh ${(parseInt(result.amount_cents, 10) / 100).toLocaleString()} successfully processed and deducted from tenant credit balance.`,
      refund: result
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to complete refund disbursal' });
  }
});
