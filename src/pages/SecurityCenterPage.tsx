/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatDate } from '../lib/api.ts';
import {
  SecurityDashboardMetrics,
  SecurityEvent,
  BlockedIp,
  UserSession,
  DatabaseBackup,
  SecuritySettings
} from '../types/index.ts';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Flame,
  Radio,
  RefreshCw,
  Sliders,
  Database,
  Users,
  Smartphone,
  Laptop,
  Download,
  RotateCcw,
  Trash2,
  Plus,
  X,
  CheckCircle2,
  Terminal,
  Activity,
  KeyRound,
  FileCheck2,
  Play
} from 'lucide-react';

export const SecurityCenterPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'waf' | 'sessions' | 'backups' | 'settings'>('waf');
  const [metrics, setMetrics] = useState<SecurityDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // WAF Tab Data
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [selectedSeverity, setSelectedSeverity] = useState<string>('');
  const [inspectEvent, setInspectEvent] = useState<SecurityEvent | null>(null);

  // Manual Block IP Modal State
  const [blockIpModalOpen, setBlockIpModalOpen] = useState(false);
  const [blockIpAddress, setBlockIpAddress] = useState('');
  const [blockReason, setBlockReason] = useState('Manual security blocklist enforcement');
  const [blockIsPermanent, setBlockIsPermanent] = useState(false);
  const [blockDurationMinutes, setBlockDurationMinutes] = useState(60);

  // Threat Simulation State
  const [simulating, setSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any | null>(null);

  // Sessions Tab Data
  const [sessions, setSessions] = useState<UserSession[]>([]);

  // Backups Tab Data
  const [backups, setBackups] = useState<DatabaseBackup[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [backupNotes, setBackupNotes] = useState('');
  const [restoreModalBackup, setRestoreModalBackup] = useState<DatabaseBackup | null>(null);
  const [restoring, setRestoring] = useState(false);

  // Settings Tab State
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadAllSecurityData();
  }, [activeTab]);

  const loadAllSecurityData = async () => {
    setLoading(true);
    try {
      const [metricsRes, settingsRes] = await Promise.all([
        apiRequest<SecurityDashboardMetrics>('/api/security/metrics'),
        apiRequest<SecuritySettings>('/api/security/settings')
      ]);

      setMetrics(metricsRes);
      setSettings(settingsRes);
      setEvents(metricsRes.recentEvents || []);

      if (activeTab === 'waf') {
        const ips = await apiRequest<BlockedIp[]>('/api/security/blocked-ips');
        setBlockedIps(ips || []);
      } else if (activeTab === 'sessions') {
        const ses = await apiRequest<UserSession[]>('/api/security/sessions');
        setSessions(ses || []);
      } else if (activeTab === 'backups') {
        const bks = await apiRequest<DatabaseBackup[]>('/api/security/backups');
        setBackups(bks || []);
      }
    } catch (err: any) {
      console.error('Failed to load security center data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadAllSecurityData();
  };

  // --- WAF Actions ---
  const handleToggleWaf = async () => {
    if (!settings) return;
    const newStatus = !settings.waf_enabled;
    try {
      const res = await apiRequest<{ settings: SecuritySettings }>('/api/security/settings', {
        method: 'PUT',
        body: JSON.stringify({ waf_enabled: newStatus })
      });
      setSettings(res.settings);
      handleRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to update WAF status');
    }
  };

  const handleManualBlockIp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blockIpAddress.trim()) return;

    try {
      await apiRequest('/api/security/blocked-ips', {
        method: 'POST',
        body: JSON.stringify({
          ipAddress: blockIpAddress.trim(),
          reason: blockReason.trim(),
          isPermanent: blockIsPermanent,
          durationMinutes: blockIsPermanent ? undefined : Number(blockDurationMinutes)
        })
      });
      setBlockIpModalOpen(false);
      setBlockIpAddress('');
      handleRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to block IP');
    }
  };

  const handleUnblockIp = async (ip: string) => {
    if (!confirm(`Are you sure you want to remove ${ip} from the firewall blocklist?`)) return;
    try {
      await apiRequest(`/api/security/blocked-ips/${encodeURIComponent(ip)}`, {
        method: 'DELETE'
      });
      handleRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to unblock IP');
    }
  };

  const handleSimulateThreat = async (attackType: 'sqli' | 'xss' | 'rate_limit' | 'path_traversal') => {
    setSimulating(true);
    setSimulationResult(null);
    try {
      const res = await apiRequest('/api/security/simulate-threat', {
        method: 'POST',
        body: JSON.stringify({ attackType })
      });
      setSimulationResult(res);
      handleRefresh();
    } catch (err: any) {
      alert(err.message || 'Simulation test failed');
    } finally {
      setSimulating(false);
    }
  };

  // --- Session Actions ---
  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to terminate this user session immediately?')) return;
    try {
      await apiRequest(`/api/security/sessions/${sessionId}`, { method: 'DELETE' });
      const ses = await apiRequest<UserSession[]>('/api/security/sessions');
      setSessions(ses || []);
      handleRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to terminate session');
    }
  };

  // --- Backup Actions ---
  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await apiRequest<{ message: string; backup: DatabaseBackup }>('/api/security/backups', {
        method: 'POST',
        body: JSON.stringify({ notes: backupNotes.trim() || undefined })
      });
      alert(res.message);
      setBackupNotes('');
      const bks = await apiRequest<DatabaseBackup[]>('/api/security/backups');
      setBackups(bks || []);
      handleRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to create database backup');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleDownloadBackup = (backupId: string, filename: string) => {
    const token = localStorage.getItem('kodipay_auth_token');
    const downloadUrl = `/api/security/backups/${backupId}/download`;
    
    // Fetch with auth and trigger download
    fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch((err) => alert('Download failed: ' + err.message));
  };

  const handleRestoreBackup = async () => {
    if (!restoreModalBackup) return;
    setRestoring(true);
    try {
      const res = await apiRequest<{ message: string }>(`/api/security/backups/${restoreModalBackup.id}/restore`, {
        method: 'POST'
      });
      alert(res.message);
      setRestoreModalBackup(null);
      handleRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to restore database from backup');
    } finally {
      setRestoring(false);
    }
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!confirm('Are you sure you want to delete this backup archive snapshot? This cannot be undone.')) return;
    try {
      await apiRequest(`/api/security/backups/${backupId}`, { method: 'DELETE' });
      const bks = await apiRequest<DatabaseBackup[]>('/api/security/backups');
      setBackups(bks || []);
      handleRefresh();
    } catch (err: any) {
      alert(err.message || 'Failed to delete backup');
    }
  };

  // --- Settings Actions ---
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSavingSettings(true);
    setSaveSuccessMsg(null);
    try {
      const res = await apiRequest<{ message: string; settings: SecuritySettings }>('/api/security/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
      });
      setSettings(res.settings);
      setSaveSuccessMsg('Security policies and firewall configurations successfully updated.');
      handleRefresh();
      setTimeout(() => setSaveSuccessMsg(null), 4000);
    } catch (err: any) {
      alert(err.message || 'Failed to update security settings');
    } finally {
      setSavingSettings(false);
    }
  };

  const filteredEvents = events.filter((ev) => {
    if (selectedSeverity && ev.severity !== selectedSeverity) return false;
    return true;
  });

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-sm border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-blue-400 animate-pulse" />
                <span>Super Administrator Security Center</span>
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                settings?.waf_enabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}>
                {settings?.waf_enabled ? 'WAF ACTIVE' : 'WAF DISABLED'}
              </span>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <Shield className="w-6 h-6 text-blue-400" />
              <span>Web Application Firewall & Security Center</span>
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              Industrial-grade protection against SQL injection, XSS, CSRF, and DDoS brute-force attacks with real-time threat neutralization, active session monitoring, and disaster recovery.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 transition-colors"
              title="Refresh security metrics"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleToggleWaf}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all shadow-xs flex items-center gap-1.5 ${
                settings?.waf_enabled
                  ? 'bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-900/50'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>{settings?.waf_enabled ? 'Disable WAF' : 'Activate WAF'}</span>
            </button>
          </div>
        </div>

        {/* Posture Score & Real-Time KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 pt-5 text-xs">
          {/* Posture Score */}
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Security Posture
            </span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xl font-black text-emerald-400">
                {metrics?.postureScore ?? 96}/100
              </span>
              <span className="text-[10px] font-bold text-slate-300">
                {metrics?.postureRating || 'A+ Optimal'}
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all"
                style={{ width: `${metrics?.postureScore ?? 96}%` }}
              />
            </div>
          </div>

          {/* Blocked Threats */}
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Threats Neutralized
            </span>
            <div className="font-mono text-2xl font-bold text-white">
              {metrics?.stats.totalThreatsRecorded || 0}
            </div>
            <span className="text-[10px] text-emerald-400 font-medium block mt-1">
              +{metrics?.stats.threats24h || 0} in last 24h
            </span>
          </div>

          {/* Blocked IPs */}
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Firewall Blocked IPs
            </span>
            <div className="font-mono text-2xl font-bold text-rose-400">
              {metrics?.stats.activeBlockedIps || 0}
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">
              Auto-ban threshold: {settings?.auto_block_strike_threshold || 3} strikes
            </span>
          </div>

          {/* Active Sessions */}
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Active Sessions
            </span>
            <div className="font-mono text-2xl font-bold text-blue-400">
              {metrics?.stats.activeUserSessions || 1}
            </div>
            <span className="text-[10px] text-slate-400 block mt-1">
              Timeout: {settings?.session_inactivity_timeout_minutes || 30} mins
            </span>
          </div>

          {/* Disaster Recovery Backups */}
          <div className="bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80 col-span-2 lg:col-span-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Database Snapshots
            </span>
            <div className="font-mono text-2xl font-bold text-indigo-300">
              {metrics?.stats.totalDatabaseBackups || 0}
            </div>
            <span className="text-[10px] text-slate-400 block mt-1 truncate">
              {metrics?.stats.lastBackupAt ? formatDate(metrics.stats.lastBackupAt) : 'Ready to create'}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 space-x-2 text-xs font-bold">
        <button
          onClick={() => setActiveTab('waf')}
          className={`pb-3 px-3 transition-colors flex items-center gap-1.5 border-b-2 ${
            activeTab === 'waf'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>WAF & Live Threat Monitor</span>
          {events.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700 text-[10px]">
              {events.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('sessions')}
          className={`pb-3 px-3 transition-colors flex items-center gap-1.5 border-b-2 ${
            activeTab === 'sessions'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Active Sessions & Devices</span>
        </button>

        <button
          onClick={() => setActiveTab('backups')}
          className={`pb-3 px-3 transition-colors flex items-center gap-1.5 border-b-2 ${
            activeTab === 'backups'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Database Backups & Disaster Recovery</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`pb-3 px-3 transition-colors flex items-center gap-1.5 border-b-2 ${
            activeTab === 'settings'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Protection Policies & Settings</span>
        </button>
      </div>

      {/* =====================================================================
          TAB 1: WAF & LIVE THREAT MONITOR
          ===================================================================== */}
      {activeTab === 'waf' && (
        <div className="space-y-6">
          {/* Interactive Threat Simulation Test Bar */}
          <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-600/30 border border-blue-500/40 rounded-lg text-blue-300">
                <Terminal className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-xs text-white block">
                  Interactive WAF Live Threat Simulator
                </span>
                <span className="text-[11px] text-slate-400">
                  Execute safe, sandboxed attack vectors to verify that the firewall intercepts, neutralizes, and records payloads in real time.
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleSimulateThreat('sqli')}
                disabled={simulating}
                className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors flex items-center gap-1"
              >
                <Play className="w-3 h-3 text-amber-400" />
                <span>Test SQLi</span>
              </button>
              <button
                type="button"
                onClick={() => handleSimulateThreat('xss')}
                disabled={simulating}
                className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors flex items-center gap-1"
              >
                <Play className="w-3 h-3 text-indigo-400" />
                <span>Test XSS</span>
              </button>
              <button
                type="button"
                onClick={() => handleSimulateThreat('path_traversal')}
                disabled={simulating}
                className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors flex items-center gap-1"
              >
                <Play className="w-3 h-3 text-rose-400" />
                <span>Test Path Probe</span>
              </button>
              <button
                type="button"
                onClick={() => handleSimulateThreat('rate_limit')}
                disabled={simulating}
                className="px-2.5 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition-colors flex items-center gap-1"
              >
                <Play className="w-3 h-3 text-emerald-400" />
                <span>Test DDoS Burst</span>
              </button>
            </div>
          </div>

          {/* Simulation Feedback Alert */}
          {simulationResult && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-start justify-between gap-3 animate-in fade-in">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">{simulationResult.message}</span>
                  <span className="font-mono text-[11px] text-emerald-800 block mt-0.5">
                    Payload: {simulationResult.signatureMatched}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSimulationResult(null)}
                className="text-emerald-700 hover:text-emerald-950 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 2-Column: Live Security Events Stream & Firewall Blocked IPs */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Security Event Feed */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-600" />
                    <span>Real-Time Threat Detection Log</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">Live stream of intercepted and neutralized attacks</p>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={selectedSeverity}
                    onChange={(e) => setSelectedSeverity(e.target.value)}
                    className="h-8 px-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Attack / Vector</th>
                      <th className="py-2.5 px-3">Severity</th>
                      <th className="py-2.5 px-3">Source IP</th>
                      <th className="py-2.5 px-3">Target Endpoint</th>
                      <th className="py-2.5 px-3">Action</th>
                      <th className="py-2.5 px-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEvents.length > 0 ? (
                      filteredEvents.map((ev) => (
                        <tr key={ev.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">
                            <span className="capitalize block">{ev.event_type.replace(/_/g, ' ')}</span>
                            <span className="font-mono text-[10px] text-slate-400">
                              {new Date(ev.created_at).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi' })} EAT
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                ev.severity === 'critical'
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                  : ev.severity === 'high'
                                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                  : 'bg-blue-100 text-blue-800'
                              }`}
                            >
                              {ev.severity}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">{ev.ip_address}</td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 truncate max-w-[140px]" title={ev.endpoint}>
                            {ev.request_method} {ev.endpoint}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-bold text-[10px] uppercase text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              {ev.action_taken}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setInspectEvent(ev)}
                              className="px-2 py-1 text-[11px] font-semibold text-blue-600 hover:underline"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          No threat events recorded in this filter. System is operating normally.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Column: Blocked IPs Management */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
                <div>
                  <h3 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-rose-600" />
                    <span>Firewall Blocklist ({blockedIps.length})</span>
                  </h3>
                  <p className="text-[11px] text-slate-500">Auto-banned and manual IP blocks</p>
                </div>
                <button
                  type="button"
                  onClick={() => setBlockIpModalOpen(true)}
                  className="px-2.5 py-1 text-xs font-bold bg-rose-700 hover:bg-rose-600 text-white rounded-lg transition-colors flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Block IP</span>
                </button>
              </div>

              <div className="flex-1 divide-y divide-slate-100 overflow-y-auto max-h-[420px]">
                {blockedIps.length > 0 ? (
                  blockedIps.map((b) => (
                    <div key={b.id} className="p-3 hover:bg-slate-50 transition-colors text-xs flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">{b.ip_address}</span>
                          <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-bold">
                            {b.is_permanent ? 'Permanent' : 'Temporary'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-1" title={b.reason}>
                          {b.reason}
                        </p>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          Strikes: {b.strike_count} · Blocked: {formatDate(b.created_at)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnblockIp(b.ip_address)}
                        className="text-xs font-semibold text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 p-1.5 rounded transition-colors shrink-0"
                        title="Unblock IP"
                      >
                        Unblock
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No IPs currently blocked. Any suspicious repeated attack will be automatically added here.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: ACTIVE SESSIONS & DEVICE SECURITY
          ===================================================================== */}
      {activeTab === 'sessions' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div>
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-blue-600" />
                <span>Active User Sessions & Device Authorization</span>
              </h3>
              <p className="text-xs text-slate-500">
                Real-time sessions authenticated with JWT. Super Admins can terminate any session instantly.
              </p>
            </div>
            <button
              onClick={handleRefresh}
              className="px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-300 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Sessions</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">User / Account</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Device & Browser</th>
                  <th className="py-3 px-4">IP Address</th>
                  <th className="py-3 px-4">Last Activity</th>
                  <th className="py-3 px-4">Login Time</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.length > 0 ? (
                  sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-900 block">{s.full_name || 'User'}</span>
                        <span className="font-mono text-[11px] text-slate-500">{s.email}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-slate-800 capitalize">
                          {s.role?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        <div className="flex items-center gap-1.5">
                          {s.device_name?.includes('Mobile') ? (
                            <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                          ) : (
                            <Laptop className="w-3.5 h-3.5 text-slate-400" />
                          )}
                          <span>{s.device_name || 'Browser'}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{s.ip_address}</td>
                      <td className="py-3 px-4 font-mono text-slate-700 font-semibold">
                        {new Date(s.last_activity_at).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi' })} EAT
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500">
                        {formatDate(s.created_at)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleRevokeSession(s.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
                        >
                          Terminate
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">
                      No active sessions detected.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: DATABASE BACKUPS & DISASTER RECOVERY
          ===================================================================== */}
      {activeTab === 'backups' && (
        <div className="space-y-6">
          {/* Create Backup Bar */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-50 text-blue-700 rounded-xl">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">Database Snapshot & Disaster Recovery</h3>
                <p className="text-xs text-slate-500">
                  Full cryptographic JSON archive containing properties, units, tenants, billing records, and payment receipts with SHA256 verification.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Optional backup note (e.g. Pre-billing cycle snapshot)"
                value={backupNotes}
                onChange={(e) => setBackupNotes(e.target.value)}
                className="h-9 px-3 border border-slate-300 rounded-lg text-xs w-64 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button
                type="button"
                onClick={handleCreateBackup}
                disabled={creatingBackup}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-xs disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{creatingBackup ? 'Creating Snapshot...' : 'Create Backup Snapshot'}</span>
              </button>
            </div>
          </div>

          {/* Backups Archive Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200">
              <h4 className="font-bold text-sm text-slate-900">
                Stored Recovery Archives ({backups.length})
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Archive Filename</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-4">Records Count</th>
                    <th className="py-3 px-4">SHA-256 Checksum</th>
                    <th className="py-3 px-4">Created Date</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {backups.length > 0 ? (
                    backups.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-mono font-bold text-slate-900 block">{b.filename}</span>
                          {b.notes && <span className="text-[11px] text-slate-500">{b.notes}</span>}
                        </td>
                        <td className="py-3 px-4">
                          <span className="capitalize px-2 py-0.5 rounded font-semibold text-[10px] bg-slate-100 text-slate-700">
                            {b.backup_type}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-700">
                          {(b.size_bytes / 1024).toFixed(1)} KB
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-blue-900">
                          {b.records_count} rows
                        </td>
                        <td className="py-3 px-4 font-mono text-[10px] text-slate-400 truncate max-w-[140px]" title={b.checksum_sha256}>
                          {b.checksum_sha256.slice(0, 16)}...
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {formatDate(b.created_at)}
                        </td>
                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => handleDownloadBackup(b.id, b.filename)}
                            className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded border border-slate-300 transition-colors inline-flex items-center gap-1"
                            title="Download JSON Snapshot"
                          >
                            <Download className="w-3 h-3 text-blue-600" />
                            <span>Download</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setRestoreModalBackup(b)}
                            className="px-2.5 py-1 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 rounded border border-amber-300 transition-colors inline-flex items-center gap-1"
                            title="Restore Database from Snapshot"
                          >
                            <RotateCcw className="w-3 h-3 text-amber-600" />
                            <span>Restore</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBackup(b.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors inline-flex items-center"
                            title="Delete Snapshot"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-400">
                        No backup snapshots created yet. Click "Create Backup Snapshot" to create the first recovery archive.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: SECURITY & PROTECTION POLICIES
          ===================================================================== */}
      {activeTab === 'settings' && settings && (
        <form onSubmit={handleSaveSettings} className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-blue-600" />
                <span>Firewall & Security Protection Policies</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure real WAF rules, DDoS rate limiting, session inactivity timeout, and brute force controls.
              </p>
            </div>
            <button
              type="submit"
              disabled={savingSettings}
              className="px-5 py-2 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <FileCheck2 className="w-4 h-4" />
              <span>{savingSettings ? 'Saving Policies...' : 'Save Security Policies'}</span>
            </button>
          </div>

          {saveSuccessMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          {/* Grid of Protection Modules */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* WAF Master Switch */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start justify-between gap-4">
              <div>
                <span className="font-bold text-xs text-slate-900 block">Web Application Firewall (WAF) Master Shield</span>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Deep packet inspection on all HTTP queries, JSON payloads, and headers to block malicious intrusion vectors.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.waf_enabled}
                onChange={(e) => setSettings({ ...settings, waf_enabled: e.target.checked })}
                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {/* SQL Injection Shield */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start justify-between gap-4">
              <div>
                <span className="font-bold text-xs text-slate-900 block">SQL Injection (SQLi) Defense Engine</span>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Inspects parameters for UNION SELECT, boolean tautologies (OR 1=1), stacked queries, and database fingerprinting.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.sqli_protection}
                onChange={(e) => setSettings({ ...settings, sqli_protection: e.target.checked })}
                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {/* XSS Filter */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start justify-between gap-4">
              <div>
                <span className="font-bold text-xs text-slate-900 block">Cross-Site Scripting (XSS) Filter</span>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Neutralizes malicious script tags, event handler injections (onerror, onload), and iframe embeds.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.xss_protection}
                onChange={(e) => setSettings({ ...settings, xss_protection: e.target.checked })}
                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {/* CSRF Guard */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex items-start justify-between gap-4">
              <div>
                <span className="font-bold text-xs text-slate-900 block">CSRF Token & Origin Verification</span>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Verifies secure origin headers and authorization tokens on mutating POST, PUT, and DELETE operations.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.csrf_protection}
                onChange={(e) => setSettings({ ...settings, csrf_protection: e.target.checked })}
                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>

            {/* Rate Limiting / DDoS */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900">DDoS Rate Limiting Engine</span>
                <input
                  type="checkbox"
                  checked={settings.rate_limiting_enabled}
                  onChange={(e) => setSettings({ ...settings, rate_limiting_enabled: e.target.checked })}
                  className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 font-semibold mb-1">
                  Max Requests per Minute per IP: <span className="font-mono text-blue-700">{settings.rate_limit_max_requests_per_minute} req/min</span>
                </label>
                <input
                  type="range"
                  min="20"
                  max="300"
                  step="10"
                  value={settings.rate_limit_max_requests_per_minute}
                  onChange={(e) => setSettings({ ...settings, rate_limit_max_requests_per_minute: Number(e.target.value) })}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>
            </div>

            {/* Brute-Force Login Limits */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
              <span className="font-bold text-xs text-slate-900 block">Brute-Force Login Attempt Limiter</span>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-600 font-semibold mb-1">Max Failed Attempts:</label>
                  <input
                    type="number"
                    min="3"
                    max="15"
                    value={settings.login_brute_force_max_attempts}
                    onChange={(e) => setSettings({ ...settings, login_brute_force_max_attempts: Number(e.target.value) })}
                    className="w-full h-8 px-2 border border-slate-300 rounded font-mono bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 font-semibold mb-1">Lockout Duration (Mins):</label>
                  <input
                    type="number"
                    min="5"
                    max="120"
                    value={settings.login_lockout_duration_minutes}
                    onChange={(e) => setSettings({ ...settings, login_lockout_duration_minutes: Number(e.target.value) })}
                    className="w-full h-8 px-2 border border-slate-300 rounded font-mono bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Inactivity Session Timeout */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
              <span className="font-bold text-xs text-slate-900 block">Session Inactivity Automatic Logout</span>
              <div>
                <label className="block text-[11px] text-slate-600 font-semibold mb-1">
                  Idle Timeout: <span className="font-mono text-blue-700 font-bold">{settings.session_inactivity_timeout_minutes} Minutes</span>
                </label>
                <input
                  type="range"
                  min="5"
                  max="120"
                  step="5"
                  value={settings.session_inactivity_timeout_minutes}
                  onChange={(e) => setSettings({ ...settings, session_inactivity_timeout_minutes: Number(e.target.value) })}
                  className="w-full accent-blue-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400 block mt-1">
                  Users inactive for this duration will be alerted with a countdown and logged out automatically.
                </span>
              </div>
            </div>

            {/* Auto IP Ban on Strikes */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-900">Auto-Ban Suspicious IPs</span>
                <input
                  type="checkbox"
                  checked={settings.auto_block_suspicious_ips}
                  onChange={(e) => setSettings({ ...settings, auto_block_suspicious_ips: e.target.checked })}
                  className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 font-semibold mb-1">
                  Strike Threshold: <span className="font-mono text-rose-700 font-bold">{settings.auto_block_strike_threshold} violations</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={settings.auto_block_strike_threshold}
                  onChange={(e) => setSettings({ ...settings, auto_block_strike_threshold: Number(e.target.value) })}
                  className="w-full accent-rose-600 cursor-pointer"
                />
                <span className="text-[10px] text-slate-400 block mt-1">
                  IPs executing repeated SQLi/XSS/Brute-force attempts will be automatically blacklisted.
                </span>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* --- MODALS --- */}

      {/* Manual Block IP Modal */}
      {blockIpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-950 px-6 py-4 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 text-rose-400" />
                <span>Add IP to Firewall Blocklist</span>
              </h3>
              <button onClick={() => setBlockIpModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleManualBlockIp} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">IP Address *</label>
                <input
                  type="text"
                  placeholder="e.g. 197.232.88.14"
                  value={blockIpAddress}
                  onChange={(e) => setBlockIpAddress(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-rose-600"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Block Justification / Reason *</label>
                <input
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-600"
                  required
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="permBlock"
                  checked={blockIsPermanent}
                  onChange={(e) => setBlockIsPermanent(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500"
                />
                <label htmlFor="permBlock" className="font-semibold text-slate-700 cursor-pointer">
                  Permanent Ban (Do not expire)
                </label>
              </div>

              {!blockIsPermanent && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Block Duration (Minutes):</label>
                  <input
                    type="number"
                    min="5"
                    max="10080"
                    value={blockDurationMinutes}
                    onChange={(e) => setBlockDurationMinutes(Number(e.target.value))}
                    className="w-full h-9 px-3 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBlockIpModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold bg-rose-700 hover:bg-rose-600 text-white rounded-lg transition-colors"
                >
                  Confirm Block
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inspect Event Modal */}
      {inspectEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-slate-950 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-sm">Security Incident Payload Inspector</h3>
              </div>
              <button onClick={() => setInspectEvent(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 pb-2 border-b border-slate-100">
                <div>
                  <span className="text-slate-400 block font-semibold">Incident Type:</span>
                  <span className="font-bold text-slate-900 capitalize">{inspectEvent.event_type.replace(/_/g, ' ')}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Severity:</span>
                  <span className="font-bold uppercase text-rose-700">{inspectEvent.severity}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Source IP:</span>
                  <span className="font-mono text-slate-800">{inspectEvent.ip_address}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Action Taken:</span>
                  <span className="font-bold text-emerald-700 uppercase">{inspectEvent.action_taken}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-500 font-semibold block mb-1">Target Endpoint:</span>
                <div className="p-2 bg-slate-50 border border-slate-200 rounded font-mono text-[11px] text-slate-800">
                  {inspectEvent.request_method} {inspectEvent.endpoint}
                </div>
              </div>

              <div>
                <span className="text-slate-500 font-semibold block mb-1">Intercepted Attack Payload:</span>
                <div className="p-3 bg-slate-900 text-rose-300 border border-slate-800 rounded font-mono text-[11px] break-all max-h-48 overflow-y-auto">
                  {inspectEvent.payload_sample || 'No payload body available'}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setInspectEvent(null)}
                  className="px-4 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restore Database Modal */}
      {restoreModalBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-amber-300 overflow-hidden">
            <div className="bg-amber-950 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm">Confirm Database Recovery</h3>
              </div>
              <button onClick={() => setRestoreModalBackup(null)} className="text-amber-200 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 leading-relaxed">
                <span className="font-bold block mb-0.5">Critical Recovery Operation:</span>
                This will restore all tables, records, rent charges, and payment ledgers from the snapshot{' '}
                <span className="font-mono font-bold">{restoreModalBackup.filename}</span> ({restoreModalBackup.records_count} records).
                SHA256 checksum integrity verification will run prior to applying changes.
              </div>

              <div className="font-mono text-[11px] bg-slate-50 p-2.5 rounded border border-slate-200">
                Checksum: {restoreModalBackup.checksum_sha256}
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRestoreModalBackup(null)}
                  className="px-3 py-1.5 text-xs text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRestoreBackup}
                  disabled={restoring}
                  className="px-4 py-1.5 text-xs font-bold bg-amber-700 hover:bg-amber-600 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${restoring ? 'animate-spin' : ''}`} />
                  <span>{restoring ? 'Restoring Snapshot...' : 'Proceed with Recovery'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
