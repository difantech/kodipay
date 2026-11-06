/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatKSh, formatDate } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { RefundRequest } from '../types/index.ts';
import {
  RotateCcw,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  RefreshCw,
  Plus,
  ArrowUpRight,
  Search,
  Filter,
  Check,
  X,
  CreditCard,
  DollarSign
} from 'lucide-react';
import { RequestRefundModal } from '../components/RequestRefundModal.tsx';

export const RefundsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';

  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'completed' | 'rejected'>('all');
  const [search, setSearch] = useState('');

  // Modals & Action States
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [disbursingRefund, setDisbursingRefund] = useState<RefundRequest | null>(null);
  const [paymentRefInput, setPaymentRefInput] = useState('');
  const [rejectingRefund, setRejectingRefund] = useState<RefundRequest | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('Insufficient documentation or credit disputed');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetchRefunds();

    const handleRefresh = () => fetchRefunds();
    window.addEventListener('kodipay:refresh-data', handleRefresh);
    return () => window.removeEventListener('kodipay:refresh-data', handleRefresh);
  }, [statusFilter]);

  const fetchRefunds = async () => {
    setLoading(true);
    try {
      let url = '/api/refunds';
      if (statusFilter !== 'all') {
        url += `?status=${statusFilter}`;
      }
      const res = await apiRequest<RefundRequest[]>(url);
      setRefunds(res);
    } catch (err: any) {
      console.error('Failed to load refunds:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await apiRequest(`/api/refunds/${id}/approve`, { method: 'POST' });
      fetchRefunds();
      window.dispatchEvent(new CustomEvent('kodipay:refresh-data'));
    } catch (err: any) {
      alert(err.message || 'Failed to approve refund');
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingRefund) return;
    setProcessing(true);
    try {
      await apiRequest(`/api/refunds/${rejectingRefund.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejectionReason: rejectionReasonInput.trim() })
      });
      setRejectingRefund(null);
      fetchRefunds();
      window.dispatchEvent(new CustomEvent('kodipay:refresh-data'));
    } catch (err: any) {
      alert(err.message || 'Failed to reject refund');
    } finally {
      setProcessing(false);
    }
  };

  const handleCompleteDisbursal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disbursingRefund) return;
    setProcessing(true);
    try {
      const res = await apiRequest(`/api/refunds/${disbursingRefund.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ paymentReference: paymentRefInput.trim() })
      });
      alert(res.message || 'Refund successfully disbursed and deducted from tenant credit balance.');
      setDisbursingRefund(null);
      setPaymentRefInput('');
      fetchRefunds();
      window.dispatchEvent(new CustomEvent('kodipay:refresh-data'));
    } catch (err: any) {
      alert(err.message || 'Failed to complete disbursal');
    } finally {
      setProcessing(false);
    }
  };

  const filteredRefunds = refunds.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.tenant_name?.toLowerCase().includes(q) ||
      r.tenant_phone?.toLowerCase().includes(q) ||
      r.unit_number?.toLowerCase().includes(q) ||
      r.reason?.toLowerCase().includes(q) ||
      r.payment_reference?.toLowerCase().includes(q)
    );
  });

  // Calculate totals
  const totalPendingCents = refunds
    .filter((r) => r.status === 'pending')
    .reduce((acc, r) => acc + parseInt(r.amount_cents as any, 10), 0);
  const totalCompletedCents = refunds
    .filter((r) => r.status === 'completed')
    .reduce((acc, r) => acc + parseInt(r.amount_cents as any, 10), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Action */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-emerald-600" />
            <h2 className="font-bold text-base text-slate-900">Tenant Refund Requests & Credit Disbursals</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage excess rent credit claims, review refund requests, and process M-Pesa/Bank payouts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchRefunds}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh list"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setRequestModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Request Refund</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Pending Requests</span>
          <p className="font-mono text-xl font-bold text-amber-600 mt-1">{formatKSh(totalPendingCents)}</p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            {refunds.filter((r) => r.status === 'pending').length} request(s) awaiting review
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Disbursed Refunds</span>
          <p className="font-mono text-xl font-bold text-emerald-700 mt-1">{formatKSh(totalCompletedCents)}</p>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            {refunds.filter((r) => r.status === 'completed').length} completed payout(s)
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Credit Balance Protection</span>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            Credits only deduct when refunds are marked <strong>Completed</strong> with verified payment references.
          </p>
        </div>
      </div>

      {/* Filter Tabs and Search */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(['all', 'pending', 'approved', 'completed', 'rejected'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors ${
                statusFilter === tab
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab === 'all' ? 'All Requests' : tab}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search tenant, unit, or ref..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
      </div>

      {/* Refunds Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Tenant & Unit</th>
                <th className="py-3 px-4">Amount Requested</th>
                <th className="py-3 px-4">Disbursal Channel</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Date Requested</th>
                {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRefunds.length > 0 ? (
                filteredRefunds.map((r) => {
                  const statusColors: Record<string, string> = {
                    pending: 'bg-amber-50 text-amber-800 border-amber-300',
                    approved: 'bg-blue-50 text-blue-800 border-blue-300',
                    completed: 'bg-emerald-50 text-emerald-800 border-emerald-300',
                    rejected: 'bg-rose-50 text-rose-800 border-rose-300'
                  };

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 block">{r.tenant_name}</span>
                        <span className="text-[11px] text-slate-500">
                          Unit {r.unit_number || '—'} · {r.tenant_phone}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {formatKSh(r.amount_cents)}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="capitalize font-medium text-slate-700 block">
                          {r.payment_method === 'mpesa' ? 'M-Pesa Mobile' : r.payment_method.replace('_', ' ')}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">{r.recipient_details}</span>
                        {r.payment_reference && (
                          <span className="font-mono text-[10px] text-emerald-700 font-bold block">
                            Ref: {r.payment_reference}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <span className="text-slate-700 line-clamp-2">{r.reason}</span>
                        {r.rejection_reason && (
                          <span className="text-rose-600 text-[10px] block mt-0.5">
                            Rejection: {r.rejection_reason}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border inline-block ${
                            statusColors[r.status] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">{formatDate(r.created_at)}</td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-right space-x-1.5">
                          {r.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(r.id)}
                                className="px-2.5 py-1 text-xs font-semibold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-md transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => setRejectingRefund(r)}
                                className="px-2.5 py-1 text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-md transition-colors"
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {r.status === 'approved' && (
                            <button
                              onClick={() => {
                                setDisbursingRefund(r);
                                setPaymentRefInput(`RFD${Date.now().toString().slice(-6)}`);
                              }}
                              className="px-2.5 py-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors shadow-xs"
                            >
                              Process Payout
                            </button>
                          )}
                          {(r.status === 'completed' || r.status === 'rejected') && (
                            <span className="text-slate-400 text-[11px] font-medium">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-xs text-slate-400">
                    No refund requests found in current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disbursal Modal */}
      {disbursingRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-[#0B1528] px-6 py-4 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Confirm Refund Disbursal</h3>
              <button onClick={() => setDisbursingRefund(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCompleteDisbursal} className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Disbursing <span className="font-bold font-mono text-emerald-700">{formatKSh(disbursingRefund.amount_cents)}</span> to{' '}
                <span className="font-bold text-slate-900">{disbursingRefund.tenant_name}</span> ({disbursingRefund.recipient_details}).
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Transaction / M-Pesa Reference Code *
                </label>
                <input
                  type="text"
                  placeholder="e.g. QK98765432"
                  value={paymentRefInput}
                  onChange={(e) => setPaymentRefInput(e.target.value)}
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Completing will automatically deduct <span className="font-mono font-semibold">{formatKSh(disbursingRefund.amount_cents)}</span> from the tenant's credit balance.
              </p>
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDisbursingRefund(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="px-4 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {processing ? 'Processing...' : 'Confirm Disbursal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectingRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-[#0B1528] px-6 py-4 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Reject Refund Request</h3>
              <button onClick={() => setRejectingRefund(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleReject} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Rejection *</label>
                <textarea
                  rows={3}
                  value={rejectionReasonInput}
                  onChange={(e) => setRejectionReasonInput(e.target.value)}
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-rose-600"
                  required
                />
              </div>
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRejectingRefund(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={processing}
                  className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {processing ? 'Rejecting...' : 'Reject Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request Refund Modal */}
      <RequestRefundModal
        isOpen={requestModalOpen}
        creditBalanceCents={0}
        onClose={() => setRequestModalOpen(false)}
        onSuccess={() => fetchRefunds()}
      />
    </div>
  );
};
