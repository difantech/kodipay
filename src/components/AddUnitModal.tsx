/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { apiRequest } from '../lib/api.ts';
import { X, DoorOpen, Check, AlertCircle } from 'lucide-react';

interface AddUnitModalProps {
  isOpen: boolean;
  propertyId: string;
  propertyName: string;
  onClose: () => void;
  onSuccess: (unit: any) => void;
}

export const AddUnitModal: React.FC<AddUnitModalProps> = ({
  isOpen,
  propertyId,
  propertyName,
  onClose,
  onSuccess
}) => {
  const [unitNumber, setUnitNumber] = useState('');
  const [floor, setFloor] = useState('1st Floor');
  const [unitType, setUnitType] = useState('2 Bedroom Master En-suite');
  const [monthlyRentKSh, setMonthlyRentKSh] = useState('35000');
  const [defaultDueDay, setDefaultDueDay] = useState(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const rent = parseFloat(monthlyRentKSh);
    if (!unitNumber.trim()) {
      setError('Please provide a unit number');
      return;
    }
    if (isNaN(rent) || rent <= 0) {
      setError('Please enter a valid monthly rent amount');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest(`/api/properties/${propertyId}/units`, {
        method: 'POST',
        body: JSON.stringify({
          unitNumber: unitNumber.trim(),
          floor: floor.trim() || undefined,
          unitType: unitType.trim(),
          monthlyRentKSh: rent,
          defaultDueDay: Number(defaultDueDay)
        })
      });

      onSuccess(res);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add rental unit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            <DoorOpen className="w-5 h-5 text-blue-400" />
            <div>
              <h2 className="text-base font-bold">Add Rental Unit</h2>
              <p className="text-xs text-slate-400">{propertyName}</p>
            </div>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Unit Number *
              </label>
              <input
                type="text"
                placeholder="e.g. Unit 3A"
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Floor / Wing
              </label>
              <input
                type="text"
                placeholder="e.g. 2nd Floor"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Unit Type / Layout *
            </label>
            <input
              type="text"
              list="unit-types"
              value={unitType}
              onChange={(e) => setUnitType(e.target.value)}
              className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
              required
            />
            <datalist id="unit-types">
              <option value="1 Bedroom Standard" />
              <option value="2 Bedroom Master En-suite" />
              <option value="3 Bedroom Master En-suite + DSQ" />
              <option value="Studio / Bedsitter" />
              <option value="Commercial Shop / Office" />
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Monthly Rent (KSh) *
              </label>
              <input
                type="number"
                step="any"
                min="1"
                value={monthlyRentKSh}
                onChange={(e) => setMonthlyRentKSh(e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Rent Due Day (1-28) *
              </label>
              <input
                type="number"
                min="1"
                max="28"
                value={defaultDueDay}
                onChange={(e) => setDefaultDueDay(Number(e.target.value))}
                className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                required
              />
            </div>
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
              <Check className="w-4 h-4" />
              {submitting ? 'Adding...' : 'Add Unit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
