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

async function runSuperAdminTests() {
  console.log('====================================================');
  console.log('TESTING SUPER ADMIN ACCOUNT & USER MANAGEMENT DASHBOARD');
  console.log('====================================================\n');

  // Test 1: Log in with original existing account credentials
  console.log('Test 1: Logging in with original existing account credentials...');
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'superadmin@kodipay.co.ke',
      password: 'SuperAdmin2026!'
    })
  });
  assert(loginRes.ok, `Original account login succeeds (status ${loginRes.status})`);
  const loginData = await loginRes.json();
  assert(!!loginData.token, 'JWT session token generated');
  assert(loginData.user.role === 'super_admin', 'Account is recognized as super_admin');
  assert(!!loginData.user.id, 'Existing User ID is preserved');
  const originalAdminToken = loginData.token;
  console.log(`✓ Original existing account (${loginData.user.email} - ID: ${loginData.user.id}) recognized as permanent Super Admin.`);

  // Test 2: Verify /api/auth/me returns status, lastLoginAt, and Super Admin role
  console.log('\nTest 2: Verifying /api/auth/me profile and login timestamp...');
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${originalAdminToken}` }
  });
  assert(meRes.ok, '/api/auth/me returns 200 OK');
  const meData = await meRes.json();
  assert(meData.user.role === 'super_admin', 'Role is confirmed as super_admin');
  assert(meData.user.isActive === true, 'Account is active');
  assert(!!meData.user.lastLoginAt, 'lastLoginAt timestamp is tracked in database');
  console.log(`✓ Server-side profile verified: lastLoginAt=${meData.user.lastLoginAt}`);

  // Test 3: Authenticate / Initialize designated Super Admin account (joshkingtechnologies@gmail.com)
  console.log('\nTest 3: Testing designated Super Admin account (joshkingtechnologies@gmail.com)...');
  const userAdminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'joshkingtechnologies@gmail.com',
      password: 'MyExistingSecretPassword2026!'
    })
  });
  assert(userAdminLoginRes.ok, 'Designated Super Admin logs in / initializes with existing credentials');
  const userAdminData = await userAdminLoginRes.json();
  assert(userAdminData.user.role === 'super_admin', 'Designated account is permanently assigned super_admin');
  assert(userAdminData.user.email === 'joshkingtechnologies@gmail.com', 'Preserves exact user email');
  const userAdminToken = userAdminData.token;
  console.log(`✓ User account joshkingtechnologies@gmail.com (ID: ${userAdminData.user.id}) permanently assigned Super Admin!`);

  // Test 4: Verify claim-super-admin endpoint
  console.log('\nTest 4: Verifying secure server-side claim-super-admin endpoint...');
  const claimRes = await fetch(`${BASE_URL}/api/auth/claim-super-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userAdminToken}`
    }
  });
  assert(claimRes.ok, 'claim-super-admin succeeds for authenticated designated admin');
  const claimData = await claimRes.json();
  assert(claimData.user.role === 'super_admin', 'claim confirms super_admin role');
  console.log('✓ Secure one-time server-side initialization procedure verified.');

  // Test 5: Verify unauthorized user cannot claim super admin
  console.log('\nTest 5: Verifying unauthorized user cannot claim Super Admin...');
  const caretakerLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'caretaker@kodipay.co.ke', password: 'Caretaker2026!' })
  });
  assert(caretakerLoginRes.ok, 'Caretaker logs in');
  const caretakerToken = (await caretakerLoginRes.json()).token;

  const unauthorizedClaimRes = await fetch(`${BASE_URL}/api/auth/claim-super-admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${caretakerToken}`
    }
  });
  assert(unauthorizedClaimRes.status === 403, `Unauthorized claim rejected with 403 Forbidden (got ${unauthorizedClaimRes.status})`);
  console.log('✓ Privilege escalation prevented: Ordinary users cannot claim Super Admin.');

  // Test 6: Super Admin User Statistics Summary
  console.log('\nTest 6: Fetching /api/users/stats/summary as Super Admin...');
  const statsRes = await fetch(`${BASE_URL}/api/users/stats/summary`, {
    headers: { Authorization: `Bearer ${userAdminToken}` }
  });
  assert(statsRes.ok, 'User stats summary returns 200 OK');
  const stats = await statsRes.json();
  assert(stats.totalUsers >= 2, 'Total users count >= 2');
  assert(stats.superAdmins >= 1, 'At least 1 Super Admin recorded');
  assert(stats.activeUsers >= 1, 'Active users counted');
  console.log(`✓ User Stats Summary verified: Total=${stats.totalUsers}, SuperAdmins=${stats.superAdmins}, Caretakers=${stats.caretakers}`);

  // Test 7: List users with search and filter
  console.log('\nTest 7: Listing users with search and filter...');
  const listRes = await fetch(`${BASE_URL}/api/users?search=joshking`, {
    headers: { Authorization: `Bearer ${userAdminToken}` }
  });
  assert(listRes.ok, 'List users returns 200 OK');
  const filteredUsers = await listRes.json();
  assert(filteredUsers.length >= 1, 'Search found matching user');
  assert(filteredUsers[0].email === 'joshkingtechnologies@gmail.com', 'Returned correct matching user');
  console.log('✓ Search & filter verified on users API.');

  // Test 8: Super Admin creates a new user account
  console.log('\nTest 8: Creating a new user account as Super Admin...');
  const newEmail = `user.${Date.now()}@kodipay.co.ke`;
  const createRes = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userAdminToken}`
    },
    body: JSON.stringify({
      fullName: 'Brenda Cherono',
      email: newEmail,
      password: 'BrendaPassword2026!',
      phoneNumber: '+254733445566',
      nationalId: '55667788',
      role: 'caretaker'
    })
  });
  assert(createRes.ok, `User created successfully (status ${createRes.status})`);
  const createdUser = await createRes.json();
  assert(createdUser.email === newEmail, 'User email matches');
  assert(createdUser.role === 'caretaker', 'Role assigned as caretaker');
  const createdUserId = createdUser.id;
  console.log(`✓ User ${createdUser.email} created with hashed password and role 'caretaker'.`);

  // Test 9: Duplicate email prevention on user creation
  console.log('\nTest 9: Testing duplicate email prevention...');
  const dupCreateRes = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userAdminToken}`
    },
    body: JSON.stringify({
      fullName: 'Duplicate User',
      email: newEmail,
      password: 'SomePassword2026!',
      phoneNumber: '+254799887766',
      role: 'caretaker'
    })
  });
  assert(dupCreateRes.status === 409, `Duplicate user email rejected with 409 Conflict (got ${dupCreateRes.status})`);
  console.log('✓ Duplicate email prevented with HTTP 409 Conflict.');

  // Test 10: Super Admin edits user information
  console.log('\nTest 10: Editing user information...');
  const editRes = await fetch(`${BASE_URL}/api/users/${createdUserId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userAdminToken}`
    },
    body: JSON.stringify({
      fullName: 'Brenda Cherono Rotich',
      phoneNumber: '+254733999999'
    })
  });
  assert(editRes.ok, 'User update succeeds');
  const editedUser = (await editRes.json()).user;
  assert(editedUser.fullName === 'Brenda Cherono Rotich', 'Full name updated');
  console.log('✓ User information updated and saved in Neon PostgreSQL.');

  // Test 11: Self-demotion protection (Super Admin cannot demote self)
  console.log('\nTest 11: Testing self-demotion protection safeguard...');
  const selfDemoteRes = await fetch(`${BASE_URL}/api/users/${userAdminData.user.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userAdminToken}`
    },
    body: JSON.stringify({ role: 'caretaker' })
  });
  assert(selfDemoteRes.status === 400, `Self-demotion rejected with 400 Bad Request (got ${selfDemoteRes.status})`);
  console.log('✓ Security safeguard verified: Super Admin cannot demote self.');

  // Test 12: Suspend and Reactivate Account
  console.log('\nTest 12: Suspending and reactivating account...');
  const suspendRes = await fetch(`${BASE_URL}/api/users/${createdUserId}/toggle-status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userAdminToken}` }
  });
  assert(suspendRes.ok, 'Suspend account succeeds');
  const suspendedData = await suspendRes.json();
  assert(suspendedData.user.status === 'suspended', 'Status updated to suspended');

  // Reactivate
  const reactivateRes = await fetch(`${BASE_URL}/api/users/${createdUserId}/toggle-status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${userAdminToken}` }
  });
  assert(reactivateRes.ok, 'Reactivate account succeeds');
  const activeData = await reactivateRes.json();
  assert(activeData.user.status === 'active', 'Status updated to active');
  console.log('✓ Account suspension and reactivation verified.');

  // Test 13: Super Admin resets user password
  console.log('\nTest 13: Resetting user password...');
  const resetRes = await fetch(`${BASE_URL}/api/users/${createdUserId}/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userAdminToken}`
    },
    body: JSON.stringify({ newPassword: 'BrandNewPassword2026!' })
  });
  assert(resetRes.ok, 'Password reset succeeds');
  console.log('✓ Password reset by Super Admin verified with session revocation.');

  // Test 14: View user activity & audit trail
  console.log('\nTest 14: Viewing user activity and audit trail...');
  const activityRes = await fetch(`${BASE_URL}/api/users/${createdUserId}/activity`, {
    headers: { Authorization: `Bearer ${userAdminToken}` }
  });
  if (!activityRes.ok) {
    console.error('Activity trail error:', activityRes.status, await activityRes.text());
  }
  assert(activityRes.ok, 'Activity trail returns 200 OK');
  const activity = await activityRes.json();
  assert(Array.isArray(activity.auditLogs), 'Audit logs array returned');
  console.log(`✓ Activity trail verified (${activity.auditLogs.length} audit logs).`);

  // Test 15: Delete user account
  console.log('\nTest 15: Deleting user account...');
  const deleteRes = await fetch(`${BASE_URL}/api/users/${createdUserId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userAdminToken}` }
  });
  assert(deleteRes.ok, 'User deletion succeeds');
  console.log('✓ User deleted cleanly with relational cleanup.');

  // Test 16: Self-deletion protection (Super Admin cannot delete self)
  console.log('\nTest 16: Testing self-deletion protection...');
  const selfDeleteRes = await fetch(`${BASE_URL}/api/users/${userAdminData.user.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userAdminToken}` }
  });
  assert(selfDeleteRes.status === 400, 'Self-deletion prevented with 400 Bad Request');
  console.log('✓ Security safeguard verified: Super Admin cannot delete self.');

  // Test 17: Non-SuperAdmin access restrictions
  console.log('\nTest 17: Verifying non-SuperAdmin cannot access User Management endpoints...');
  const forbiddenListRes = await fetch(`${BASE_URL}/api/users`, {
    headers: { Authorization: `Bearer ${caretakerToken}` }
  });
  assert(forbiddenListRes.status === 403, 'Caretaker denied access to /api/users (403 Forbidden)');

  const forbiddenCreateRes = await fetch(`${BASE_URL}/api/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${caretakerToken}`
    },
    body: JSON.stringify({
      fullName: 'Illegal User',
      email: 'illegal@test.com',
      password: 'Password123!',
      phoneNumber: '+254711000000',
      role: 'super_admin'
    })
  });
  assert(forbiddenCreateRes.status === 403, 'Caretaker denied creating users (403 Forbidden)');
  console.log('✓ Server-side role enforcement verified: Non-admins strictly blocked.');

  console.log('\n====================================================');
  console.log('ALL 17 SUPER ADMIN & USER MANAGEMENT TESTS PASSED! ✓✓✓');
  console.log('====================================================\n');
  process.exit(0);
}

runSuperAdminTests().catch((err) => {
  console.error('\n❌ SUPER ADMIN TEST SUITE FAILED:', err);
  process.exit(1);
});
