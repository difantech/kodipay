/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { Receipt } from '../types/index.ts';
import { formatKSh, formatDate } from '../lib/api.ts';
import { X, Printer, CheckCircle2, AlertTriangle, ShieldCheck, Download } from 'lucide-react';
import { exportReceiptPDF } from '../utils/pdfExport.ts';

interface ReceiptModalProps {
  receipt: Receipt | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  const receiptRef = useRef<HTMLDivElement>(null);

  if (!receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    exportReceiptPDF(receipt);
  };

  const isReversed = receipt.payment_status === 'reversed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto no-print">
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200 my-8">
        {/* Modal Actions Bar (hidden on print) */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white no-print">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-sm tracking-wide">Official Rent Payment Receipt</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors shadow-xs"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white rounded-md transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Paper Container */}
        <div ref={receiptRef} className="p-8 bg-white text-slate-900 print-card">
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-5 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">KodiPay Kenya</h1>
                <p className="text-xs text-slate-600 font-medium">Property & Rental Payment Management System</p>
                <p className="text-xs text-slate-500 mt-1">Nairobi, Kenya · Africa/Nairobi EAT</p>
              </div>
              <div className="text-right">
                <div className="inline-block px-2.5 py-1 bg-slate-100 rounded text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                  Official Receipt
                </div>
                <p className="font-mono text-sm font-semibold text-blue-900">{receipt.receipt_number}</p>
                <p className="text-xs text-slate-500 mt-0.5">Date: {formatDate(receipt.payment_date)}</p>
              </div>
            </div>
          </div>

          {/* Reversal Banner if reversed */}
          {isReversed && (
            <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-3 text-rose-800">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
              <div className="text-xs">
                <span className="font-bold">THIS PAYMENT WAS REVERSED</span>
                {receipt.reversal_reason && <p className="mt-0.5">Reason: {receipt.reversal_reason}</p>}
              </div>
            </div>
          )}

          {/* Receipt Details Grid */}
          <div className="grid grid-cols-2 gap-6 text-sm mb-6 pb-6 border-b border-slate-100">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">Received From</span>
              <p className="font-bold text-slate-900 text-base">{receipt.tenant_name}</p>
              {receipt.tenant_phone && <p className="text-xs text-slate-600 mt-0.5">Phone: {receipt.tenant_phone}</p>}
              {receipt.tenant_national_id && <p className="text-xs text-slate-600">National ID: {receipt.tenant_national_id}</p>}
            </div>

            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">Property & Unit</span>
              <p className="font-semibold text-slate-900">{receipt.property_name}</p>
              <p className="text-xs text-slate-600 mt-0.5">Unit: <span className="font-bold text-slate-900">{receipt.unit_number}</span> {receipt.unit_type && `· ${receipt.unit_type}`}</p>
              <p className="text-xs text-slate-500">{receipt.property_address}</p>
            </div>
          </div>

          {/* Payment Breakdown Table */}
          <table className="w-full text-left text-sm mb-6 border border-slate-200 rounded-lg overflow-hidden">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Description / Period Covered</th>
                <th className="py-2.5 px-4">Payment Method</th>
                <th className="py-2.5 px-4">Reference No.</th>
                <th className="py-2.5 px-4 text-right">Amount Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="py-3 px-4 font-medium text-slate-900">
                  Monthly Rent ({receipt.period_covered})
                </td>
                <td className="py-3 px-4 capitalize text-slate-700">
                  {receipt.payment_method === 'mpesa' ? 'M-Pesa Mobile' : receipt.payment_method.replace('_', ' ')}
                </td>
                <td className="py-3 px-4 font-mono text-xs text-slate-600">
                  {receipt.transaction_reference || receipt.payment_reference || 'N/A'}
                </td>
                <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 text-base tabular-nums">
                  {formatKSh(receipt.amount_cents)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Summary Totals */}
          <div className="flex justify-between items-end mb-8 pt-2">
            <div className="text-xs text-slate-500 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirmed & Verified in KodiPay Registry</span>
              </div>
              <p>Generated: {new Date(receipt.generated_at).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi' })} EAT</p>
              {receipt.issued_by_name && <p>Issued by: {receipt.issued_by_name}</p>}
            </div>

            <div className="w-64 bg-slate-50 p-4 rounded-lg border border-slate-200 text-right">
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>Amount Paid:</span>
                <span className="font-mono font-bold text-slate-900 tabular-nums">{formatKSh(receipt.amount_cents)}</span>
              </div>
              <div className="flex justify-between text-xs font-semibold pt-2 border-t border-slate-200">
                <span className="text-slate-700">Remaining Balance:</span>
                <span className={`font-mono tabular-nums ${receipt.remaining_balance_cents > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {formatKSh(receipt.remaining_balance_cents)}
                </span>
              </div>
            </div>
          </div>

          {/* Official Stamp & Signatory Box */}
          <div className="border-t border-dashed border-slate-300 pt-6 flex items-center justify-between text-xs text-slate-400">
            <div>
              <p className="font-semibold text-slate-600">Thank you for your prompt payment.</p>
              <p className="mt-0.5">This document serves as an official electronic receipt under Kenyan tenancy regulations.</p>
            </div>
            <div className="text-center w-40 border border-slate-300 rounded p-2">
              <div className="h-8 border-b border-slate-200 flex items-center justify-center text-[10px] text-slate-400 uppercase tracking-widest">
                Official Stamp
              </div>
              <span className="text-[10px] text-slate-500 font-mono mt-1 block">KodiPay Kenya</span>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex justify-end no-print">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
