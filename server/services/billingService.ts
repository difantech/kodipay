/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { query, transaction } from '../db/connection.ts';

/**
 * Recalculate overdue statuses for unpaid/partially paid charges past the 5-day grace period
 */
export async function updateOverdueStatuses(): Promise<void> {
  try {
    await query(`
      UPDATE rent_charges
      SET status = 'overdue', updated_at = NOW()
      WHERE status IN ('unpaid', 'partially_paid')
        AND balance_cents > 0
        AND due_date + INTERVAL '5 days' < CURRENT_DATE
    `);
  } catch (err) {
    console.error('Error updating overdue statuses:', err);
  }
}

export function toYearMonth(val: any): string {
  if (!val) return '';
  if (val instanceof Date) {
    return val.toISOString().slice(0, 7);
  }
  return String(val).slice(0, 7);
}

/**
 * Generate rent charge for a specific tenancy and billing month.
 * Handles credit carry-forward deduction automatically.
 * Enforces strict idempotency (does not duplicate existing charges).
 */
export async function generateChargeForTenancy(
  tenancyId: string,
  billingMonth: string,
  txDb?: any
): Promise<any | null> {
  const runner = txDb || { query };

  // 1. Fetch tenancy and tenant credit details
  const tenancyRes = await runner.query(
    `SELECT ty.*, t.id as tenant_id, t.credit_balance_cents, ru.property_id
     FROM tenancies ty
     JOIN tenants t ON t.id = ty.tenant_id
     JOIN rental_units ru ON ru.id = ty.unit_id
     WHERE ty.id = $1`,
    [tenancyId]
  );

  if (tenancyRes.rows.length === 0) return null;
  const tenancy = tenancyRes.rows[0];

  // If tenancy is inactive or ended before this billing month, do not generate
  const endMonth = toYearMonth(tenancy.end_date);
  if (endMonth && endMonth < billingMonth) {
    return null;
  }

  // If tenancy starts after this billing month, do not generate
  const startMonth = toYearMonth(tenancy.start_date);
  if (startMonth && startMonth > billingMonth) {
    return null;
  }

  // Check if charge already exists
  const existingCheck = await runner.query(
    `SELECT * FROM rent_charges WHERE tenancy_id = $1 AND billing_month = $2`,
    [tenancyId, billingMonth]
  );
  if (existingCheck.rows.length > 0) {
    return existingCheck.rows[0];
  }

  // Compute due date anchored to rent_due_day
  const [yearStr, monthStr] = billingMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const dueDay = Math.min(Math.max(tenancy.rent_due_day || 5, 1), 28);
  const dueDate = `${year}-${String(month).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;

  const rentDueCents = parseInt(tenancy.rent_amount_cents, 10);
  const availableCreditCents = parseInt(tenancy.credit_balance_cents || '0', 10);

  // Apply excess credit carry-forward if available
  const creditToApply = Math.min(availableCreditCents, rentDueCents);
  const remainingBalanceCents = rentDueCents - creditToApply;
  const status = remainingBalanceCents === 0 ? 'paid' : (creditToApply > 0 ? 'partially_paid' : 'unpaid');

  // Insert charge
  const insertChargeRes = await runner.query(
    `INSERT INTO rent_charges (
       tenancy_id, billing_month, rent_due_cents, amount_paid_cents, credit_applied_cents, balance_cents, due_date, status, notes
     )
     VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      tenancyId,
      billingMonth,
      rentDueCents,
      creditToApply,
      remainingBalanceCents,
      dueDate,
      status,
      creditToApply > 0 ? `Credit of KSh ${(creditToApply / 100).toLocaleString()} carried forward & applied` : null
    ]
  );

  const charge = insertChargeRes.rows[0];

  // If credit was applied, deduct from tenant and record credit ledger transaction
  if (creditToApply > 0) {
    const newCreditBalance = availableCreditCents - creditToApply;
    await runner.query(
      `UPDATE tenants SET credit_balance_cents = $1, updated_at = NOW() WHERE id = $2`,
      [newCreditBalance, tenancy.tenant_id]
    );

    await runner.query(
      `INSERT INTO tenant_credit_transactions (
         tenant_id, tenancy_id, type, amount_cents, running_balance_cents, rent_charge_id, notes
       )
       VALUES ($1, $2, 'applied_to_rent', $3, $4, $5, $6)`,
      [
        tenancy.tenant_id,
        tenancyId,
        creditToApply,
        newCreditBalance,
        charge.id,
        `Applied to ${billingMonth} rent invoice (Charge ${charge.id.slice(0, 8)})`
      ]
    );
  }

  return charge;
}

/**
 * Automatically cycle and ensure monthly rent charges exist for all active tenancies
 * from their start date up to targetMonth.
 */
export async function autoGenerateCycleCharges(targetMonth?: string): Promise<{ created: number; skipped: number }> {
  const currentMonth = targetMonth || new Date().toISOString().slice(0, 7);

  // Fetch all active tenancies
  const tenanciesRes = await query(
    `SELECT ty.id, ty.start_date, ty.rent_amount_cents, ty.rent_due_day, ty.tenant_id
     FROM tenancies ty
     WHERE ty.is_active = TRUE`
  );

  let created = 0;
  let skipped = 0;

  for (const tenancy of tenanciesRes.rows) {
    const startMonth = toYearMonth(tenancy.start_date);
    if (!startMonth) continue;
    
    // Generate months from startMonth up to currentMonth
    let iter = new Date(`${startMonth}-01T00:00:00Z`);
    const end = new Date(`${currentMonth}-01T00:00:00Z`);

    while (iter <= end) {
      const monthStr = iter.toISOString().slice(0, 7);
      
      const res = await transaction(async (txDb) => {
        return generateChargeForTenancy(tenancy.id, monthStr, txDb);
      });

      if (res) {
        created++;
      } else {
        skipped++;
      }

      // Next month
      iter.setUTCMonth(iter.getUTCMonth() + 1);
    }
  }

  await updateOverdueStatuses();

  return { created, skipped };
}
