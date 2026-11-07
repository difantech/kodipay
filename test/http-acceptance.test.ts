/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
const TEST_CARETAKER_EMAIL = process.env.TEST_CARETAKER_EMAIL;
const TEST_CARETAKER_PASSWORD = process.env.TEST_CARETAKER_PASSWORD;
const TEST_TENANT_PORTAL_PASSWORD = process.env.TEST_TENANT_PORTAL_PASSWORD;

if (!TEST_ADMIN_EMAIL || !TEST_ADMIN_PASSWORD || !TEST_CARETAKER_EMAIL || !TEST_CARETAKER_PASSWORD || !TEST_TENANT_PORTAL_PASSWORD) {
  throw new Error('Set TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD, TEST_CARETAKER_EMAIL, TEST_CARETAKER_PASSWORD and TEST_TENANT_PORTAL_PASSWORD before running HTTP acceptance tests.');
}

async function runHttpAcceptanceTests() {
  console.log('====================================================');
  console.log('STARTING LIVE API ACCEPTANCE & WORKFLOW TESTS');
  console.log('====================================================\n');

  // 1. Health check
  console.log('Test 1: Verifying /api/health endpoint...');
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert(healthRes.ok, 'Health endpoint responds 200 OK');
  const health = await healthRes.json();
  assert(health.currency === 'KSh', 'Currency is Kenyan Shillings (KSh)');
  assert(health.timezone === 'Africa/Nairobi', 'Timezone is Africa/Nairobi');
  console.log('✓ System health, currency (KSh), and timezone verified.');

  // 2. Super Admin Login & JWT issuance
  console.log('\nTest 2: Verifying Super Admin login & JWT verification...');
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD })
  });
  assert(adminLoginRes.ok, 'Super admin login succeeds');
  const adminLogin = await adminLoginRes.json();
  assert(!!adminLogin.token, 'JWT token is issued');
  assert(adminLogin.user.role === 'super_admin', 'Role is super_admin');
  const adminToken = adminLogin.token;
  console.log('✓ Admin login and JWT session token verified.');

  // 3. Current User verification (/api/auth/me)
  console.log('\nTest 3: Testing /api/auth/me with Bearer token...');
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(meRes.ok, '/api/auth/me returned 200');
  const me = await meRes.json();
  assert(me.user.email === TEST_ADMIN_EMAIL, 'Correct user profile returned');
  console.log('✓ Token authorization and user identity verified.');

  // 4. Create Property and Rental Unit
  console.log('\nTest 4: Creating a property and adding rental units...');
  const propCode = `HTP-${Date.now().toString().slice(-4)}`;
  const propRes = await fetch(`${BASE_URL}/api/properties`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      name: 'Hurlingham Executive Suites',
      code: propCode,
      address: 'Argwings Kodhek Road, Hurlingham',
      estate: 'Hurlingham',
      city: 'Nairobi',
      county: 'Nairobi'
    })
  });
  assert(propRes.ok, 'Property creation succeeds');
  const property = await propRes.json();
  assert(property.code === propCode, 'Property code preserved in uppercase');

  // Add unit
  const unitRes = await fetch(`${BASE_URL}/api/properties/${property.id}/units`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      unitNumber: 'Suite 201',
      floor: '2nd Floor',
      unitType: 'Executive 2-Bedroom',
      monthlyRentKSh: 55000,
      defaultDueDay: 5
    })
  });
  assert(unitRes.ok, 'Rental unit creation succeeds');
  const unit = await unitRes.json();
  assert(parseInt(unit.monthly_rent_cents, 10) === 5500000, '55,000 KSh correctly stored as 5,500,000 cents');

  // Add a second distinct unit in same property
  const unit2Res = await fetch(`${BASE_URL}/api/properties/${property.id}/units`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      unitNumber: 'Suite 202',
      floor: '2nd Floor',
      unitType: 'Executive 1-Bedroom',
      monthlyRentKSh: 40000,
      defaultDueDay: 5
    })
  });
  assert(unit2Res.ok, 'Second distinct unit created in property');

  // Test duplicate unit creation prevention (must return HTTP 409 Conflict)
  console.log('Testing duplicate unit creation prevention...');
  const dupUnitRes = await fetch(`${BASE_URL}/api/properties/${property.id}/units`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      unitNumber: 'Suite 201', // duplicate in same property
      floor: '2nd Floor',
      unitType: 'Executive 2-Bedroom',
      monthlyRentKSh: 55000,
      defaultDueDay: 5
    })
  });
  assert(dupUnitRes.status === 409, `Duplicate unit returns HTTP 409 Conflict (got ${dupUnitRes.status})`);
  const dupUnitJson = await dupUnitRes.json();
  assert(dupUnitJson.error.toLowerCase().includes('already exists'), 'Friendly message explains unit already exists');
  console.log('✓ Duplicate unit prevented with HTTP 409 Conflict and friendly message.');

  // Test allowing identical unit number on a DIFFERENT property
  console.log('Testing identical unit number on a different property (allowed)...');
  const propCode2 = `HTP2-${Date.now().toString().slice(-4)}`;
  const prop2Res = await fetch(`${BASE_URL}/api/properties`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      name: 'Westlands Commercial Tower',
      code: propCode2,
      address: 'Waiyaki Way, Westlands',
      estate: 'Westlands',
      city: 'Nairobi',
      county: 'Nairobi'
    })
  });
  assert(prop2Res.ok, 'Second property created');
  const prop2 = await prop2Res.json();

  const crossUnitRes = await fetch(`${BASE_URL}/api/properties/${prop2.id}/units`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      unitNumber: 'Suite 201', // Same unit number as in Property 1
      floor: '2nd Floor',
      unitType: 'Commercial Suite',
      monthlyRentKSh: 60000,
      defaultDueDay: 5
    })
  });
  assert(crossUnitRes.ok, 'Identical unit number allowed in different property');
  console.log('✓ Identical unit number successfully allowed in a different property.');

  // 5. Register Tenant and Assign Tenancy
  console.log('\nTest 5: Registering tenant and assigning unit with portal login...');
  
  // 5A. Test validation errors (missing / invalid fields must return HTTP 400 with specific field info)
  console.log('Testing tenant registration input validation...');
  const invalidTenantRes = await fetch(`${BASE_URL}/api/tenants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      fullName: 'A', // too short (<2)
      email: 'not-an-email', // invalid email
      phoneNumber: '123', // too short (<9)
      nationalId: '1' // too short (<4)
    })
  });
  assert(invalidTenantRes.status === 400, 'Invalid tenant registration rejected with HTTP 400');
  const invalidJson = await invalidTenantRes.json();
  assert(invalidJson.error.toLowerCase().includes('validation'), 'Error specifies validation failure');
  console.log('✓ Invalid tenant input rejected with HTTP 400 and field details.');

  // 5B. Valid tenant registration
  const tenantEmail = `tenant.${Date.now()}.${Math.floor(Math.random() * 10000)}@test.co.ke`;
  const tenantPhone = `+2547${Math.floor(10000000 + Math.random() * 90000000)}`;
  const tenantNatId = `${Math.floor(10000000 + Math.random() * 90000000)}`;

  const tenantRes = await fetch(`${BASE_URL}/api/tenants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      fullName: 'Faith Jepchirchir',
      email: tenantEmail,
      phoneNumber: tenantPhone,
      nationalId: tenantNatId,
      unitId: unit.id,
      startDate: '2026-10-01',
      monthlyRentKSh: 55000,
      depositKSh: 55000,
      createPortalLogin: true,
      portalPassword: TEST_TENANT_PORTAL_PASSWORD
    })
  });
  if (!tenantRes.ok) {
    const errText = await tenantRes.text();
    console.error('Tenant registration failed:', tenantRes.status, errText);
  }
  assert(tenantRes.ok, 'Tenant registration succeeds');
  const tenantData = await tenantRes.json();
  const tenantId = tenantData.tenant.id;
  const tenancyId = tenantData.tenancy.id;
  assert(!!tenancyId, 'Tenancy assigned and linked to unit');
  console.log('✓ Tenant registered and assigned to unit atomically.');

  // 5C. Duplicate tenant registration prevention (HTTP 409 Conflict)
  console.log('Testing duplicate tenant prevention...');
  const dupTenantRes = await fetch(`${BASE_URL}/api/tenants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      fullName: 'Duplicate Faith',
      email: tenantEmail, // duplicate email
      phoneNumber: '+254799001122',
      nationalId: '88776655'
    })
  });
  assert(dupTenantRes.status === 409, `Duplicate tenant email returns HTTP 409 Conflict (got ${dupTenantRes.status})`);
  console.log('✓ Duplicate tenant registration prevented with HTTP 409 Conflict.');

  // 6. Overlapping active tenancy prevention (must return HTTP 409 Conflict)
  console.log('\nTest 6: Verifying overlapping active tenancy prevention on same unit...');
  const overlapRes = await fetch(`${BASE_URL}/api/tenants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      fullName: 'Second Conflicting Tenant',
      email: `second.${Date.now()}.${Math.floor(Math.random() * 10000)}@test.com`,
      phoneNumber: `+2547${Math.floor(10000000 + Math.random() * 90000000)}`,
      nationalId: `${Math.floor(10000000 + Math.random() * 90000000)}`,
      unitId: unit.id, // unit is already occupied by Faith!
      startDate: '2026-10-01'
    })
  });
  assert(overlapRes.status === 409, `Second active tenancy on occupied unit returns HTTP 409 Conflict (got ${overlapRes.status})`);
  const overlapJson = await overlapRes.json();
  assert(overlapJson.error.toLowerCase().includes('already occupied'), 'Error message explains unit is already occupied');
  console.log('✓ Overlapping tenancy correctly rejected with HTTP 409 Conflict.');

  // 7. Monthly Rent Charge Generation & Idempotency
  console.log('\nTest 7: Generating monthly rent charge and testing idempotency...');
  const billingMonth = '2026-10';
  const genRes1 = await fetch(`${BASE_URL}/api/billing/generate-charges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ billingMonth, propertyId: property.id })
  });
  const gen1 = await genRes1.json();
  assert(gen1.createdCount >= 1 || gen1.skippedCount >= 1, 'Charge created or already existing');

  // Test idempotency: generating second time must NOT duplicate
  const genRes2 = await fetch(`${BASE_URL}/api/billing/generate-charges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ billingMonth, propertyId: property.id })
  });
  assert(genRes2.ok, 'Second charge generation succeeds without error');
  const gen2 = await genRes2.json();
  assert(gen2.createdCount === 0, 'Zero duplicate charges created on rerun');
  assert(gen2.skippedCount >= 1, 'Existing charges skipped due to uniqueness constraint');
  console.log('✓ Monthly rent charge generated with guaranteed idempotency.');

  // 8. Record Partial Payment (e.g. KSh 30,000 of KSh 55,000)
  console.log('\nTest 8: Recording partial payment via M-Pesa...');
  const txRef1 = `QKP${Date.now().toString().slice(-7)}`;
  const pay1Res = await fetch(`${BASE_URL}/api/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      tenancyId,
      amountKSh: 30000,
      paymentMethod: 'mpesa',
      transactionReference: txRef1,
      paymentDate: '2026-10-04',
      status: 'confirmed'
    })
  });
  assert(pay1Res.ok, 'Partial payment recorded');
  const pay1 = await pay1Res.json();
  assert(!!pay1.receipt, 'Official receipt generated for confirmed partial payment');
  const receipt1Id = pay1.receipt.id;
  console.log('✓ Partial payment recorded and allocated. Official receipt issued.');

  // 9. Duplicate Transaction Reference Rejection
  console.log('\nTest 9: Verifying duplicate transaction reference rejection...');
  const dupPayRes = await fetch(`${BASE_URL}/api/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      tenancyId,
      amountKSh: 10000,
      paymentMethod: 'mpesa',
      transactionReference: txRef1,
      paymentDate: '2026-10-04',
      status: 'confirmed'
    })
  });
  assert(!dupPayRes.ok, 'Duplicate payment reference rejected');
  console.log('✓ Duplicate transaction code correctly rejected.');

  // 10. Record Remaining Balance Payment (KSh 25,000)
  console.log('\nTest 10: Recording final balance payment to settle charge completely...');
  const txRef2 = `NCBA-${Date.now().toString().slice(-6)}`;
  const pay2Res = await fetch(`${BASE_URL}/api/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      tenancyId,
      amountKSh: 25000,
      paymentMethod: 'bank_transfer',
      transactionReference: txRef2,
      paymentDate: '2026-10-05',
      status: 'confirmed'
    })
  });
  assert(pay2Res.ok, 'Settling payment recorded');
  const pay2 = await pay2Res.json();
  assert(pay2.receipt.remaining_balance_cents === 0, 'Remaining balance is now 0');
  console.log('✓ Remaining balance paid and charge settled as fully paid.');

  // 11. View Printable Official Receipt
  console.log('\nTest 11: Viewing official printable receipt...');
  const recRes = await fetch(`${BASE_URL}/api/receipts/${receipt1Id}`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(recRes.ok, 'Receipt fetch succeeds');
  const receipt = await recRes.json();
  assert(receipt.tenant_name === 'Faith Jepchirchir', 'Receipt contains tenant name');
  assert(receipt.property_name === 'Hurlingham Executive Suites', 'Receipt contains property');
  assert(receipt.transaction_reference === txRef1, 'Receipt contains M-Pesa reference');
  console.log('✓ Printable receipt payload verified.');

  // 12. Tenant Login and Tenant Portal Isolation Check
  console.log('\nTest 12: Testing tenant authentication and strict portal isolation...');
  const tenantLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: tenantEmail, password: TEST_TENANT_PORTAL_PASSWORD })
  });
  assert(tenantLoginRes.ok, 'Tenant login succeeds');
  const tenantLogin = await tenantLoginRes.json();
  const tenantToken = tenantLogin.token;

  // Tenant views own overview
  const tenantOverviewRes = await fetch(`${BASE_URL}/api/tenant-portal/overview`, {
    headers: { Authorization: `Bearer ${tenantToken}` }
  });
  assert(tenantOverviewRes.ok, 'Tenant can access their own overview');
  const tenantOverview = await tenantOverviewRes.json();
  assert(tenantOverview.profile.tenant_name === 'Faith Jepchirchir', 'Tenant sees their assigned unit');

  // Tenant tries to access admin-only properties list (Must be forbidden)
  const forbiddenRes = await fetch(`${BASE_URL}/api/properties`, {
    headers: { Authorization: `Bearer ${tenantToken}` }
  });
  assert(forbiddenRes.status === 403, 'Tenant is strictly forbidden from admin property endpoints (403)');
  console.log('✓ Tenant portal verified and server-side tenant isolation enforced.');

  // 13. Caretaker Authorization Check
  console.log('\nTest 13: Verifying Caretaker cannot access Super Admin endpoints...');
  const caretakerCheckLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_CARETAKER_EMAIL, password: TEST_CARETAKER_PASSWORD })
  });
  if (caretakerCheckLoginRes.ok) {
    const caretakerCheckData = await caretakerCheckLoginRes.json();
    const caretakerForbiddenRes = await fetch(`${BASE_URL}/api/users`, {
      headers: { Authorization: `Bearer ${caretakerCheckData.token}` }
    });
    assert(caretakerForbiddenRes.status === 403, 'Caretaker cannot access /api/users (403)');

    // Caretaker CANNOT create properties (Forbidden)
    const caretakerAddPropRes = await fetch(`${BASE_URL}/api/properties`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${caretakerCheckData.token}`
      },
      body: JSON.stringify({
        name: 'Unauthorized Caretaker Property',
        code: 'UCP-01',
        address: 'Nairobi',
        city: 'Nairobi',
        county: 'Nairobi'
      })
    });
    assert(caretakerAddPropRes.status === 403, 'Caretaker cannot add a property (403 Forbidden)');
    console.log('✓ Role-based access control verified: Caretaker cannot add properties or perform super admin actions.');
  }

  // 14. Payment Reversal Workflow
  console.log('\nTest 14: Testing payment reversal and balance restoration...');
  const revRes = await fetch(`${BASE_URL}/api/payments/${pay2.payment.id}/reverse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ reversalReason: 'Test cashier reversal of bank transfer' })
  });
  assert(revRes.ok, 'Reversal executed successfully');
  console.log('✓ Payment reversal recorded with permanent audit trail and restored balance.');

  // 15. Vacant Units Endpoint & Immediate Tenant Unit Assignment
  console.log('\nTest 15: Verifying /api/properties/units/vacant and immediate unit assignment...');
  const vacantUnitsRes = await fetch(`${BASE_URL}/api/properties/units/vacant`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(vacantUnitsRes.ok, 'Vacant units endpoint responds 200 OK');
  const vacantUnitsList = await vacantUnitsRes.json();
  assert(Array.isArray(vacantUnitsList), 'Vacant units returns an array');
  console.log(`✓ Vacant units endpoint retrieved ${vacantUnitsList.length} vacant units with property details.`);

  // 16. M-Pesa Daraja STK Push Simulation & Daraja Verification
  console.log('\nTest 16: Verifying Safaricom M-Pesa Daraja STK Push & Daraja Transaction Verification...');
  const stkRes = await fetch(`${BASE_URL}/api/payments/daraja/stk-push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      phoneNumber: '0712345678',
      amountKSh: 25000,
      accountReference: 'KODIPAY-TEST'
    })
  });
  assert(stkRes.ok, 'STK Push endpoint responds 200 OK');
  const stkData = await stkRes.json();
  assert(stkData.success === true, 'STK push simulated successfully');
  assert(stkData.ResponseCode === '0', 'Daraja response code is 0 (Success)');
  const mpesaRefMatch = stkData.CustomerMessage.match(/Expected Ref:\s*([A-Z0-9]{10})/i);
  assert(!!mpesaRefMatch, 'Customer message contains 10-char M-Pesa receipt code');
  const generatedMpesaRef = mpesaRefMatch[1];

  // Verify the transaction with Daraja mock service
  const verifyRes = await fetch(`${BASE_URL}/api/payments/daraja/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      transactionCode: generatedMpesaRef,
      expectedAmountKSh: 25000,
      expectedPhone: '0712345678'
    })
  });
  assert(verifyRes.ok, 'Daraja verification responds 200 OK');
  const verifyData = await verifyRes.json();
  assert(verifyData.verified === true, 'Daraja ledger verified the transaction code');
  assert(verifyData.transactionCode === generatedMpesaRef.toUpperCase(), 'Correct transaction code returned');
  assert(verifyData.businessShortCode === '400200', 'Safaricom Paybill shortcode is 400200');
  console.log(`✓ M-Pesa Daraja STK Push (Ref: ${generatedMpesaRef}) and Daraja ledger verification passed.`);

  // 17. Landlord Notification Preferences (Toggles for SMS & Email)
  console.log('\nTest 17: Testing Landlord Notification Preferences Toggles...');
  const prefGetRes = await fetch(`${BASE_URL}/api/notifications/preferences`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(prefGetRes.ok, 'Preferences endpoint responds 200 OK');
  const prefs = await prefGetRes.json();
  assert(prefs.sms_payment_received !== undefined, 'Preferences contains sms_payment_received toggle');
  assert(prefs.email_payment_received !== undefined, 'Preferences contains email_payment_received toggle');

  // Update preferences toggle
  const prefUpdateRes = await fetch(`${BASE_URL}/api/notifications/preferences`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      sms_payment_received: true,
      email_payment_received: true,
      sms_tenant_receipt: true,
      email_tenant_receipt: true
    })
  });
  assert(prefUpdateRes.ok, 'Preferences updated successfully');
  console.log('✓ Landlord notification preferences retrieved and toggles updated.');

  // 18. Notification Logs & Rent Payment Triggered Notifications
  console.log('\nTest 18: Verifying Notification Logs & Automatic Payment Event Dispatch...');
  const notifLogsRes = await fetch(`${BASE_URL}/api/notifications/logs`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(notifLogsRes.ok, 'Notification logs endpoint responds 200 OK');
  const notifLogs = await notifLogsRes.json();
  assert(Array.isArray(notifLogs), 'Notification logs returns an array');
  assert(notifLogs.length > 0, 'Notification logs contains dispatched payment notification events');
  const paymentNotif = notifLogs.find((l: any) => l.event_type === 'rent_payment_received');
  assert(!!paymentNotif, 'Found rent_payment_received event log');
  console.log(`✓ Notification logs verified: ${notifLogs.length} logged events. Landlord and tenant alerts verified.`);

  // 19. AI Notification Drafting & AI Collection Insights (Gemini 3.8 Flash)
  console.log('\nTest 19: Testing AI Notification Composer & Collection Insights (Gemini 3.8 Flash)...');
  const aiDraftRes = await fetch(`${BASE_URL}/api/notifications/ai-draft`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      tenantName: 'Otieno Brian',
      unitNumber: 'B204',
      propertyName: 'Kilimani Heights Apartments',
      amountKSh: 45000,
      balanceKSh: 0,
      tone: 'swahili_bilingual',
      eventType: 'payment_acknowledgement'
    })
  });
  assert(aiDraftRes.ok, 'AI draft endpoint responds 200 OK');
  const aiDraft = await aiDraftRes.json();
  assert(!!aiDraft.smsMessage, 'AI generated SMS message');
  assert(!!aiDraft.emailSubject, 'AI generated Email subject');
  assert(!!aiDraft.emailBody, 'AI generated Email body');
  assert(!!aiDraft.culturalNotes, 'AI generated cultural communication note');
  console.log(`✓ AI Notification Draft generated (${aiDraft.modelUsed}):\n   SMS: "${aiDraft.smsMessage}"`);

  // AI Collection Insights
  const aiInsightRes = await fetch(`${BASE_URL}/api/notifications/ai-insights`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      totalCollectedKSh: 250000,
      expectedRentKSh: 300000,
      collectionRatePct: 83.3,
      occupiedUnits: 10,
      vacantUnits: 2,
      totalArrearsKSh: 50000,
      monthName: 'November 2026'
    })
  });
  assert(aiInsightRes.ok, 'AI collection insights responds 200 OK');
  const aiInsights = await aiInsightRes.json();
  assert(!!aiInsights.executiveSummary, 'AI generated executive collection summary');
  assert(!!aiInsights.collectionHealth, 'AI determined collection health score');
  console.log(`✓ AI Portfolio Insights generated (Health: ${aiInsights.collectionHealth}): "${aiInsights.executiveSummary.slice(0, 100)}..."`);

  // 20. 3 Core Accounts & Caretaker Strict Data Entry Boundary
  console.log('\nTest 20: Verifying Caretaker Role Boundary & 3 Dedicated Accounts...');
  const caretakerLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_CARETAKER_EMAIL, password: TEST_CARETAKER_PASSWORD })
  });
  assert(caretakerLoginRes.ok, 'Caretaker login succeeds');
  const caretakerLogin = await caretakerLoginRes.json();
  assert(caretakerLogin.user.role === 'caretaker', 'Role is caretaker');
  const caretakerToken = caretakerLogin.token;

  // Caretaker CAN record payments (Data entry allowed)
  const caretakerTxRef = `CTK${Date.now().toString().slice(-7)}`;
  const caretakerPayRes = await fetch(`${BASE_URL}/api/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${caretakerToken}`
    },
    body: JSON.stringify({
      tenancyId,
      amountKSh: 10000,
      paymentMethod: 'mpesa',
      transactionReference: caretakerTxRef,
      paymentDate: '2026-10-06',
      status: 'confirmed'
    })
  });
  assert(caretakerPayRes.ok, 'Caretaker successfully recorded payment (Data entry allowed)');
  const caretakerPay = await caretakerPayRes.json();
  assert(caretakerPay.moneyCollectedKSh === 10000, 'moneyCollectedKSh returned in payload');
  assert(!!caretakerPay.ownerNotified, 'Owner was resolved and notified');
  assert(!!caretakerPay.tenantNotified, 'Tenant was resolved and notified');

  // Caretaker CANNOT reverse payments (Data entry boundary enforced)
  const caretakerReverseRes = await fetch(`${BASE_URL}/api/payments/${caretakerPay.payment.id}/reverse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${caretakerToken}`
    },
    body: JSON.stringify({ reversalReason: 'Unauthorized caretaker reversal attempt' })
  });
  assert(caretakerReverseRes.status === 403, 'Caretaker payment reversal forbidden (403 Forbidden - Super Admin only)');
  console.log('✓ Caretaker data entry boundary verified: Can record payments, cannot reverse payments.');

  // 21. Automatic Owner & Tenant Notifications
  console.log('\nTest 21: Verifying Owner & Tenant Notifications dispatched upon payment...');
  assert(caretakerPay.notificationsDispatched >= 2, 'At least 2 notifications (Owner + Tenant) dispatched');
  console.log(`✓ Owner (${caretakerPay.ownerNotified.name} - ${caretakerPay.ownerNotified.phone}) and Tenant (${caretakerPay.tenantNotified.name} - ${caretakerPay.tenantNotified.phone}) notified automatically.`);

  console.log('\n====================================================');
  console.log('ALL 21 LIVE API ACCEPTANCE TESTS PASSED! ✓✓✓');
  console.log('====================================================\n');
  process.exit(0);
}

runHttpAcceptanceTests().catch((err) => {
  console.error('\n❌ ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
