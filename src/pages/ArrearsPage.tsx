/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatKSh, formatDate } from '../lib/api.ts';
import { RentCharge } from '../types/index.ts';
import { AlertCircle, CreditCard, RefreshCw, Download } from 'lucide-react';
import { exportArrearsReportPDF } from '../utils/pdfExport.ts';

interface ArrearsPageProps {
  onOpenRecordPaymentWithTenancy: (tenancyId: string) => void;
}

export const ArrearsPage: React.FC<ArrearsPageProps> = ({ onOpenRecordPaymentWithTenancy }) => {
  const [arrears, setArrears] = useState<RentCharge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchArrears();

    const handleRefresh = () => {
      fetchArrears();
    };

    window.addEventListener('kodipay:payment-recorded', handleRefresh);
    window.addEventListener('kodipay:refresh-data', handleRefresh);
    return () => {
      window.removeEventListener('kodipay:payment-recorded', handleRefresh);
      window.removeEventListener('kodipay:refresh-data', handleRefresh);
    };
  }, []);

  const fetchArrears = async () => {
    setLoading(true);
    try {
      // Overdue or partially paid with balance > 0
      const res = await apiRequest<RentCharge[]>('/api/billing/register?status=overdue');
      setArrears(res);
    } catch (err) {
      console.error('Failed to load arrears:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalOverdueCents = arrears.reduce((acc, c) => acc + parseInt(c.balance_cents as any, 10), 0);

  const handleExportPDF = () => {
    if (arrears.length === 0) {
      alert('No overdue accounts to export');
      return;
    }
    exportArrearsReportPDF(arrears);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-rose-50 border border-rose-200 p-5 rounded-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-rose-800 font-bold text-base">
            <AlertCircle className="w-5 h-5 text-rose-600" />
            <span>Overdue Rent & Default Arrears Registry</span>
          </div>
          <p className="text-xs text-rose-700 mt-1">
            Charges exceeding the configured 5-day grace period past due date. Follow up with tenants for M-Pesa or bank settlement.
          </p>
        </div>

        <div className="flex items-center gap-4">
          {arrears.length > 0 && (
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-rose-700 hover:bg-rose-800 text-white rounded-lg transition-colors shadow-xs"
              title="Download official Arrears & Defaulters notice as PDF"
            >
              <Download className="w-4 h-4" />
              <span>Export Arrears (PDF)</span>
            </button>
          )}

          <div className="text-right pl-4 border-l border-rose-200">
            <span className="text-xs text-rose-600 font-semibold uppercase tracking-wider block">Total Outstanding Default</span>
            <span className="font-mono text-2xl font-bold text-rose-800 tabular-nums">
              {formatKSh(totalOverdueCents)}
            </span>
          </div>
        </div>
      </div>

      {/* Arrears Register Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-900">
            Overdue Accounts ({arrears.length})
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchArrears}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Tenant Name</th>
                <th className="py-3 px-4">Contact Phone</th>
                <th className="py-3 px-4">Property & Unit</th>
                <th className="py-3 px-4">Defaulted Month</th>
                <th className="py-3 px-4">Original Rent</th>
                <th className="py-3 px-4">Partial Paid</th>
                <th className="py-3 px-4">Arrears Balance</th>
                <th className="py-3 px-4">Due Date</th>
                <th className="py-3 px-4 text-right">Collect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {arrears.length > 0 ? (
                arrears.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">{c.tenant_name}</td>
                    <td className="py-3 px-4 font-mono text-slate-700">{c.tenant_phone}</td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-900">{c.property_name}</span>
                      <span className="block text-[11px] text-slate-500">Unit {c.unit_number}</span>
                    </td>
                    <td className="py-3 px-4 font-mono font-medium">{c.billing_month}</td>
                    <td className="py-3 px-4 font-mono text-slate-600 tabular-nums">
                      {formatKSh(c.rent_due_cents)}
                    </td>
                    <td className="py-3 px-4 font-mono text-emerald-700 tabular-nums">
                      {formatKSh(c.amount_paid_cents)}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-rose-700 tabular-nums text-sm">
                      {formatKSh(c.balance_cents)}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">{formatDate(c.due_date)}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => onOpenRecordPaymentWithTenancy(c.tenancy_id)}
                        className="px-3 py-1 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors"
                      >
                        Collect
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No overdue accounts! All active tenancies are in good standing.
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
