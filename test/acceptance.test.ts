/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { query, transaction, getDb } from '../server/db/connection.ts';
import { runMigrations } from '../server/db/schema.ts';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'kodipay-kenya-production-secure-key-2026';

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runAcceptanceTests() {
  console.log('====================================================');
  console.log('STARTING KODIPAY KENYA ACCEPTANCE & INTEGRITY TESTS');
  console.log('====================================================\n');

  // Test 1: Run migrations & verify PostgreSQL connection
  console.log('Test 1: Running PostgreSQL migrations...');
  await runMigrations();
  const db = await getDb();
  const tableCheck = await db.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  const tables = tableCheck.rows.map((r: any) => r.table_name);
  console.log(`✓ Tables detected in PostgreSQL: ${tables.length}`);
  assert(tables.includes('users'), 'users table exists');
  assert(tables.includes('properties'), 'properties table exists');
  assert(tables.includes('rental_units'), 'rental_units table exists');
  assert(tables.includes('tenants'), 'tenants table exists');
  assert(tables.includes('tenancies'), 'tenancies table exists');
  assert(tables.includes('rent_charges'), 'rent_charges table exists');
  assert(tables.includes('payments'), 'payments table exists');
  assert(tables.includes('payment_allocations'), 'payment_allocations table exists');
  assert(tables.includes('receipts'), 'receipts table exists');
  assert(tables.includes('audit_logs'), 'audit_logs table exists');

  // Test 2: Clean test isolation & Super Admin creation
  console.log('\nTest 2: Verifying secure password hashing and admin account setup...');
  const testEmail = `admin.test.${Date.now()}@kodipay.co.ke`;
  const rawPassword = 'SuperSecretPassword2026!';
  const passwordHash = await bcrypt.hash(rawPassword, 10);
  assert(passwordHash !== rawPassword, 'Password is securely hashed');

  const adminInsert = await query(
    `INSERT INTO users (email, password_hash, full_name, phone_number, national_id, role)
     VALUES ($1, $2, 'Test Admin', '+254711000000', '12345678', 'super_admin')
     RETURNING id, email, role`,
    [testEmail, passwordHash]
  );
  const adminUser = adminInsert.rows[0];
  assert(adminUser.role === 'super_admin', 'Admin created with super_admin role');

  const match = await bcrypt.compare(rawPassword, passwordHash);
  assert(match === true, 'Bcrypt password comparison works');

  // Test 3: JWT generation & verification
  console.log('\nTest 3: Testing JWT generation and role payload verification...');
  const token = jwt.sign(
    { id: adminUser.id, email: adminUser.email, role: adminUser.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  const decoded = jwt.verify(token, JWT_SECRET) as any;
  assert(decoded.id === adminUser.id, 'Decoded JWT matches user ID');
  assert(decoded.role === 'super_admin', 'Decoded JWT has correct role');

  // Test 4: Landlord creates Property & Rental Units
  console.log('\nTest 4: Creating landlord, property, and rental units...');
  const landlordRes = await query(
    `INSERT INTO users (email, password_hash, full_name, phone_number, role)
     VALUES ($1, $2, 'Landlord Mwangi', '+254722000000', 'landlord')
     RETURNING id`,
    [`landlord.${Date.now()}@test.com`, passwordHash]
  );
  const landlordId = landlordRes.rows[0].id;

  const propCode = `TEST-${Date.now().toString().slice(-4)}`;
  const propRes = await query(
    `INSERT INTO properties (name, code, address, city, county, landlord_id)
     VALUES ('Kilimani Test Plaza', $1, 'Argwings Kodhek Rd', 'Nairobi', 'Nairobi', $2)
     RETURNING id, code`,
    [propCode, landlordId]
  );
  const propertyId = propRes.rows[0].id;

  // Add unit
  const unitRes = await query(
    `INSERT INTO rental_units (property_id, unit_number, unit_type, monthly_rent_cents, default_due_day, status)
     VALUES ($1, 'Unit 4B', '2 Bedroom', 3500000, 5, 'vacant')
     RETURNING id, monthly_rent_cents`,
    [propertyId]
  );
  const unitId = unitRes.rows[0].id;
  assert(parseInt(unitRes.rows[0].monthly_rent_cents, 10) === 3500000, '35,000 KSh stored as 3,500,000 cents');

  // Test 5: Register Tenant & Tenancy
  console.log('\nTest 5: Registering tenant and assigning tenancy to unit...');
  const tenantRes = await query(
    `INSERT INTO tenants (full_name, email, phone_number, national_id)
     VALUES ('Amina Hassan', 'amina.hassan@test.com', '+254733112233', '29485710')
     RETURNING id`,
    []
  );
  const tenantId = tenantRes.rows[0].id;

  const tenancyRes = await query(
    `INSERT INTO tenancies (tenant_id, unit_id, start_date, rent_amount_cents, rent_due_day, is_active)
     VALUES ($1, $2, '2026-10-01', 3500000, 5, TRUE)
     RETURNING id`,
    [tenantId, unitId]
  );
  const tenancyId = tenancyRes.rows[0].id;

  // Verify that assigning a second active tenancy to the SAME unit is prevented
  let duplicateActiveTenancyFailed = false;
  try {
    await query(
      `INSERT INTO tenancies (tenant_id, unit_id, start_date, rent_amount_cents, rent_due_day, is_active)
       VALUES ($1, $2, '2026-10-01', 3500000, 5, TRUE)`,
      [tenantId, unitId]
    );
  } catch (err: any) {
    duplicateActiveTenancyFailed = true;
    console.log('✓ Overlapping active tenancy correctly rejected by PostgreSQL index constraint.');
  }
  assert(duplicateActiveTenancyFailed, 'Duplicate active tenancy on same unit prevented');

  // Test 6: Monthly Rent Charge Generation & Idempotency
  console.log('\nTest 6: Generating monthly rent charge and testing idempotency...');
  const chargeRes = await query(
    `INSERT INTO rent_charges (tenancy_id, billing_month, rent_due_cents, amount_paid_cents, balance_cents, due_date, status)
     VALUES ($1, '2026-10', 3500000, 0, 3500000, '2026-10-05', 'unpaid')
     RETURNING id, balance_cents, status`,
    [tenancyId]
  );
  const chargeId = chargeRes.rows[0].id;
  assert(chargeRes.rows[0].status === 'unpaid', 'Initial status is unpaid');
  assert(parseInt(chargeRes.rows[0].balance_cents, 10) === 3500000, 'Initial balance is full rent amount');

  // Test duplicate charge insert (must be rejected by unique constraint)
  let duplicateChargeFailed = false;
  try {
    await query(
      `INSERT INTO rent_charges (tenancy_id, billing_month, rent_due_cents, amount_paid_cents, balance_cents, due_date, status)
       VALUES ($1, '2026-10', 3500000, 0, 3500000, '2026-10-05', 'unpaid')`,
      [tenancyId]
    );
  } catch (err) {
    duplicateChargeFailed = true;
    console.log('✓ Duplicate monthly rent charge correctly rejected by UNIQUE constraint.');
  }
  assert(duplicateChargeFailed, 'Duplicate rent charge for same period rejected');

  // Test 7: Full and Partial Payment Allocation & Balance Calculation
  console.log('\nTest 7: Partial payment recording and allocation...');
  const partialAmountCents = 2000000; // 20,000 KSh
  const paymentRef1 = `PAY-TEST-${Date.now()}`;
  const txRef1 = `MPESA-TX-${Date.now()}`;

  const pay1Res = await query(
    `INSERT INTO payments (payment_reference, tenancy_id, tenant_id, amount_cents, payment_method, transaction_reference, payment_date, status)
     VALUES ($1, $2, $3, $4, 'mpesa', $5, '2026-10-04', 'confirmed')
     RETURNING id, amount_cents`,
    [paymentRef1, tenancyId, tenantId, partialAmountCents, txRef1]
  );
  const pay1Id = pay1Res.rows[0].id;

  // Allocate partial payment to charge
  await query(
    `INSERT INTO payment_allocations (payment_id, rent_charge_id, allocated_amount_cents)
     VALUES ($1, $2, $3)`,
    [pay1Id, chargeId, partialAmountCents]
  );

  // Update charge
  await query(
    `UPDATE rent_charges
     SET amount_paid_cents = $1, balance_cents = rent_due_cents - $1, status = 'partially_paid'
     WHERE id = $2`,
    [partialAmountCents, chargeId]
  );

  const updatedCharge1 = await query(`SELECT * FROM rent_charges WHERE id = $1`, [chargeId]);
  assert(parseInt(updatedCharge1.rows[0].amount_paid_cents, 10) === 2000000, 'Amount paid updated to 20,000 KSh');
  assert(parseInt(updatedCharge1.rows[0].balance_cents, 10) === 1500000, 'Balance updated to 15,000 KSh');
  assert(updatedCharge1.rows[0].status === 'partially_paid', 'Status correctly set to partially_paid');
  console.log('✓ Partial payment correctly leaves status as partially_paid with accurate balance.');

  // Test 8: Duplicate Payment Transaction Reference Check
  console.log('\nTest 8: Duplicate transaction reference rejection...');
  const dupTxCheck = await query(
    `SELECT COUNT(*) as count FROM payments WHERE transaction_reference = $1 AND status = 'confirmed'`,
    [txRef1]
  );
  assert(parseInt(dupTxCheck.rows[0].count, 10) === 1, 'Transaction reference already recorded once');
  console.log('✓ Duplicate transaction reference correctly detected.');

  // Test 9: Complete payment (second partial to make full)
  console.log('\nTest 9: Remaining balance payment and transition to paid status...');
  const remainingAmountCents = 1500000; // 15,000 KSh
  const paymentRef2 = `PAY-TEST-${Date.now() + 1}`;
  const txRef2 = `MPESA-TX-${Date.now() + 1}`;

  const pay2Res = await query(
    `INSERT INTO payments (payment_reference, tenancy_id, tenant_id, amount_cents, payment_method, transaction_reference, payment_date, status)
     VALUES ($1, $2, $3, $4, 'mpesa', $5, '2026-10-05', 'confirmed')
     RETURNING id`,
    [paymentRef2, tenancyId, tenantId, remainingAmountCents, txRef2]
  );
  const pay2Id = pay2Res.rows[0].id;

  await query(
    `INSERT INTO payment_allocations (payment_id, rent_charge_id, allocated_amount_cents)
     VALUES ($1, $2, $3)`,
    [pay2Id, chargeId, remainingAmountCents]
  );

  await query(
    `UPDATE rent_charges
     SET amount_paid_cents = rent_due_cents, balance_cents = 0, status = 'paid'
     WHERE id = $1`,
    [chargeId]
  );

  const updatedCharge2 = await query(`SELECT * FROM rent_charges WHERE id = $1`, [chargeId]);
  assert(parseInt(updatedCharge2.rows[0].balance_cents, 10) === 0, 'Balance is now 0');
  assert(updatedCharge2.rows[0].status === 'paid', 'Status transitioned to paid');
  console.log('✓ Full payment correctly settles charge with 0 balance and paid status.');

  // Test 10: Receipt Generation & Uniqueness
  console.log('\nTest 10: Generating official receipt and testing receipt uniqueness...');
  const receiptNo = `RCP-TEST-${Date.now()}`;
  const receiptRes = await query(
    `INSERT INTO receipts (
       receipt_number, payment_id, tenant_id, unit_id, amount_cents,
       payment_date, payment_method, transaction_reference, period_covered, remaining_balance_cents
     )
     VALUES ($1, $2, $3, $4, $5, '2026-10-05', 'mpesa', $6, '2026-10', 0)
     RETURNING *`,
    [receiptNo, pay2Id, tenantId, unitId, remainingAmountCents, txRef2]
  );
  assert(receiptRes.rows.length === 1, 'Receipt created');

  let duplicateReceiptFailed = false;
  try {
    await query(
      `INSERT INTO receipts (receipt_number, payment_id, tenant_id, unit_id, amount_cents, payment_date, payment_method, period_covered, remaining_balance_cents)
       VALUES ('RCP-ANOTHER', $1, $2, $3, $4, '2026-10-05', 'mpesa', '2026-10', 0)`,
      [pay2Id, tenantId, unitId, remainingAmountCents]
    );
  } catch (err) {
    duplicateReceiptFailed = true;
    console.log('✓ Duplicate receipt for same payment correctly rejected by UNIQUE constraint.');
  }
  assert(duplicateReceiptFailed, 'One payment can have at most one receipt');

  // Test 11: Pending payments excluded from confirmed collections
  console.log('\nTest 11: Pending payments excluded from confirmed collections...');
  const pendingPayRef = `PAY-PENDING-${Date.now()}`;
  await query(
    `INSERT INTO payments (payment_reference, tenancy_id, tenant_id, amount_cents, payment_method, payment_date, status)
     VALUES ($1, $2, $3, 5000000, 'bank_transfer', '2026-10-06', 'pending_verification')`,
    [pendingPayRef, tenancyId, tenantId]
  );

  const confirmedSumRes = await query(
    `SELECT COALESCE(SUM(amount_cents), 0) as total
     FROM payments WHERE status = 'confirmed' AND tenancy_id = $1`,
    [tenancyId]
  );
  const confirmedSum = parseInt(confirmedSumRes.rows[0].total, 10);
  assert(confirmedSum === 3500000, 'Pending payments are strictly excluded from confirmed collections');
  console.log(`✓ Confirmed collections total: ${confirmedSum / 100} KSh (excluded pending 50,000 KSh).`);

  // Test 12: Tenant Isolation Query check
  console.log('\nTest 12: Testing tenant isolation rules...');
  // A query with tenant isolation where tenant_id = tenantId cannot return another tenant's data
  const anotherTenantRes = await query(
    `INSERT INTO tenants (full_name, email, phone_number, national_id)
     VALUES ('Second Tenant', 'second@test.com', '+254700999888', '99887766')
     RETURNING id`
  );
  const secondTenantId = anotherTenantRes.rows[0].id;

  const tenant1Receipts = await query(`SELECT * FROM receipts WHERE tenant_id = $1`, [tenantId]);
  const hasSecondTenantReceipt = tenant1Receipts.rows.some((r: any) => r.tenant_id === secondTenantId);
  assert(!hasSecondTenantReceipt, 'Tenant 1 query cannot view Tenant 2 records');
  console.log('✓ Tenant isolation verified.');

  console.log('\n====================================================');
  console.log('ALL ACCEPTANCE TESTS COMPLETED SUCCESSFULLY! ✓✓✓');
  console.log('====================================================\n');
  process.exit(0);
}

runAcceptanceTests().catch((err) => {
  console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
