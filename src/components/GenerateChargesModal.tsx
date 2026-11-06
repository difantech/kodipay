/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { apiRequest } from '../lib/api.ts';
import { X, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';

interface GenerateChargesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: any) => void;
  properties: Array<{ id: string; name: string }>;
}

export const GenerateChargesModal: React.FC<GenerateChargesModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  properties
}) => {
  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const [billingMonth, setBillingMonth] = useState(currentMonthStr);
  const [propertyId, setPropertyId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await apiRequest('/api/billing/generate-charges', {
        method: 'POST',
        body: JSON.stringify({
          billingMonth,
          propertyId: propertyId || undefined
        })
      });

      onSuccess(res);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to generate monthly charges');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold">Generate Monthly Rent Billing</h2>
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

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 leading-relaxed">
            <span className="font-semibold block mb-0.5">Automated Idempotent Billing Engine:</span>
            Creates monthly rent charges for all active tenancies. The database constraint guarantees that existing charges for the same billing month are never duplicated.
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Billing Month *
            </label>
            <input
              type="month"
              value={billingMonth}
              onChange={(e) => setBillingMonth(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Target Property (Optional)
            </label>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              <option value="">All Managed Properties</option>
              {properties.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

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
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? 'Generating...' : 'Run Billing Batch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
