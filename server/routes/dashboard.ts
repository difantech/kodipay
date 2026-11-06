/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Response } from 'express';
import { query } from '../db/connection.ts';
import { requireAuth, requireRoles, AuthRequest } from '../middleware/auth.ts';
import { autoGenerateCycleCharges } from '../services/billingService.ts';

export const dashboardRouter = Router();

dashboardRouter.get('/stats', requireAuth, requireRoles('super_admin', 'caretaker'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const propertyId = req.query.propertyId as string | undefined;
    const selectedMonth = (req.query.month as string) || new Date().toISOString().slice(0, 7); // e.g. '2026-10'

    // Automatically ensure recurring monthly rent charges are cycled and up-to-date
    await autoGenerateCycleCharges(selectedMonth);

    // 1. Properties Count
    let propSql = `SELECT COUNT(*) as total_properties FROM properties WHERE archived_at IS NULL`;
    const propParams: any[] = [];
    if (propertyId) {
      propParams.push(propertyId);
      propSql += ` AND id = $${propParams.length}`;
    }
    const propRes = await query(propSql, propParams);
    const totalProperties = parseInt(propRes.rows[0].total_properties, 10);

    // 2. Units Stats (total, occupied, vacant, maintenance)
    let unitSql = `
      SELECT 
        COUNT(ru.id) as total_units,
        COUNT(CASE WHEN ru.status = 'occupied' THEN 1 END) as occupied_units,
        COUNT(CASE WHEN ru.status = 'vacant' THEN 1 END) as vacant_units,
        COUNT(CASE WHEN ru.status = 'maintenance' THEN 1 END) as maintenance_units
      FROM rental_units ru
      JOIN properties p ON p.id = ru.property_id
      WHERE ru.archived_at IS NULL AND p.archived_at IS NULL
    `;
    const unitParams: any[] = [];
    if (propertyId) {
      unitParams.push(propertyId);
      unitSql += ` AND p.id = $${unitParams.length}`;
    }
    const unitRes = await query(unitSql, unitParams);
    const units = {
      total: parseInt(unitRes.rows[0].total_units, 10),
      occupied: parseInt(unitRes.rows[0].occupied_units, 10),
      vacant: parseInt(unitRes.rows[0].vacant_units, 10),
      maintenance: parseInt(unitRes.rows[0].maintenance_units, 10)
    };

    // 3. Registered Tenants count
    let tenantSql = `
      SELECT COUNT(DISTINCT t.id) as total_tenants
      FROM tenants t
      LEFT JOIN tenancies ty ON ty.tenant_id = t.id AND ty.is_active = TRUE
      LEFT JOIN rental_units ru ON ru.id = ty.unit_id
      LEFT JOIN properties p ON p.id = ru.property_id
      WHERE 1=1
    `;
    const tenantParams: any[] = [];
    if (propertyId) {
      tenantParams.push(propertyId);
      tenantSql += ` AND p.id = $${tenantParams.length}`;
    }
    const tenantRes = await query(tenantSql, tenantParams);
    const totalTenants = parseInt(tenantRes.rows[0].total_tenants, 10);

    // 4. Monthly Financial Figures for selected month
    let finSql = `
      SELECT 
        COALESCE(SUM(rc.rent_due_cents), 0) as expected_rent_cents,
        COALESCE(SUM(rc.amount_paid_cents), 0) as collected_rent_cents,
        COALESCE(SUM(rc.balance_cents), 0) as outstanding_rent_cents,
        COUNT(CASE WHEN rc.status = 'paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN rc.status = 'partially_paid' THEN 1 END) as partial_count,
        COUNT(CASE WHEN rc.status = 'unpaid' THEN 1 END) as unpaid_count,
        COUNT(CASE WHEN rc.status = 'overdue' THEN 1 END) as overdue_count
      FROM rent_charges rc
      JOIN tenancies ty ON ty.id = rc.tenancy_id
      JOIN rental_units ru ON ru.id = ty.unit_id
      JOIN properties p ON p.id = ru.property_id
      WHERE rc.billing_month = $1
    `;
    const finParams: any[] = [selectedMonth];
    if (propertyId) {
      finParams.push(propertyId);
      finSql += ` AND p.id = $${finParams.length}`;
    }
    const finRes = await query(finSql, finParams);
    const finRow = finRes.rows[0];

    const expectedRentCents = parseInt(finRow.expected_rent_cents, 10);
    const collectedRentCents = parseInt(finRow.collected_rent_cents, 10);
    const outstandingRentCents = parseInt(finRow.outstanding_rent_cents, 10);

    const collectionPercentage = expectedRentCents > 0
      ? Math.round((collectedRentCents / expectedRentCents) * 100)
      : 0;

    // 5. Total Cumulative Arrears across all past months
    let arrearsSql = `
      SELECT COALESCE(SUM(rc.balance_cents), 0) as total_arrears_cents
      FROM rent_charges rc
      JOIN tenancies ty ON ty.id = rc.tenancy_id
      JOIN rental_units ru ON ru.id = ty.unit_id
      JOIN properties p ON p.id = ru.property_id
      WHERE rc.status IN ('overdue', 'partially_paid', 'unpaid')
    `;
    const arrParams: any[] = [];
    if (propertyId) {
      arrParams.push(propertyId);
      arrearsSql += ` AND p.id = $${arrParams.length}`;
    }
    const arrRes = await query(arrearsSql, arrParams);
    const totalCumulativeArrearsCents = parseInt(arrRes.rows[0].total_arrears_cents, 10);

    // 6. Confirmed payments collected this month
    let paySql = `
      SELECT COALESCE(SUM(py.amount_cents), 0) as total_payments_month_cents
      FROM payments py
      JOIN tenancies ty ON ty.id = py.tenancy_id
      JOIN rental_units ru ON ru.id = ty.unit_id
      JOIN properties p ON p.id = ru.property_id
      WHERE py.status = 'confirmed' AND py.payment_date::text LIKE $1
    `;
    const payParams: any[] = [`${selectedMonth}%`];
    if (propertyId) {
      payParams.push(propertyId);
      paySql += ` AND p.id = $${payParams.length}`;
    }
    const payRes = await query(paySql, payParams);
    const confirmedPaymentsCollectedCents = parseInt(payRes.rows[0].total_payments_month_cents, 10);

    // 7. Recent Confirmed Payments
    let recentPaySql = `
      SELECT py.id, py.payment_reference, py.amount_cents, py.payment_method, py.transaction_reference,
             py.payment_date, py.status, t.full_name as tenant_name, ru.unit_number, p.name as property_name,
             r.receipt_number
      FROM payments py
      JOIN tenants t ON t.id = py.tenant_id
      JOIN tenancies ty ON ty.id = py.tenancy_id
      JOIN rental_units ru ON ru.id = ty.unit_id
      JOIN properties p ON p.id = ru.property_id
      LEFT JOIN receipts r ON r.payment_id = py.id
      WHERE 1=1
    `;
    const recParams: any[] = [];
    if (propertyId) {
      recParams.push(propertyId);
      recentPaySql += ` AND p.id = $${recParams.length}`;
    }
    recentPaySql += ` ORDER BY py.payment_date DESC, py.created_at DESC LIMIT 6`;
    const recentPayRes = await query(recentPaySql, recParams);

    // 8. Upcoming rent due dates
    let upcomingDueSql = `
      SELECT rc.id, rc.billing_month, rc.due_date, rc.rent_due_cents, rc.balance_cents, rc.status,
             t.full_name as tenant_name, t.phone_number, ru.unit_number, p.name as property_name
      FROM rent_charges rc
      JOIN tenancies ty ON ty.id = rc.tenancy_id
      JOIN rental_units ru ON ru.id = ty.unit_id
      JOIN properties p ON p.id = ru.property_id
      JOIN tenants t ON t.id = ty.tenant_id
      WHERE rc.status IN ('unpaid', 'partially_paid')
    `;
    const upParams: any[] = [];
    if (propertyId) {
      upParams.push(propertyId);
      upcomingDueSql += ` AND p.id = $${upParams.length}`;
    }
    upcomingDueSql += ` ORDER BY rc.due_date ASC LIMIT 6`;
    const upcomingDueRes = await query(upcomingDueSql, upParams);

    // 9. Total Tenant Credit Balances held
    const creditsRes = await query(`SELECT COALESCE(SUM(credit_balance_cents), 0) as total_credits FROM tenants`);
    const totalTenantCreditsCents = parseInt(creditsRes.rows[0].total_credits, 10);

    // 10. Refund Request Aggregates
    const pendingRefundsRes = await query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total_cents
       FROM refund_requests
       WHERE status = 'pending'`
    );
    const pendingRefundsCount = parseInt(pendingRefundsRes.rows[0].count, 10);
    const pendingRefundsCents = parseInt(pendingRefundsRes.rows[0].total_cents, 10);

    const completedRefundsRes = await query(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount_cents), 0) as total_cents
       FROM refund_requests
       WHERE status = 'completed'`
    );
    const completedRefundsCount = parseInt(completedRefundsRes.rows[0].count, 10);
    const completedRefundsCents = parseInt(completedRefundsRes.rows[0].total_cents, 10);

    return res.json({
      selectedMonth,
      totalProperties,
      units,
      totalTenants,
      financials: {
        expectedRentCents,
        collectedRentCents,
        outstandingRentCents,
        confirmedPaymentsCollectedCents,
        totalCumulativeArrearsCents,
        collectionPercentage,
        paidCount: parseInt(finRow.paid_count, 10),
        partialCount: parseInt(finRow.partial_count, 10),
        unpaidCount: parseInt(finRow.unpaid_count, 10),
        overdueCount: parseInt(finRow.overdue_count, 10),
        totalTenantCreditsCents,
        pendingRefundsCount,
        pendingRefundsCents,
        completedRefundsCount,
        completedRefundsCents
      },
      recentPayments: recentPayRes.rows,
      upcomingDueDates: upcomingDueRes.rows
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch dashboard metrics' });
  }
});
