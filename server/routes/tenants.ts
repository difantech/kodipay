/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, transaction } from '../db/connection.ts';
import { requireAuth, requireRoles, AuthRequest, verifyPropertyAccess } from '../middleware/auth.ts';
import { logAudit } from '../services/audit.ts';
import { generateChargeForTenancy } from '../services/billingService.ts';

export const tenantsRouter = Router();

// List / Search Tenants
tenantsRouter.get('/', requireAuth, requireRoles('super_admin', 'caretaker'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const search = req.query.search as string;

    let sql = `
      SELECT t.*,
             u.unit_number,
             u.id as unit_id,
             p.id as property_id,
             p.name as property_name,
             p.code as property_code,
             ty.id as tenancy_id,
             ty.rent_amount_cents,
             ty.start_date as tenancy_start_date,
             ty.is_active as is_tenancy_active,
             COALESCE(SUM(rc.balance_cents), 0) as total_balance_cents
      FROM tenants t
      LEFT JOIN tenancies ty ON ty.tenant_id = t.id AND ty.is_active = TRUE
      LEFT JOIN rental_units u ON u.id = ty.unit_id
      LEFT JOIN properties p ON p.id = u.property_id
      LEFT JOIN rent_charges rc ON rc.tenancy_id = ty.id AND rc.status != 'paid'
      WHERE 1=1
    `;
    const params: any[] = [];

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      sql += ` AND (
        LOWER(t.full_name) LIKE $${params.length} OR
        LOWER(t.phone_number) LIKE $${params.length} OR
        LOWER(t.national_id) LIKE $${params.length} OR
        LOWER(COALESCE(p.name, '')) LIKE $${params.length} OR
        LOWER(COALESCE(u.unit_number, '')) LIKE $${params.length}
      )`;
    }

    sql += ` GROUP BY t.id, u.unit_number, u.id, p.id, p.name, p.code, ty.id, ty.rent_amount_cents, ty.start_date, ty.is_active
             ORDER BY t.created_at DESC`;

    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch tenants' });
  }
});

// Register Tenant & Optionally Assign Unit in One Atomic Workflow
const registerTenantSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phoneNumber: z.string().min(9),
  nationalId: z.string().min(4),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  notes: z.string().optional(),
  // Tenancy assignment fields (optional at registration)
  unitId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  monthlyRentKSh: z.number().positive().optional(),
  depositKSh: z.number().min(0).optional(),
  rentDueDay: z.number().int().min(1).max(28).optional().default(5),
  createPortalLogin: z.boolean().optional().default(false),
  portalPassword: z.string().min(8).optional()
});

tenantsRouter.post('/', requireAuth, requireRoles('super_admin', 'caretaker'), async (req: AuthRequest, res) => {
  try {
    const parse = registerTenantSchema.safeParse(req.body);
    if (!parse.success) {
      const fieldMessages = parse.error.issues.map((i) => `${i.path.join('.') || 'field'}: ${i.message}`).join(', ');
      return res.status(400).json({
        error: `Validation failed: ${fieldMessages}`,
        details: parse.error.issues,
        fields: parse.error.issues.map((i) => i.path.join('.'))
      });
    }

    const data = parse.data;
    const user = req.user!;

    // Check for duplicate tenant by email, phone, or national ID
    const existingEmail = await query(`SELECT id, full_name FROM tenants WHERE LOWER(email) = LOWER($1)`, [data.email]);
    if (existingEmail.rows.length > 0) {
      return res.status(409).json({
        error: `A tenant with email '${data.email}' is already registered (${existingEmail.rows[0].full_name}).`,
        field: 'email'
      });
    }

    const existingPhone = await query(`SELECT id, full_name FROM tenants WHERE phone_number = $1`, [data.phoneNumber]);
    if (existingPhone.rows.length > 0) {
      return res.status(409).json({
        error: `A tenant with phone number '${data.phoneNumber}' is already registered (${existingPhone.rows[0].full_name}).`,
        field: 'phoneNumber'
      });
    }

    const existingNatId = await query(`SELECT id, full_name FROM tenants WHERE national_id = $1`, [data.nationalId]);
    if (existingNatId.rows.length > 0) {
      return res.status(409).json({
        error: `A tenant with National ID '${data.nationalId}' is already registered (${existingNatId.rows[0].full_name}).`,
        field: 'nationalId'
      });
    }

    // If unit assignment is requested, verify property access and unit vacancy
    if (data.unitId) {
      if (!data.startDate) {
        return res.status(400).json({
          error: 'Tenancy start date (YYYY-MM-DD) is required when assigning a rental unit.',
          field: 'startDate'
        });
      }

      const unitRes = await query(
        `SELECT ru.*, p.landlord_id, p.name as property_name
         FROM rental_units ru
         JOIN properties p ON p.id = ru.property_id
         WHERE ru.id = $1 AND ru.archived_at IS NULL`,
        [data.unitId]
      );

      if (unitRes.rows.length === 0) {
        return res.status(404).json({ error: 'Selected rental unit does not exist.', field: 'unitId' });
      }

      const unit = unitRes.rows[0];
      const hasAccess = await verifyPropertyAccess(user, unit.property_id);
      if (!hasAccess) {
        return res.status(403).json({ error: 'You do not have permission to assign units in this property.' });
      }

      // Check for active tenancy on this unit (Prevent overlapping active tenancies)
      const activeTenancyCheck = await query(
        `SELECT id FROM tenancies WHERE unit_id = $1 AND is_active = TRUE`,
        [data.unitId]
      );
      if (activeTenancyCheck.rows.length > 0 || unit.status !== 'vacant') {
        return res.status(409).json({ 
          error: `Unit '${unit.unit_number}' in ${unit.property_name} is already occupied. Multiple active tenancies for the same unit are prevented.`,
          field: 'unitId'
        });
      }
    }

    // Atomic transaction for tenant, optional user login, and tenancy assignment
    const result = await transaction(async (txDb) => {
      let createdUserId: string | null = null;

      // Create tenant portal login if requested
      if (data.createPortalLogin && data.portalPassword) {
        // Check if email already used
        const existingUser = await txDb.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [data.email]);
        if (existingUser.rows.length > 0) {
          const err: any = new Error(`A user login account with email '${data.email}' already exists.`);
          err.status = 409;
          throw err;
        }

        const passwordHash = await bcrypt.hash(data.portalPassword, 10);
        const userInsert = await txDb.query(
          `INSERT INTO users (email, password_hash, full_name, phone_number, national_id, role)
           VALUES ($1, $2, $3, $4, $5, 'tenant')
           RETURNING id`,
          [data.email.toLowerCase(), passwordHash, data.fullName, data.phoneNumber, data.nationalId]
        );
        createdUserId = userInsert.rows[0].id;
      }

      // Insert tenant
      const tenantInsert = await txDb.query(
        `INSERT INTO tenants (user_id, full_name, email, phone_number, national_id, emergency_contact_name, emergency_contact_phone, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          createdUserId,
          data.fullName,
          data.email.toLowerCase(),
          data.phoneNumber,
          data.nationalId,
          data.emergencyContactName || '',
          data.emergencyContactPhone || '',
          data.notes || ''
        ]
      );

      const tenant = tenantInsert.rows[0];

      // Assign tenancy if unit specified
      let tenancy = null;
      if (data.unitId && data.startDate) {
        // Re-verify unit vacancy inside transaction with row lock
        const freshUnitCheck = await txDb.query(
          `SELECT id, status FROM rental_units WHERE id = $1 FOR UPDATE`,
          [data.unitId]
        );
        if (freshUnitCheck.rows.length === 0 || freshUnitCheck.rows[0].status !== 'vacant') {
          const err: any = new Error('Unit is no longer vacant. It may have just been assigned to another tenant.');
          err.status = 409;
          throw err;
        }

        // Look up unit rent if monthlyRentKSh not specified
        let rentAmountCents: number;
        if (data.monthlyRentKSh !== undefined) {
          rentAmountCents = Math.round(data.monthlyRentKSh * 100);
        } else {
          const uRes = await txDb.query(`SELECT monthly_rent_cents, default_due_day FROM rental_units WHERE id = $1`, [data.unitId]);
          rentAmountCents = parseInt(uRes.rows[0].monthly_rent_cents, 10);
        }

        const depositCents = data.depositKSh ? Math.round(data.depositKSh * 100) : 0;
        const dueDay = data.rentDueDay || 5;

        const tenancyInsert = await txDb.query(
          `INSERT INTO tenancies (tenant_id, unit_id, start_date, rent_amount_cents, deposit_cents, rent_due_day, is_active, status)
           VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'active')
           RETURNING *`,
          [tenant.id, data.unitId, data.startDate, rentAmountCents, depositCents, dueDay]
        );

        tenancy = tenancyInsert.rows[0];

        // Mark unit as occupied immediately
        await txDb.query(`UPDATE rental_units SET status = 'occupied', updated_at = NOW() WHERE id = $1`, [data.unitId]);

        // Automatically generate the first rent charge based on the tenancy start date
        try {
          const startMonth = data.startDate.slice(0, 7);
          await generateChargeForTenancy(tenancy.id, startMonth, txDb);
        } catch (chargeErr) {
          console.error('Failed to generate initial rent charge:', chargeErr);
        }
      }

      return { tenant, tenancy };
    });

    await logAudit({
      userId: user.id,
      action: 'TENANT_REGISTERED',
      entityType: 'tenants',
      entityId: result.tenant.id,
      changes: { fullName: result.tenant.full_name, phone: result.tenant.phone_number, unitId: data.unitId },
      ipAddress: req.ip
    });

    return res.status(201).json(result);
  } catch (error: any) {
    const status = error.status || (error.message?.includes('already exists') || error.message?.includes('already occupied') ? 409 : 500);
    return res.status(status).json({ error: error.message || 'Failed to register tenant' });
  }
});

// Get Single Tenant Profile with Full History
tenantsRouter.get('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    // Tenant Isolation Check
    if (user.role === 'tenant' && user.tenantId !== id) {
      return res.status(403).json({ error: 'Tenant isolation violation. You cannot view another tenant profile.' });
    }

    const tenantRes = await query(
      `SELECT t.*, u.email as user_email
       FROM tenants t
       LEFT JOIN users u ON u.id = t.user_id
       WHERE t.id = $1`,
      [id]
    );

    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const tenant = tenantRes.rows[0];

    // Fetch active and past tenancies
    const tenanciesRes = await query(
      `SELECT ty.*, ru.unit_number, ru.floor, ru.unit_type, p.id as property_id, p.name as property_name, p.code as property_code
       FROM tenancies ty
       JOIN rental_units ru ON ru.id = ty.unit_id
       JOIN properties p ON p.id = ru.property_id
       WHERE ty.tenant_id = $1
       ORDER BY ty.created_at DESC`,
      [id]
    );

    // Fetch rent charges
    const chargesRes = await query(
      `SELECT rc.*, ru.unit_number, p.name as property_name
       FROM rent_charges rc
       JOIN tenancies ty ON ty.id = rc.tenancy_id
       JOIN rental_units ru ON ru.id = ty.unit_id
       JOIN properties p ON p.id = ru.property_id
       WHERE ty.tenant_id = $1
       ORDER BY rc.billing_month DESC, rc.due_date DESC`,
      [id]
    );

    // Fetch payments and receipts
    const paymentsRes = await query(
      `SELECT py.*, r.receipt_number, r.id as receipt_id, u.full_name as recorded_by_name
       FROM payments py
       LEFT JOIN receipts r ON r.payment_id = py.id
       LEFT JOIN users u ON u.id = py.recorded_by
       WHERE py.tenant_id = $1
       ORDER BY py.payment_date DESC, py.created_at DESC`,
      [id]
    );

    // Calculate total arrears
    const arrearsRes = await query(
      `SELECT COALESCE(SUM(rc.balance_cents), 0) as arrears_cents
       FROM rent_charges rc
       JOIN tenancies ty ON ty.id = rc.tenancy_id
       WHERE ty.tenant_id = $1 AND rc.status != 'paid'`,
      [id]
    );

    // Fetch tenant credit ledger transactions
    const creditTxRes = await query(
      `SELECT * FROM tenant_credit_transactions
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    // Fetch tenant refund requests
    const refundsRes = await query(
      `SELECT * FROM refund_requests
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [id]
    );

    // Fetch tenancy settlement record if vacated
    const settlementRes = await query(
      `SELECT * FROM tenancy_settlements
       WHERE tenant_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [id]
    );

    return res.json({
      ...tenant,
      totalArrearsCents: parseInt(arrearsRes.rows[0].arrears_cents, 10),
      creditBalanceCents: parseInt(tenant.credit_balance_cents || '0', 10),
      tenancies: tenanciesRes.rows,
      charges: chargesRes.rows,
      payments: paymentsRes.rows,
      creditTransactions: creditTxRes.rows,
      refundRequests: refundsRes.rows,
      settlement: settlementRes.rows[0] || null
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch tenant profile' });
  }
});

// Get Settlement Preview for Assign Out (Move Out Calculation)
tenantsRouter.get('/:id/settlement-preview', requireAuth, requireRoles('super_admin', 'caretaker'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const tenantRes = await query(
      `SELECT t.*, ty.id as tenancy_id, ty.start_date, ty.rent_amount_cents, ty.deposit_cents, ty.is_active,
              ru.id as unit_id, ru.unit_number, p.id as property_id, p.name as property_name
       FROM tenants t
       LEFT JOIN tenancies ty ON ty.tenant_id = t.id AND ty.is_active = TRUE
       LEFT JOIN rental_units ru ON ru.id = ty.unit_id
       LEFT JOIN properties p ON p.id = ru.property_id
       WHERE t.id = $1`,
      [id]
    );

    if (tenantRes.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    const t = tenantRes.rows[0];

    // Calculate outstanding rent balance across all charges
    let unpaidRentCents = 0;
    if (t.tenancy_id) {
      const unpaidRes = await query(
        `SELECT COALESCE(SUM(balance_cents), 0) as unpaid_cents
         FROM rent_charges
         WHERE tenancy_id = $1 AND status != 'paid'`,
        [t.tenancy_id]
      );
      unpaidRentCents = parseInt(unpaidRes.rows[0].unpaid_cents, 10);
    }

    const depositHeldCents = parseInt(t.deposit_cents || '0', 10);
    const excessCreditCents = parseInt(t.credit_balance_cents || '0', 10);

    // Net settlement = (Deposit + Credit) - Unpaid Rent
    const netSettlementCents = (depositHeldCents + excessCreditCents) - unpaidRentCents;

    return res.json({
      tenantId: t.id,
      tenantName: t.full_name,
      phoneNumber: t.phone_number,
      unitNumber: t.unit_number,
      propertyName: t.property_name,
      tenancyId: t.tenancy_id,
      tenancyStartDate: t.start_date,
      monthlyRentCents: parseInt(t.rent_amount_cents || '0', 10),
      depositHeldCents,
      excessCreditCents,
      unpaidRentCents,
      netSettlementCents,
      isEligibleRefund: netSettlementCents > 0
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to generate settlement preview' });
  }
});

// Assign Out / Vacate Tenant with Final Settlement Statement
const assignOutSchema = z.object({
  moveOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  reason: z.string().min(3, 'Move-out reason is required'),
  deductionsKSh: z.number().min(0).optional().default(0),
  creditAction: z.enum(['refunded', 'retained', 'settled']).default('refunded'),
  notes: z.string().optional()
});

tenantsRouter.post('/:id/assign-out', requireAuth, requireRoles('super_admin', 'caretaker'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const user = req.user!;

    const parse = assignOutSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const data = parse.data;

    const tenantRes = await query(
      `SELECT t.*, ty.id as tenancy_id, ty.unit_id, ty.deposit_cents, ty.rent_amount_cents, ty.start_date,
              ru.unit_number, p.id as property_id, p.name as property_name
       FROM tenants t
       JOIN tenancies ty ON ty.tenant_id = t.id AND ty.is_active = TRUE
       JOIN rental_units ru ON ru.id = ty.unit_id
       JOIN properties p ON p.id = ru.property_id
       WHERE t.id = $1`,
      [id]
    );

    if (tenantRes.rows.length === 0) {
      return res.status(400).json({ error: 'No active tenancy found for this tenant to vacate.' });
    }

    const t = tenantRes.rows[0];

    // Calculate unpaid rent
    const unpaidRes = await query(
      `SELECT COALESCE(SUM(balance_cents), 0) as unpaid_cents
       FROM rent_charges
       WHERE tenancy_id = $1 AND status != 'paid'`,
      [t.tenancy_id]
    );
    const unpaidRentCents = parseInt(unpaidRes.rows[0].unpaid_cents, 10);
    const depositHeldCents = parseInt(t.deposit_cents || '0', 10);
    const excessCreditCents = parseInt(t.credit_balance_cents || '0', 10);
    const deductionsCents = Math.round(data.deductionsKSh * 100);

    // Net settlement = (Deposit + Credit) - (Unpaid Rent + Deductions)
    const netSettlementCents = (depositHeldCents + excessCreditCents) - (unpaidRentCents + deductionsCents);

    let settlementResult: any = null;

    await transaction(async (txDb) => {
      // 1. Terminate Tenancy and set end_date
      await txDb.query(
        `UPDATE tenancies
         SET is_active = FALSE, status = 'terminated', end_date = $1, updated_at = NOW()
         WHERE id = $2`,
        [data.moveOutDate, t.tenancy_id]
      );

      // 2. Make rental unit vacant and ready for new assignment
      await txDb.query(
        `UPDATE rental_units
         SET status = 'vacant', updated_at = NOW()
         WHERE id = $1`,
        [t.unit_id]
      );

      // 3. Handle credit balance adjustment if refunded or retained
      if (excessCreditCents > 0) {
        await txDb.query(
          `UPDATE tenants SET credit_balance_cents = 0, updated_at = NOW() WHERE id = $1`,
          [t.id]
        );

        await txDb.query(
          `INSERT INTO tenant_credit_transactions (
             tenant_id, tenancy_id, type, amount_cents, running_balance_cents, notes
           )
           VALUES ($1, $2, 'settlement_deduction', $3, 0, $4)`,
          [
            t.id,
            t.tenancy_id,
            excessCreditCents,
            `Credit balance ${data.creditAction} upon assigning out on ${data.moveOutDate}. Reason: ${data.reason}`
          ]
        );
      }

      // 4. Record formal tenancy settlement statement
      const setInsert = await txDb.query(
        `INSERT INTO tenancy_settlements (
           tenancy_id, tenant_id, unit_id, move_out_date, reason,
           unpaid_rent_cents, deposit_held_cents, excess_credit_cents, deductions_cents,
           net_settlement_cents, credit_action, status, settled_by, notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'completed', $12, $13)
         RETURNING *`,
        [
          t.tenancy_id,
          t.id,
          t.unit_id,
          data.moveOutDate,
          data.reason,
          unpaidRentCents,
          depositHeldCents,
          excessCreditCents,
          deductionsCents,
          netSettlementCents,
          data.creditAction,
          user.id,
          data.notes || null
        ]
      );

      settlementResult = setInsert.rows[0];
    });

    await logAudit({
      userId: user.id,
      action: 'TENANT_ASSIGNED_OUT',
      entityType: 'tenants',
      entityId: id,
      changes: {
        tenantName: t.full_name,
        unitNumber: t.unit_number,
        moveOutDate: data.moveOutDate,
        netSettlementCents,
        creditAction: data.creditAction
      },
      ipAddress: req.ip
    });

    return res.json({
      message: `Tenant ${t.full_name} successfully assigned out of Unit ${t.unit_number}. Unit is now vacant and ready for assignment.`,
      settlement: settlementResult,
      vacatedUnitId: t.unit_id
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to assign out tenant' });
  }
});

// Terminate Tenancy (Alternative simple termination)
tenantsRouter.post('/tenancies/:tenancyId/terminate', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { tenancyId } = req.params;
    const { endDate, reason } = req.body;

    const tenancyRes = await query(
      `SELECT ty.*, ru.property_id
       FROM tenancies ty
       JOIN rental_units ru ON ru.id = ty.unit_id
       WHERE ty.id = $1 AND ty.is_active = TRUE`,
      [tenancyId]
    );

    if (tenancyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Active tenancy not found' });
    }

    const tenancy = tenancyRes.rows[0];
    const hasAccess = await verifyPropertyAccess(req.user!, tenancy.property_id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Unauthorized to terminate tenancy for this property.' });
    }

    await transaction(async (txDb) => {
      // Set tenancy inactive
      await txDb.query(
        `UPDATE tenancies
         SET is_active = FALSE, status = 'terminated', end_date = COALESCE($1, CURRENT_DATE), updated_at = NOW()
         WHERE id = $2`,
        [endDate || null, tenancyId]
      );

      // Free up rental unit
      await txDb.query(
        `UPDATE rental_units SET status = 'vacant', updated_at = NOW() WHERE id = $1`,
        [tenancy.unit_id]
      );
    });

    await logAudit({
      userId: req.user!.id,
      action: 'TENANCY_TERMINATED',
      entityType: 'tenancies',
      entityId: tenancyId,
      changes: { reason, endDate },
      ipAddress: req.ip
    });

    return res.json({ message: 'Tenancy terminated and unit marked vacant.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to terminate tenancy' });
  }
});
