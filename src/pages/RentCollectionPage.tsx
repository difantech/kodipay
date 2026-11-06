/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatKSh, formatDate, formatMonth } from '../lib/api.ts';
import { RentCharge, Property } from '../types/index.ts';
import { ReceiptText, Filter, Calendar, CreditCard, RefreshCw, AlertCircle, Download } from 'lucide-react';
import { exportRentRollPDF } from '../utils/pdfExport.ts';

interface RentCollectionPageProps {
  onOpenRecordPaymentWithTenancy: (tenancyId: string) => void;
  onOpenBillingModal: () => void;
}

export const RentCollectionPage: React.FC<RentCollectionPageProps> = ({
  onOpenRecordPaymentWithTenancy,
  onOpenBillingModal
}) => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [charges, setCharges] = useState<RentCharge[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProperties();
  }, []);

  useEffect(() => {
    fetchRegister();
  }, [selectedMonth, selectedPropertyId, selectedStatus]);

  // Real-time automatic updates when payment is recorded or confirmed anywhere in system
  useEffect(() => {
    const handleRefresh = () => {
      fetchRegister();
    };

    window.addEventListener('kodipay:payment-recorded', handleRefresh);
    window.addEventListener('kodipay:refresh-data', handleRefresh);
    return () => {
      window.removeEventListener('kodipay:payment-recorded', handleRefresh);
      window.removeEventListener('kodipay:refresh-data', handleRefresh);
    };
  }, [selectedMonth, selectedPropertyId, selectedStatus]);

  const fetchProperties = async () => {
    try {
      const res = await apiRequest<Property[]>('/api/properties');
      setProperties(res);
    } catch (err) {
      console.error('Failed to load properties:', err);
    }
  };

  const fetchRegister = async () => {
    setLoading(true);
    try {
      let url = `/api/billing/register?month=${selectedMonth}`;
      if (selectedPropertyId) url += `&propertyId=${selectedPropertyId}`;
      if (selectedStatus) url += `&status=${selectedStatus}`;
      const res = await apiRequest<RentCharge[]>(url);
      setCharges(res);
    } catch (err) {
      console.error('Failed to load rent register:', err);
    } finally {
      setLoading(false);
    }
  };

  // Aggregated totals for this view
  const totalRentDue = charges.reduce((acc, c) => acc + parseInt(c.rent_due_cents as any, 10), 0);
  const totalAmountPaid = charges.reduce((acc, c) => acc + parseInt(c.amount_paid_cents as any, 10), 0);
  const totalBalance = charges.reduce((acc, c) => acc + parseInt(c.balance_cents as any, 10), 0);

  const handleExportRentRoll = () => {
    if (charges.length === 0) {
      alert('No rent charges in current filter to export');
      return;
    }
    const prop = properties.find((p) => p.id === selectedPropertyId);
    exportRentRollPDF(charges, selectedMonth, prop?.name);
  };

  return (
    <div className="space-y-6">
      {/* Controls & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Filter className="w-4 h-4 text-slate-500" />
            <span>Filters:</span>
          </div>

          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-9 px-3 border border-slate-300 rounded-lg text-xs bg-slate-50 font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
          />

          <select
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            className="h-9 px-3 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="">All Properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-9 px-3 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="">All Statuses</option>
            <option value="paid">Paid</option>
            <option value="partially_paid">Partially Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="overdue">Overdue</option>
          </select>

          <button
            onClick={fetchRegister}
            title="Refresh rent register"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {charges.length > 0 && (
            <button
              onClick={handleExportRentRoll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors shadow-xs"
              title="Download official Rent Roll & Collection Register as PDF"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Export Rent Roll (PDF)</span>
            </button>
          )}

          <button
            onClick={onOpenBillingModal}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-xs"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Generate Monthly Invoices</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Total Rent Billed</span>
          <div className="font-mono text-xl font-bold text-slate-900 tabular-nums mt-1">
            {formatKSh(totalRentDue)}
          </div>
          <span className="text-xs text-slate-400">{charges.length} rent charge records</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Confirmed Collected</span>
          <div className="font-mono text-xl font-bold text-emerald-700 tabular-nums mt-1">
            {formatKSh(totalAmountPaid)}
          </div>
          <span className="text-xs text-emerald-700 font-semibold">
            {totalRentDue > 0 ? Math.round((totalAmountPaid / totalRentDue) * 100) : 0}% collected
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">Remaining Uncollected</span>
          <div className="font-mono text-xl font-bold text-rose-700 tabular-nums mt-1">
            {formatKSh(totalBalance)}
          </div>
          <span className="text-xs text-slate-400">Overdue grace period: 5 days</span>
        </div>
      </div>

      {/* Rent Register Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Tenant</th>
                <th className="py-3 px-4">Property & Unit</th>
                <th className="py-3 px-4">Billing Month</th>
                <th className="py-3 px-4">Rent Due</th>
                <th className="py-3 px-4">Amount Paid</th>
                <th className="py-3 px-4">Balance</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {charges.length > 0 ? (
                charges.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 block">{c.tenant_name}</span>
                      <span className="text-[11px] text-slate-500 font-mono">{c.tenant_phone}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-900">{c.property_name}</span>
                      <span className="text-[11px] text-slate-500 block">Unit {c.unit_number}</span>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium">{c.billing_month}</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 tabular-nums">
                      {formatKSh(c.rent_due_cents)}
                    </td>
                    <td className="py-3 px-4 font-mono text-emerald-700 tabular-nums font-semibold">
                      {formatKSh(c.amount_paid_cents)}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold tabular-nums">
                      <span className={c.balance_cents > 0 ? 'text-rose-600' : 'text-slate-900'}>
                        {formatKSh(c.balance_cents)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono">{formatDate(c.due_date)}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider ${
                          c.status === 'paid'
                            ? 'text-emerald-700'
                            : c.status === 'partially_paid'
                            ? 'text-blue-700'
                            : c.status === 'overdue'
                            ? 'text-rose-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {c.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {c.balance_cents > 0 ? (
                        <button
                          onClick={() => onOpenRecordPaymentWithTenancy(c.tenancy_id)}
                          className="px-2.5 py-1 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 transition-colors"
                        >
                          Collect
                        </button>
                      ) : (
                        <span className="text-[11px] text-emerald-700 font-semibold">Settled</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No rent charges recorded for this period. Click "Generate Monthly Invoices" to create charges.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
