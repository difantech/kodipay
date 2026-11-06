/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db/connection.ts';
import { requireAuth, requireRoles, AuthRequest, verifyPropertyAccess } from '../middleware/auth.ts';
import { logAudit } from '../services/audit.ts';
import { initiateDarajaSTKPush, verifyDarajaTransaction } from '../services/mpesaDaraja.ts';
import { notificationService } from '../services/notificationService.ts';

export const paymentsRouter = Router();

// List Payments
paymentsRouter.get('/', requireAuth, requireRoles('super_admin', 'caretaker', 'landlord', 'accountant'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const { propertyId, status, tenantId, month } = req.query;

    let sql = `
      SELECT py.*,
             t.full_name as tenant_name,
             t.phone_number as tenant_phone,
             ru.unit_number,
             p.id as property_id,
             p.name as property_name,
             r.receipt_number,
             r.id as receipt_id,
             u.full_name as recorded_by_name
      FROM payments py
      JOIN tenants t ON t.id = py.tenant_id
      JOIN tenancies ty ON ty.id = py.tenancy_id
      JOIN rental_units ru ON ru.id = ty.unit_id
      JOIN properties p ON p.id = ru.property_id
      LEFT JOIN receipts r ON r.payment_id = py.id
      LEFT JOIN users u ON u.id = py.recorded_by
      WHERE 1=1
    `;
    const params: any[] = [];

    if (propertyId) {
      params.push(propertyId);
      sql += ` AND p.id = $${params.length}`;
    }

    if (tenantId) {
      params.push(tenantId);
      sql += ` AND py.tenant_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND py.status = $${params.length}`;
    }

    if (month) {
      params.push(`${month}%`);
      sql += ` AND py.payment_date::text LIKE $${params.length}`;
    }

    sql += ` ORDER BY py.payment_date DESC, py.created_at DESC`;

    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch payments' });
  }
});

// -----------------------------------------------------------------------------
// Safaricom M-Pesa Daraja 2.0 API Mock Routes
// -----------------------------------------------------------------------------

const stkPushSchema = z.object({
  phoneNumber: z.string().min(9),
  amountKSh: z.number().positive(),
  accountReference: z.string().default('KODIPAY-RENT'),
  transactionDesc: z.string().optional()
});

paymentsRouter.post('/daraja/stk-push', requireAuth, requireRoles('super_admin', 'landlord', 'accountant'), async (req: AuthRequest, res) => {
  try {
    const parse = stkPushSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const result = await initiateDarajaSTKPush(parse.data);
    return res.json({ success: true, ...result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to initiate M-Pesa STK Push' });
  }
});

const verifyDarajaSchema = z.object({
  transactionCode: z.string().min(5),
  expectedAmountKSh: z.number().positive().optional(),
  expectedPhone: z.string().optional()
});

paymentsRouter.post('/daraja/verify', requireAuth, requireRoles('super_admin', 'landlord', 'accountant'), async (req: AuthRequest, res) => {
  try {
    const parse = verifyDarajaSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const result = await verifyDarajaTransaction(
      parse.data.transactionCode,
      parse.data.expectedAmountKSh,
      parse.data.expectedPhone
    );
    return res.json({ success: result.verified, ...result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to verify M-Pesa transaction' });
  }
});

// Record Payment with Allocation & Receipt Generation
const recordPaymentSchema = z.object({
  tenancyId: z.string().uuid(),
  amountKSh: z.number().positive(),
  paymentMethod: z.enum(['mpesa', 'bank_transfer', 'cash', 'cheque', 'other']),
  transactionReference: z.string().optional(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['confirmed', 'pending_verification']).default('confirmed'),
  notes: z.string().optional(),
  // Optional specific charge ID to allocate against; otherwise FIFO allocation
  targetChargeId: z.string().uuid().optional()
});

paymentsRouter.post('/', requireAuth, requireRoles('super_admin', 'caretaker', 'landlord', 'accountant'), async (req: AuthRequest, res) => {
  try {
    const parse = recordPaymentSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const data = parse.data;
    const user = req.user!;
    const amountCents = Math.round(data.amountKSh * 100);

    // Retrieve tenancy, unit, property, tenant and landlord contact details
    const tenancyRes = await query(
      `SELECT ty.*, ru.id as unit_id, ru.unit_number, p.id as property_id, p.name as property_name, p.landlord_id,
              t.id as tenant_id, t.full_name as tenant_name, t.phone_number as tenant_phone, t.email as tenant_email,
              u.full_name as landlord_name, u.phone_number as landlord_phone, u.email as landlord_email
       FROM tenancies ty
       JOIN rental_units ru ON ru.id = ty.unit_id
       JOIN properties p ON p.id = ru.property_id
       JOIN tenants t ON t.id = ty.tenant_id
       LEFT JOIN users u ON u.id = p.landlord_id
       WHERE ty.id = $1`,
      [data.tenancyId]
    );

    if (tenancyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Tenancy record not found' });
    }

    const tenancy = tenancyRes.rows[0];
    const hasAccess = await verifyPropertyAccess(user, tenancy.property_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Unauthorized to record payment for this property.' });
    }

    // Check duplicate transaction reference for confirmed payments
    const cleanTxRef = data.transactionReference?.trim();
    if (cleanTxRef && data.status === 'confirmed') {
      const dupCheck = await query(
        `SELECT id, payment_reference FROM payments
         WHERE transaction_reference = $1 AND status = 'confirmed'`,
        [cleanTxRef]
      );
      if (dupCheck.rows.length > 0) {
        return res.status(400).json({ 
          error: `Duplicate payment rejected: Transaction reference '${cleanTxRef}' has already been recorded under payment ${dupCheck.rows[0].payment_reference}.` 
        });
      }
    }

    // Generate unique payment reference: PAY-YYYYMMDD-XXXX
    const datePrefix = data.paymentDate.replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const paymentReference = `PAY-${datePrefix}-${randomSuffix}`;

    // Execute atomic transaction for payment, allocation, and receipt
    const transactionResult = await transaction(async (txDb) => {
      // 1. Insert payment record
      const payInsert = await txDb.query(
        `INSERT INTO payments (
           payment_reference, tenancy_id, tenant_id, amount_cents, payment_method,
           transaction_reference, payment_date, status, recorded_by, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          paymentReference,
          tenancy.id,
          tenancy.tenant_id,
          amountCents,
          data.paymentMethod,
          cleanTxRef || null,
          data.paymentDate,
          data.status,
          user.id,
          data.notes || ''
        ]
      );

      const payment = payInsert.rows[0];
      const allocations: any[] = [];
      let coveredPeriods: string[] = [];

      // 2. If confirmed, allocate to outstanding rent charges
      if (data.status === 'confirmed') {
        let unallocatedCents = amountCents;

        // Fetch unpaid or partially paid charges for this tenancy ordered by due date ascending (FIFO)
        let chargesQuery = `
          SELECT * FROM rent_charges
          WHERE tenancy_id = $1 AND status != 'paid' AND balance_cents > 0
        `;
        const cParams: any[] = [tenancy.id];

        if (data.targetChargeId) {
          chargesQuery += ` AND id = $2`;
          cParams.push(data.targetChargeId);
        }

        chargesQuery += ` ORDER BY due_date ASC, billing_month ASC`;

        const chargesRes = await txDb.query(chargesQuery, cParams);

        for (const charge of chargesRes.rows) {
          if (unallocatedCents <= 0) break;

          const allocAmount = Math.min(unallocatedCents, parseInt(charge.balance_cents, 10));
          const newAmountPaid = parseInt(charge.amount_paid_cents, 10) + allocAmount;
          const newBalance = parseInt(charge.rent_due_cents, 10) - newAmountPaid;
          const newStatus = newBalance <= 0 ? 'paid' : 'partially_paid';

          // Insert allocation
          const allocInsert = await txDb.query(
            `INSERT INTO payment_allocations (payment_id, rent_charge_id, allocated_amount_cents)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [payment.id, charge.id, allocAmount]
          );
          allocations.push(allocInsert.rows[0]);

          // Update charge
          await txDb.query(
            `UPDATE rent_charges
             SET amount_paid_cents = $1, balance_cents = $2, status = $3, updated_at = NOW()
             WHERE id = $4`,
            [newAmountPaid, newBalance, newStatus, charge.id]
          );

          coveredPeriods.push(charge.billing_month);
          unallocatedCents -= allocAmount;
        }

        // Excess rent management: store excess as credit balance and record credit transaction
        let excessCreditCents = 0;
        if (unallocatedCents > 0) {
          excessCreditCents = unallocatedCents;

          const tRes = await txDb.query(`SELECT credit_balance_cents FROM tenants WHERE id = $1`, [tenancy.tenant_id]);
          const currentCredit = parseInt(tRes.rows[0]?.credit_balance_cents || '0', 10);
          const newCredit = currentCredit + excessCreditCents;

          await txDb.query(
            `UPDATE tenants SET credit_balance_cents = $1, updated_at = NOW() WHERE id = $2`,
            [newCredit, tenancy.tenant_id]
          );

          await txDb.query(
            `UPDATE payments SET excess_credit_cents = $1 WHERE id = $2`,
            [excessCreditCents, payment.id]
          );

          await txDb.query(
            `INSERT INTO tenant_credit_transactions (
               tenant_id, tenancy_id, type, amount_cents, running_balance_cents, payment_id, notes
             )
             VALUES ($1, $2, 'excess_payment', $3, $4, $5, $6)`,
            [
              tenancy.tenant_id,
              tenancy.id,
              excessCreditCents,
              newCredit,
              payment.id,
              `Excess payment of KSh ${(excessCreditCents / 100).toLocaleString()} credited & carried forward`
            ]
          );
        }

        // Calculate remaining outstanding balance for this tenant
        const remBalRes = await txDb.query(
          `SELECT COALESCE(SUM(balance_cents), 0) as balance_cents
           FROM rent_charges rc
           JOIN tenancies ty ON ty.id = rc.tenancy_id
           WHERE ty.tenant_id = $1 AND rc.status != 'paid'`,
          [tenancy.tenant_id]
        );
        const remainingBalanceCents = parseInt(remBalRes.rows[0].balance_cents, 10);

        // 3. Generate unique receipt
        const receiptNo = `RCP-${datePrefix}-${Math.floor(1000 + Math.random() * 9000)}`;
        const periodStr = coveredPeriods.length > 0 ? coveredPeriods.join(', ') : 'Advance Rent / Unallocated';

        const receiptInsert = await txDb.query(
          `INSERT INTO receipts (
             receipt_number, payment_id, tenant_id, unit_id, amount_cents,
             payment_date, payment_method, transaction_reference, period_covered,
             remaining_balance_cents, qr_code_data
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           RETURNING *`,
          [
            receiptNo,
            payment.id,
            tenancy.tenant_id,
            tenancy.unit_id,
            amountCents,
            data.paymentDate,
            data.paymentMethod,
            cleanTxRef || 'N/A',
            periodStr,
            remainingBalanceCents,
            JSON.stringify({ receiptNo, tenant: tenancy.tenant_name, amountKSh: data.amountKSh, date: data.paymentDate, txRef: cleanTxRef })
          ]
        );

        return { payment, allocations, receipt: receiptInsert.rows[0] };
      }

      return { payment, allocations, receipt: null };
    });

    await logAudit({
      userId: user.id,
      action: 'PAYMENT_RECORDED',
      entityType: 'payments',
      entityId: transactionResult.payment.id,
      changes: {
        paymentReference,
        amountKSh: data.amountKSh,
        method: data.paymentMethod,
        txRef: cleanTxRef,
        status: data.status,
        receiptNumber: transactionResult.receipt?.receipt_number
      },
      ipAddress: req.ip
    });

    // Resolve property owner details (fallback to super_admin if landlord_id is null)
    let ownerName = tenancy.landlord_name;
    let ownerPhone = tenancy.landlord_phone;
    let ownerEmail = tenancy.landlord_email;
    let ownerId = tenancy.landlord_id;

    if (!ownerPhone || !ownerEmail) {
      const adminRes = await query(
        `SELECT id, full_name, phone_number, email FROM users WHERE role = 'super_admin' ORDER BY created_at ASC LIMIT 1`
      );
      if (adminRes.rows.length > 0) {
        ownerId = ownerId || adminRes.rows[0].id;
        ownerName = ownerName || adminRes.rows[0].full_name;
        ownerPhone = ownerPhone || adminRes.rows[0].phone_number;
        ownerEmail = ownerEmail || adminRes.rows[0].email;
      }
    }

    let notifResult: any = null;
    // Trigger real-time notifications to BOTH property owner and tenant if confirmed
    if (data.status === 'confirmed') {
      try {
        notifResult = await notificationService.notifyPaymentReceived({
          paymentId: transactionResult.payment.id,
          receiptId: transactionResult.receipt?.id,
          receiptNumber: transactionResult.receipt?.receipt_number,
          tenancyId: tenancy.id,
          amountCents: amountCents,
          paymentMethod: data.paymentMethod,
          transactionReference: cleanTxRef,
          paymentDate: data.paymentDate,
          tenantName: tenancy.tenant_name,
          tenantPhone: tenancy.tenant_phone,
          tenantEmail: tenancy.tenant_email,
          unitNumber: tenancy.unit_number,
          propertyName: tenancy.property_name,
          landlordId: ownerId,
          landlordName: ownerName,
          landlordPhone: ownerPhone,
          landlordEmail: ownerEmail,
          remainingBalanceCents: transactionResult.receipt?.remaining_balance_cents || 0
        });
      } catch (notifErr) {
        console.error('Failed to dispatch payment notifications:', notifErr);
      }
    }

    return res.status(201).json({
      message: data.status === 'confirmed' 
        ? `Payment of KSh ${data.amountKSh.toLocaleString()} recorded and confirmed! Real-time notifications dispatched to owner (${ownerPhone}) and tenant (${tenancy.tenant_phone}).`
        : 'Payment recorded and pending verification. Charge balances and notifications will trigger once verified.',
      moneyCollectedKSh: data.amountKSh,
      notificationsDispatched: notifResult?.dispatchedCount || 0,
      notificationLogs: notifResult?.logs || [],
      ownerNotified: {
        name: ownerName,
        phone: ownerPhone,
        email: ownerEmail
      },
      tenantNotified: {
        name: tenancy.tenant_name,
        phone: tenancy.tenant_phone,
        email: tenancy.tenant_email
      },
      ...transactionResult
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Failed to record payment' });
  }
});

// Confirm Pending Payment
paymentsRouter.post('/:id/confirm', requireAuth, requireRoles('super_admin', 'landlord', 'accountant'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const payRes = await query(
      `SELECT py.*, ty.tenant_id, ty.unit_id, ru.unit_number,
              t.full_name as tenant_name, t.phone_number as tenant_phone, t.email as tenant_email,
              p.id as property_id, p.name as property_name, p.landlord_id,
              u.full_name as landlord_name, u.phone_number as landlord_phone, u.email as landlord_email
       FROM payments py
       JOIN tenancies ty ON ty.id = py.tenancy_id
       JOIN rental_units ru ON ru.id = ty.unit_id
       JOIN properties p ON p.id = ru.property_id
       JOIN tenants t ON t.id = ty.tenant_id
       LEFT JOIN users u ON u.id = p.landlord_id
       WHERE py.id = $1`,
      [id]
    );

    if (payRes.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const payment = payRes.rows[0];
    if (payment.status === 'confirmed') {
      return res.status(400).json({ error: 'Payment is already confirmed.' });
    }
    if (payment.status === 'reversed') {
      return res.status(400).json({ error: 'Cannot confirm a reversed payment.' });
    }

    const hasAccess = await verifyPropertyAccess(user, payment.property_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Unauthorized to confirm payment for this property.' });
    }

    // Run allocation and receipt in transaction
    const result = await transaction(async (txDb) => {
      await txDb.query(
        `UPDATE payments SET status = 'confirmed', updated_at = NOW() WHERE id = $1`,
        [id]
      );

      let unallocatedCents = parseInt(payment.amount_cents, 10);
      const coveredPeriods: string[] = [];

      const chargesRes = await txDb.query(
        `SELECT * FROM rent_charges
         WHERE tenancy_id = $1 AND status != 'paid' AND balance_cents > 0
         ORDER BY due_date ASC`,
        [payment.tenancy_id]
      );

      for (const charge of chargesRes.rows) {
        if (unallocatedCents <= 0) break;
        const allocAmount = Math.min(unallocatedCents, parseInt(charge.balance_cents, 10));
        const newPaid = parseInt(charge.amount_paid_cents, 10) + allocAmount;
        const newBal = parseInt(charge.rent_due_cents, 10) - newPaid;
        const newStatus = newBal <= 0 ? 'paid' : 'partially_paid';

        await txDb.query(
          `INSERT INTO payment_allocations (payment_id, rent_charge_id, allocated_amount_cents)
           VALUES ($1, $2, $3)`,
          [id, charge.id, allocAmount]
        );

        await txDb.query(
          `UPDATE rent_charges
           SET amount_paid_cents = $1, balance_cents = $2, status = $3, updated_at = NOW()
           WHERE id = $4`,
          [newPaid, newBal, newStatus, charge.id]
        );

        coveredPeriods.push(charge.billing_month);
        unallocatedCents -= allocAmount;
      }

      // Excess rent management: store excess as credit balance and record credit transaction
      let excessCreditCents = 0;
      if (unallocatedCents > 0) {
        excessCreditCents = unallocatedCents;

        const tRes = await txDb.query(`SELECT credit_balance_cents FROM tenants WHERE id = $1`, [payment.tenant_id]);
        const currentCredit = parseInt(tRes.rows[0]?.credit_balance_cents || '0', 10);
        const newCredit = currentCredit + excessCreditCents;

        await txDb.query(
          `UPDATE tenants SET credit_balance_cents = $1, updated_at = NOW() WHERE id = $2`,
          [newCredit, payment.tenant_id]
        );

        await txDb.query(
          `UPDATE payments SET excess_credit_cents = $1 WHERE id = $2`,
          [excessCreditCents, payment.id]
        );

        await txDb.query(
          `INSERT INTO tenant_credit_transactions (
             tenant_id, tenancy_id, type, amount_cents, running_balance_cents, payment_id, notes
           )
           VALUES ($1, $2, 'excess_payment', $3, $4, $5, $6)`,
          [
            payment.tenant_id,
            payment.tenancy_id,
            excessCreditCents,
            newCredit,
            payment.id,
            `Excess payment of KSh ${(excessCreditCents / 100).toLocaleString()} confirmed & credited`
          ]
        );
      }

      // Check remaining balance
      const remRes = await txDb.query(
        `SELECT COALESCE(SUM(balance_cents), 0) as balance_cents
         FROM rent_charges rc
         JOIN tenancies ty ON ty.id = rc.tenancy_id
         WHERE ty.tenant_id = $1 AND rc.status != 'paid'`,
        [payment.tenant_id]
      );
      const remainingBalanceCents = parseInt(remRes.rows[0].balance_cents, 10);

      // Generate receipt if not already exists
      const rawDateStr = typeof payment.payment_date === 'string'
        ? payment.payment_date
        : (payment.payment_date?.toISOString?.() || new Date().toISOString());
      const datePrefix = rawDateStr.slice(0, 10).replace(/-/g, '');
      const receiptNo = `RCP-${datePrefix}-${Math.floor(1000 + Math.random() * 9000)}`;
      const periodStr = coveredPeriods.length > 0 ? coveredPeriods.join(', ') : 'Advance Rent';

      const receiptInsert = await txDb.query(
        `INSERT INTO receipts (
           receipt_number, payment_id, tenant_id, unit_id, amount_cents,
           payment_date, payment_method, transaction_reference, period_covered,
           remaining_balance_cents
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          receiptNo,
          payment.id,
          payment.tenant_id,
          payment.unit_id,
          payment.amount_cents,
          payment.payment_date,
          payment.payment_method,
          payment.transaction_reference || 'N/A',
          periodStr,
          remainingBalanceCents
        ]
      );

      return receiptInsert.rows[0];
    });

    await logAudit({
      userId: user.id,
      action: 'PAYMENT_CONFIRMED',
      entityType: 'payments',
      entityId: id,
      changes: { receiptNumber: result.receipt_number },
      ipAddress: req.ip
    });

    // Resolve property owner details (fallback to super_admin if landlord_id is null)
    let ownerName = payment.landlord_name;
    let ownerPhone = payment.landlord_phone;
    let ownerEmail = payment.landlord_email;
    let ownerId = payment.landlord_id;

    if (!ownerPhone || !ownerEmail) {
      const adminRes = await query(
        `SELECT id, full_name, phone_number, email FROM users WHERE role = 'super_admin' ORDER BY created_at ASC LIMIT 1`
      );
      if (adminRes.rows.length > 0) {
        ownerId = ownerId || adminRes.rows[0].id;
        ownerName = ownerName || adminRes.rows[0].full_name;
        ownerPhone = ownerPhone || adminRes.rows[0].phone_number;
        ownerEmail = ownerEmail || adminRes.rows[0].email;
      }
    }

    // Real-time notification dispatch to property owner and tenant
    const dateFormatted = typeof payment.payment_date === 'string'
      ? payment.payment_date.slice(0, 10)
      : payment.payment_date?.toISOString?.().slice(0, 10) || new Date().toISOString().slice(0, 10);

    let notifResult: any = null;
    try {
      notifResult = await notificationService.notifyPaymentReceived({
        paymentId: payment.id,
        receiptId: result.id,
        receiptNumber: result.receipt_number,
        tenancyId: payment.tenancy_id,
        amountCents: parseInt(payment.amount_cents, 10),
        paymentMethod: payment.payment_method,
        transactionReference: payment.transaction_reference,
        paymentDate: dateFormatted,
        tenantName: payment.tenant_name,
        tenantPhone: payment.tenant_phone,
        tenantEmail: payment.tenant_email,
        unitNumber: payment.unit_number,
        propertyName: payment.property_name,
        landlordId: ownerId,
        landlordName: ownerName,
        landlordPhone: ownerPhone,
        landlordEmail: ownerEmail,
        remainingBalanceCents: result.remaining_balance_cents
      });
    } catch (notifErr) {
      console.error('Failed to dispatch payment confirmed notifications:', notifErr);
    }

    return res.json({
      message: `Payment verified and confirmed! Notifications dispatched to owner (${ownerPhone}) and tenant (${payment.tenant_phone}).`,
      moneyCollectedKSh: parseInt(payment.amount_cents, 10) / 100,
      notificationsDispatched: notifResult?.dispatchedCount || 0,
      receipt: result
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to confirm payment' });
  }
});

// Payment Reversal (Roll back financial impact - STRICTLY Super Administrator Only)
const reversePaymentSchema = z.object({
  reversalReason: z.string().min(5, 'A clear reason for reversal is mandatory.')
});

paymentsRouter.post('/:id/reverse', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const parse = reversePaymentSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Please provide a valid reason for reversing this payment' });
    }

    const { reversalReason } = parse.data;

    const payRes = await query(
      `SELECT py.*, ru.property_id
       FROM payments py
       JOIN tenancies ty ON ty.id = py.tenancy_id
       JOIN rental_units ru ON ru.id = ty.unit_id
       WHERE py.id = $1`,
      [id]
    );

    if (payRes.rows.length === 0) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    const payment = payRes.rows[0];
    if (payment.status === 'reversed') {
      return res.status(400).json({ error: 'This payment has already been reversed.' });
    }

    const hasAccess = await verifyPropertyAccess(user, payment.property_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Unauthorized to reverse payment for this property.' });
    }

    await transaction(async (txDb) => {
      // 1. Mark payment as reversed
      await txDb.query(
        `UPDATE payments
         SET status = 'reversed', reversal_reason = $1, updated_at = NOW()
         WHERE id = $2`,
        [reversalReason, id]
      );

      // 2. Fetch allocations made by this payment
      const allocs = await txDb.query(
        `SELECT * FROM payment_allocations WHERE payment_id = $1`,
        [id]
      );

      // 3. Roll back allocations from each rent charge
      for (const alloc of allocs.rows) {
        const chargeRes = await txDb.query(`SELECT * FROM rent_charges WHERE id = $1`, [alloc.rent_charge_id]);
        if (chargeRes.rows.length > 0) {
          const charge = chargeRes.rows[0];
          const restoredPaid = Math.max(0, parseInt(charge.amount_paid_cents, 10) - parseInt(alloc.allocated_amount_cents, 10));
          const restoredBalance = parseInt(charge.rent_due_cents, 10) - restoredPaid;
          const restoredStatus = restoredPaid === 0 ? 'unpaid' : 'partially_paid';

          await txDb.query(
            `UPDATE rent_charges
             SET amount_paid_cents = $1, balance_cents = $2, status = $3, updated_at = NOW()
             WHERE id = $4`,
            [restoredPaid, restoredBalance, restoredStatus, charge.id]
          );
        }
      }

      // Remove allocations
      await txDb.query(`DELETE FROM payment_allocations WHERE payment_id = $1`, [id]);
    });

    await logAudit({
      userId: user.id,
      action: 'PAYMENT_REVERSED',
      entityType: 'payments',
      entityId: id,
      changes: {
        paymentReference: payment.payment_reference,
        amountCents: payment.amount_cents,
        reason: reversalReason
      },
      ipAddress: req.ip
    });

    return res.json({ message: 'Payment successfully reversed and charge balances restored.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to reverse payment' });
  }
});
