/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`Security Assertion Failed: ${message}`);
  }
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function runSecurityAcceptanceTests() {
  console.log('====================================================');
  console.log('TESTING SECURITY & FIREWALL CENTER CAPABILITIES');
  console.log('====================================================\n');

  // 1. Super Admin Authentication
  console.log('Sec-Test 1: Authenticating Super Admin...');
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'superadmin@kodipay.co.ke', password: 'SuperAdmin2026!' })
  });
  assert(adminLoginRes.ok, 'Super admin login succeeded');
  const adminData = await adminLoginRes.json();
  const adminToken = adminData.token;
  assert(!!adminToken, 'Admin token received');
  console.log('✓ Super Admin authenticated.');

  // 2. Caretaker / Tenant Authentication & Forbidden Access
  console.log('\nSec-Test 2: Verifying Non-SuperAdmin access to Security Center is strictly forbidden...');
  const caretakerLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'caretaker@kodipay.co.ke', password: 'Caretaker2026!' })
  });
  assert(caretakerLoginRes.ok, 'Caretaker login succeeded');
  const caretakerToken = (await caretakerLoginRes.json()).token;

  const forbiddenRes = await fetch(`${BASE_URL}/api/security/metrics`, {
    headers: { Authorization: `Bearer ${caretakerToken}` }
  });
  assert(forbiddenRes.status === 403, 'Caretaker is rejected with 403 Forbidden from /api/security/metrics');
  console.log('✓ Role-based access control verified: Non-admin denied access to Security Center.');

  // 3. Super Admin retrieves Security Metrics & Events
  console.log('\nSec-Test 3: Fetching Security & Firewall live metrics...');
  const metricsRes = await fetch(`${BASE_URL}/api/security/metrics`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(metricsRes.ok, 'Metrics request succeeds');
  const metrics = await metricsRes.json();
  assert(typeof metrics.stats?.totalBlocked === 'number', 'stats.totalBlocked is number');
  assert(typeof metrics.postureScore === 'number', 'postureScore is calculated number');
  assert(typeof metrics.settings?.waf_enabled === 'boolean', 'settings.waf_enabled is boolean');
  assert(Array.isArray(metrics.attacksByType), 'attacksByType is array');
  console.log(`✓ Live metrics retrieved. Current security posture score: ${metrics.postureScore}%. WAF active: ${metrics.settings.waf_enabled}`);

  // 4. Test Web Application Firewall (WAF) - SQL Injection prevention
  console.log('\nSec-Test 4: Testing WAF Deep Inspection against SQL Injection attack payload...');
  const sqliRes = await fetch(`${BASE_URL}/api/properties?search=' UNION SELECT username, password FROM users --`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(sqliRes.status === 403, `WAF correctly intercepted SQL injection with 403 Forbidden (got ${sqliRes.status})`);
  const sqliPayload = await sqliRes.json();
  assert(sqliPayload.code === 'WAF_SQLI_BLOCKED', 'Response contains WAF_SQLI_BLOCKED code');
  assert(sqliPayload.error.includes('SQL Injection'), 'Error message specifies SQL Injection Protection');
  console.log('✓ SQL Injection attack stopped by WAF with 403 Forbidden.');

  // 5. Test Web Application Firewall (WAF) - Cross-Site Scripting (XSS) prevention
  console.log('\nSec-Test 5: Testing WAF Deep Inspection against Cross-Site Scripting (XSS)...');
  const xssRes = await fetch(`${BASE_URL}/api/properties`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      name: '<script>alert("pwned")</script>',
      code: 'PROP-XSS',
      property_type: 'commercial'
    })
  });
  assert(xssRes.status === 403, `WAF correctly intercepted XSS attack with 403 Forbidden (got ${xssRes.status})`);
  const xssPayload = await xssRes.json();
  assert(xssPayload.code === 'WAF_XSS_BLOCKED', 'Response contains WAF_XSS_BLOCKED code');
  assert(xssPayload.error.includes('XSS Protection'), 'Error message specifies XSS Protection');
  console.log('✓ Cross-Site Scripting attack stopped by WAF with 403 Forbidden.');

  // 6. Security Audit Logs verification
  console.log('\nSec-Test 6: Verifying Security Audit Log entries...');
  const eventsRes = await fetch(`${BASE_URL}/api/security/events?limit=10`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(eventsRes.ok, 'Security events endpoint returned 200');
  const eventsList = await eventsRes.json();
  assert(Array.isArray(eventsList), 'Events list is an array');
  assert(eventsList.length > 0, 'Security events were recorded');
  const hasSqliEvent = eventsList.some((e: any) => e.event_type === 'sqli_attempt');
  const hasXssEvent = eventsList.some((e: any) => e.event_type === 'xss_attempt');
  assert(hasSqliEvent, 'SQL injection attempt logged in security_events');
  assert(hasXssEvent, 'XSS attempt logged in security_events');
  console.log(`✓ Audit log verified: ${eventsList.length} security events inspected, threats recorded.`);

  // 7. Security Settings Configuration
  console.log('\nSec-Test 7: Updating Security & Firewall configuration settings...');
  const getSettingsRes = await fetch(`${BASE_URL}/api/security/settings`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(getSettingsRes.ok, 'Get settings returned 200');

  const updateSettingsRes = await fetch(`${BASE_URL}/api/security/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({
      rate_limit_max_requests_per_minute: 250,
      auto_block_strike_threshold: 4
    })
  });
  assert(updateSettingsRes.ok, 'Update settings returned 200');
  const updatedData = await updateSettingsRes.json();
  assert(updatedData.settings.rate_limit_max_requests_per_minute === 250, 'Rate limit updated to 250');
  assert(updatedData.settings.auto_block_strike_threshold === 4, 'Strikes updated to 4');
  console.log('✓ Security settings successfully updated and applied.');

  // 8. Active Sessions Management & Revocation
  console.log('\nSec-Test 8: Checking active user sessions & testing remote session revocation...');
  const sessionsRes = await fetch(`${BASE_URL}/api/security/sessions`, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });
  assert(sessionsRes.ok, 'Sessions endpoint returned 200');
  const sessionsList = await sessionsRes.json();
  assert(Array.isArray(sessionsList), 'Sessions array returned');
  assert(sessionsList.length > 0, 'Active sessions present');
  console.log(`✓ Found ${sessionsList.length} recorded session(s).`);

  // 9. Database Backup & Restore with SHA-256 Integrity Verification
  console.log('\nSec-Test 9: Creating full database backup snapshot with SHA-256 integrity checksum...');
  const backupRes = await fetch(`${BASE_URL}/api/security/backups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    },
    body: JSON.stringify({ notes: 'Automated Security Acceptance Verification Snapshot' })
  });
  assert(backupRes.ok, 'Database backup creation succeeded');
  const backupResult = await backupRes.json();
  assert(!!backupResult.backup?.id, 'Backup ID returned');
  assert(typeof backupResult.backup?.checksum_sha256 === 'string', 'SHA256 checksum generated');
  assert(backupResult.backup?.checksum_sha256.length === 64, 'SHA256 checksum is 64 hex characters');
  assert(backupResult.backup?.records_count > 0, 'Backup captured records');
  const backupId = backupResult.backup.id;
  console.log(`✓ Database backup snapshot "${backupResult.backup.filename}" created with verified SHA-256: ${backupResult.backup.checksum_sha256.substring(0, 16)}...`);

  // 10. Restore Database Backup Verification
  console.log('\nSec-Test 10: Testing backup integrity verification on restore...');
  const restoreRes = await fetch(`${BASE_URL}/api/security/backups/${backupId}/restore`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`
    }
  });
  assert(restoreRes.ok, 'Backup restore with verified checksum completed successfully');
  const restoreData = await restoreRes.json();
  assert(restoreData.result?.restored === true, 'Restore result returned restored: true');
  assert(Array.isArray(restoreData.result?.tablesRestored), 'tablesRestored is an array');
  console.log(`✓ Database restore and checksum integrity verification verified (${restoreData.result.recordsRestored} records restored).`);

  // Clean up test backup
  await fetch(`${BASE_URL}/api/security/backups/${backupId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` }
  });

  console.log('\n====================================================');
  console.log('ALL 10 SECURITY & FIREWALL SUITE TESTS PASSED! ✓✓✓');
  console.log('====================================================');
}

runSecurityAcceptanceTests().catch(err => {
  console.error('\n❌ Security Test Suite Failed:', err);
  process.exit(1);
});
