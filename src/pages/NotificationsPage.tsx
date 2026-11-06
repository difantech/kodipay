/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatKSh } from '../lib/api.ts';
import {
  Bell,
  Smartphone,
  Mail,
  Sliders,
  CheckCircle2,
  Clock,
  Sparkles,
  Send,
  RefreshCw,
  Search,
  Filter,
  Check,
  AlertCircle,
  Copy,
  ChevronDown,
  Building2,
  User,
  Shield,
  Layers
} from 'lucide-react';

export const NotificationsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'preferences' | 'logs' | 'ai-studio'>('preferences');

  // Preferences State
  const [prefs, setPrefs] = useState({
    sms_payment_received: true,
    email_payment_received: true,
    sms_tenant_receipt: true,
    email_tenant_receipt: true,
    sms_arrears_reminder: true,
    email_monthly_statement: true
  });
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefSaveSuccess, setPrefSaveSuccess] = useState(false);

  // Logs State
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [channelFilter, setChannelFilter] = useState<'all' | 'sms' | 'email' | 'in_app'>('all');
  const [recipientFilter, setRecipientFilter] = useState<'all' | 'landlord' | 'tenant'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Stats State
  const [stats, setStats] = useState<any>(null);

  // Tenancies for AI Composer & Manual Dispatch
  const [tenantsList, setTenantsList] = useState<any[]>([]);

  // AI Composer State
  const [aiTenantId, setAiTenantId] = useState('');
  const [aiEventType, setAiEventType] = useState<'payment_acknowledgement' | 'rent_reminder' | 'overdue_notice' | 'welcome_tenant'>('payment_acknowledgement');
  const [aiTone, setAiTone] = useState<'professional' | 'warm_friendly' | 'swahili_bilingual' | 'formal_legal' | 'gentle_reminder'>('swahili_bilingual');
  const [aiCustomInstructions, setAiCustomInstructions] = useState('');
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiDraft, setAiDraft] = useState<any | null>(null);
  const [sendingAiMessage, setSendingAiMessage] = useState(false);
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | null>(null);

  // AI Collection Insights State
  const [analyzingInsights, setAnalyzingInsights] = useState(false);
  const [aiInsights, setAiInsights] = useState<any | null>(null);

  useEffect(() => {
    fetchPreferences();
    fetchStats();
    fetchLogs();
    fetchTenants();
  }, []);

  const fetchPreferences = async () => {
    try {
      const res = await apiRequest<any>('/api/notifications/preferences');
      setPrefs({
        sms_payment_received: res.sms_payment_received ?? true,
        email_payment_received: res.email_payment_received ?? true,
        sms_tenant_receipt: res.sms_tenant_receipt ?? true,
        email_tenant_receipt: res.email_tenant_receipt ?? true,
        sms_arrears_reminder: res.sms_arrears_reminder ?? true,
        email_monthly_statement: res.email_monthly_statement ?? true
      });
    } catch (e) {
      console.error('Failed to load notification preferences:', e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await apiRequest<any>('/api/notifications/stats');
      setStats(res);
    } catch (e) {
      console.error('Failed to load notification stats:', e);
    }
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await apiRequest<any[]>('/api/notifications/logs?limit=100');
      setLogs(res);
    } catch (e) {
      console.error('Failed to load notification logs:', e);
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchTenants = async () => {
    try {
      const res = await apiRequest<any[]>('/api/tenants');
      const active = res.filter((t) => t.tenancy_id);
      setTenantsList(active);
      if (active.length > 0 && !aiTenantId) {
        setAiTenantId(active[0].tenancy_id);
      }
    } catch (e) {
      console.error('Failed to load tenants for notification composer:', e);
    }
  };

  const handleTogglePref = (key: keyof typeof prefs) => {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
    setPrefSaveSuccess(false);
  };

  const handleSavePreferences = async () => {
    setSavingPrefs(true);
    setPrefSaveSuccess(false);
    try {
      await apiRequest('/api/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify(prefs)
      });
      setPrefSaveSuccess(true);
      fetchStats();
      setTimeout(() => setPrefSaveSuccess(false), 3500);
    } catch (err: any) {
      alert(err.message || 'Failed to update preferences');
    } finally {
      setSavingPrefs(false);
    }
  };

  // AI Message Generator
  const handleGenerateAiDraft = async () => {
    const selected = tenantsList.find((t) => t.tenancy_id === aiTenantId);
    if (!selected) {
      alert('Please select a tenant first');
      return;
    }

    setGeneratingAi(true);
    setSendSuccessMessage(null);
    try {
      const res = await apiRequest<any>('/api/notifications/ai-draft', {
        method: 'POST',
        body: JSON.stringify({
          tenantName: selected.full_name,
          unitNumber: selected.unit_number || 'A1',
          propertyName: selected.property_name || 'Apartment',
          amountKSh: selected.rent_amount_cents ? selected.rent_amount_cents / 100 : 30000,
          balanceKSh: selected.total_balance_cents ? selected.total_balance_cents / 100 : 0,
          dueDate: `${selected.rent_due_day || 5}th of this month`,
          paymentMethod: 'M-Pesa',
          tone: aiTone,
          eventType: aiEventType,
          customInstructions: aiCustomInstructions.trim() || undefined
        })
      });
      setAiDraft(res);
    } catch (err: any) {
      alert(err.message || 'AI message draft failed');
    } finally {
      setGeneratingAi(false);
    }
  };

  // Dispatch Drafted AI Message
  const handleDispatchAiMessage = async (channel: 'sms' | 'email') => {
    if (!aiDraft) return;
    const selected = tenantsList.find((t) => t.tenancy_id === aiTenantId);
    if (!selected) return;

    setSendingAiMessage(true);
    setSendSuccessMessage(null);
    try {
      const res = await apiRequest<any>('/api/notifications/send-manual', {
        method: 'POST',
        body: JSON.stringify({
          recipientType: 'tenant',
          recipientName: selected.full_name,
          recipientContact: channel === 'sms' ? selected.phone_number : selected.email,
          channel,
          subject: channel === 'email' ? aiDraft.emailSubject : undefined,
          message: channel === 'sms' ? aiDraft.smsMessage : aiDraft.emailBody,
          eventType: `ai_${aiEventType}`
        })
      });

      setSendSuccessMessage(res.message);
      fetchLogs();
      fetchStats();
    } catch (err: any) {
      alert(err.message || 'Failed to dispatch message');
    } finally {
      setSendingAiMessage(false);
    }
  };

  // Generate AI Executive Collection Insights
  const handleGenerateAiInsights = async () => {
    setAnalyzingInsights(true);
    try {
      // Fetch summary stats from reports or dashboard
      const dash = await apiRequest<any>('/api/dashboard/stats');
      const res = await apiRequest<any>('/api/notifications/ai-insights', {
        method: 'POST',
        body: JSON.stringify({
          totalCollectedKSh: (dash.total_collected_this_month_cents || 0) / 100,
          expectedRentKSh: (dash.expected_monthly_rent_cents || 1) / 100,
          collectionRatePct: dash.collection_rate_percentage || 0,
          occupiedUnits: dash.occupied_units || 0,
          vacantUnits: dash.vacant_units || 0,
          totalArrearsKSh: (dash.total_arrears_cents || 0) / 100,
          monthName: new Intl.DateTimeFormat('en-KE', { month: 'long', year: 'numeric' }).format(new Date())
        })
      });
      setAiInsights(res);
    } catch (err: any) {
      alert(err.message || 'Failed to generate AI insights');
    } finally {
      setAnalyzingInsights(false);
    }
  };

  // Filtered Logs
  const filteredLogs = logs.filter((l) => {
    if (channelFilter !== 'all' && l.channel !== channelFilter) return false;
    if (recipientFilter !== 'all' && l.recipient_type !== recipientFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (l.recipient_name || '').toLowerCase().includes(q);
      const matchContact = (l.recipient_contact || '').toLowerCase().includes(q);
      const matchMsg = (l.message || '').toLowerCase().includes(q);
      if (!matchName && !matchContact && !matchMsg) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Metrics */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white rounded-2xl p-6 shadow-sm border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-700/60">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-blue-400" />
                <span>Automated SMS & Email Scaffolding with Gemini 3.8 Flash</span>
              </span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>Notification Hub & AI Communication Studio</span>
            </h1>
            <p className="text-xs text-slate-300 mt-0.5">
              Instant landlord alerts, tenant rent receipts, customizable preference toggles, and AI-powered drafting
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('preferences')}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'preferences'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Preferences</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('logs');
                fetchLogs();
              }}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'logs'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Event Logs ({logs.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveTab('ai-studio');
                if (!aiInsights) handleGenerateAiInsights();
              }}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'ai-studio'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>AI Studio</span>
            </button>
          </div>
        </div>

        {/* Quick Statistics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-xs">
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
            <span className="text-slate-400 block text-[11px]">Total Dispatched</span>
            <span className="text-lg font-bold font-mono text-white">
              {stats?.summary?.total_notifications || logs.length}
            </span>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
            <span className="text-slate-400 block text-[11px] flex items-center gap-1">
              <Smartphone className="w-3 h-3 text-emerald-400" />
              <span>SMS Dispatched</span>
            </span>
            <span className="text-lg font-bold font-mono text-emerald-400">
              {stats?.summary?.sms_count || logs.filter((l) => l.channel === 'sms').length}
            </span>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
            <span className="text-slate-400 block text-[11px] flex items-center gap-1">
              <Mail className="w-3 h-3 text-blue-400" />
              <span>Emails Sent</span>
            </span>
            <span className="text-lg font-bold font-mono text-blue-400">
              {stats?.summary?.email_count || logs.filter((l) => l.channel === 'email').length}
            </span>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
            <span className="text-slate-400 block text-[11px] flex items-center gap-1">
              <Sliders className="w-3 h-3 text-amber-400" />
              <span>Skipped (By Preference)</span>
            </span>
            <span className="text-lg font-bold font-mono text-amber-300">
              {stats?.summary?.skipped_count || logs.filter((l) => l.status === 'skipped_by_preference').length}
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: LANDLORD NOTIFICATION PREFERENCES
          ===================================================================== */}
      {activeTab === 'preferences' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-blue-600" />
                <span>Landlord Notification Preference Toggles</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Enable or disable individual SMS or Email notifications for rent collections, receipts, and tenant reminders
              </p>
            </div>

            <div className="flex items-center gap-3">
              {prefSaveSuccess && (
                <span className="text-xs font-bold text-emerald-700 flex items-center gap-1 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Preferences Saved!</span>
                </span>
              )}
              <button
                onClick={handleSavePreferences}
                disabled={savingPrefs}
                className="px-4 py-2 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{savingPrefs ? 'Saving Changes...' : 'Save Preferences'}</span>
              </button>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Column 1: SMS Channel Preferences */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">SMS Channel Toggles</h3>
                  <p className="text-[11px] text-slate-500">Safaricom & Africa's Talking gateway integrations</p>
                </div>
              </div>

              {/* Toggle 1: Landlord SMS on Payment */}
              <div className="flex items-start justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <div className="pr-4">
                  <span className="text-xs font-bold text-slate-900 block">Owner SMS on Payment Received</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Send real-time SMS alert to property owner/landlord phone as soon as a rent payment is confirmed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleTogglePref('sms_payment_received')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                    prefs.sms_payment_received ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      prefs.sms_payment_received ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Toggle 2: Tenant SMS Receipt */}
              <div className="flex items-start justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <div className="pr-4">
                  <span className="text-xs font-bold text-slate-900 block">Tenant SMS Rent Receipt</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Automatically dispatch an official SMS receipt with M-Pesa transaction reference and remainder balance to the tenant.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleTogglePref('sms_tenant_receipt')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                    prefs.sms_tenant_receipt ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      prefs.sms_tenant_receipt ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Toggle 3: SMS Arrears Reminder */}
              <div className="flex items-start justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <div className="pr-4">
                  <span className="text-xs font-bold text-slate-900 block">Tenant SMS Arrears & Payment Reminders</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Send automated payment reminder SMS to tenants approaching due dates or carrying overdue balances.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleTogglePref('sms_arrears_reminder')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                    prefs.sms_arrears_reminder ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      prefs.sms_arrears_reminder ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Column 2: Email Channel Preferences */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Email Channel Toggles</h3>
                  <p className="text-[11px] text-slate-500">SMTP and SendGrid email scaffolding</p>
                </div>
              </div>

              {/* Toggle 4: Landlord Email on Payment */}
              <div className="flex items-start justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <div className="pr-4">
                  <span className="text-xs font-bold text-slate-900 block">Owner Email Payment Breakdown</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Email full collection receipt and financial breakdown to the landlord when rent is collected.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleTogglePref('email_payment_received')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                    prefs.email_payment_received ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      prefs.email_payment_received ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Toggle 5: Tenant Email Receipt */}
              <div className="flex items-start justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <div className="pr-4">
                  <span className="text-xs font-bold text-slate-900 block">Tenant Digital Receipt Email</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Email an official PDF-ready receipt breakdown directly to the tenant's registered email.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleTogglePref('email_tenant_receipt')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                    prefs.email_tenant_receipt ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      prefs.email_tenant_receipt ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Toggle 6: Monthly Statement Email */}
              <div className="flex items-start justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                <div className="pr-4">
                  <span className="text-xs font-bold text-slate-900 block">Monthly Portfolio Statement Email</span>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Receive an executive monthly financial collection statement summarizing total money collected across all properties.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleTogglePref('email_monthly_statement')}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                    prefs.email_monthly_statement ? 'bg-blue-600' : 'bg-slate-300'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      prefs.email_monthly_statement ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-slate-400" />
              <span>Preferences take effect immediately on next payment recording and system events.</span>
            </span>
            <button
              onClick={handleSavePreferences}
              disabled={savingPrefs}
              className="text-blue-700 font-bold hover:underline"
            >
              Save Now
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: NOTIFICATION EVENT LOGS & DISPATCH HISTORY
          ===================================================================== */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Controls Bar */}
          <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/70">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search recipient, phone or text..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white w-60 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              {/* Channel Filter */}
              <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5 text-xs">
                {(['all', 'sms', 'email', 'in_app'] as const).map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setChannelFilter(ch)}
                    className={`px-2.5 py-1 font-semibold rounded-md transition-colors ${
                      channelFilter === ch ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {ch === 'all' ? 'All Channels' : ch.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Recipient Filter */}
              <div className="flex items-center bg-white border border-slate-300 rounded-lg p-0.5 text-xs">
                {(['all', 'landlord', 'tenant'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRecipientFilter(r)}
                    className={`px-2.5 py-1 font-semibold rounded-md transition-colors ${
                      recipientFilter === r ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {r === 'all' ? 'All Roles' : r === 'landlord' ? 'Owner / Landlord' : 'Tenant'}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={fetchLogs}
              className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-300 flex items-center gap-1.5 self-start md:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
              <span>Refresh Logs</span>
            </button>
          </div>

          {/* Logs Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Channel & Event</th>
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Message Content</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Time (EAT)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {log.channel === 'sms' && (
                            <span className="p-1 rounded bg-emerald-100 text-emerald-800">
                              <Smartphone className="w-3.5 h-3.5" />
                            </span>
                          )}
                          {log.channel === 'email' && (
                            <span className="p-1 rounded bg-blue-100 text-blue-800">
                              <Mail className="w-3.5 h-3.5" />
                            </span>
                          )}
                          {log.channel === 'in_app' && (
                            <span className="p-1 rounded bg-purple-100 text-purple-800">
                              <Bell className="w-3.5 h-3.5" />
                            </span>
                          )}
                          <div>
                            <span className="font-bold uppercase tracking-wider text-[10px] text-slate-700 block">
                              {log.channel}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              {log.event_type.replace(/_/g, ' ')}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-bold text-slate-900 block">{log.recipient_name}</span>
                        <span className="text-[11px] font-mono text-slate-500">
                          {log.recipient_contact} ({log.recipient_type})
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {log.subject && (
                          <span className="font-semibold text-slate-800 block text-[11px] mb-0.5">
                            {log.subject}
                          </span>
                        )}
                        <p className="text-slate-600 text-xs line-clamp-2 hover:line-clamp-none transition-all">
                          {log.message}
                        </p>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {log.status === 'delivered' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                            <span>Delivered</span>
                          </span>
                        ) : log.status === 'skipped_by_preference' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                            <span>Skipped (Preference Off)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            {log.status}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleString('en-KE', {
                          timeZone: 'Africa/Nairobi',
                          dateStyle: 'short',
                          timeStyle: 'short'
                        })}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No notification logs match your filter criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: AI COMMUNICATION & COLLECTION STUDIO (GEMINI 3.8 FLASH)
          ===================================================================== */}
      {activeTab === 'ai-studio' && (
        <div className="space-y-6">
          {/* Executive AI Collection Insights Card */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-6 border border-slate-700 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>AI Portfolio Collection Briefing</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Powered by Gemini 3.8 Flash
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300">
                    Real-time analysis of money collected, recovery pacing, and strategic next steps
                  </p>
                </div>
              </div>

              <button
                onClick={handleGenerateAiInsights}
                disabled={analyzingInsights}
                className="px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors flex items-center gap-1.5 self-start sm:self-auto shadow-xs disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${analyzingInsights ? 'animate-spin' : ''}`} />
                <span>{analyzingInsights ? 'Analyzing Portfolio...' : 'Refresh AI Analysis'}</span>
              </button>
            </div>

            {aiInsights && (
              <div className="pt-2 border-t border-slate-700/80 space-y-3 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">Financial Health:</span>
                  <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                    aiInsights.collectionHealth === 'Excellent'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : aiInsights.collectionHealth === 'Good'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {aiInsights.collectionHealth}
                  </span>
                </div>

                <p className="text-xs text-slate-200 leading-relaxed bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/50">
                  {aiInsights.executiveSummary}
                </p>

                {aiInsights.recommendations && aiInsights.recommendations.length > 0 && (
                  <div className="space-y-1.5 text-xs">
                    <span className="font-bold text-slate-300 text-[11px] uppercase tracking-wider block">
                      AI Recommended Strategic Actions:
                    </span>
                    <ul className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {aiInsights.recommendations.map((rec: string, idx: number) => (
                        <li key={idx} className="bg-slate-800/50 p-2.5 rounded-lg border border-slate-700/40 text-slate-300 text-[11px] flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Message Composer */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <span>AI Notification Drafter & Cultural Tone Composer</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Draft culturally resonant English & Swahili SMS receipts and payment reminders tailored to tenant history
              </p>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Form Controls */}
              <div className="lg:col-span-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Target Tenant & Unit *
                  </label>
                  <select
                    value={aiTenantId}
                    onChange={(e) => setAiTenantId(e.target.value)}
                    className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {tenantsList.map((t) => (
                      <option key={t.tenancy_id} value={t.tenancy_id}>
                        {t.full_name} — {t.property_name} (Unit {t.unit_number}) · Bal: {formatKSh(t.total_balance_cents || 0)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Event Type *</label>
                    <select
                      value={aiEventType}
                      onChange={(e) => setAiEventType(e.target.value as any)}
                      className="w-full h-9 px-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="payment_acknowledgement">Payment Receipt</option>
                      <option value="rent_reminder">Rent Due Reminder</option>
                      <option value="overdue_notice">Overdue Arrears Notice</option>
                      <option value="welcome_tenant">Welcome Move-In</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Communication Tone *</label>
                    <select
                      value={aiTone}
                      onChange={(e) => setAiTone(e.target.value as any)}
                      className="w-full h-9 px-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="swahili_bilingual">Swahili/English Bilingual</option>
                      <option value="warm_friendly">Warm & Friendly</option>
                      <option value="professional">Professional Kenyan</option>
                      <option value="gentle_reminder">Gentle Reminder</option>
                      <option value="formal_legal">Formal Legal Notice</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Special Prompt Instructions (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Include 5% prompt payment discount, mention caretaker Mwangi"
                    value={aiCustomInstructions}
                    onChange={(e) => setAiCustomInstructions(e.target.value)}
                    className="w-full h-9 px-3 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleGenerateAiDraft}
                  disabled={generatingAi || !aiTenantId}
                  className="w-full py-2.5 px-4 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>{generatingAi ? 'Generating Draft with Gemini...' : 'Draft Message with Gemini AI'}</span>
                </button>

                {sendSuccessMessage && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{sendSuccessMessage}</span>
                  </div>
                )}
              </div>

              {/* Right Column: AI Output & One-Click Dispatch */}
              <div className="lg:col-span-7 space-y-4">
                {aiDraft ? (
                  <div className="space-y-4 animate-in fade-in">
                    {/* SMS Preview Card */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Generated SMS Preview</span>
                        </span>
                        <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                          aiDraft.smsCharacterCount <= 160
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {aiDraft.smsCharacterCount} / 160 chars ({aiDraft.smsCharacterCount <= 160 ? '1 SMS Credit' : '2 Credits'})
                        </span>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs font-mono text-slate-800 leading-relaxed">
                        {aiDraft.smsMessage}
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => handleDispatchAiMessage('sms')}
                          disabled={sendingAiMessage}
                          className="px-3.5 py-1.5 text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{sendingAiMessage ? 'Dispatching...' : 'Dispatch SMS to Tenant'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Email Preview Card */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-blue-600" />
                          <span>Generated Email Preview</span>
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          Subject: {aiDraft.emailSubject}
                        </span>
                      </div>

                      <div className="bg-white p-3 rounded-lg border border-slate-200 text-xs text-slate-800 whitespace-pre-line leading-relaxed font-sans">
                        {aiDraft.emailBody}
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-500 italic">
                          {aiDraft.culturalNotes}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDispatchAiMessage('email')}
                          disabled={sendingAiMessage}
                          className="px-3.5 py-1.5 text-xs font-bold bg-blue-700 hover:bg-blue-800 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>{sendingAiMessage ? 'Dispatching...' : 'Dispatch Email to Tenant'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-full min-h-[220px] rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center p-6 text-center text-slate-400 bg-slate-50/50">
                    <Sparkles className="w-8 h-8 text-slate-300 mb-2" />
                    <span className="text-xs font-bold text-slate-600">No Draft Generated Yet</span>
                    <span className="text-[11px] text-slate-400 max-w-xs mt-1">
                      Select a tenant, choose your preferred Kenyan tone, and click "Draft Message with Gemini AI" to create customized communications.
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
