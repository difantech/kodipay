/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Response } from 'express';
import { query } from '../db/connection.ts';
import { requireAuth, requireRoles, AuthRequest } from '../middleware/auth.ts';

export const reportsRouter = Router();

// Financial & Collection Reports
reportsRouter.get('/summary', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const { propertyId, year = '2026' } = req.query;

    // 1. Property Performance breakdown
    let propSql = `
      SELECT p.id, p.name, p.code,
             COUNT(DISTINCT ru.id) as total_units,
             COUNT(DISTINCT CASE WHEN ru.status = 'occupied' THEN ru.id END) as occupied_units,
             COALESCE(SUM(rc.rent_due_cents), 0) as expected_cents,
             COALESCE(SUM(rc.amount_paid_cents), 0) as collected_cents,
             COALESCE(SUM(rc.balance_cents), 0) as balance_cents
      FROM properties p
      LEFT JOIN rental_units ru ON ru.property_id = p.id AND ru.archived_at IS NULL
      LEFT JOIN tenancies ty ON ty.unit_id = ru.id
      LEFT JOIN rent_charges rc ON rc.tenancy_id = ty.id AND rc.billing_month LIKE $1
      WHERE p.archived_at IS NULL
    `;
    const propParams: any[] = [`${year}%`];
    if (propertyId) {
      propParams.push(propertyId);
      propSql += ` AND p.id = $${propParams.length}`;
    }
    propSql += ` GROUP BY p.id, p.name, p.code ORDER BY expected_cents DESC`;
    const propPerf = await query(propSql, propParams);

    // 2. Payment Method Distribution (M-Pesa, Bank, Cash, Cheque)
    let methodSql = `
      SELECT py.payment_method,
             COUNT(py.id) as transaction_count,
             COALESCE(SUM(py.amount_cents), 0) as total_amount_cents
      FROM payments py
      JOIN tenancies ty ON ty.id = py.tenancy_id
      JOIN rental_units ru ON ru.id = ty.unit_id
      JOIN properties p ON p.id = ru.property_id
      WHERE py.status = 'confirmed' AND py.payment_date::text LIKE $1
    `;
    const methodParams: any[] = [`${year}%`];
    if (propertyId) {
      methodParams.push(propertyId);
      methodSql += ` AND p.id = $${methodParams.length}`;
    }
    methodSql += ` GROUP BY py.payment_method ORDER BY total_amount_cents DESC`;
    const methodDist = await query(methodSql, methodParams);

    // 3. Monthly Trend (Months of the year)
    let trendSql = `
      SELECT rc.billing_month,
             COALESCE(SUM(rc.rent_due_cents), 0) as expected_cents,
             COALESCE(SUM(rc.amount_paid_cents), 0) as collected_cents,
             COALESCE(SUM(rc.balance_cents), 0) as arrears_cents
      FROM rent_charges rc
      JOIN tenancies ty ON ty.id = rc.tenancy_id
      JOIN rental_units ru ON ru.id = ty.unit_id
      JOIN properties p ON p.id = ru.property_id
      WHERE rc.billing_month LIKE $1
    `;
    const trendParams: any[] = [`${year}%`];
    if (propertyId) {
      trendParams.push(propertyId);
      trendSql += ` AND p.id = $${trendParams.length}`;
    }
    trendSql += ` GROUP BY rc.billing_month ORDER BY rc.billing_month ASC`;
    const monthlyTrend = await query(trendSql, trendParams);

    return res.json({
      year,
      propertyPerformance: propPerf.rows,
      paymentMethodDistribution: methodDist.rows,
      monthlyTrend: monthlyTrend.rows
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to generate reports' });
  }
});
