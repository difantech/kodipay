/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { KeyRound, ShieldCheck, CheckCircle2, AlertCircle, Eye, EyeOff, Building2, UserCheck, X } from 'lucide-react';

export const PortalActivationModal: React.FC = () => {
  const { login } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [verification, setVerification] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activatedSuccess, setActivatedSuccess] = useState(false);

  useEffect(() => {
    // Check URL query parameters for invitation token
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    const actionParam = urlParams.get('action');

    if (tokenParam && (actionParam === 'activate-portal' || actionParam === 'activate')) {
      setToken(tokenParam);
      setIsOpen(true);
      verifyToken(tokenParam);
    }
  }, []);

  const verifyToken = async (tok: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<any>(`/api/auth/invitation/${tok}`);
      if (res.valid) {
        setVerification(res);
      } else {
        setError(res.error || 'Invalid invitation link.');
      }
    } catch (err: any) {
      setError(err.message || 'Invitation link has expired or is invalid.');
    } finally {
      setLoading(false);
    }
  };

  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must contain at least 8 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify your password entry.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiRequest<any>(`/api/auth/invitation/${token}/activate`, {
        method: 'POST',
        body: JSON.stringify({ password })
      });

      setActivatedSuccess(true);
      // Clean query params from URL
      window.history.replaceState({}, document.title, window.location.pathname);

      // Auto sign-in if token returned
      if (res.token && res.user) {
        setTimeout(() => {
          login(res.token, res.user);
          setIsOpen(false);
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to activate account. Link may have expired.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in duration-150">
        {/* Header */}
        <div className="bg-[#0B1528] px-6 py-4 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Tenant Portal Account Setup</h3>
              <p className="text-[11px] text-slate-400">KodiPay Kenya · Secure Portal Access</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 text-slate-400 hover:text-white rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="py-8 text-center text-xs text-slate-500 space-y-2">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p>Verifying secure invitation credentials...</p>
            </div>
          ) : error && !verification ? (
            <div className="py-4 space-y-4 text-center">
              <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto border border-rose-200">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Invitation Link Invalid or Expired</h4>
                <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          ) : activatedSuccess ? (
            <div className="py-6 space-y-3 text-center">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-slate-900">Account Activated Successfully!</h4>
              <p className="text-xs text-slate-600">
                Your password is now secured. Logging you into your tenant portal dashboard...
              </p>
              <div className="w-4 h-4 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mt-2" />
            </div>
          ) : (
            <form onSubmit={handleActivateSubmit} className="space-y-4">
              {/* Tenant Welcome Card */}
              {verification?.tenant && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 text-blue-900 font-bold">
                    <UserCheck className="w-4 h-4 text-blue-700" />
                    <span>Welcome, {verification.tenant.fullName}!</span>
                  </div>
                  <p className="text-slate-600">
                    Set up your personal password to access your rent statements, M-Pesa receipts, and payment portal.
                  </p>
                  {verification.tenant.propertyName && (
                    <div className="pt-1.5 text-[11px] text-slate-500 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        {verification.tenant.propertyName} · Unit {verification.tenant.unitNumber}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2 text-xs text-rose-800">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Create Your Password <span className="text-rose-500">* (Min 8 characters)</span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a strong password"
                    className="w-full h-9 pl-3 pr-9 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm Password <span className="text-rose-500">*</span>
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 space-y-0.5">
                <span className="font-semibold text-slate-700 block flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Zero Plain-Text Security Guarantee:
                </span>
                <p>Your password is cryptographically hashed with bcrypt on submission and never stored in plain text.</p>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-700 hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Activating Account...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Activate Account & Sign In</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
