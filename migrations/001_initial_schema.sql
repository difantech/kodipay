-- =====================================================================
-- KODIPAY KENYA RENTAL PAYMENT MANAGEMENT SYSTEM
-- Standalone Neon Serverless PostgreSQL Production Migration Schema
-- Compatible with Neon SQL Editor, psql, and pgAdmin
-- =====================================================================

-- Ensure pgcrypto extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users & Authentication
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50),
  role VARCHAR(50) NOT NULL CHECK (role IN ('super_admin', 'caretaker', 'tenant')),
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deactivated')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

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

CREATE INDEX IF NOT EXISTS idx_tenants_email ON tenants(email);
CREATE INDEX IF NOT EXISTS idx_tenants_phone ON tenants(phone_number);
CREATE INDEX IF NOT EXISTS idx_tenants_national_id ON tenants(national_id);
CREATE INDEX IF NOT EXISTS idx_tenants_user_id ON tenants(user_id);

-- 5. Tenancies
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
  tenancy_id UUID NOT NULL REFERENCES tenancies(id) ON DELETE RESTRICT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('mpesa', 'bank_transfer', 'cash', 'cheque', 'other')),
  transaction_reference VARCHAR(100) UNIQUE NOT NULL,
  payment_date DATE NOT NULL,
  notes TEXT,
  recorded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'reversed', 'pending')),
  reversal_reason TEXT,
  reversed_at TIMESTAMPTZ,
  excess_credit_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_tenancy ON payments(tenancy_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(transaction_reference);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date DESC);

-- 8. Payment Allocations
CREATE TABLE IF NOT EXISTS payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  rent_charge_id UUID NOT NULL REFERENCES rent_charges(id) ON DELETE RESTRICT,
  amount_allocated_cents BIGINT NOT NULL CHECK (amount_allocated_cents > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_payment_charge_allocation UNIQUE(payment_id, rent_charge_id)
);

-- 9. Payment Reversals
CREATE TABLE IF NOT EXISTS payment_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  reversed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reversal_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  amount_cents BIGINT NOT NULL,
  audit_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Receipts
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number VARCHAR(100) UNIQUE NOT NULL,
  payment_id UUID UNIQUE NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. Tenant Credit Transactions
CREATE TABLE IF NOT EXISTS tenant_credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tenancy_id UUID REFERENCES tenancies(id) ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('excess_payment', 'applied_to_rent', 'refund', 'adjustment')),
  amount_cents BIGINT NOT NULL,
  running_balance_cents BIGINT NOT NULL,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  rent_charge_id UUID REFERENCES rent_charges(id) ON DELETE SET NULL,
  refund_request_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 12. Refund Requests
CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  tenancy_id UUID REFERENCES tenancies(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  reason TEXT NOT NULL,
  payment_method VARCHAR(50) NOT NULL DEFAULT 'mpesa',
  recipient_details TEXT NOT NULL,
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

-- 13. Tenancy Settlements
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

-- 14. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100),
  changes JSONB,
  ip_address VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

-- 15. System Settings
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. Notification Logs & Templates
CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_type VARCHAR(50) NOT NULL CHECK (recipient_type IN ('tenant', 'landlord', 'super_admin')),
  recipient_name VARCHAR(255) NOT NULL,
  recipient_phone VARCHAR(50),
  recipient_email VARCHAR(255),
  channel VARCHAR(50) NOT NULL CHECK (channel IN ('sms', 'email')),
  notification_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'queued')),
  provider_reference VARCHAR(100),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_created ON notification_logs(created_at DESC);

-- 17. Security Events & WAF Threat Telemetry
CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  severity VARCHAR(50) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  ip_address VARCHAR(100) NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_email VARCHAR(255),
  endpoint VARCHAR(255) NOT NULL,
  request_method VARCHAR(20) NOT NULL,
  payload_sample TEXT,
  action_taken VARCHAR(50) NOT NULL CHECK (action_taken IN ('blocked', 'logged', 'rate_limited', 'ip_banned')),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sec_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_sec_events_created ON security_events(created_at DESC);

-- 18. Blocked IPs
CREATE TABLE IF NOT EXISTS blocked_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address VARCHAR(100) UNIQUE NOT NULL,
  reason VARCHAR(255) NOT NULL,
  strike_count INT NOT NULL DEFAULT 1,
  is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  blocked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 19. User Sessions
CREATE TABLE IF NOT EXISTS user_sessions (
  id VARCHAR(100) PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_address VARCHAR(100) NOT NULL,
  user_agent TEXT,
  device_name VARCHAR(100),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

-- 20. Login Attempts
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

-- 21. Database Backups
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

-- 22. Seed Default Settings
INSERT INTO system_settings (key, value)
VALUES 
  ('general', '{"system_name": "KodiPay Kenya", "currency": "KSh", "timezone": "Africa/Nairobi", "grace_period_days": 5, "late_fee_percentage": 0}'::jsonb),
  ('payment_methods', '{"mpesa": true, "bank_transfer": true, "cash": true, "cheque": true}'::jsonb),
  ('security', '{"waf_enabled": true, "sqli_protection": true, "xss_protection": true, "csrf_protection": true, "rate_limiting_enabled": true, "rate_limit_max_requests_per_minute": 120, "login_brute_force_max_attempts": 5, "login_lockout_duration_minutes": 15, "auto_block_suspicious_ips": true, "auto_block_strike_threshold": 3, "session_inactivity_timeout_minutes": 30, "enforce_strong_passwords": true, "ip_whitelist": ["127.0.0.1", "::1"]}'::jsonb)
ON CONFLICT (key) DO NOTHING;
