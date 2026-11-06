/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { apiRequest, formatKSh } from '../lib/api.ts';
import { X, AlertTriangle, RotateCcw } from 'lucide-react';

interface ReversePaymentModalProps {
  isOpen: boolean;
  payment: any;
  onClose: () => void;
  onSuccess: () => void;
}

export const ReversePaymentModal: React.FC<ReversePaymentModalProps> = ({
  isOpen,
  payment,
  onClose,
  onSuccess
}) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !payment) return null;

  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      setError('Please provide a descriptive reason for reversing this payment (at least 5 characters).');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await apiRequest(`/api/payments/${payment.id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reversalReason: reason.trim() })
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to reverse payment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-rose-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-rose-900 text-white">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-300" />
            <h2 className="text-base font-bold">Reverse Rent Payment</h2>
          </div>
          <button onClick={onClose} className="p-1 text-rose-300 hover:text-white rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleReverse} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
              {error}
            </div>
          )}

          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 space-y-1">
            <p className="font-bold">Permanent Audit Trail Notice:</p>
            <p>
              In accordance with Kenyan accounting standards, this financial record will NOT be deleted. 
              The payment status will be updated to <span className="font-bold uppercase">REVERSED</span>, all rent charge allocations will be rolled back, and the tenant arrears balance will be automatically restored.
            </p>
          </div>

          <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Payment Reference:</span>
              <span className="font-mono font-bold text-slate-900">{payment.payment_reference}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Amount:</span>
              <span className="font-mono font-bold text-slate-900">{formatKSh(payment.amount_cents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tenant:</span>
              <span className="font-semibold text-slate-900">{payment.tenant_name}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Mandatory Reversal Justification *
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Bank chargeback / Wrong M-Pesa reference entered / Duplicate cashier entry"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-2.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-rose-600"
              required
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold bg-rose-700 hover:bg-rose-600 text-white rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              {submitting ? 'Reversing...' : 'Confirm Reversal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
