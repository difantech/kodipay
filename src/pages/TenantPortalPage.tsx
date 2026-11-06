/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatKSh, formatDate, formatMonth } from '../lib/api.ts';
import { Building2, ReceiptText, FileCheck, Phone, Check, AlertCircle, Printer, RefreshCw, Download, RotateCcw } from 'lucide-react';
import { exportTenantStatementPDF, exportReceiptPDF } from '../utils/pdfExport.ts';
import { RequestRefundModal } from '../components/RequestRefundModal.tsx';

interface TenantPortalPageProps {
  onViewReceipt: (receiptId: string) => void;
  subTab?: string;
}

export const TenantPortalPage: React.FC<TenantPortalPageProps> = ({ onViewReceipt, subTab = 'tenant-overview' }) => {
  const [overview, setOverview] = useState<any>(null);
  const [statement, setStatement] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refundModalOpen, setRefundModalOpen] = useState(false);

  // Contact update form
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  useEffect(() => {
    fetchTenantData();
  }, []);

  const fetchTenantData = async () => {
    setLoading(true);
    try {
      const [ovRes, stRes, pyRes] = await Promise.all([
        apiRequest('/api/tenant-portal/overview'),
        apiRequest('/api/tenant-portal/statement'),
        apiRequest('/api/tenant-portal/payments')
      ]);

      setOverview(ovRes);
      setStatement(stRes);
      setPayments(pyRes);

      if (ovRes.profile) {
        setPhone(ovRes.profile.phone_number || '');
        setEmail(ovRes.profile.email || '');
        setEmergencyName(ovRes.profile.emergency_contact_name || '');
        setEmergencyPhone(ovRes.profile.emergency_contact_phone || '');
      }
    } catch (err) {
      console.error('Failed to load tenant portal data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingContact(true);
    setContactSuccess(false);
    setContactError(null);
    try {
      await apiRequest('/api/tenant-portal/contact-info', {
        method: 'PUT',
        body: JSON.stringify({
          phoneNumber: phone.trim(),
          email: email.trim().toLowerCase(),
          emergencyContactName: emergencyName.trim(),
          emergencyContactPhone: emergencyPhone.trim()
        })
      });
      setContactSuccess(true);
      fetchTenantData();
    } catch (err: any) {
      setContactError(err.message || 'Failed to update contact info');
    } finally {
      setSavingContact(false);
    }
  };

  const profile = overview?.profile;
  const financials = overview?.financials;

  const handleExportStatement = () => {
    if (!profile) {
      alert('Tenant profile is still loading');
      return;
    }
    exportTenantStatementPDF({
      tenant: profile,
      statement,
      payments,
      financials
    });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Welcome Banner */}
      <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono text-blue-400 uppercase tracking-wider block">
            Tenant Self-Service Portal
          </span>
          <h2 className="text-xl font-bold mt-1">
            Welcome back, {profile?.tenant_name || 'Resident'}
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            {profile?.property_name ? `${profile.property_name} · Unit ${profile.unit_number}` : 'No active unit linked'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportStatement}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-xs"
            title="Download full official statement of account as PDF"
          >
            <Download className="w-4 h-4" />
            <span>Download Statement (PDF)</span>
          </button>

          <button
            onClick={fetchTenantData}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
            Monthly Rent Due
          </span>
          <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {formatKSh(profile?.rent_amount_cents || 0)}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">
            Due every {profile?.rent_due_day || 5}th of the month
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
            Current Outstanding Balance
          </span>
          <div
            className={`font-mono text-2xl font-bold tabular-nums mt-1 ${
              (financials?.totalArrearsCents || 0) > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {formatKSh(financials?.totalArrearsCents || 0)}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">
            {(financials?.totalArrearsCents || 0) > 0 ? 'Please settle via M-Pesa' : 'All rent charges cleared!'}
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-purple-200 shadow-xs bg-purple-50/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-purple-900 tracking-wider">
              Excess Credit Balance
            </span>
            {(financials?.creditBalanceCents || 0) > 0 && (
              <button
                onClick={() => setRefundModalOpen(true)}
                className="text-[10px] font-bold text-purple-700 hover:text-purple-900 bg-purple-100 hover:bg-purple-200 px-2 py-0.5 rounded transition-colors flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Request Refund</span>
              </button>
            )}
          </div>
          <div className="font-mono text-2xl font-bold text-purple-950 tabular-nums mt-1">
            {formatKSh(financials?.creditBalanceCents || 0)}
          </div>
          <span className="text-xs text-purple-700 mt-1 block">
            {(financials?.creditBalanceCents || 0) > 0
              ? 'Carried forward to next rent bill'
              : 'Overpayments automatically credited'}
          </span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold uppercase text-slate-500 tracking-wider">
            Security Deposit on File
          </span>
          <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-1">
            {formatKSh(profile?.deposit_cents || 0)}
          </div>
          <span className="text-xs text-slate-500 mt-1 block">
            Held in escrow by management
          </span>
        </div>
      </div>

      {/* Main Tab Views */}
      {subTab === 'tenant-overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Unit Details */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="font-bold text-sm text-slate-900 pb-2 border-b border-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>Assigned Rental Residence</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Property:</span>
                <span className="font-bold text-slate-900">{profile?.property_name || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Unit Number:</span>
                <span className="font-bold text-slate-900">{profile?.unit_number || '—'} ({profile?.unit_type || 'Residential'})</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Property Address:</span>
                <span className="text-slate-800 text-right">{profile?.property_address || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Tenancy Start Date:</span>
                <span className="font-mono text-slate-800">{formatDate(profile?.start_date)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Tenancy Status:</span>
                <span className="font-bold uppercase text-emerald-700">{profile?.tenancy_status || 'Active'}</span>
              </div>
            </div>
          </div>

          {/* Payment Instructions & Safaricom Paybill Guide */}
          <div className="bg-emerald-50/60 border border-emerald-200 p-6 rounded-xl space-y-3">
            <h3 className="font-bold text-sm text-emerald-900 flex items-center gap-2">
              <Phone className="w-4 h-4 text-emerald-700" />
              <span>Rent Payment via Safaricom M-Pesa</span>
            </h3>
            <p className="text-xs text-emerald-800 leading-relaxed">
              You can pay your rent directly from your M-Pesa menu. Once sent, provide the 10-character transaction confirmation code to management to automatically generate your official stamped receipt.
            </p>
            <div className="bg-white p-3.5 rounded-lg border border-emerald-200 text-xs font-mono space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Paybill Number:</span>
                <span className="font-bold text-slate-900">400200</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Account Number:</span>
                <span className="font-bold text-slate-900">{profile?.property_code}-{profile?.unit_number}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rent Statement View */}
      {(subTab === 'tenant-statement' || subTab === 'tenant-overview') && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900">Monthly Rent Statement & Invoices</h3>
            <button
              onClick={handleExportStatement}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg border border-slate-300 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              <span>Export Statement (PDF)</span>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Billing Month</th>
                  <th className="py-3 px-4">Rent Due</th>
                  <th className="py-3 px-4">Amount Paid</th>
                  <th className="py-3 px-4">Remaining Balance</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {statement.length > 0 ? (
                  statement.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{c.billing_month}</td>
                      <td className="py-3 px-4 font-mono tabular-nums">{formatKSh(c.rent_due_cents)}</td>
                      <td className="py-3 px-4 font-mono text-emerald-700 font-semibold tabular-nums">{formatKSh(c.amount_paid_cents)}</td>
                      <td className="py-3 px-4 font-mono font-bold tabular-nums">
                        <span className={c.balance_cents > 0 ? 'text-rose-700' : 'text-slate-900'}>
                          {formatKSh(c.balance_cents)}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">{formatDate(c.due_date)}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider ${
                            c.status === 'paid'
                              ? 'text-emerald-700'
                              : c.status === 'partially_paid'
                              ? 'text-blue-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {c.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No invoices on file yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Receipts Archive */}
      {(subTab === 'tenant-receipts' || subTab === 'tenant-overview') && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-200">
            <h3 className="font-bold text-sm text-slate-900">Official Electronic Payment Receipts</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {payments.filter(p => p.receipt_id).length > 0 ? (
              payments.filter(p => p.receipt_id).map((p) => (
                <div key={p.id} className="p-4 hover:bg-slate-50/70 transition-colors flex items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-blue-900">{p.receipt_number}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-bold text-slate-900">{formatKSh(p.amount_cents)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                      <span className="capitalize">{p.payment_method === 'mpesa' ? 'M-Pesa' : p.payment_method}</span>
                      {p.transaction_reference && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{p.transaction_reference}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>Paid: {formatDate(p.payment_date)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={async () => {
                        try {
                          const r = await apiRequest(`/api/receipts/${p.receipt_id}`);
                          exportReceiptPDF(r);
                        } catch (err: any) {
                          alert(err.message || 'Failed to download receipt PDF');
                        }
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded border border-emerald-200 transition-colors"
                      title="Download PDF Receipt"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-700" />
                      <span>PDF</span>
                    </button>
                    <button
                      onClick={() => onViewReceipt(p.receipt_id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 rounded border border-blue-200 transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print</span>
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                No receipts generated yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Permitted Contact Details Update (Requirement H) */}
      {(subTab === 'tenant-profile' || subTab === 'tenant-overview') && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="font-bold text-sm text-slate-900 pb-2 border-b border-slate-100">
            Update Permitted Resident Contact Information
          </h3>

          {contactSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Contact details updated successfully!</span>
            </div>
          )}

          {contactError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
              {contactError}
            </div>
          )}

          <form onSubmit={handleUpdateContact} className="space-y-4 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-600 mb-1">M-Pesa / Phone Number *</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">Email Address *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">Emergency Contact Name</label>
                <input
                  type="text"
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-600 mb-1">Emergency Contact Phone</label>
                <input
                  type="text"
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                  className="w-full h-9 px-3 border border-slate-300 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={savingContact}
                className="px-5 py-2 font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                {savingContact ? 'Saving...' : 'Update Contact Information'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Credit History & Submitted Refund Requests */}
      {(overview?.creditTransactions?.length > 0 || overview?.refundRequests?.length > 0) && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-purple-600" />
              <span>Credit Carry-Forward & Refund Requests</span>
            </h3>
            {(financials?.creditBalanceCents || 0) > 0 && (
              <button
                onClick={() => setRefundModalOpen(true)}
                className="px-3 py-1.5 text-xs font-bold bg-purple-700 hover:bg-purple-600 text-white rounded-lg transition-colors shadow-2xs"
              >
                Request Refund
              </button>
            )}
          </div>

          {/* Refund Requests status */}
          {overview?.refundRequests?.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                Submitted Refund Applications
              </span>
              <div className="space-y-2">
                {overview.refundRequests.map((rf: any) => (
                  <div key={rf.id} className="p-3 bg-purple-50/50 border border-purple-200 rounded-lg text-xs flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-purple-950">{formatKSh(rf.amount_cents)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="capitalize">{rf.payment_method === 'mpesa' ? 'M-Pesa' : rf.payment_method}</span>
                        {rf.disbursement_reference && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono text-slate-600">{rf.disbursement_reference}</span>
                          </>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500 block mt-0.5">
                        {formatDate(rf.created_at)} · {rf.reason}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        rf.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : rf.status === 'approved'
                          ? 'bg-blue-100 text-blue-800'
                          : rf.status === 'rejected'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {rf.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Credit ledger */}
          {overview?.creditTransactions?.length > 0 && (
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                Credit Balance Adjustments Ledger
              </span>
              <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full text-left font-mono">
                  <thead className="bg-slate-50 font-sans font-semibold text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Amount</th>
                      <th className="py-2 px-3">Balance After</th>
                      <th className="py-2 px-3 font-sans">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {overview.creditTransactions.map((tx: any) => (
                      <tr key={tx.id}>
                        <td className="py-2 px-3 text-slate-600">{formatDate(tx.created_at)}</td>
                        <td className="py-2 px-3 font-sans capitalize">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-800">
                            {tx.transaction_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-bold">
                          {tx.transaction_type === 'excess_payment' ? '+' : '-'}
                          {formatKSh(tx.amount_cents)}
                        </td>
                        <td className="py-2 px-3 font-bold text-slate-900">{formatKSh(tx.balance_after_cents)}</td>
                        <td className="py-2 px-3 font-sans text-slate-600 text-[11px]">{tx.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tenant Request Refund Modal */}
      {refundModalOpen && (
        <RequestRefundModal
          tenantId={profile?.tenant_id}
          tenantName={profile?.tenant_name}
          creditBalanceCents={financials?.creditBalanceCents || 0}
          isOpen={refundModalOpen}
          onClose={() => setRefundModalOpen(false)}
          onSuccess={() => {
            fetchTenantData();
          }}
        />
      )}
    </div>
  );
};
