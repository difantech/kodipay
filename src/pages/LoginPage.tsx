/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { apiRequest } from '../lib/api.ts';
import { Building2, ShieldCheck, Lock, Mail, User, Phone, CheckCircle2, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, needsSetup, checkSetupStatus } = useAuth();

  const [isSetupMode, setIsSetupMode] = useState(needsSetup);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+254');
  const [nationalId, setNationalId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (isSetupMode || needsSetup) {
        // First Administrator Setup
        const res = await apiRequest('/api/auth/setup-first-admin', {
          method: 'POST',
          body: JSON.stringify({
            fullName: fullName.trim(),
            email: email.trim().toLowerCase(),
            password,
            phoneNumber: phoneNumber.trim(),
            nationalId: nationalId.trim()
          })
        });

        login(res.token, res.user);
      } else {
        // Standard Secure Login
        const res = await apiRequest('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password
          })
        });

        login(res.token, res.user);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 text-slate-100">
      <div className="w-full max-w-md bg-white text-slate-900 rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Brand Header */}
        <div className="bg-[#0B1528] px-8 pt-8 pb-6 text-white text-center border-b border-slate-800">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center font-black text-xl text-white mx-auto shadow-lg mb-3">
            KP
          </div>
          <h1 className="text-xl font-bold tracking-tight">KodiPay Kenya</h1>
          <p className="text-xs text-slate-400 mt-1">
            Rental Payment & Property Management System
          </p>
        </div>

        {/* Form Body */}
        <div className="p-8">
          {needsSetup || isSetupMode ? (
            <div className="mb-5 p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-950 leading-relaxed">
              <span className="font-bold flex items-center gap-1.5 text-blue-900 mb-1">
                <ShieldCheck className="w-4 h-4 text-blue-700" />
                First-Administrator Setup Required
              </span>
              No administrative accounts detected. Please configure the initial Super Administrator below. This cannot be overridden once registered.
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-800">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {(needsSetup || isSetupMode) && (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Super Admin Full Name *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="e.g. Chief Administrator"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                    Phone Number (Kenyan) *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
                      required
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Email Address *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  placeholder="name@kodipay.co.ke"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm shadow-sm disabled:opacity-50 mt-2"
            >
              {loading ? (
                'Processing...'
              ) : needsSetup || isSetupMode ? (
                'Initialize Super Administrator'
              ) : (
                'Sign In to KodiPay'
              )}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-100 text-center text-[11px] text-slate-400 space-y-1">
            <p>Protected by Bcrypt Hashing, JWT Session tokens, and Role Isolation.</p>
            <p className="font-mono">Timezone: Africa/Nairobi · Currency: KSh</p>
          </div>
        </div>
      </div>
    </div>
  );
};
