/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatKSh } from '../lib/api.ts';
import { BarChart3, TrendingUp, Smartphone, Building2, Banknote, RefreshCw, Download } from 'lucide-react';
import { exportFinancialSummaryPDF } from '../utils/pdfExport.ts';

export const ReportsPage: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState('2026');

  useEffect(() => {
    fetchReports();
  }, [year]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/api/reports/summary?year=${year}`);
      setData(res);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = () => {
    if (!data) {
      alert('Report data is still loading');
      return;
    }
    exportFinancialSummaryPDF(data, year);
  };

  const totalCollectedAllMethods = data?.paymentMethodDistribution?.reduce(
    (acc: number, m: any) => acc + parseInt(m.total_amount_cents, 10),
    0
  ) || 0;

  return (
    <div className="space-y-6">
      {/* Top Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-base text-slate-900">Financial & Performance Analytics</h2>
          <p className="text-xs text-slate-500">Rental yield, channel collections, and property comparisons</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="h-9 px-3 border border-slate-300 rounded-lg text-xs font-semibold bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="2026">Year 2026</option>
            <option value="2025">Year 2025</option>
          </select>

          <button
            onClick={handleExportPDF}
            disabled={!data || loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg transition-colors shadow-xs"
            title="Download annual financial & performance summary as PDF"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Export Report (PDF)</span>
          </button>

          <button
            onClick={fetchReports}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Grid: Payment Channel Breakdown & Monthly Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Channels (M-Pesa vs Bank vs Cash) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-900">Collection by Channel</h3>
            <span className="text-xs text-slate-500 font-mono">
              Total: {formatKSh(totalCollectedAllMethods)}
            </span>
          </div>

          <div className="space-y-3">
            {data?.paymentMethodDistribution?.map((m: any) => {
              const amount = parseInt(m.total_amount_cents, 10);
              const pct = totalCollectedAllMethods > 0 ? Math.round((amount / totalCollectedAllMethods) * 100) : 0;
              return (
                <div key={m.payment_method} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="capitalize font-semibold text-slate-800">
                      {m.payment_method === 'mpesa' ? 'M-Pesa Express / Paybill' : m.payment_method.replace('_', ' ')}
                    </span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {formatKSh(amount)} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        m.payment_method === 'mpesa'
                          ? 'bg-emerald-500'
                          : m.payment_method === 'bank_transfer'
                          ? 'bg-blue-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 block text-right">
                    {m.transaction_count} confirmed transactions
                  </span>
                </div>
              );
            })}

            {(!data?.paymentMethodDistribution || data.paymentMethodDistribution.length === 0) && (
              <div className="py-8 text-center text-xs text-slate-400">
                No payment channel data recorded yet.
              </div>
            )}
          </div>
        </div>

        {/* Monthly Trend Table */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <h3 className="font-bold text-sm text-slate-900">Monthly Rent Revenue & Collection Trend ({year})</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Billing Month</th>
                  <th className="py-3 px-4">Expected Rent</th>
                  <th className="py-3 px-4">Collected</th>
                  <th className="py-3 px-4">Arrears / Balance</th>
                  <th className="py-3 px-4 text-right">Collection Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.monthlyTrend?.map((t: any) => {
                  const expected = parseInt(t.expected_cents, 10);
                  const collected = parseInt(t.collected_cents, 10);
                  const rate = expected > 0 ? Math.round((collected / expected) * 100) : 0;
                  return (
                    <tr key={t.billing_month} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-bold font-mono text-slate-900">{t.billing_month}</td>
                      <td className="py-3 px-4 font-mono tabular-nums">{formatKSh(expected)}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-emerald-700 font-semibold">{formatKSh(collected)}</td>
                      <td className="py-3 px-4 font-mono tabular-nums text-rose-700 font-semibold">{formatKSh(t.arrears_cents)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                        {rate}%
                      </td>
                    </tr>
                  );
                })}

                {(!data?.monthlyTrend || data.monthlyTrend.length === 0) && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No monthly billing records found for {year}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Property Performance Comparison */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h3 className="font-bold text-sm text-slate-900">Property Portfolio Performance</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Property</th>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Occupancy</th>
                <th className="py-3 px-4">Expected Rent</th>
                <th className="py-3 px-4">Collected Rent</th>
                <th className="py-3 px-4">Outstanding Arrears</th>
                <th className="py-3 px-4 text-right">Performance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.propertyPerformance?.map((p: any) => {
                const expected = parseInt(p.expected_cents, 10);
                const collected = parseInt(p.collected_cents, 10);
                const pct = expected > 0 ? Math.round((collected / expected) * 100) : 0;
                return (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-bold text-slate-900">{p.name}</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-700">{p.code}</td>
                    <td className="py-3 px-4">
                      {p.occupied_units || 0} / {p.total_units || 0} units
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">{formatKSh(expected)}</td>
                    <td className="py-3 px-4 font-mono text-emerald-700 font-semibold tabular-nums">{formatKSh(collected)}</td>
                    <td className="py-3 px-4 font-mono text-rose-700 font-semibold tabular-nums">{formatKSh(p.balance_cents)}</td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 tabular-nums">
                      {pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
