/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query, transaction } from '../db/connection.ts';
import { requireAuth, requireRoles, AuthRequest } from '../middleware/auth.ts';
import { logAudit } from '../services/audit.ts';

export const settingsRouter = Router();

// Get System Settings
settingsRouter.get('/', requireAuth, async (req, res) => {
  try {
    const result = await query(`SELECT key, value FROM system_settings`);
    const settingsMap: Record<string, any> = {};
    for (const row of result.rows) {
      settingsMap[row.key] = row.value;
    }
    return res.json(settingsMap);
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to fetch settings' });
  }
});

// Update General Settings (Super Admin Only)
settingsRouter.post('/general', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const { gracePeriodDays, lateFeePercentage, systemName } = req.body;

    const current = await query(`SELECT value FROM system_settings WHERE key = 'general'`);
    const val = current.rows.length > 0 ? current.rows[0].value : {};

    const updated = {
      ...val,
      grace_period_days: gracePeriodDays !== undefined ? Number(gracePeriodDays) : (val.grace_period_days || 5),
      late_fee_percentage: lateFeePercentage !== undefined ? Number(lateFeePercentage) : (val.late_fee_percentage || 0),
      system_name: systemName || val.system_name || 'KodiPay Kenya'
    };

    await query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('general', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(updated)]
    );

    await logAudit({
      userId: req.user!.id,
      action: 'SYSTEM_SETTINGS_UPDATED',
      entityType: 'system_settings',
      entityId: 'general',
      changes: updated,
      ipAddress: req.ip
    });

    return res.json({ message: 'Settings saved successfully', settings: updated });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to update settings' });
  }
});

// Seed Clearly-Labelled Demo Environment
settingsRouter.post('/seed-demo-data', requireAuth, requireRoles('super_admin'), async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const defaultPasswordHash = await bcrypt.hash('KodiPay2026!', 10);

    const seedResult = await transaction(async (txDb) => {
      // 1. Create Demo Landlord & Tenant users if not existing
      const landlordUserRes = await txDb.query(
        `INSERT INTO users (email, password_hash, full_name, phone_number, national_id, role)
         VALUES ('landlord.demo@kodipay.co.ke', $1, 'James Mwangi Kamau', '+254711223344', '28475910', 'super_admin')
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, role = 'super_admin'
         RETURNING id`,
        [defaultPasswordHash]
      );
      const landlordId = landlordUserRes.rows[0].id;

      const accountantUserRes = await txDb.query(
        `INSERT INTO users (email, password_hash, full_name, phone_number, national_id, role)
         VALUES ('accountant.demo@kodipay.co.ke', $1, 'Grace Wambui Njoroge', '+254722334455', '30128492', 'caretaker')
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, role = 'caretaker'
         RETURNING id`,
        [defaultPasswordHash]
      );

      const tenant1UserRes = await txDb.query(
        `INSERT INTO users (email, password_hash, full_name, phone_number, national_id, role)
         VALUES ('brian.otieno@gmail.com', $1, 'Brian Otieno Ochieng', '+254733445566', '32948102', 'tenant')
         ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
         RETURNING id`,
        [defaultPasswordHash]
      );
      const tenant1UserId = tenant1UserRes.rows[0].id;

      // 2. Demo Properties (Clearly labelled as [DEMO])
      const p1Res = await txDb.query(
        `INSERT INTO properties (name, code, address, estate, city, county, landlord_id, description)
         VALUES ('[DEMO] Kilimani Heights Court', 'KIL-01', 'Kindaruma Road, off Ring Road Kilimani', 'Kilimani', 'Nairobi', 'Nairobi', $1, 'Modern 16-unit residential complex with standby generator and high-speed lifts.')
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [landlordId]
      );
      const prop1Id = p1Res.rows[0].id;

      const p2Res = await txDb.query(
        `INSERT INTO properties (name, code, address, estate, city, county, landlord_id, description)
         VALUES ('[DEMO] Westlands Executive Suites', 'WES-02', 'Muthithi Road, Westlands Commercial & Residential Hub', 'Westlands', 'Nairobi', 'Nairobi', $1, 'Contemporary executive studio and 1-bedroom serviced apartments.')
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [landlordId]
      );
      const prop2Id = p2Res.rows[0].id;

      // 3. Demo Rental Units
      const unitsData = [
        { propId: prop1Id, no: 'A1', floor: '1st Floor', type: '2 Bedroom Master En-suite', rent: 4500000 },
        { propId: prop1Id, no: 'A2', floor: '1st Floor', type: '2 Bedroom Master En-suite', rent: 4500000 },
        { propId: prop1Id, no: 'B1', floor: '2nd Floor', type: '3 Bedroom Master En-suite + DSQ', rent: 6500000 },
        { propId: prop1Id, no: 'B2', floor: '2nd Floor', type: '3 Bedroom Master En-suite + DSQ', rent: 6500000 },
        { propId: prop2Id, no: '101', floor: 'Ground Floor', type: 'Executive Studio', rent: 3000000 },
        { propId: prop2Id, no: '102', floor: 'Ground Floor', type: '1 Bedroom Suite', rent: 3800000 },
        { propId: prop2Id, no: '201', floor: '1st Floor', type: '1 Bedroom Suite', rent: 3800000 }
      ];

      const insertedUnits: any[] = [];
      for (const u of unitsData) {
        const uRes = await txDb.query(
          `INSERT INTO rental_units (property_id, unit_number, floor, unit_type, monthly_rent_cents, default_due_day, status)
           VALUES ($1, $2, $3, $4, $5, 5, 'vacant')
           ON CONFLICT (property_id, unit_number) DO UPDATE SET monthly_rent_cents = EXCLUDED.monthly_rent_cents
           RETURNING id, unit_number, property_id, monthly_rent_cents`,
          [u.propId, u.no, u.floor, u.type, u.rent]
        );
        insertedUnits.push(uRes.rows[0]);
      }

      // 4. Demo Tenants
      const t1Res = await txDb.query(
        `INSERT INTO tenants (user_id, full_name, email, phone_number, national_id, emergency_contact_name, emergency_contact_phone, notes)
         VALUES ($1, 'Brian Otieno Ochieng', 'brian.otieno@gmail.com', '+254733445566', '32948102', 'Lilian Achieng', '+254711009988', 'Works in tech, pays promptly via M-Pesa')
         ON CONFLICT (id) DO NOTHING
         RETURNING id`,
        [tenant1UserId]
      );
      const tenant1Id = t1Res.rows[0]?.id || (await txDb.query(`SELECT id FROM tenants WHERE email = 'brian.otieno@gmail.com'`)).rows[0].id;

      const t2Res = await txDb.query(
        `INSERT INTO tenants (full_name, email, phone_number, national_id, emergency_contact_name, emergency_contact_phone, notes)
         VALUES ('Sarah Cherono Koech', 'sarah.cherono@standardmedia.co.ke', '+254720998877', '29837461', 'David Koech', '+254722887766', 'Journalist at Standard Group')
         ON CONFLICT (id) DO NOTHING
         RETURNING id`
      );
      const tenant2Id = t2Res.rows[0]?.id || (await txDb.query(`SELECT id FROM tenants WHERE email = 'sarah.cherono@standardmedia.co.ke'`)).rows[0].id;

      const t3Res = await txDb.query(
        `INSERT INTO tenants (full_name, email, phone_number, national_id, emergency_contact_name, emergency_contact_phone, notes)
         VALUES ('Kevin Kiprop Mutai', 'kevin.kiprop@equitybank.co.ke', '+254701234567', '31049281', 'Mercy Chebet', '+254703998811', 'Bank officer at Equity Bank Kilimani')
         ON CONFLICT (id) DO NOTHING
         RETURNING id`
      );
      const tenant3Id = t3Res.rows[0]?.id || (await txDb.query(`SELECT id FROM tenants WHERE email = 'kevin.kiprop@equitybank.co.ke'`)).rows[0].id;

      // 5. Tenancies
      const unitA1 = insertedUnits.find(u => u.unit_number === 'A1');
      const unitB1 = insertedUnits.find(u => u.unit_number === 'B1');
      const unit101 = insertedUnits.find(u => u.unit_number === '101');

      if (unitA1) {
        await txDb.query(`DELETE FROM tenancies WHERE unit_id = $1`, [unitA1.id]);
        const ty1 = await txDb.query(
          `INSERT INTO tenancies (tenant_id, unit_id, start_date, rent_amount_cents, deposit_cents, rent_due_day, is_active, status)
           VALUES ($1, $2, '2026-01-01', 4500000, 4500000, 5, TRUE, 'active')
           RETURNING id`,
          [tenant1Id, unitA1.id]
        );
        await txDb.query(`UPDATE rental_units SET status = 'occupied' WHERE id = $1`, [unitA1.id]);

        // Monthly charges for current month and previous month
        const ch1 = await txDb.query(
          `INSERT INTO rent_charges (tenancy_id, billing_month, rent_due_cents, amount_paid_cents, balance_cents, due_date, status)
           VALUES ($1, '2026-10', 4500000, 4500000, 0, '2026-10-05', 'paid')
           ON CONFLICT (tenancy_id, billing_month) DO UPDATE SET amount_paid_cents = 4500000, balance_cents = 0, status = 'paid'
           RETURNING id`,
          [ty1.rows[0].id]
        );

        // Record a confirmed M-Pesa payment for tenant 1
        const pay1 = await txDb.query(
          `INSERT INTO payments (payment_reference, tenancy_id, tenant_id, amount_cents, payment_method, transaction_reference, payment_date, status, recorded_by, notes)
           VALUES ('PAY-20261003-8821', $1, $2, 4500000, 'mpesa', 'QKJ47L90XP', '2026-10-03', 'confirmed', $3, 'M-Pesa Express confirmed via Safaricom Paybill 400200')
           ON CONFLICT (payment_reference) DO NOTHING
           RETURNING id`,
          [ty1.rows[0].id, tenant1Id, user.id]
        );

        if (pay1.rows.length > 0) {
          await txDb.query(
            `INSERT INTO payment_allocations (payment_id, rent_charge_id, allocated_amount_cents)
             VALUES ($1, $2, 4500000)
             ON CONFLICT DO NOTHING`,
            [pay1.rows[0].id, ch1.rows[0].id]
          );

          await txDb.query(
            `INSERT INTO receipts (receipt_number, payment_id, tenant_id, unit_id, amount_cents, payment_date, payment_method, transaction_reference, period_covered, remaining_balance_cents, qr_code_data)
             VALUES ('RCP-202610-1001', $1, $2, $3, 4500000, '2026-10-03', 'mpesa', 'QKJ47L90XP', '2026-10', 0, '{"receipt":"RCP-202610-1001","tenant":"Brian Otieno","amount":45000}')
             ON CONFLICT (receipt_number) DO NOTHING`,
            [pay1.rows[0].id, tenant1Id, unitA1.id]
          );
        }
      }

      if (unitB1) {
        await txDb.query(`DELETE FROM tenancies WHERE unit_id = $1`, [unitB1.id]);
        const ty2 = await txDb.query(
          `INSERT INTO tenancies (tenant_id, unit_id, start_date, rent_amount_cents, deposit_cents, rent_due_day, is_active, status)
           VALUES ($1, $2, '2026-03-01', 6500000, 6500000, 5, TRUE, 'active')
           RETURNING id`,
          [tenant2Id, unitB1.id]
        );
        await txDb.query(`UPDATE rental_units SET status = 'occupied' WHERE id = $1`, [unitB1.id]);

        // Partial payment charge
        const ch2 = await txDb.query(
          `INSERT INTO rent_charges (tenancy_id, billing_month, rent_due_cents, amount_paid_cents, balance_cents, due_date, status)
           VALUES ($1, '2026-10', 6500000, 3500000, 3000000, '2026-10-05', 'partially_paid')
           ON CONFLICT (tenancy_id, billing_month) DO UPDATE SET amount_paid_cents = 3500000, balance_cents = 3000000, status = 'partially_paid'
           RETURNING id`,
          [ty2.rows[0].id]
        );

        const pay2 = await txDb.query(
          `INSERT INTO payments (payment_reference, tenancy_id, tenant_id, amount_cents, payment_method, transaction_reference, payment_date, status, recorded_by, notes)
           VALUES ('PAY-20261005-7712', $1, $2, 3500000, 'bank_transfer', 'NCBA-FT-99201', '2026-10-05', 'confirmed', $3, 'Partial deposit into NCBA Bank Account')
           ON CONFLICT (payment_reference) DO NOTHING
           RETURNING id`,
          [ty2.rows[0].id, tenant2Id, user.id]
        );

        if (pay2.rows.length > 0) {
          await txDb.query(
            `INSERT INTO payment_allocations (payment_id, rent_charge_id, allocated_amount_cents)
             VALUES ($1, $2, 3500000)
             ON CONFLICT DO NOTHING`,
            [pay2.rows[0].id, ch2.rows[0].id]
          );

          await txDb.query(
            `INSERT INTO receipts (receipt_number, payment_id, tenant_id, unit_id, amount_cents, payment_date, payment_method, transaction_reference, period_covered, remaining_balance_cents)
             VALUES ('RCP-202610-1002', $1, $2, $3, 3500000, '2026-10-05', 'bank_transfer', 'NCBA-FT-99201', '2026-10 (Partial)', 3000000)
             ON CONFLICT (receipt_number) DO NOTHING`,
            [pay2.rows[0].id, tenant2Id, unitB1.id]
          );
        }
      }

      if (unit101) {
        await txDb.query(`DELETE FROM tenancies WHERE unit_id = $1`, [unit101.id]);
        const ty3 = await txDb.query(
          `INSERT INTO tenancies (tenant_id, unit_id, start_date, rent_amount_cents, deposit_cents, rent_due_day, is_active, status)
           VALUES ($1, $2, '2026-06-01', 3000000, 3000000, 5, TRUE, 'active')
           RETURNING id`,
          [tenant3Id, unit101.id]
        );
        await txDb.query(`UPDATE rental_units SET status = 'occupied' WHERE id = $1`, [unit101.id]);

        // Overdue charge
        await txDb.query(
          `INSERT INTO rent_charges (tenancy_id, billing_month, rent_due_cents, amount_paid_cents, balance_cents, due_date, status)
           VALUES ($1, '2026-10', 3000000, 0, 3000000, '2026-10-05', 'overdue')
           ON CONFLICT (tenancy_id, billing_month) DO UPDATE SET amount_paid_cents = 0, balance_cents = 3000000, status = 'overdue'`,
          [ty3.rows[0].id]
        );
      }

      return {
        propertiesCreated: 2,
        unitsCreated: unitsData.length,
        tenantsCreated: 3,
        tenanciesAssigned: 3
      };
    });

    await logAudit({
      userId: user.id,
      action: 'DEMO_DATA_INITIALIZED',
      entityType: 'system',
      entityId: 'demo-seed',
      changes: seedResult,
      ipAddress: req.ip
    });

    return res.json({
      message: 'Demo environment initialized with clearly labelled sample properties, units, tenants, and verified billing records.',
      details: seedResult,
      credentials: [
        { role: 'Landlord', email: 'landlord.demo@kodipay.co.ke', password: 'KodiPay2026!' },
        { role: 'Accountant', email: 'accountant.demo@kodipay.co.ke', password: 'KodiPay2026!' },
        { role: 'Tenant', email: 'brian.otieno@gmail.com', password: 'KodiPay2026!' }
      ]
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to seed demo data' });
  }
});
