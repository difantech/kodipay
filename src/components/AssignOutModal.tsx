/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatKSh } from '../lib/api.ts';
import { X, LogOut, CheckCircle2, AlertCircle, Calendar, DollarSign, FileText, ArrowRight, ShieldCheck } from 'lucide-react';

interface AssignOutModalProps {
  tenantId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const AssignOutModal: React.FC<AssignOutModalProps> = ({
  tenantId,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<any | null>(null);
  const [moveOutDate, setMoveOutDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('End of Tenancy Lease Agreement');
  const [deductionsKSh, setDeductionsKSh] = useState<number>(0);
  const [creditAction, setCreditAction] = useState<'refunded' | 'retained' | 'settled'>('refunded');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settlementResult, setSettlementResult] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen && tenantId) {
      fetchSettlementPreview();
      setSettlementResult(null);
      setError(null);
    }
  }, [isOpen, tenantId]);

  const fetchSettlementPreview = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await apiRequest(`/api/tenants/${tenantId}/settlement-preview`);
      setPreview(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load settlement preview');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !tenantId) return null;

  // Real-time calculation of net settlement
  const depositHeldCents = preview?.depositHeldCents || 0;
  const excessCreditCents = preview?.excessCreditCents || 0;
  const unpaidRentCents = preview?.unpaidRentCents || 0;
  const deductionsCents = Math.round((Number(deductionsKSh) || 0) * 100);

  const netSettlementCents = (depositHeldCents + excessCreditCents) - (unpaidRentCents + deductionsCents);
  const isRefundToTenant = netSettlementCents > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await apiRequest(`/api/tenants/${tenantId}/assign-out`, {
        method: 'POST',
        body: JSON.stringify({
          moveOutDate,
          reason: reason.trim(),
          deductionsKSh: Number(deductionsKSh) || 0,
          creditAction,
          notes: notes.trim()
        })
      });

      setSettlementResult(res.settlement);
      window.dispatchEvent(new CustomEvent('kodipay:refresh-data'));
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to complete assign-out move-out settlement');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="bg-[#0B1528] px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-300">
              <LogOut className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h2 className="font-bold text-base leading-tight">Assign Out / Vacate Tenant</h2>
              <p className="text-xs text-slate-400">Final tenant settlement statement & unit vacancy</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Calculating final settlement statement...
            </div>
          ) : settlementResult ? (
            /* Settlement Completed View */
            <div className="space-y-5 text-center py-4">
              <div className="w-14 h-14 bg-emerald-100 border border-emerald-300 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Tenant Successfully Vacated</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Unit <span className="font-bold text-slate-800">{preview?.unitNumber}</span> is now marked vacant and ready for new tenancy assignment.
                </p>
              </div>

              {/* Settlement Summary Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left text-xs space-y-2">
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-600">Tenant:</span>
                  <span className="font-bold text-slate-900">{preview?.tenantName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-600">Move-Out Date:</span>
                  <span className="font-mono text-slate-900">{moveOutDate}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-600">Deposit Held:</span>
                  <span className="font-mono font-medium text-slate-900">{formatKSh(depositHeldCents)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-600">Excess Credit Balance:</span>
                  <span className="font-mono font-medium text-emerald-700">{formatKSh(excessCreditCents)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-600">Unpaid Rent Outstanding:</span>
                  <span className="font-mono font-medium text-rose-700">{formatKSh(unpaidRentCents)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-600">Deductions (Repairs / Utility):</span>
                  <span className="font-mono font-medium text-slate-900">{formatKSh(deductionsCents)}</span>
                </div>
                <div className="flex justify-between pt-2 text-sm font-bold">
                  <span className={isRefundToTenant ? 'text-emerald-700' : 'text-rose-700'}>
                    {isRefundToTenant ? 'Net Refund Due to Tenant:' : 'Net Balance Owed by Tenant:'}
                  </span>
                  <span className={`font-mono ${isRefundToTenant ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatKSh(Math.abs(netSettlementCents))}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full h-10 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-xs transition-colors"
              >
                Close Statement
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Tenant & Tenancy Summary Banner */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-900 text-sm block">{preview?.tenantName}</span>
                  <span className="text-slate-500">
                    Unit {preview?.unitNumber} · {preview?.propertyName}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Monthly Rent</span>
                  <span className="font-mono font-bold text-slate-900">{formatKSh(preview?.monthlyRentCents || 0)}</span>
                </div>
              </div>

              {/* Live Settlement Breakdown */}
              <div className="bg-blue-50/60 border border-blue-200/80 rounded-xl p-4 text-xs space-y-2">
                <span className="font-bold text-blue-900 uppercase tracking-wider block mb-1 text-[11px]">
                  Financial Statement Preview
                </span>
                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <div>
                    <span className="text-slate-500 block">Security Deposit Held:</span>
                    <span className="font-mono font-bold text-slate-900">{formatKSh(depositHeldCents)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Excess Credit Balance:</span>
                    <span className="font-mono font-bold text-emerald-700">{formatKSh(excessCreditCents)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Unpaid Rent Outstanding:</span>
                    <span className={`font-mono font-bold ${unpaidRentCents > 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                      {formatKSh(unpaidRentCents)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Damage / Utility Deductions:</span>
                    <span className="font-mono font-bold text-slate-900">{formatKSh(deductionsCents)}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-blue-200 flex items-center justify-between text-sm">
                  <span className="font-bold text-blue-950">
                    {isRefundToTenant ? 'Net Amount to Refund Tenant:' : 'Net Arrears Owed by Tenant:'}
                  </span>
                  <span className={`font-mono font-black text-base ${isRefundToTenant ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatKSh(Math.abs(netSettlementCents))}
                  </span>
                </div>
              </div>

              {/* Move Out Date & Reason */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Move-Out Date *
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="date"
                      value={moveOutDate}
                      onChange={(e) => setMoveOutDate(e.target.value)}
                      className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Agreed Deductions (KSh)
                  </label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={deductionsKSh}
                      onChange={(e) => setDeductionsKSh(Number(e.target.value))}
                      placeholder="0"
                      className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Vacating *
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Relocating, End of contract, Purchased property"
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              {excessCreditCents > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Handling of Excess Credit ({formatKSh(excessCreditCents)}) *
                  </label>
                  <select
                    value={creditAction}
                    onChange={(e) => setCreditAction(e.target.value as any)}
                    className="w-full h-10 px-3 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="refunded">Refund remaining credit to tenant via M-Pesa / Bank</option>
                    <option value="retained">Retain credit for agreed outstanding tenant obligation</option>
                    <option value="settled">Settled in cash upon key handover</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Settlement Notes / Handover Remarks
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="e.g. Keys handed over, meter readings inspected, all clean."
                  className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg transition-colors shadow-xs disabled:opacity-50"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Finalizing...' : 'Finalize Vacate & Make Unit Vacant'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
