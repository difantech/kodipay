/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatKSh, formatDate } from '../lib/api.ts';
import { Receipt } from '../types/index.ts';
import { FileCheck, Search, Printer, RefreshCw, Download, FileSpreadsheet } from 'lucide-react';
import { exportReceiptPDF, exportPaymentsStatementPDF } from '../utils/pdfExport.ts';

interface ReceiptsPageProps {
  onViewReceipt: (receiptId: string) => void;
}

export const ReceiptsPage: React.FC<ReceiptsPageProps> = ({ onViewReceipt }) => {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchReceipts();
  }, []);

  const fetchReceipts = async () => {
    setLoading(true);
    try {
      const url = search ? `/api/receipts?search=${encodeURIComponent(search)}` : '/api/receipts';
      const res = await apiRequest<Receipt[]>(url);
      setReceipts(res);
    } catch (err) {
      console.error('Failed to load receipts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReceipts();
  };

  const handleExportAllPDF = () => {
    if (receipts.length === 0) return;
    // Map receipts to payment statement format
    const fakePayments: any[] = receipts.map(r => ({
      payment_reference: r.receipt_number,
      tenant_name: r.tenant_name,
      property_name: r.property_name,
      unit_number: r.unit_number,
      payment_method: r.payment_method,
      transaction_reference: r.transaction_reference,
      payment_date: r.payment_date,
      amount_cents: r.amount_cents,
      receipt_number: r.receipt_number,
      status: r.payment_status || 'confirmed'
    }));
    exportPaymentsStatementPDF(fakePayments, search ? `Receipts (${search})` : 'All Official Receipts');
  };

  return (
    <div className="space-y-6">
      {/* Header and Search Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by receipt number, tenant, or M-Pesa reference..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-300 transition-colors"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-2">
          {receipts.length > 0 && (
            <button
              onClick={handleExportAllPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors shadow-xs"
              title="Export all visible receipts to PDF ledger"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Export Ledger (PDF)</span>
            </button>
          )}

          <button
            onClick={fetchReceipts}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Receipts Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-4">Tenant Name</th>
                <th className="py-3 px-4">Property & Unit</th>
                <th className="py-3 px-4">Amount Paid</th>
                <th className="py-3 px-4">Method & Reference</th>
                <th className="py-3 px-4">Period Covered</th>
                <th className="py-3 px-4">Payment Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {receipts.length > 0 ? (
                receipts.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => onViewReceipt(r.id)}
                    className="hover:bg-slate-50/70 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-blue-900">
                      {r.receipt_number}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 block">{r.tenant_name}</span>
                      <span className="text-[11px] text-slate-500 font-mono">{r.tenant_phone}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-900">{r.property_name}</span>
                      <span className="text-[11px] text-slate-500 block">Unit {r.unit_number}</span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-700 tabular-nums text-sm">
                      {formatKSh(r.amount_cents)}
                    </td>
                    <td className="py-3 px-4">
                      <span className="capitalize font-medium text-slate-800">
                        {r.payment_method === 'mpesa' ? 'M-Pesa Mobile' : r.payment_method.replace('_', ' ')}
                      </span>
                      {r.transaction_reference && (
                        <span className="block font-mono text-[11px] text-slate-600">
                          {r.transaction_reference}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700">{r.period_covered}</td>
                    <td className="py-3 px-4 text-slate-600 font-mono">{formatDate(r.payment_date)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => exportReceiptPDF(r)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded border border-emerald-200 transition-colors"
                          title="Download official PDF receipt"
                        >
                          <Download className="w-3 h-3 text-emerald-700" />
                          <span>PDF</span>
                        </button>
                        <button
                          onClick={() => onViewReceipt(r.id)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 transition-colors"
                          title="Preview & Print Receipt"
                        >
                          <Printer className="w-3 h-3" />
                          <span>View</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No receipts found matching criteria.
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
