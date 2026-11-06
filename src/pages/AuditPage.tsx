/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatDate } from '../lib/api.ts';
import { History, RefreshCw, ShieldAlert } from 'lucide-react';

export const AuditPage: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<any[]>('/api/audit?limit=100');
      setLogs(res);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="font-bold text-base text-slate-900">System & Financial Audit Trail</h2>
          <p className="text-xs text-slate-500">Immutable chronological records of financial updates, payments, and administrative actions</p>
        </div>

        <button
          onClick={fetchLogs}
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Timestamp (EAT)</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Initiated By</th>
                <th className="py-3 px-4">Entity Type</th>
                <th className="py-3 px-4">Details / Changes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-600">
                    {new Date(l.created_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })}
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-blue-900">
                    {l.action}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-slate-900 block">{l.user_full_name || 'System / Unauthenticated'}</span>
                    <span className="text-[11px] text-slate-500">{l.user_email}</span>
                  </td>
                  <td className="py-3 px-4 capitalize font-medium text-slate-700">
                    {l.entity_type}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-600 max-w-xs truncate" title={JSON.stringify(l.changes)}>
                    {JSON.stringify(l.changes)}
                  </td>
                </tr>
              ))}

              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No audit records logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
