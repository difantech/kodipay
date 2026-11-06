/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'super_admin' | 'caretaker' | 'tenant';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  nationalId?: string;
  role: UserRole;
  isActive?: boolean;
  status?: 'active' | 'suspended' | 'deactivated';
  createdAt?: string;
  lastLoginAt?: string | null;
  updatedAt?: string;
  tenantId?: string | null;
  tenantInfo?: any;
}

export interface Property {
  id: string;
  name: string;
  code: string;
  address: string;
  estate?: string;
  city: string;
  county: string;
  postal_code?: string;
  landlord_id?: string;
  landlord_name?: string;
  landlord_email?: string;
  description?: string;
  total_units?: number;
  occupied_units?: number;
  vacant_units?: number;
  expected_monthly_rent_cents?: number;
  units?: RentalUnit[];
  created_at: string;
}

export interface RentalUnit {
  id: string;
  property_id: string;
  unit_number: string;
  floor?: string;
  unit_type: string;
  monthly_rent_cents: number;
  default_due_day: number;
  status: 'vacant' | 'occupied' | 'maintenance';
  active_tenancy_id?: string;
  tenant_id?: string;
  tenant_name?: string;
  tenant_phone?: string;
  active_rent_cents?: number;
  tenancy_start_date?: string;
  created_at: string;
}

export interface Tenant {
  id: string;
  user_id?: string;
  full_name: string;
  email: string;
  phone_number: string;
  mpesa_phone_number?: string;
  national_id: string;
  profile_photo_url?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relationship?: string;
  emergency_contact_alt_phone?: string;
  credit_balance_cents?: number;
  notes?: string;
  unit_number?: string;
  unit_id?: string;
  property_id?: string;
  property_name?: string;
  property_code?: string;
  tenancy_id?: string;
  rent_amount_cents?: number;
  deposit_cents?: number;
  deposit_status?: 'pending' | 'paid' | 'partially_paid' | 'waived';
  deposit_paid_cents?: number;
  payment_frequency?: 'monthly' | 'quarterly' | 'biannually' | 'annually';
  tenancy_start_date?: string;
  tenancy_end_date?: string;
  is_tenancy_active?: boolean;
  total_balance_cents?: number;
  portal_status?: 'uninvited' | 'invited' | 'active';
  portal_invitation_token?: string;
  created_at: string;
}

export interface RentCharge {
  id: string;
  tenancy_id: string;
  billing_month: string;
  rent_due_cents: number;
  amount_paid_cents: number;
  credit_applied_cents?: number;
  balance_cents: number;
  due_date: string;
  status: 'unpaid' | 'partially_paid' | 'paid' | 'overdue';
  notes?: string;
  tenant_id?: string;
  tenant_name?: string;
  tenant_phone?: string;
  unit_number?: string;
  property_id?: string;
  property_name?: string;
  property_code?: string;
  created_at: string;
}

export interface Payment {
  id: string;
  payment_reference: string;
  tenancy_id: string;
  tenant_id: string;
  amount_cents: number;
  excess_credit_cents?: number;
  payment_method: 'mpesa' | 'bank_transfer' | 'cash' | 'cheque' | 'other';
  transaction_reference?: string;
  payment_date: string;
  status: 'confirmed' | 'pending_verification' | 'rejected' | 'reversed';
  recorded_by?: string;
  recorded_by_name?: string;
  notes?: string;
  reversal_reason?: string;
  tenant_name?: string;
  tenant_phone?: string;
  unit_number?: string;
  property_id?: string;
  property_name?: string;
  receipt_number?: string;
  receipt_id?: string;
  created_at: string;
}

export interface Receipt {
  id: string;
  receipt_number: string;
  payment_id: string;
  tenant_id: string;
  tenant_name: string;
  tenant_phone?: string;
  tenant_email?: string;
  tenant_national_id?: string;
  unit_id: string;
  unit_number: string;
  unit_type?: string;
  floor?: string;
  property_id: string;
  property_name: string;
  property_code: string;
  property_address: string;
  property_estate?: string;
  property_city?: string;
  amount_cents: number;
  payment_date: string;
  payment_method: string;
  transaction_reference?: string;
  period_covered: string;
  remaining_balance_cents: number;
  excess_credit_cents?: number;
  payment_reference?: string;
  payment_status?: string;
  reversal_reason?: string;
  issued_by_name?: string;
  generated_at: string;
  qr_code_data?: string;
}

export interface TenantCreditTransaction {
  id: string;
  tenant_id: string;
  tenancy_id?: string;
  type: 'excess_payment' | 'applied_to_rent' | 'refund' | 'settlement_deduction' | 'manual_adjustment';
  amount_cents: number;
  running_balance_cents: number;
  payment_id?: string;
  rent_charge_id?: string;
  refund_request_id?: string;
  notes?: string;
  created_at: string;
}

export interface RefundRequest {
  id: string;
  tenant_id: string;
  tenant_name?: string;
  tenant_phone?: string;
  tenancy_id?: string;
  unit_number?: string;
  property_name?: string;
  amount_cents: number;
  reason: string;
  payment_method: string;
  recipient_details: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  requested_by?: string;
  requested_by_name?: string;
  reviewed_by?: string;
  reviewed_by_name?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  payment_reference?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface TenancySettlement {
  id: string;
  tenancy_id: string;
  tenant_id: string;
  tenant_name?: string;
  unit_id: string;
  unit_number?: string;
  property_name?: string;
  move_out_date: string;
  reason: string;
  unpaid_rent_cents: number;
  deposit_held_cents: number;
  excess_credit_cents: number;
  deductions_cents: number;
  net_settlement_cents: number;
  credit_action: 'refunded' | 'retained' | 'settled';
  status: string;
  settled_by?: string;
  notes?: string;
  created_at: string;
}

export interface DashboardStats {
  selectedMonth: string;
  totalProperties: number;
  units: {
    total: number;
    occupied: number;
    vacant: number;
    maintenance: number;
  };
  totalTenants: number;
  financials: {
    expectedRentCents: number;
    collectedRentCents: number;
    outstandingRentCents: number;
    confirmedPaymentsCollectedCents: number;
    totalCumulativeArrearsCents: number;
    collectionPercentage: number;
    paidCount: number;
    partialCount: number;
    unpaidCount: number;
    overdueCount: number;
    totalTenantCreditsCents: number;
    pendingRefundsCount: number;
    pendingRefundsCents: number;
    completedRefundsCount: number;
    completedRefundsCents: number;
  };
  recentPayments: Payment[];
  upcomingDueDates: any[];
}

export interface SecuritySettings {
  waf_enabled: boolean;
  sqli_protection: boolean;
  xss_protection: boolean;
  csrf_protection: boolean;
  rate_limiting_enabled: boolean;
  rate_limit_max_requests_per_minute: number;
  login_brute_force_max_attempts: number;
  login_lockout_duration_minutes: number;
  auto_block_suspicious_ips: boolean;
  auto_block_strike_threshold: number;
  session_inactivity_timeout_minutes: number;
  enforce_strong_passwords: boolean;
  ip_whitelist: string[];
}

export interface SecurityEvent {
  id: string;
  event_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  ip_address: string;
  user_id?: string | null;
  user_email?: string | null;
  endpoint: string;
  request_method: string;
  payload_sample?: string | null;
  action_taken: 'blocked' | 'flagged' | 'rate_limited' | 'logged' | 'ip_banned';
  metadata: any;
  created_at: string;
}

export interface BlockedIp {
  id: string;
  ip_address: string;
  reason: string;
  strike_count: number;
  is_permanent: boolean;
  expires_at?: string | null;
  blocked_by?: string | null;
  blocked_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSession {
  id: string;
  user_id: string;
  email?: string;
  full_name?: string;
  role?: string;
  ip_address: string;
  user_agent?: string;
  device_name?: string;
  last_activity_at: string;
  expires_at: string;
  is_revoked: boolean;
  revoked_at?: string | null;
  created_at: string;
}

export interface DatabaseBackup {
  id: string;
  filename: string;
  size_bytes: number;
  checksum_sha256: string;
  records_count: number;
  backup_type: 'manual' | 'automatic' | 'pre_migration';
  created_by?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface SecurityDashboardMetrics {
  postureScore: number;
  postureRating: string;
  settings: SecuritySettings;
  stats: {
    totalThreatsRecorded: number;
    threats24h: number;
    totalBlocked: number;
    criticalAlerts: number;
    highAlerts: number;
    activeBlockedIps: number;
    activeUserSessions: number;
    totalDatabaseBackups: number;
    lastBackupAt: string | null;
  };
  recentEvents: SecurityEvent[];
  attacksByType: Array<{ event_type: string; count: string | number }>;
}
