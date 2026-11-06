/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../lib/api.ts';
import { Settings, ShieldCheck, Database, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';

  const [settings, setSettings] = useState<any>({
    system_name: 'KodiPay Kenya',
    currency: 'KSh',
    timezone: 'Africa/Nairobi',
    grace_period_days: 5,
    late_fee_percentage: 0
  });

  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await apiRequest('/api/settings');
      if (res.general) {
        setSettings(res.general);
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest('/api/settings/general', {
        method: 'POST',
        body: JSON.stringify({
          gracePeriodDays: settings.grace_period_days,
          lateFeePercentage: settings.late_fee_percentage,
          systemName: settings.system_name
        })
      });
      setMessage('Settings updated successfully.');
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleSeedDemoData = async () => {
    if (!confirm('Initialize clearly labelled demo data? This will create sample properties [DEMO] Kilimani Heights, units, tenants, and verified billing records.')) {
      return;
    }
    setSeeding(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest('/api/settings/seed-demo-data', { method: 'POST' });
      setMessage(res.message);
    } catch (err: any) {
      setError(err.message || 'Failed to seed demo data');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <h2 className="font-bold text-base text-slate-900">System Configuration & Policies</h2>
        <p className="text-xs text-slate-500">Regional defaults, grace periods, and test environment initialization</p>
      </div>

      {message && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* General Settings Card */}
      <form onSubmit={handleSaveGeneral} className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
        <h3 className="font-bold text-sm text-slate-900 pb-2 border-b border-slate-100">
          Regional & Financial Policy Settings
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">System Name</label>
            <input
              type="text"
              value={settings.system_name || ''}
              onChange={(e) => setSettings({ ...settings, system_name: e.target.value })}
              disabled={!isAdmin}
              className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm disabled:bg-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Default Currency</label>
            <input
              type="text"
              value="Kenyan Shillings (KSh)"
              disabled
              className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-slate-100 font-mono text-slate-700"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Timezone</label>
            <input
              type="text"
              value="Africa/Nairobi (EAT, UTC+3)"
              disabled
              className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-slate-100 font-mono text-slate-700"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Rent Grace Period (Days before marked Overdue)
            </label>
            <input
              type="number"
              min="0"
              max="30"
              value={settings.grace_period_days || 5}
              onChange={(e) => setSettings({ ...settings, grace_period_days: e.target.value })}
              disabled={!isAdmin}
              className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm font-mono disabled:bg-slate-100"
            />
          </div>
        </div>

        {isAdmin && (
          <div className="pt-2 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors"
            >
              {saving ? 'Saving...' : 'Save Policy Settings'}
            </button>
          </div>
        )}
      </form>

      {/* Demo Environment Card (Requirement D & K) */}
      {isAdmin && (
        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-sm text-slate-900">Clearly-Labelled Demo Environment</h3>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-xl">
                In strict accordance with Kenyan testing standards, sample records are clearly labelled with <code className="font-bold text-slate-800">[DEMO]</code> so they are never confused with live production payments.
              </p>
            </div>

            <button
              onClick={handleSeedDemoData}
              disabled={seeding}
              className="px-4 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
              <span>{seeding ? 'Seeding...' : 'Seed Demo Data'}</span>
            </button>
          </div>

          <div className="p-4 bg-white rounded-lg border border-slate-200 text-xs space-y-2">
            <span className="font-bold text-slate-800 block">Available Test Accounts:</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-[11px]">
              <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                <span className="font-bold text-blue-900 block font-sans">Landlord / Manager</span>
                <p className="mt-1">landlord.demo@kodipay.co.ke</p>
                <p className="text-slate-500">Pass: KodiPay2026!</p>
              </div>

              <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                <span className="font-bold text-blue-900 block font-sans">Accountant / Staff</span>
                <p className="mt-1">accountant.demo@kodipay.co.ke</p>
                <p className="text-slate-500">Pass: KodiPay2026!</p>
              </div>

              <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                <span className="font-bold text-blue-900 block font-sans">Tenant</span>
                <p className="mt-1">brian.otieno@gmail.com</p>
                <p className="text-slate-500">Pass: KodiPay2026!</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
