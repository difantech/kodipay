/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { apiRequest, formatKSh } from '../lib/api.ts';
import { X, RotateCcw, AlertCircle, DollarSign, Smartphone, CreditCard, CheckCircle2 } from 'lucide-react';

interface RequestRefundModalProps {
  tenantId?: string;
  tenantName?: string;
  creditBalanceCents: number;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const RequestRefundModal: React.FC<RequestRefundModalProps> = ({
  tenantId,
  tenantName,
  creditBalanceCents,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [tenantsList, setTenantsList] = useState<any[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>(tenantId || '');
  const [currentTenantName, setCurrentTenantName] = useState<string>(tenantName || '');
  const [currentCreditCents, setCurrentCreditCents] = useState<number>(creditBalanceCents || 0);

  const maxRefundKSh = Math.max(0, currentCreditCents / 100);
  const [amountKSh, setAmountKSh] = useState<number>(maxRefundKSh);
  const [reason, setReason] = useState('Excess rent overpayment refund');
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'bank_transfer' | 'cash' | 'cheque'>('mpesa');
  const [recipientDetails, setRecipientDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      if (tenantId) {
        setSelectedTenantId(tenantId);
        setCurrentTenantName(tenantName || '');
        setCurrentCreditCents(creditBalanceCents || 0);
        setAmountKSh(Math.max(0, (creditBalanceCents || 0) / 100));
      } else {
        // Fetch tenants list
        apiRequest<any[]>('/api/tenants').then((tenants) => {
          setTenantsList(tenants || []);
          // Prefer tenant with credit balance
          const withCredit = tenants.find((t) => (t.credit_balance_cents || 0) > 0);
          const first = withCredit || tenants[0];
          if (first) {
            setSelectedTenantId(first.id);
            setCurrentTenantName(first.full_name);
            const cred = first.credit_balance_cents || 0;
            setCurrentCreditCents(cred);
            setAmountKSh(Math.max(0, cred / 100));
            setRecipientDetails(first.phone_number || '');
          }
        }).catch(() => {});
      }
    }
  }, [isOpen, tenantId, tenantName, creditBalanceCents]);

  const handleSelectTenant = (id: string) => {
    setSelectedTenantId(id);
    const found = tenantsList.find((t) => t.id === id);
    if (found) {
      setCurrentTenantName(found.full_name);
      const cred = found.credit_balance_cents || 0;
      setCurrentCreditCents(cred);
      setAmountKSh(Math.max(0, cred / 100));
      setRecipientDetails(found.phone_number || '');
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const targetId = selectedTenantId || tenantId;
    if (!targetId) {
      setError('Please select a tenant for this refund request.');
      return;
    }

    if (amountKSh <= 0) {
      setError('Refund amount must be greater than zero.');
      return;
    }

    if (amountKSh > maxRefundKSh) {
      setError(`Requested amount (KSh ${amountKSh.toLocaleString()}) exceeds available credit balance of KSh ${maxRefundKSh.toLocaleString()}`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest('/api/refunds', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: targetId,
          amountKSh: Number(amountKSh),
          reason: reason.trim(),
          paymentMethod,
          recipientDetails: recipientDetails.trim()
        })
      });

      setSuccessMsg(res.message || 'Refund request successfully submitted for review.');
      window.dispatchEvent(new CustomEvent('kodipay:refresh-data'));
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      setError(err.message || 'Failed to submit refund request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-[#0B1528] px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
              <RotateCcw className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="font-bold text-base leading-tight">Request Tenant Refund</h2>
              <p className="text-xs text-slate-400">Withdraw available excess rent credit</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6">
          {successMsg ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-900">{successMsg}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Tenant Selection if not pre-set */}
              {!tenantId && tenantsList.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Tenant *
                  </label>
                  <select
                    value={selectedTenantId}
                    onChange={(e) => handleSelectTenant(e.target.value)}
                    className="w-full h-10 px-3 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {tenantsList.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.full_name} {t.unit_number ? `(Unit ${t.unit_number})` : ''} - Credit: {formatKSh(t.credit_balance_cents || 0)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Available Credit Banner */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between text-xs">
                <div>
                  <span className="text-emerald-800 block font-medium">Available Credit Balance:</span>
                  <span className="text-[11px] text-slate-500">{currentTenantName || 'Tenant Account'}</span>
                </div>
                <span className="font-mono font-bold text-base text-emerald-700 tabular-nums">
                  {formatKSh(currentCreditCents)}
                </span>
              </div>

              {currentCreditCents <= 0 ? (
                <div className="py-4 text-center text-xs text-slate-500">
                  No excess credit available for this tenant. Credit is automatically generated when payments exceed rent charges.
                </div>
              ) : (
                <>
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-slate-700">Refund Amount (KSh) *</label>
                      <button
                        type="button"
                        onClick={() => setAmountKSh(maxRefundKSh)}
                        className="text-[11px] font-semibold text-blue-600 hover:underline"
                      >
                        Refund Full Amount ({formatKSh(creditBalanceCents)})
                      </button>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400 font-mono">KSh</span>
                      <input
                        type="number"
                        min="1"
                        max={maxRefundKSh}
                        step="100"
                        value={amountKSh}
                        onChange={(e) => setAmountKSh(Number(e.target.value))}
                        className="w-full h-10 pl-11 pr-3 border border-slate-300 rounded-lg text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method *</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as any)}
                        className="w-full h-10 px-3 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      >
                        <option value="mpesa">M-Pesa Mobile</option>
                        <option value="bank_transfer">Bank Transfer</option>
                        <option value="cash">Cash Handover</option>
                        <option value="cheque">Bank Cheque</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {paymentMethod === 'mpesa' ? 'M-Pesa Phone *' : 'Account Details *'}
                      </label>
                      <input
                        type="text"
                        placeholder={paymentMethod === 'mpesa' ? '+2547XXXXXXXX' : 'Bank, Branch, Account No'}
                        value={recipientDetails}
                        onChange={(e) => setRecipientDetails(e.target.value)}
                        className="w-full h-10 px-3 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Reason for Refund *</label>
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Overpaid rent for October, moving out adjustment"
                      className="w-full h-10 px-3 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                      required
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
                      className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors shadow-xs disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{submitting ? 'Submitting...' : 'Submit Refund Request'}</span>
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
