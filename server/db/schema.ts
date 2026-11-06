/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDb } from './connection.ts';

export async function runMigrations(): Promise<void> {
  const db = await getDb();
  console.log('Running PostgreSQL database migrations for KodiPay...');

  const migrationSql = `
    -- 1. Users and Roles
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      phone_number VARCHAR(50),
      national_id VARCHAR(50),
      role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'caretaker', 'tenant')),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

    -- 2. Properties
    CREATE TABLE IF NOT EXISTS properties (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      code VARCHAR(50) UNIQUE NOT NULL,
      address TEXT NOT NULL,
      estate VARCHAR(100),
      city VARCHAR(100) NOT NULL DEFAULT 'Nairobi',
      county VARCHAR(100) NOT NULL DEFAULT 'Nairobi',
      postal_code VARCHAR(50),
      landlord_id UUID REFERENCES users(id) ON DELETE SET NULL,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_properties_landlord ON properties(landlord_id);
    CREATE INDEX IF NOT EXISTS idx_properties_code ON properties(code);

    -- 3. Rental Units
    CREATE TABLE IF NOT EXISTS rental_units (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      unit_number VARCHAR(50) NOT NULL,
      floor VARCHAR(50),
      unit_type VARCHAR(100) NOT NULL,
      monthly_rent_cents BIGINT NOT NULL CHECK (monthly_rent_cents >= 0),
      default_due_day INT NOT NULL DEFAULT 5 CHECK (default_due_day BETWEEN 1 AND 28),
      status VARCHAR(50) NOT NULL DEFAULT 'vacant' CHECK (status IN ('vacant', 'occupied', 'maintenance')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ,
      CONSTRAINT unique_property_unit UNIQUE(property_id, unit_number)
    );

    CREATE INDEX IF NOT EXISTS idx_rental_units_property ON rental_units(property_id);
    CREATE INDEX IF NOT EXISTS idx_rental_units_status ON rental_units(status);

    -- 4. Tenants
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone_number VARCHAR(50) NOT NULL,
      national_id VARCHAR(50) NOT NULL,
      emergency_contact_name VARCHAR(255),
      emergency_contact_phone VARCHAR(50),
      credit_balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (credit_balance_cents >= 0),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_tenants_phone ON tenants(phone_number);
    CREATE INDEX IF NOT EXISTS idx_tenants_national_id ON tenants(national_id);
    CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON tenants(user_id);

    -- 5. Tenancies (links tenant to unit and property)
    CREATE TABLE IF NOT EXISTS tenancies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      unit_id UUID NOT NULL REFERENCES rental_units(id) ON DELETE RESTRICT,
      start_date DATE NOT NULL,
      end_date DATE,
      rent_amount_cents BIGINT NOT NULL CHECK (rent_amount_cents >= 0),
      deposit_cents BIGINT NOT NULL DEFAULT 0 CHECK (deposit_cents >= 0),
      rent_due_day INT NOT NULL DEFAULT 5 CHECK (rent_due_day BETWEEN 1 AND 28),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'terminated', 'pending')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_tenancies_unit ON tenancies(unit_id);
    CREATE INDEX IF NOT EXISTS idx_tenancies_tenant ON tenancies(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_tenancies_active ON tenancies(is_active);

    -- Partial unique index to enforce that an occupied unit cannot have multiple active tenancies!
    CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_unit_tenancy ON tenancies(unit_id) WHERE is_active = TRUE;

    -- 6. Monthly Rent Charges
    CREATE TABLE IF NOT EXISTS rent_charges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenancy_id UUID NOT NULL REFERENCES tenancies(id) ON DELETE RESTRICT,
      billing_month VARCHAR(7) NOT NULL, -- Format YYYY-MM
      rent_due_cents BIGINT NOT NULL CHECK (rent_due_cents >= 0),
      amount_paid_cents BIGINT NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0),
      credit_applied_cents BIGINT NOT NULL DEFAULT 0 CHECK (credit_applied_cents >= 0),
      balance_cents BIGINT NOT NULL,
      due_date DATE NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'overdue')),
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_tenancy_billing_month UNIQUE(tenancy_id, billing_month)
    );

    CREATE INDEX IF NOT EXISTS idx_rent_charges_tenancy ON rent_charges(tenancy_id);
    CREATE INDEX IF NOT EXISTS idx_rent_charges_month ON rent_charges(billing_month);
    CREATE INDEX IF NOT EXISTS idx_rent_charges_status ON rent_charges(status);

    -- 7. Payments
    CREATE TABLE IF NOT EXISTS payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_reference VARCHAR(100) UNIQUE NOT NULL,
      tenancy_id UUID NOT NULL REFERENCES tenancies(id) ON DELETE RESTRICT,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
      excess_credit_cents BIGINT NOT NULL DEFAULT 0 CHECK (excess_credit_cents >= 0),
      payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('mpesa', 'bank_transfer', 'cash', 'cheque', 'other')),
      transaction_reference VARCHAR(100),
      payment_date DATE NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending_verification', 'rejected', 'reversed')),
      recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT,
      reversal_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_payments_tenancy ON payments(tenancy_id);
    CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_payments_tx_ref ON payments(transaction_reference);
    CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

    -- 8. Payment Allocations (supports partial payments & multi-month charge allocation)
    CREATE TABLE IF NOT EXISTS payment_allocations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
      rent_charge_id UUID NOT NULL REFERENCES rent_charges(id) ON DELETE RESTRICT,
      allocated_amount_cents BIGINT NOT NULL CHECK (allocated_amount_cents > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_allocations_payment ON payment_allocations(payment_id);
    CREATE INDEX IF NOT EXISTS idx_allocations_charge ON payment_allocations(rent_charge_id);

    -- 9. Receipts
    CREATE TABLE IF NOT EXISTS receipts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_number VARCHAR(100) UNIQUE NOT NULL,
      payment_id UUID NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      unit_id UUID NOT NULL REFERENCES rental_units(id) ON DELETE RESTRICT,
      amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
      payment_date DATE NOT NULL,
      payment_method VARCHAR(50) NOT NULL,
      transaction_reference VARCHAR(100),
      period_covered VARCHAR(100) NOT NULL,
      remaining_balance_cents BIGINT NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      qr_code_data TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_receipts_receipt_no ON receipts(receipt_number);
    CREATE INDEX IF NOT EXISTS idx_receipts_tenant ON receipts(tenant_id);

    -- 10. Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(100) NOT NULL,
      entity_id VARCHAR(100) NOT NULL,
      changes JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_address VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

    -- 11. System Settings
    CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(100) PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 12. Notification Event Logs (SMS, Email, In-App for Landlords & Tenants)
    CREATE TABLE IF NOT EXISTS notification_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type VARCHAR(100) NOT NULL,
      recipient_type VARCHAR(50) NOT NULL CHECK (recipient_type IN ('landlord', 'tenant', 'admin')),
      recipient_id UUID,
      recipient_name VARCHAR(255) NOT NULL,
      recipient_contact VARCHAR(255) NOT NULL,
      channel VARCHAR(50) NOT NULL CHECK (channel IN ('sms', 'email', 'in_app')),
      subject VARCHAR(255),
      message TEXT NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'simulated', 'skipped_by_preference')),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_notif_created ON notification_logs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notification_logs(recipient_id);
    CREATE INDEX IF NOT EXISTS idx_notif_event ON notification_logs(event_type);

    -- 13. Landlord & User Notification Preferences (Toggles for SMS & Email per event)
    CREATE TABLE IF NOT EXISTS notification_preferences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sms_payment_received BOOLEAN NOT NULL DEFAULT TRUE,
      email_payment_received BOOLEAN NOT NULL DEFAULT TRUE,
      sms_tenant_receipt BOOLEAN NOT NULL DEFAULT TRUE,
      email_tenant_receipt BOOLEAN NOT NULL DEFAULT TRUE,
      sms_arrears_reminder BOOLEAN NOT NULL DEFAULT TRUE,
      email_monthly_statement BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_user_pref UNIQUE(user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_notif_pref_user ON notification_preferences(user_id);

    -- 14. Tenant Credit Transactions Ledger
    CREATE TABLE IF NOT EXISTS tenant_credit_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      tenancy_id UUID REFERENCES tenancies(id) ON DELETE SET NULL,
      type VARCHAR(50) NOT NULL CHECK (type IN ('excess_payment', 'applied_to_rent', 'refund', 'settlement_deduction', 'manual_adjustment')),
      amount_cents BIGINT NOT NULL,
      running_balance_cents BIGINT NOT NULL,
      payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
      rent_charge_id UUID REFERENCES rent_charges(id) ON DELETE SET NULL,
      refund_request_id UUID,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_credit_tx_tenant ON tenant_credit_transactions(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_credit_tx_created ON tenant_credit_transactions(created_at DESC);

    -- 15. Tenant Refund Requests
    CREATE TABLE IF NOT EXISTS refund_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      tenancy_id UUID REFERENCES tenancies(id) ON DELETE SET NULL,
      amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
      reason TEXT NOT NULL,
      payment_method VARCHAR(50) NOT NULL DEFAULT 'mpesa',
      recipient_details VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
      requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
      reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      rejection_reason TEXT,
      payment_reference VARCHAR(100),
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_refund_tenant ON refund_requests(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_refund_status ON refund_requests(status);

    -- 16. Tenancy Settlement Statements (Assign Out / Move Out)
    CREATE TABLE IF NOT EXISTS tenancy_settlements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenancy_id UUID NOT NULL REFERENCES tenancies(id) ON DELETE RESTRICT,
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      unit_id UUID NOT NULL REFERENCES rental_units(id) ON DELETE RESTRICT,
      move_out_date DATE NOT NULL,
      reason TEXT NOT NULL,
      unpaid_rent_cents BIGINT NOT NULL DEFAULT 0,
      deposit_held_cents BIGINT NOT NULL DEFAULT 0,
      excess_credit_cents BIGINT NOT NULL DEFAULT 0,
      deductions_cents BIGINT NOT NULL DEFAULT 0,
      net_settlement_cents BIGINT NOT NULL DEFAULT 0,
      credit_action VARCHAR(50) NOT NULL DEFAULT 'refunded' CHECK (credit_action IN ('refunded', 'retained', 'settled')),
      status VARCHAR(50) NOT NULL DEFAULT 'completed',
      settled_by UUID REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_settlement_tenancy ON tenancy_settlements(tenancy_id);
    CREATE INDEX IF NOT EXISTS idx_settlement_tenant ON tenancy_settlements(tenant_id);

    -- 17. Security Events & WAF Threat Logs
    CREATE TABLE IF NOT EXISTS security_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type VARCHAR(100) NOT NULL,
      severity VARCHAR(50) NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
      ip_address VARCHAR(100) NOT NULL,
      user_id UUID REFERENCES users(id) ON DELETE SET NULL,
      user_email VARCHAR(255),
      endpoint VARCHAR(255) NOT NULL,
      request_method VARCHAR(20) NOT NULL,
      payload_sample TEXT,
      action_taken VARCHAR(50) NOT NULL DEFAULT 'blocked' CHECK (action_taken IN ('blocked', 'flagged', 'rate_limited', 'logged', 'ip_banned')),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sec_events_created ON security_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sec_events_ip ON security_events(ip_address);
    CREATE INDEX IF NOT EXISTS idx_sec_events_type ON security_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_sec_events_sev ON security_events(severity);

    -- 18. Blocked IPs (WAF Auto-ban and Manual Blocklist)
    CREATE TABLE IF NOT EXISTS blocked_ips (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ip_address VARCHAR(100) UNIQUE NOT NULL,
      reason TEXT NOT NULL,
      strike_count INT NOT NULL DEFAULT 1,
      is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
      expires_at TIMESTAMPTZ,
      blocked_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip ON blocked_ips(ip_address);

    -- 19. Whitelisted IPs (Exempt from Rate Limits & Strict WAF Inspection)
    CREATE TABLE IF NOT EXISTS whitelisted_ips (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ip_address VARCHAR(100) UNIQUE NOT NULL,
      description VARCHAR(255) NOT NULL,
      added_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- 20. User Active Sessions (Secure Invalidation & Inactivity Tracking)
    CREATE TABLE IF NOT EXISTS user_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(255) NOT NULL,
      ip_address VARCHAR(100) NOT NULL,
      user_agent TEXT,
      device_name VARCHAR(100),
      last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_revoked ON user_sessions(is_revoked);

    -- 21. Login Attempts (Brute Force Monitoring)
    CREATE TABLE IF NOT EXISTS login_attempts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) NOT NULL,
      ip_address VARCHAR(100) NOT NULL,
      status VARCHAR(50) NOT NULL CHECK (status IN ('success', 'failed')),
      failure_reason VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address);
    CREATE INDEX IF NOT EXISTS idx_login_attempts_created ON login_attempts(created_at DESC);

    -- 22. Database Backups & Disaster Recovery Records
    CREATE TABLE IF NOT EXISTS database_backups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      filename VARCHAR(255) NOT NULL,
      size_bytes BIGINT NOT NULL,
      checksum_sha256 VARCHAR(64) NOT NULL,
      records_count INT NOT NULL DEFAULT 0,
      backup_type VARCHAR(50) NOT NULL DEFAULT 'manual' CHECK (backup_type IN ('manual', 'automatic', 'pre_migration')),
      backup_data TEXT NOT NULL,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_db_backups_created ON database_backups(created_at DESC);
  `;

  // Execute multi-statement SQL script (supports both PGlite db.exec and pg.Pool db.query)
  if (typeof db.exec === 'function') {
    await db.exec(migrationSql);
  } else {
    await db.query(migrationSql);
  }

  // Insert default system settings if not existing
  await db.query(`
    INSERT INTO system_settings (key, value)
    VALUES 
      ('general', '{"system_name": "KodiPay Kenya", "currency": "KSh", "timezone": "Africa/Nairobi", "grace_period_days": 5, "late_fee_percentage": 0}'::jsonb),
      ('payment_methods', '{"mpesa": true, "bank_transfer": true, "cash": true, "cheque": true}'::jsonb),
      ('security', '{"waf_enabled": true, "sqli_protection": true, "xss_protection": true, "csrf_protection": true, "rate_limiting_enabled": true, "rate_limit_max_requests_per_minute": 120, "login_brute_force_max_attempts": 5, "login_lockout_duration_minutes": 15, "auto_block_suspicious_ips": true, "auto_block_strike_threshold": 3, "session_inactivity_timeout_minutes": 30, "enforce_strong_passwords": true, "ip_whitelist": ["127.0.0.1", "::1"]}'::jsonb)
    ON CONFLICT (key) DO NOTHING;
  `);

  // Migrate legacy columns and roles in existing database:
  try {
    await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS credit_balance_cents BIGINT NOT NULL DEFAULT 0`);
    await db.query(`ALTER TABLE rent_charges ADD COLUMN IF NOT EXISTS credit_applied_cents BIGINT NOT NULL DEFAULT 0`);
    await db.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS excess_credit_cents BIGINT NOT NULL DEFAULT 0`);
    await db.query(`UPDATE users SET role = 'super_admin' WHERE role = 'landlord'`);
    await db.query(`UPDATE users SET role = 'caretaker' WHERE role = 'accountant'`);
    await db.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
    await db.query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('super_admin', 'caretaker', 'tenant'))`);

    // Improved Tenant and Tenancy Details migrations:
    await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS mpesa_phone_number VARCHAR(50)`);
    await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS profile_photo_url TEXT`);
    await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(100)`);
    await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS emergency_contact_alt_phone VARCHAR(50)`);
    await db.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS portal_status VARCHAR(50) DEFAULT 'uninvited'`);

    await db.query(`ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS payment_frequency VARCHAR(50) DEFAULT 'monthly'`);
    await db.query(`ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS deposit_status VARCHAR(50) DEFAULT 'pending'`);
    await db.query(`ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS deposit_paid_cents BIGINT DEFAULT 0`);
    await db.query(`ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS lease_agreement_url TEXT`);
    await db.query(`ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS lease_agreement_filename VARCHAR(255)`);
    await db.query(`ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS rent_override_authorized_by UUID REFERENCES users(id)`);
    await db.query(`ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS rent_override_reason TEXT`);
    await db.query(`ALTER TABLE tenancies ADD COLUMN IF NOT EXISTS original_rent_cents BIGINT`);

    // User Management columns for Super Admin Dashboard
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`);
    await db.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active'`);
    await db.query(`UPDATE users SET status = 'active' WHERE status IS NULL AND is_active = TRUE`);
    await db.query(`UPDATE users SET status = 'suspended' WHERE status IS NULL AND is_active = FALSE`);

    // Verify and ensure existing Super Admin account is permanently assigned super_admin without altering password
    const designatedAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'joshkingtechnologies@gmail.com').trim().toLowerCase();
    const existingTargetUser = await db.query(`SELECT id, role, email FROM users WHERE LOWER(email) = $1`, [designatedAdminEmail]);
    if (existingTargetUser.rows.length > 0) {
      await db.query(
        `UPDATE users SET role = 'super_admin', is_active = TRUE, status = 'active', updated_at = NOW() WHERE id = $1`,
        [existingTargetUser.rows[0].id]
      );
      console.log(`Verified existing user account ${designatedAdminEmail} (${existingTargetUser.rows[0].id}) as permanent Super Administrator.`);
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS portal_invitations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        phone_number VARCHAR(50) NOT NULL,
        token VARCHAR(100) UNIQUE NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'activated', 'expired', 'revoked')),
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        activated_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_invitations_token ON portal_invitations(token)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_invitations_tenant ON portal_invitations(tenant_id)');
  } catch (err: any) {
    // Columns or constraints might already exist
    console.warn('Migration step notice:', err.message);
  }

  const bcrypt = (await import('bcryptjs')).default;

  // 1. System Default Super Administrator Account
  const adminPasswordHash = bcrypt.hashSync('SuperAdmin2026!', 10);
  await db.query(
    `INSERT INTO users (email, password_hash, full_name, phone_number, national_id, role, status)
     VALUES ('superadmin@kodipay.co.ke', $1, 'Chief System Administrator', '+254700000000', '11223344', 'super_admin', 'active')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'super_admin', is_active = TRUE, status = 'active'`,
    [adminPasswordHash]
  );

  // 2. Caretaker Account (Data Entry Only)
  const caretakerPasswordHash = bcrypt.hashSync('Caretaker2026!', 10);
  await db.query(
    `INSERT INTO users (email, password_hash, full_name, phone_number, national_id, role)
     VALUES ('caretaker@kodipay.co.ke', $1, 'John Kamau (Estate Caretaker - Data Entry)', '+254711223344', '22334455', 'caretaker')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'caretaker', is_active = TRUE`,
    [caretakerPasswordHash]
  );

  // 3. Demo Tenant Account (Tenant Portal Access)
  const tenantPasswordHash = bcrypt.hashSync('Tenant2026!', 10);
  const tenantUserRes = await db.query(
    `INSERT INTO users (email, password_hash, full_name, phone_number, national_id, role)
     VALUES ('tenant.demo@kodipay.co.ke', $1, 'Dennis Mwangi (Tenant)', '+254722334455', '33445566', 'tenant')
     ON CONFLICT (email) DO UPDATE SET password_hash = $1, role = 'tenant', is_active = TRUE
     RETURNING id`,
    [tenantPasswordHash]
  );

  // Ensure demo tenant profile is linked in tenants table
  const tenantUserId = (tenantUserRes.rows[0] as any)?.id;
  if (tenantUserId) {
    await db.query(
      `INSERT INTO tenants (user_id, full_name, email, phone_number, national_id, notes)
       VALUES ($1, 'Dennis Mwangi', 'tenant.demo@kodipay.co.ke', '+254722334455', '33445566', 'Active demo tenant')
       ON CONFLICT (user_id) DO NOTHING`,
      [tenantUserId]
    );
  }

  console.log('PostgreSQL database migrations applied successfully with 3 dedicated roles: Super Admin, Caretaker (Data Entry), and Tenant!');
}
