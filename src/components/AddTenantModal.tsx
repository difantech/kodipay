/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatKSh } from '../lib/api.ts';
import {
  X,
  UserPlus,
  AlertCircle,
  Check,
  BookmarkCheck,
  Building2,
  Calendar,
  KeyRound,
  ShieldCheck,
  Clock
} from 'lucide-react';

interface AddTenantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (tenant: any) => void;
  preselectedUnitId?: string;
  initialBookingMode?: boolean;
}

export const AddTenantModal: React.FC<AddTenantModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedUnitId,
  initialBookingMode = false
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+254');
  const [nationalId, setNationalId] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Mode: 'assign' = immediate move-in, 'book' = advance booking/reservation
  const [isBookingMode, setIsBookingMode] = useState(initialBookingMode);

  // Unit assignment
  const [vacantUnits, setVacantUnits] = useState<any[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState(preselectedUnitId || '');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [monthlyRentKSh, setMonthlyRentKSh] = useState('');
  const [depositKSh, setDepositKSh] = useState('');
  const [rentDueDay, setRentDueDay] = useState(5);
  const [bookingNotes, setBookingNotes] = useState('');

  // Portal login
  const [createPortalLogin, setCreatePortalLogin] = useState(true);
  const [portalPassword, setPortalPassword] = useState('Tenant2026!');

  const [loadingUnits, setLoadingUnits] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setIsBookingMode(initialBookingMode);
      fetchVacantUnits();
    }
  }, [isOpen, initialBookingMode]);

  const fetchVacantUnits = async () => {
    setLoadingUnits(true);
    try {
      // Direct call to vacant units endpoint with property info joined
      let unitsList: any[] = [];
      try {
        const directVacant = await apiRequest<any[]>('/api/properties/units/vacant');
        if (Array.isArray(directVacant) && directVacant.length > 0) {
          unitsList = directVacant;
        }
      } catch (err) {
        console.warn('Direct vacant units fetch error, trying fallback:', err);
      }

      if (unitsList.length === 0) {
        try {
          const allUnits = await apiRequest<any[]>('/api/properties/all-units');
          if (Array.isArray(allUnits)) {
            unitsList = allUnits.filter((u: any) => u.status === 'vacant');
          }
        } catch {
          // ignore
        }
      }

      setVacantUnits(unitsList);

      // Default: Immediately select a unit to assign immediately
      if (preselectedUnitId) {
        const found = unitsList.find((u) => u.id === preselectedUnitId);
        if (found) {
          setSelectedUnitId(found.id);
          setMonthlyRentKSh((found.monthly_rent_cents / 100).toString());
          setDepositKSh((found.monthly_rent_cents / 100).toString());
          setRentDueDay(found.default_due_day || 5);
          return;
        }
      }

      if (unitsList.length > 0) {
        // Automatically preselect the first available unit so immediate assignment is the default
        const first = unitsList[0];
        setSelectedUnitId(first.id);
        setMonthlyRentKSh((first.monthly_rent_cents / 100).toString());
        setDepositKSh((first.monthly_rent_cents / 100).toString());
        setRentDueDay(first.default_due_day || 5);
      } else {
        setSelectedUnitId('__defer__');
      }
    } catch (err: any) {
      console.error('Error fetching units:', err);
    } finally {
      setLoadingUnits(false);
    }
  };

  const handleUnitChange = (uId: string) => {
    setSelectedUnitId(uId);
    if (uId && uId !== '__defer__') {
      const found = vacantUnits.find((u) => u.id === uId);
      if (found) {
        setMonthlyRentKSh((found.monthly_rent_cents / 100).toString());
        setDepositKSh((found.monthly_rent_cents / 100).toString());
        setRentDueDay(found.default_due_day || 5);
      }
    } else {
      setMonthlyRentKSh('');
      setDepositKSh('');
    }
  };

  const handleFormSubmit = async (overrideBookingMode?: boolean) => {
    setError(null);

    if (!fullName.trim() || !email.trim() || !phoneNumber.trim() || !nationalId.trim()) {
      setError('Please fill in all required tenant personal and contact details.');
      return;
    }

    const booking = overrideBookingMode !== undefined ? overrideBookingMode : isBookingMode;
    const isDeferred = selectedUnitId === '__defer__' || !selectedUnitId;

    if (!isDeferred && !monthlyRentKSh) {
      setError('Please specify the monthly rent amount for the assigned unit.');
      return;
    }

    setSubmitting(true);
    try {
      const finalNotesParts: string[] = [];
      if (notes.trim()) finalNotesParts.push(notes.trim());

      if (!isDeferred) {
        if (booking) {
          finalNotesParts.push(`[BOOKED / RESERVED UNIT]: Move-in scheduled for ${startDate}. Reservation deposit: KSh ${depositKSh || 0}.`);
          if (bookingNotes.trim()) {
            finalNotesParts.push(`Booking Note: ${bookingNotes.trim()}`);
          }
        } else {
          finalNotesParts.push(`[IMMEDIATE UNIT ASSIGNMENT]: Tenancy active starting ${startDate}.`);
        }
      }

      const payload: any = {
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        phoneNumber: phoneNumber.trim(),
        nationalId: nationalId.trim(),
        emergencyContactName: emergencyName.trim() || undefined,
        emergencyContactPhone: emergencyPhone.trim() || undefined,
        notes: finalNotesParts.join(' ') || undefined,
        createPortalLogin,
        portalPassword: createPortalLogin ? portalPassword : undefined
      };

      if (!isDeferred) {
        payload.unitId = selectedUnitId;
        payload.startDate = startDate;
        payload.monthlyRentKSh = parseFloat(monthlyRentKSh);
        payload.depositKSh = depositKSh ? parseFloat(depositKSh) : 0;
        payload.rentDueDay = rentDueDay;
      }

      const res = await apiRequest('/api/tenants', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      alert(
        booking
          ? `Unit successfully booked and reserved for ${fullName.trim()}!`
          : `Tenant ${fullName.trim()} registered and assigned to unit immediately!`
      );

      onSuccess(res);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to register tenant');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const currentUnit = vacantUnits.find((u) => u.id === selectedUnitId);
  const isDeferred = selectedUnitId === '__defer__' || !selectedUnitId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
          <div className="flex items-center gap-2">
            {isBookingMode ? (
              <BookmarkCheck className="w-5 h-5 text-emerald-400" />
            ) : (
              <UserPlus className="w-5 h-5 text-blue-400" />
            )}
            <div>
              <h2 className="text-base font-bold">
                {isBookingMode ? 'Book Unit & Register Tenant' : 'Assign Tenant Unit Immediately'}
              </h2>
              <p className="text-[11px] text-slate-300">
                {isBookingMode
                  ? 'Reserve vacant rental unit with advance booking deposit & move-in date'
                  : 'Register tenant profile and assign vacant rental unit immediately'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-md transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); handleFormSubmit(); }} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: Tenant Personal Details */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3 pb-1 border-b border-slate-100 flex items-center justify-between">
              <span>1. Tenant Personal & Contact Information</span>
              <span className="text-[10px] font-normal text-slate-500">* Required fields</span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Dennis Kipchoge Ruto"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">National ID / Passport *</label>
                <input
                  type="text"
                  placeholder="e.g. 31948201"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Email Address *</label>
                <input
                  type="email"
                  placeholder="e.g. dennis.ruto@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Phone Number (M-Pesa) *</label>
                <input
                  type="text"
                  placeholder="e.g. +254712345678"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 2: Immediate Unit Assignment & Booking Mode */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <span>2. Unit Assignment & Tenancy Booking</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                  isBookingMode
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-emerald-100 text-emerald-900'
                }`}>
                  {isBookingMode ? 'Unit Reservation / Booking' : 'Immediate Move-in'}
                </span>
              </h3>

              {/* Mode Toggle */}
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsBookingMode(false)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all flex items-center gap-1 ${
                    !isBookingMode
                      ? 'bg-white text-blue-900 shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <KeyRound className="w-3 h-3 text-blue-600" />
                  <span>Assign Immediately</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsBookingMode(true)}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all flex items-center gap-1 ${
                    isBookingMode
                      ? 'bg-amber-500 text-white shadow-2xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BookmarkCheck className="w-3 h-3" />
                  <span>Book Unit</span>
                </button>
              </div>
            </div>

            {/* Vacant Unit Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>
                  {isBookingMode
                    ? 'Select Vacant Unit to Book & Reserve *'
                    : 'Select Vacant Unit to Assign Immediately *'}
                </span>
                {vacantUnits.length > 0 && (
                  <span className="text-[11px] text-emerald-700 font-medium">
                    {vacantUnits.length} vacant units available
                  </span>
                )}
              </label>

              <select
                value={selectedUnitId}
                onChange={(e) => handleUnitChange(e.target.value)}
                className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-blue-600"
              >
                {vacantUnits.length === 0 ? (
                  <option value="" disabled>No vacant units currently available</option>
                ) : (
                  vacantUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.property_name} — Unit {u.unit_number} ({u.unit_type}) · Rent: {formatKSh(u.monthly_rent_cents)}/mo
                    </option>
                  ))
                )}
                <option value="__defer__">Register tenant profile only (Defer unit assignment)</option>
              </select>
            </div>

            {/* Unit Details & Tenancy Setup Box */}
            {!isDeferred && currentUnit && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-xs">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span className="font-bold text-slate-900">
                      {currentUnit.property_name} · Unit {currentUnit.unit_number}
                    </span>
                    <span className="text-slate-500 font-normal">({currentUnit.unit_type})</span>
                  </div>
                  <span className="font-mono font-bold text-blue-900">
                    Standard Rent: {formatKSh(currentUnit.monthly_rent_cents)}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      {isBookingMode ? 'Move-in / Start Date *' : 'Lease Start Date *'}
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full h-8 px-2 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Monthly Rent (KSh) *</label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      value={monthlyRentKSh}
                      onChange={(e) => setMonthlyRentKSh(e.target.value)}
                      className="w-full h-8 px-2 border border-slate-300 rounded text-xs font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      {isBookingMode ? 'Booking / Deposit (KSh)' : 'Security Deposit (KSh)'}
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      placeholder="e.g. 25000"
                      value={depositKSh}
                      onChange={(e) => setDepositKSh(e.target.value)}
                      className="w-full h-8 px-2 border border-slate-300 rounded text-xs font-mono bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                </div>

                {/* Booking Notes when in booking mode */}
                {isBookingMode && (
                  <div className="pt-1">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Booking / Reservation Notes (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Advance reservation deposit received via M-Pesa. Keys handover on 1st."
                      value={bookingNotes}
                      onChange={(e) => setBookingNotes(e.target.value)}
                      className="w-full h-8 px-2 border border-slate-300 rounded text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 3: Emergency Contact & Tenant Portal Access */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-3 pb-1 border-b border-slate-100">
              3. Emergency Contact & Tenant Portal Access
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Emergency Contact Name</label>
                <input
                  type="text"
                  placeholder="e.g. Mercy Chebet (Spouse)"
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Emergency Phone</label>
                <input
                  type="text"
                  placeholder="e.g. +254703998811"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-lg">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-blue-900 mb-2">
                <input
                  type="checkbox"
                  checked={createPortalLogin}
                  onChange={(e) => setCreatePortalLogin(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Create Tenant Self-Service Portal Login</span>
              </label>

              {createPortalLogin && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-600">Initial Password:</span>
                  <input
                    type="text"
                    value={portalPassword}
                    onChange={(e) => setPortalPassword(e.target.value)}
                    className="h-7 px-2 border border-slate-300 rounded font-mono text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                  <span className="text-[11px] text-slate-500">(Tenant can change password upon login)</span>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cancel
            </button>

            <div className="flex items-center gap-2">
              {!isDeferred && (
                <>
                  {/* Book Unit Button */}
                  <button
                    type="button"
                    onClick={() => handleFormSubmit(true)}
                    disabled={submitting}
                    className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                    title="Book and reserve this unit for tenant"
                  >
                    <BookmarkCheck className="w-4 h-4" />
                    <span>{submitting && isBookingMode ? 'Booking...' : 'Book Unit'}</span>
                  </button>

                  {/* Assign Unit Immediately Button */}
                  <button
                    type="button"
                    onClick={() => handleFormSubmit(false)}
                    disabled={submitting}
                    className="px-5 py-2 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                    title="Assign tenant to unit immediately"
                  >
                    <Check className="w-4 h-4" />
                    <span>{submitting && !isBookingMode ? 'Assigning...' : 'Assign Unit Immediately'}</span>
                  </button>
                </>
              )}

              {isDeferred && (
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{submitting ? 'Registering...' : 'Register Profile (Unit Deferred)'}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
