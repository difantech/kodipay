/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db/connection.ts';
import { requireAuth, requireRoles, AuthRequest, verifyPropertyAccess } from '../middleware/auth.ts';
import { logAudit } from '../services/audit.ts';
import { updateOverdueStatuses, generateChargeForTenancy, autoGenerateCycleCharges } from '../services/billingService.ts';

export const billingRouter = Router();

// Rent Register List (auto cycles charges and refreshes overdue statuses)
billingRouter.get('/register', requireAuth, requireRoles('super_admin', 'caretaker'), async (req: AuthRequest, res) => {
  try {
    // Run automated billing cycle check and overdue calculation
    await autoGenerateCycleCharges();
    const user = req.user!;
    const { month, propertyId, status } = req.query;

    let sql = `
      SELECT rc.*,
             t.id as tenant_id,
             t.full_name as tenant_name,
             t.phone_number as tenant_phone,
             ru.unit_number,
             ru.id as unit_id,
             p.id as property_id,
             p.name as property_name,
             p.code as property_code
      FROM rent_charges rc
      JOIN tenancies ty ON ty.id = rc.tenancy_id
      JOIN tenants t ON t.id = ty.tenant_id
      JOIN rental_units ru ON ru.id = ty.unit_id
      JOIN properties p ON p.id = ru.property_id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (propertyId) {
      params.push(propertyId);
      sql += ` AND p.id = $${params.length}`;
    }

    if (month) {
      params.push(month);
      sql += ` AND rc.billing_month = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND rc.status = $${params.length}`;
    }

    sql += ` ORDER BY rc.due_date DESC, p.name ASC, ru.unit_number ASC`;

    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch rent register' });
  }
});

// Generate Monthly Rent Charges
const generateChargesSchema = z.object({
  billingMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Must be in YYYY-MM format (e.g. 2026-10)'),
  propertyId: z.string().uuid().optional()
});

billingRouter.post('/generate-charges', requireAuth, requireRoles('super_admin', 'caretaker'), async (req: AuthRequest, res) => {
  try {
    const parse = generateChargesSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'Validation failed', details: parse.error.issues });
    }

    const { billingMonth, propertyId } = parse.data;
    const user = req.user!;

    if (propertyId) {
      const hasAccess = await verifyPropertyAccess(user, propertyId);
      if (!hasAccess) {
        return res.status(403).json({ error: 'Unauthorized to generate charges for this property.' });
      }
    }

    // Fetch active tenancies eligible for billing
    let tenanciesSql = `
      SELECT ty.id as tenancy_id, ty.rent_amount_cents, ty.rent_due_day, ty.start_date,
             p.id as property_id, p.name as property_name, ru.unit_number, t.full_name as tenant_name
      FROM tenancies ty
      JOIN rental_units ru ON ru.id = ty.unit_id
      JOIN properties p ON p.id = ru.property_id
      JOIN tenants t ON t.id = ty.tenant_id
      WHERE ty.is_active = TRUE
    `;
    const params: any[] = [];

    if (propertyId) {
      params.push(propertyId);
      tenanciesSql += ` AND p.id = $${params.length}`;
    }

    const tenanciesRes = await query(tenanciesSql, params);

    let createdCount = 0;
    let skippedCount = 0;
    const createdCharges: any[] = [];
    const skippedDetails: any[] = [];

    await transaction(async (txDb) => {
      for (const tenancy of tenanciesRes.rows) {
        // Check if charge already exists for idempotency
        const existing = await txDb.query(
          `SELECT id, rent_due_cents, balance_cents, status FROM rent_charges WHERE tenancy_id = $1 AND billing_month = $2`,
          [tenancy.tenancy_id, billingMonth]
        );

        if (existing.rows.length > 0) {
          skippedCount++;
          skippedDetails.push({
            tenancyId: tenancy.tenancy_id,
            tenantName: tenancy.tenant_name,
            unitNumber: tenancy.unit_number,
            propertyName: tenancy.property_name,
            reason: 'Existing charge already present (idempotent skip)',
            existingChargeId: existing.rows[0].id,
            status: existing.rows[0].status
          });
        } else {
          const newCharge = await generateChargeForTenancy(tenancy.tenancy_id, billingMonth, txDb);
          if (newCharge) {
            createdCount++;
            createdCharges.push({
              id: newCharge.id,
              tenantName: tenancy.tenant_name,
              unitNumber: tenancy.unit_number,
              propertyName: tenancy.property_name,
              rentAmountKSh: newCharge.rent_due_cents / 100,
              dueDate: newCharge.due_date,
              status: newCharge.status
            });
          } else {
            skippedCount++;
            skippedDetails.push({
              tenancyId: tenancy.tenancy_id,
              tenantName: tenancy.tenant_name,
              unitNumber: tenancy.unit_number,
              propertyName: tenancy.property_name,
              reason: 'Tenancy start date is after or end date is before this billing month'
            });
          }
        }
      }
    });

    await logAudit({
      userId: user.id,
      action: 'MONTHLY_RENT_CHARGES_GENERATED',
      entityType: 'rent_charges',
      entityId: billingMonth,
      changes: { billingMonth, propertyId, createdCount, skippedCount },
      ipAddress: req.ip
    });

    return res.json({
      message: `Rent generation complete for ${billingMonth}. Created ${createdCount} charge(s), skipped ${skippedCount} existing.`,
      billingMonth,
      createdCount,
      skippedCount,
      charges: createdCharges,
      skippedDetails
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to generate monthly rent charges' });
  }
});
