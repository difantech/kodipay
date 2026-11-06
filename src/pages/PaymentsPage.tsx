/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatKSh, formatDate } from '../lib/api.ts';
import { Payment } from '../types/index.ts';
import { CreditCard, Search, Plus, FileCheck, RotateCcw, CheckCircle2, AlertTriangle, RefreshCw, Download } from 'lucide-react';
import { ReversePaymentModal } from '../components/ReversePaymentModal.tsx';
import { exportPaymentsStatementPDF } from '../utils/pdfExport.ts';
import { useAuth } from '../context/AuthContext.tsx';

interface PaymentsPageProps {
  onOpenRecordPayment: () => void;
  onViewReceipt: (receiptId: string) => void;
}

export const PaymentsPage: React.FC<PaymentsPageProps> = ({
  onOpenRecordPayment,
  onViewReceipt
}) => {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [reversalTarget, setReversalTarget] = useState<Payment | null>(null);

  useEffect(() => {
    fetchPayments();

    // Auto-update payments table automatically when payments are recorded or confirmed
    const handleAutoUpdate = () => {
      fetchPayments();
    };

    window.addEventListener('kodipay:payment-recorded', handleAutoUpdate);
    window.addEventListener('kodipay:refresh-data', handleAutoUpdate);
    return () => {
      window.removeEventListener('kodipay:payment-recorded', handleAutoUpdate);
      window.removeEventListener('kodipay:refresh-data', handleAutoUpdate);
    };
  }, [statusFilter]);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      let url = '/api/payments';
      if (statusFilter) url += `?status=${statusFilter}`;
      const res = await apiRequest<Payment[]>(url);
      setPayments(res);
    } catch (err) {
      console.error('Failed to load payments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPending = async (paymentId: string) => {
    if (!confirm('Are you sure you want to verify and confirm this payment? It will allocate funds, notify owner & tenant, and generate an official receipt.')) {
      return;
    }
    try {
      const res = await apiRequest<any>(`/api/payments/${paymentId}/confirm`, { method: 'POST' });
      alert(res.message || 'Payment confirmed and allocated successfully! Messages sent to owner and tenant.');
      
      // Auto-update system across all open views
      window.dispatchEvent(new CustomEvent('kodipay:payment-recorded', { detail: res }));
      window.dispatchEvent(new CustomEvent('kodipay:refresh-data'));

      fetchPayments();
      if (res.receipt?.id) {
        onViewReceipt(res.receipt.id);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to confirm payment');
    }
  };

  const handleExportPDF = () => {
    if (payments.length === 0) {
      alert('No payment records to export');
      return;
    }
    const filterLabel = statusFilter ? statusFilter.replace('_', ' ').toUpperCase() : 'All Statuses';
    exportPaymentsStatementPDF(payments, filterLabel);
  };

  return (
    <div className="space-y-6">
      {/* Header and Filter Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="">All Payment Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending_verification">Pending Verification</option>
            <option value="reversed">Reversed</option>
          </select>

          <button
            onClick={fetchPayments}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {payments.length > 0 && (
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors shadow-xs"
              title="Export filtered payments ledger as PDF"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Export PDF Statement</span>
            </button>
          )}

          <button
            onClick={onOpenRecordPayment}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-xs"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </button>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Ref Number</th>
                <th className="py-3 px-4">Tenant & Unit</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Method & Tx Code</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Recorded By</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.length > 0 ? (
                payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {p.payment_reference}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-900 block">{p.tenant_name}</span>
                      <span className="text-[11px] text-slate-500">
                        {p.property_name} (Unit {p.unit_number})
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 tabular-nums text-sm">
                      {formatKSh(p.amount_cents)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="capitalize font-medium text-slate-800">
                        {p.payment_method === 'mpesa' ? 'M-Pesa Mobile' : p.payment_method.replace('_', ' ')}
                      </span>
                      {p.transaction_reference && (
                        <span className="block font-mono text-[11px] text-slate-600">
                          {p.transaction_reference}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono">{formatDate(p.payment_date)}</td>
                    <td className="py-3 px-4">
                      {p.status === 'pending_verification' && p.payment_method === 'mpesa' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 border border-amber-300 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping inline-block" />
                          <span>Pending M-Pesa Verification</span>
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            p.status === 'confirmed'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : p.status === 'pending_verification'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-rose-50 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {p.status === 'confirmed' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />}
                          {p.status.replace('_', ' ')}
                        </span>
                      )}
                      {p.reversal_reason && (
                        <span className="block text-[10px] text-rose-500 truncate max-w-[140px] mt-0.5" title={p.reversal_reason}>
                          {p.reversal_reason}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-[11px]">
                      {p.recorded_by_name || 'System Admin'}
                    </td>
                    <td className="py-3 px-4 text-right space-x-2">
                      {p.status === 'confirmed' && p.receipt_id && (
                        <button
                          onClick={() => onViewReceipt(p.receipt_id!)}
                          className="px-2.5 py-1 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 transition-colors"
                        >
                          Receipt
                        </button>
                      )}

                      {p.status === 'pending_verification' && (
                        <button
                          onClick={() => handleConfirmPending(p.id)}
                          className="px-2.5 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded transition-colors"
                        >
                          Verify & Confirm
                        </button>
                      )}

                      {p.status === 'confirmed' && user?.role === 'super_admin' && (
                        <button
                          onClick={() => setReversalTarget(p)}
                          className="px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded transition-colors"
                          title="Reverse payment record (Super Admin only)"
                        >
                          Reverse
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No payment records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reversal Modal */}
      {reversalTarget && (
        <ReversePaymentModal
          isOpen={true}
          payment={reversalTarget}
          onClose={() => setReversalTarget(null)}
          onSuccess={() => {
            fetchPayments();
            alert('Payment reversed successfully and balance restored.');
          }}
        />
      )}
    </div>
  );
};
