/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatKSh, formatDate, formatMonth } from '../lib/api.ts';
import { DashboardStats, Property } from '../types/index.ts';
import {
  Building2,
  Users,
  CreditCard,
  AlertCircle,
  TrendingUp,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Filter,
  Plus,
  RefreshCw,
  FileCheck,
  Download,
  RotateCcw,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { exportPaymentsStatementPDF, exportReceiptPDF } from '../utils/pdfExport.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface DashboardPageProps {
  onOpenRecordPayment: () => void;
  onOpenAddTenant: () => void;
  onOpenAddProperty: () => void;
  onOpenBillingModal: () => void;
  onViewReceipt: (receiptId: string) => void;
  onNavigateTab: (tab: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onOpenRecordPayment,
  onOpenAddTenant,
  onOpenAddProperty,
  onOpenBillingModal,
  onViewReceipt,
  onNavigateTab
}) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProperties();
  }, []);

  useEffect(() => {
    fetchStats();

    // Auto-update dashboard metrics automatically when payments are recorded
    const handleAutoUpdate = () => {
      fetchStats();
      fetchProperties();
    };

    window.addEventListener('kodipay:payment-recorded', handleAutoUpdate);
    window.addEventListener('kodipay:refresh-data', handleAutoUpdate);
    return () => {
      window.removeEventListener('kodipay:payment-recorded', handleAutoUpdate);
      window.removeEventListener('kodipay:refresh-data', handleAutoUpdate);
    };
  }, [selectedMonth, selectedPropertyId]);

  const fetchProperties = async () => {
    try {
      const res = await apiRequest<Property[]>('/api/properties');
      setProperties(res);
    } catch (err) {
      console.error('Error fetching properties:', err);
    }
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      let url = `/api/dashboard/stats?month=${selectedMonth}`;
      if (selectedPropertyId) {
        url += `&propertyId=${selectedPropertyId}`;
      }
      const res = await apiRequest<DashboardStats>(url);
      setStats(res);
    } catch (err) {
      console.error('Error loading dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Super Admin Status & Command Center Banner */}
      {isAdmin && (
        <div className="bg-gradient-to-r from-[#0B1528] to-[#122340] text-white p-4 rounded-xl border border-slate-800 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-white">Super Administrator Control Center</span>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                  Permanent Super Admin
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Authenticated as <strong className="text-white font-mono">{user?.email}</strong>. Full authority over users, properties, finances, and security.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onNavigateTab('users')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-xs"
            >
              <Users className="w-3.5 h-3.5" />
              <span>User Management</span>
            </button>
            <button
              onClick={() => onNavigateTab('security-center')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors border border-slate-700"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>Security Center</span>
            </button>
          </div>
        </div>
      )}

      {/* Controls Bar: Filter by Month & Property, and Quick Action Buttons */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Filters:</span>
          </div>

          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-9 px-3 border border-slate-300 rounded-lg text-xs font-medium bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />

          <select
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            className="h-9 px-3 border border-slate-300 rounded-lg text-xs bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="">All Properties ({properties.length})</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>

          <button
            onClick={fetchStats}
            title="Refresh statistics"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Quick Action Triggers */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenRecordPayment}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-xs"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </button>

          <button
            onClick={onOpenAddTenant}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition-colors border border-slate-300/70"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Tenant</span>
          </button>

          {isAdmin && (
            <button
              onClick={onOpenAddProperty}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition-colors border border-slate-300/70"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Add Property</span>
            </button>
          )}

          <button
            onClick={() => onNavigateTab('arrears')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-800 rounded-lg transition-colors border border-rose-200"
          >
            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
            <span>View Arrears</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Expected Rent */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            <span>Expected Rent ({formatMonth(selectedMonth)})</span>
            <Building2 className="w-4 h-4 text-blue-600" />
          </div>
          <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {formatKSh(stats?.financials.expectedRentCents || 0)}
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
            <span>{stats?.totalTenants || 0} active tenants</span>
            <span aria-hidden="true">·</span>
            <span>{stats?.units.occupied || 0} occupied units</span>
          </div>
        </div>

        {/* Confirmed Collections */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            <span>Confirmed Collections</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {formatKSh(stats?.financials.confirmedPaymentsCollectedCents || 0)}
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
            <span className="font-semibold text-emerald-700">
              {stats?.financials.collectionPercentage || 0}% collected
            </span>
            <span aria-hidden="true">·</span>
            <span>M-Pesa & Bank verified</span>
          </div>
        </div>

        {/* Outstanding for Selected Month */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            <span>Current Month Uncollected</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="font-mono text-2xl font-bold text-amber-700 tabular-nums">
            {formatKSh(stats?.financials.outstandingRentCents || 0)}
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
            <span>{stats?.financials.unpaidCount || 0} unpaid</span>
            <span aria-hidden="true">·</span>
            <span>{stats?.financials.partialCount || 0} partial</span>
          </div>
        </div>

        {/* Total Cumulative Arrears */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            <span>Total Cumulative Arrears</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="font-mono text-2xl font-bold text-rose-700 tabular-nums">
            {formatKSh(stats?.financials.totalCumulativeArrearsCents || 0)}
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
            <span className="text-rose-700 font-semibold">{stats?.financials.overdueCount || 0} overdue charges</span>
            <span aria-hidden="true">·</span>
            <span>Grace period: 5 days</span>
          </div>
        </div>
      </div>

      {/* Excess Credit & Refunds Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Tenant Credit Balances */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
              <span>Tenant Credit Balances</span>
            </div>
            <div className="font-mono text-xl font-bold text-emerald-700 tabular-nums">
              {formatKSh(stats?.financials.totalTenantCreditsCents || 0)}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              Excess rent carried forward
            </span>
          </div>
          <button
            onClick={() => onNavigateTab('refunds')}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
          >
            Refunds <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Pending Refund Requests */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Pending Refund Requests</span>
            </div>
            <div className="font-mono text-xl font-bold text-amber-600 tabular-nums">
              {formatKSh(stats?.financials.pendingRefundsCents || 0)}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {stats?.financials.pendingRefundsCount || 0} request(s) awaiting review
            </span>
          </div>
          <button
            onClick={() => onNavigateTab('refunds')}
            className="text-xs font-semibold text-amber-700 hover:text-amber-900 flex items-center gap-1"
          >
            Review <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Completed Refunds */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Completed Refunds</span>
            </div>
            <div className="font-mono text-xl font-bold text-blue-700 tabular-nums">
              {formatKSh(stats?.financials.completedRefundsCents || 0)}
            </div>
            <span className="text-[11px] text-slate-400 mt-0.5 block">
              {stats?.financials.completedRefundsCount || 0} payout(s) disbursed
            </span>
          </div>
          <button
            onClick={() => onNavigateTab('refunds')}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 flex items-center gap-1"
          >
            Ledger <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Property & Occupancy Inventory Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Properties Managed</span>
            <p className="font-mono text-xl font-bold text-slate-900 mt-1">{stats?.totalProperties || 0}</p>
          </div>
          <button
            onClick={() => onNavigateTab('properties')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            Manage <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Rental Units Occupancy</span>
            <p className="font-mono text-xl font-bold text-slate-900 mt-1">
              {stats?.units.occupied || 0} / {stats?.units.total || 0}
              <span className="text-xs font-sans text-slate-500 font-normal ml-2">
                ({stats?.units.total ? Math.round(((stats.units.occupied) / stats.units.total) * 100) : 0}% occupancy)
              </span>
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('units')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
          >
            View Units <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Vacant Units</span>
            <p className="font-mono text-xl font-bold text-emerald-700 mt-1">
              {stats?.units.vacant || 0} Available
            </p>
          </div>
          <button
            onClick={onOpenAddTenant}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
          >
            Assign Tenant <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2-Column Split: Recent Confirmed Payments & Upcoming Due Dates */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Confirmed Payments */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm text-slate-900">Recent Collections & Payments</h2>
              <p className="text-xs text-slate-500">Live verified payments recorded in database</p>
            </div>
            <div className="flex items-center gap-2">
              {stats?.recentPayments && stats.recentPayments.length > 0 && (
                <button
                  onClick={() => {
                    const mapped: any[] = stats.recentPayments.map(p => ({
                      payment_reference: p.transaction_reference || p.receipt_number || 'N/A',
                      tenant_name: p.tenant_name,
                      property_name: p.property_name || 'Assigned Property',
                      unit_number: p.unit_number,
                      payment_method: p.payment_method,
                      transaction_reference: p.transaction_reference,
                      payment_date: p.payment_date,
                      amount_cents: p.amount_cents,
                      receipt_number: p.receipt_number,
                      status: 'confirmed'
                    }));
                    exportPaymentsStatementPDF(mapped, `Dashboard Recent Collections (${selectedMonth})`);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md border border-slate-300 transition-colors"
                  title="Export recent collections as PDF"
                >
                  <Download className="w-3 h-3 text-blue-600" />
                  <span>Export (PDF)</span>
                </button>
              )}
              <button
                onClick={() => onNavigateTab('payments')}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                View All
              </button>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {stats?.recentPayments && stats.recentPayments.length > 0 ? (
              stats.recentPayments.map((p) => (
                <div key={p.id} className="p-4 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{p.tenant_name}</span>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span className="text-slate-600">Unit {p.unit_number}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <span className="capitalize">{p.payment_method === 'mpesa' ? 'M-Pesa Mobile' : p.payment_method.replace('_', ' ')}</span>
                      {p.transaction_reference && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{p.transaction_reference}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{formatDate(p.payment_date)}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-bold text-slate-900 tabular-nums block text-sm">
                      {formatKSh(p.amount_cents)}
                    </span>
                    {p.receipt_id ? (
                      <div className="flex items-center gap-1.5 justify-end mt-0.5">
                        <button
                          onClick={async () => {
                            try {
                              const r = await apiRequest(`/api/receipts/${p.receipt_id}`);
                              exportReceiptPDF(r);
                            } catch (err: any) {
                              alert(err.message || 'Failed to download receipt PDF');
                            }
                          }}
                          className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-0.5"
                          title="Download official receipt PDF"
                        >
                          <Download className="w-3 h-3" />
                          <span>PDF</span>
                        </button>
                        <span className="text-slate-300">·</span>
                        <button
                          onClick={() => onViewReceipt(p.receipt_id!)}
                          className="text-[11px] font-semibold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <FileCheck className="w-3 h-3" />
                          <span>Receipt</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-[10px] text-slate-400">Pending Receipt</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                No payments recorded yet for this selection. Use "Record Payment" to log an entry.
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Rent Due Dates & Pending Collection */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm text-slate-900">Upcoming Due Dates & Invoices</h2>
              <p className="text-xs text-slate-500">Unsettled charges scheduled for collection</p>
            </div>
            <button
              onClick={() => onNavigateTab('rent-collection')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              Open Register
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {stats?.upcomingDueDates && stats.upcomingDueDates.length > 0 ? (
              stats.upcomingDueDates.map((c) => (
                <div key={c.id} className="p-4 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{c.tenant_name}</span>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span className="text-slate-600">{c.property_name} ({c.unit_number})</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>Due: {formatDate(c.due_date)}</span>
                      <span aria-hidden="true">·</span>
                      <span>Month: {formatMonth(c.billing_month)}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="font-mono font-bold text-slate-900 tabular-nums block text-sm">
                      {formatKSh(c.balance_cents)}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                      {c.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                No pending rent due dates. Use "Generate Billing" to create charges for the month.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
