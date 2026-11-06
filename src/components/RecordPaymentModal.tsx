/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatKSh } from '../lib/api.ts';
import {
  X,
  Check,
  AlertCircle,
  Smartphone,
  Building2,
  Banknote,
  CreditCard,
  Clock,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (receipt: any, fullResponse?: any) => void;
  preselectedTenancyId?: string;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedTenancyId
}) => {
  const [tenancies, setTenancies] = useState<any[]>([]);
  const [loadingTenancies, setLoadingTenancies] = useState(false);
  const [selectedTenancyId, setSelectedTenancyId] = useState(preselectedTenancyId || '');
  const [amountKSh, setAmountKSh] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'bank_transfer' | 'cash' | 'cheque'>('mpesa');
  const [transactionReference, setTransactionReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<'confirmed' | 'pending_verification'>('confirmed');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // M-Pesa Daraja 2.0 Mock Integration States
  const [darajaVerifying, setDarajaVerifying] = useState(false);
  const [darajaVerification, setDarajaVerification] = useState<any | null>(null);
  const [stkPushing, setStkPushing] = useState(false);
  const [stkPushMessage, setStkPushMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchTenancies();
      if (preselectedTenancyId) {
        setSelectedTenancyId(preselectedTenancyId);
      }
      setDarajaVerification(null);
      setStkPushMessage(null);
    }
  }, [isOpen, preselectedTenancyId]);

  const fetchTenancies = async () => {
    setLoadingTenancies(true);
    try {
      // Fetch tenants who have active tenancies
      const res = await apiRequest<any[]>('/api/tenants');
      const active = res.filter(t => t.tenancy_id && t.is_tenancy_active);
      setTenancies(active);
      if (!selectedTenancyId && active.length > 0) {
        setSelectedTenancyId(active[0].tenancy_id);
        setAmountKSh((active[0].rent_amount_cents / 100).toString());
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load tenancies');
    } finally {
      setLoadingTenancies(false);
    }
  };

  const handleTenancyChange = (tId: string) => {
    setSelectedTenancyId(tId);
    const found = tenancies.find(t => t.tenancy_id === tId);
    if (found) {
      setAmountKSh((found.rent_amount_cents / 100).toString());
    }
    setDarajaVerification(null);
    setStkPushMessage(null);
  };

  // M-Pesa Daraja: Simulate STK Push Prompt to Tenant's Phone
  const handleSimulateSTKPush = async () => {
    setError(null);
    const currentTenant = tenancies.find(t => t.tenancy_id === selectedTenancyId);
    const phone = currentTenant?.phone_number || '254712345678';
    const amount = parseFloat(amountKSh);

    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount before initiating STK Push');
      return;
    }

    setStkPushing(true);
    setStkPushMessage(null);
    try {
      const res = await apiRequest<any>('/api/payments/daraja/stk-push', {
        method: 'POST',
        body: JSON.stringify({
          phoneNumber: phone,
          amountKSh: amount,
          accountReference: currentTenant?.unit_number ? `KODI-${currentTenant.unit_number}` : 'KODIPAY-RENT',
          transactionDesc: `Rent payment for ${currentTenant?.full_name || 'Tenant'}`
        })
      });

      // Extract generated ref from message if present or random
      const match = res.CustomerMessage.match(/Expected Ref:\s*([A-Z0-9]{10})/i);
      if (match && match[1]) {
        setTransactionReference(match[1].toUpperCase());
      }

      setStkPushMessage(res.CustomerMessage);
      // When STK push is initiated, set status to pending M-Pesa verification
      setStatus('pending_verification');
    } catch (err: any) {
      setError(err.message || 'Failed to initiate Daraja STK Push');
    } finally {
      setStkPushing(false);
    }
  };

  // M-Pesa Daraja: Verify Transaction Reference with Safaricom Daraja ledger
  const handleVerifyWithDaraja = async () => {
    if (!transactionReference.trim()) {
      setError('Please enter an M-Pesa transaction code to verify');
      return;
    }

    setError(null);
    setDarajaVerifying(true);
    try {
      const currentTenant = tenancies.find(t => t.tenancy_id === selectedTenancyId);
      const amount = parseFloat(amountKSh) || undefined;
      const res = await apiRequest<any>('/api/payments/daraja/verify', {
        method: 'POST',
        body: JSON.stringify({
          transactionCode: transactionReference.trim().toUpperCase(),
          expectedAmountKSh: amount,
          expectedPhone: currentTenant?.phone_number
        })
      });

      setDarajaVerification(res);
      if (res.verified) {
        setStatus('confirmed');
      } else {
        setStatus('pending_verification');
        setError(res.statusDescription || 'M-Pesa verification failed');
      }
    } catch (err: any) {
      setError(err.message || 'M-Pesa Daraja verification error');
    } finally {
      setDarajaVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amount = parseFloat(amountKSh);
    if (!selectedTenancyId) {
      setError('Please select a tenant/tenancy');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid payment amount greater than zero');
      return;
    }
    if (paymentMethod === 'mpesa' && !transactionReference.trim()) {
      setError('M-Pesa payments require a transaction confirmation code (e.g. QKJ47L90XP)');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<any>('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          tenancyId: selectedTenancyId,
          amountKSh: amount,
          paymentMethod,
          transactionReference: transactionReference.trim() || undefined,
          paymentDate,
          status,
          notes: notes.trim() || undefined
        })
      });

      // Broadcast global events so all pages (Dashboard, Payments, Rent Roll, Arrears) update automatically!
      window.dispatchEvent(new CustomEvent('kodipay:payment-recorded', { detail: res }));
      window.dispatchEvent(new CustomEvent('kodipay:refresh-data'));

      onSuccess(res.receipt, res);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const currentSelected = tenancies.find(t => t.tenancy_id === selectedTenancyId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div>
            <h2 className="text-base font-bold">Record Rent Payment</h2>
            <p className="text-xs text-slate-400">Record cash, bank or M-Pesa collection and generate official receipt</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Tenancy Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Select Tenant & Unit *
            </label>
            {loadingTenancies ? (
              <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
            ) : (
              <select
                value={selectedTenancyId}
                onChange={(e) => handleTenancyChange(e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                required
              >
                <option value="">Select an active tenancy...</option>
                {tenancies.map(t => (
                  <option key={t.tenancy_id} value={t.tenancy_id}>
                    {t.full_name} — {t.property_name} (Unit {t.unit_number}) · Rent: {formatKSh(t.rent_amount_cents)}
                  </option>
                ))}
              </select>
            )}
            {currentSelected && currentSelected.total_balance_cents > 0 && (
              <p className="text-xs text-rose-600 font-medium mt-1">
                Outstanding Balance: {formatKSh(currentSelected.total_balance_cents)}
              </p>
            )}
          </div>

          {/* Amount in KSh */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Amount Received (KSh) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-400">KSh</span>
              <input
                type="number"
                step="any"
                min="1"
                placeholder="e.g. 35000"
                value={amountKSh}
                onChange={(e) => setAmountKSh(e.target.value)}
                className="w-full h-10 pl-12 pr-4 border border-slate-300 rounded-lg text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                required
              />
            </div>
          </div>

          {/* Payment Method Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Payment Method *
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('mpesa')}
                className={`py-2 px-2 text-xs font-semibold rounded-lg border flex flex-col items-center gap-1 transition-colors ${
                  paymentMethod === 'mpesa'
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-1 ring-emerald-500'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <span>M-Pesa</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('bank_transfer')}
                className={`py-2 px-2 text-xs font-semibold rounded-lg border flex flex-col items-center gap-1 transition-colors ${
                  paymentMethod === 'bank_transfer'
                    ? 'bg-blue-50 border-blue-500 text-blue-900 ring-1 ring-blue-500'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Building2 className="w-4 h-4 text-blue-600" />
                <span>Bank</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`py-2 px-2 text-xs font-semibold rounded-lg border flex flex-col items-center gap-1 transition-colors ${
                  paymentMethod === 'cash'
                    ? 'bg-amber-50 border-amber-500 text-amber-900 ring-1 ring-amber-500'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Banknote className="w-4 h-4 text-amber-600" />
                <span>Cash</span>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('cheque')}
                className={`py-2 px-2 text-xs font-semibold rounded-lg border flex flex-col items-center gap-1 transition-colors ${
                  paymentMethod === 'cheque'
                    ? 'bg-purple-50 border-purple-500 text-purple-900 ring-1 ring-purple-500'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CreditCard className="w-4 h-4 text-purple-600" />
                <span>Cheque</span>
              </button>
            </div>
          </div>

          {/* Reference & Date Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                {paymentMethod === 'mpesa' ? 'M-Pesa Receipt Code *' : 'Transaction Ref'}
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder={paymentMethod === 'mpesa' ? 'e.g. QKJ47L90XP' : 'e.g. NCBA-FT-9812'}
                  value={transactionReference}
                  onChange={(e) => {
                    setTransactionReference(e.target.value.toUpperCase());
                    setDarajaVerification(null);
                  }}
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  required={paymentMethod === 'mpesa'}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Payment Date *
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                required
              />
            </div>
          </div>

          {/* M-Pesa Daraja 2.0 Integration Panel & Status Indicator */}
          {paymentMethod === 'mpesa' && (
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                    M
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                      <span>Safaricom M-Pesa Daraja 2.0 API</span>
                      <span className="text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.2 rounded font-semibold">
                        Paybill 400200
                      </span>
                    </h4>
                    <p className="text-[11px] text-emerald-800">
                      Simulate STK Push or verify live transaction code with Daraja ledger
                    </p>
                  </div>
                </div>

                {/* Status Indicator Badge */}
                <div>
                  {status === 'pending_verification' ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block" />
                      <span>Pending M-Pesa Verification</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>M-Pesa Confirmed</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Daraja Action Buttons */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSimulateSTKPush}
                  disabled={stkPushing || !amountKSh}
                  className="flex-1 py-1.5 px-3 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>{stkPushing ? 'Prompting Phone...' : 'Simulate STK Push'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleVerifyWithDaraja}
                  disabled={darajaVerifying || !transactionReference.trim()}
                  className="flex-1 py-1.5 px-3 text-xs font-bold bg-white hover:bg-emerald-100/60 border border-emerald-300 text-emerald-900 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-emerald-700 ${darajaVerifying ? 'animate-spin' : ''}`} />
                  <span>{darajaVerifying ? 'Verifying...' : 'Verify via Daraja'}</span>
                </button>
              </div>

              {/* STK Push Feedback Alert */}
              {stkPushMessage && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold block">STK Push Request Dispatched</span>
                    <span className="text-[11px] text-amber-800">{stkPushMessage}</span>
                  </div>
                </div>
              )}

              {/* Daraja Verification Feedback */}
              {darajaVerification && (
                <div className={`p-2.5 rounded-lg text-xs border ${
                  darajaVerification.verified
                    ? 'bg-emerald-100/70 border-emerald-300 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  <div className="flex items-center gap-1.5 font-bold">
                    {darajaVerification.verified ? (
                      <>
                        <ShieldCheck className="w-4 h-4 text-emerald-700" />
                        <span>M-Pesa Verified: Ref {darajaVerification.transactionCode}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-rose-600" />
                        <span>Verification Failed</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] mt-0.5 opacity-90">{darajaVerification.statusDescription}</p>
                  {darajaVerification.verified && (
                    <div className="mt-1.5 text-[11px] font-mono text-emerald-800 flex items-center gap-3">
                      <span>Payer: {darajaVerification.payerName}</span>
                      <span>Shortcode: {darajaVerification.businessShortCode}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Payment Status (Confirmed vs Pending M-Pesa Verification) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
              Payment Status & Verification *
            </label>
            <div className="space-y-2 text-xs">
              <label className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                status === 'confirmed'
                  ? 'bg-white border-blue-400 ring-1 ring-blue-400 shadow-2xs'
                  : 'border-slate-200 hover:bg-white/60'
              }`}>
                <input
                  type="radio"
                  name="status"
                  value="confirmed"
                  checked={status === 'confirmed'}
                  onChange={() => setStatus('confirmed')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="font-bold text-slate-900 block">
                    Confirmed & Verified
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Immediately allocates payment to outstanding rent charges and generates official receipt.
                  </span>
                </div>
              </label>

              <label className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${
                status === 'pending_verification'
                  ? 'bg-amber-50/70 border-amber-400 ring-1 ring-amber-400 shadow-2xs'
                  : 'border-slate-200 hover:bg-white/60'
              }`}>
                <input
                  type="radio"
                  name="status"
                  value="pending_verification"
                  checked={status === 'pending_verification'}
                  onChange={() => setStatus('pending_verification')}
                  className="mt-0.5 text-amber-600 focus:ring-amber-500"
                />
                <div>
                  <span className="font-bold text-amber-900 flex items-center gap-1.5">
                    <span>
                      {paymentMethod === 'mpesa'
                        ? 'Pending M-Pesa Verification'
                        : 'Pending Verification'}
                    </span>
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                  </span>
                  <span className="text-[11px] text-amber-800">
                    {paymentMethod === 'mpesa'
                      ? 'Payment recorded as pending verification. Verifiable via Daraja API or manual reconcile before allocation.'
                      : 'Records payment as pending. Allocations and receipt apply once payment clears.'}
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Internal Notes / Narrative
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Paid via Paybill 400200, tenant requested hardcopy receipt"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {submitting ? 'Recording...' : 'Record Payment & Issue Receipt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
