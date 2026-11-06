/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatKSh, formatDate } from '../lib/api.ts';
import { Tenant } from '../types/index.ts';
import { Users, Search, UserPlus, Phone, CreditCard, ChevronRight, X, AlertCircle, RefreshCw, Download, LogOut, RotateCcw, ArrowDownCircle, ArrowUpCircle, KeyRound, Smartphone, Copy, Check, ShieldCheck } from 'lucide-react';
import { exportTenantStatementPDF } from '../utils/pdfExport.ts';
import { AssignOutModal } from '../components/AssignOutModal.tsx';
import { RequestRefundModal } from '../components/RequestRefundModal.tsx';

interface TenantsPageProps {
  onOpenAddTenant: () => void;
  onOpenRecordPayment: () => void;
  onViewReceipt: (receiptId: string) => void;
}

export const TenantsPage: React.FC<TenantsPageProps> = ({
  onOpenAddTenant,
  onOpenRecordPayment,
  onViewReceipt
}) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTenantDetails, setSelectedTenantDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Assign Out & Refund Modals
  const [assignOutTenantId, setAssignOutTenantId] = useState<string | null>(null);
  const [assignOutOpen, setAssignOutOpen] = useState(false);
  const [refundTenant, setRefundTenant] = useState<{ id: string; name: string; creditBalanceCents: number } | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);

  // Portal Invitation Modal State
  const [invitationModalData, setInvitationModalData] = useState<{
    tenantName: string;
    link: string;
    token: string;
    phone: string;
  } | null>(null);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  useEffect(() => {
    fetchTenants();
  }, []);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const url = search ? `/api/tenants?search=${encodeURIComponent(search)}` : '/api/tenants';
      const res = await apiRequest<Tenant[]>(url);
      setTenants(res);
    } catch (err) {
      console.error('Failed to load tenants:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchTenants();
  };

  const openTenantProfile = async (tenantId: string) => {
    setLoadingDetails(true);
    try {
      const res = await apiRequest(`/api/tenants/${tenantId}`);
      setSelectedTenantDetails(res);
    } catch (err: any) {
      alert(err.message || 'Failed to fetch tenant profile');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleTerminateTenancy = async (tenancyId: string) => {
    const reason = prompt('Please enter the reason for tenancy termination / move-out:');
    if (!reason) return;

    try {
      await apiRequest(`/api/tenants/tenancies/${tenancyId}/terminate`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      alert('Tenancy terminated. Unit is now marked vacant.');
      fetchTenants();
      if (selectedTenantDetails) {
        openTenantProfile(selectedTenantDetails.id);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to terminate tenancy');
    }
  };

  const handleInvitePortal = async (tenant: any) => {
    setInvitingId(tenant.id);
    try {
      const res = await apiRequest<any>(`/api/tenants/${tenant.id}/invite-portal`, {
        method: 'POST'
      });
      setInvitationModalData({
        tenantName: tenant.full_name,
        link: res.invitationLink,
        token: res.token,
        phone: tenant.phone_number
      });
      fetchTenants();
      if (selectedTenantDetails && selectedTenantDetails.id === tenant.id) {
        openTenantProfile(tenant.id);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to generate invitation link');
    } finally {
      setInvitingId(null);
    }
  };

  const handleExportTenantStatement = (t: any) => {
    const activeTenancy = t.tenancies?.find((ten: any) => ten.is_active) || t.tenancies?.[0];
    exportTenantStatementPDF({
      tenant: {
        tenant_name: t.full_name,
        phone_number: t.phone_number,
        national_id: t.national_id,
        email: t.email,
        property_name: activeTenancy?.property_name,
        unit_number: activeTenancy?.unit_number,
        rent_amount_cents: activeTenancy?.rent_amount_cents,
        deposit_cents: activeTenancy?.deposit_cents,
        start_date: activeTenancy?.start_date
      },
      statement: t.charges || [],
      payments: t.payments || [],
      financials: {
        totalArrearsCents: t.totalArrearsCents || 0
      }
    });
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
              placeholder="Search by name, phone, national ID, property, or unit..."
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
          <button
            onClick={fetchTenants}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onOpenAddTenant}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Register Tenant</span>
          </button>
        </div>
      </div>

      {/* Tenants Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Tenant Name</th>
                <th className="py-3 px-4">Contacts</th>
                <th className="py-3 px-4">National ID</th>
                <th className="py-3 px-4">Current Residence</th>
                <th className="py-3 px-4">Monthly Rent</th>
                <th className="py-3 px-4">Arrears / Balance</th>
                <th className="py-3 px-4">Excess Credit</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.length > 0 ? (
                tenants.map((t) => (
                  <tr
                    key={t.id}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td
                      onClick={() => openTenantProfile(t.id)}
                      className="py-3 px-4 cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        {t.profile_photo_url ? (
                          <img
                            src={t.profile_photo_url}
                            alt={t.full_name}
                            className="w-8 h-8 rounded-full object-cover shrink-0 border border-slate-200"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center shrink-0 text-xs">
                            {t.full_name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <span className="font-bold text-slate-900 block">{t.full_name}</span>
                          <span className="text-[11px] font-normal text-slate-500">
                            Joined {formatDate(t.created_at)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td
                      onClick={() => openTenantProfile(t.id)}
                      className="py-3 px-4 cursor-pointer"
                    >
                      <div className="font-mono text-slate-700 font-medium">{t.phone_number}</div>
                      {t.mpesa_phone_number && t.mpesa_phone_number !== t.phone_number && (
                        <div className="text-[10px] text-emerald-700 font-mono flex items-center gap-0.5">
                          <Smartphone className="w-2.5 h-2.5 text-emerald-600" />
                          <span>M-Pesa: {t.mpesa_phone_number}</span>
                        </div>
                      )}
                      <div className="text-[11px] text-slate-500">{t.email}</div>
                    </td>
                    <td
                      onClick={() => openTenantProfile(t.id)}
                      className="py-3 px-4 font-mono text-slate-600 cursor-pointer"
                    >
                      {t.national_id}
                    </td>
                    <td
                      onClick={() => openTenantProfile(t.id)}
                      className="py-3 px-4 cursor-pointer"
                    >
                      {t.property_name ? (
                        <div>
                          <span className="font-semibold text-slate-900">{t.property_name}</span>
                          <span className="block text-[11px] text-slate-500">
                            Unit <span className="font-bold text-slate-800">{t.unit_number}</span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">No Active Tenancy</span>
                      )}
                    </td>
                    <td
                      onClick={() => openTenantProfile(t.id)}
                      className="py-3 px-4 font-mono font-semibold text-slate-900 tabular-nums cursor-pointer"
                    >
                      {t.rent_amount_cents ? formatKSh(t.rent_amount_cents) : '—'}
                    </td>
                    <td
                      onClick={() => openTenantProfile(t.id)}
                      className="py-3 px-4 cursor-pointer"
                    >
                      <span
                        className={`font-mono font-bold tabular-nums ${
                          (t.total_balance_cents || 0) > 0 ? 'text-rose-600' : 'text-emerald-700'
                        }`}
                      >
                        {formatKSh(t.total_balance_cents || 0)}
                      </span>
                    </td>
                    <td
                      onClick={() => openTenantProfile(t.id)}
                      className="py-3 px-4 cursor-pointer"
                    >
                      {(t.credit_balance_cents || 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold font-mono bg-purple-50 text-purple-700 border border-purple-200">
                          {formatKSh(t.credit_balance_cents || 0)}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono text-xs">KSh 0</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {t.unit_number && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setAssignOutTenantId(t.id);
                              setAssignOutOpen(true);
                            }}
                            className="px-2 py-1 text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded transition-colors flex items-center gap-1"
                            title="Vacate tenant, calculate final settlement statement and free up unit"
                          >
                            <LogOut className="w-3 h-3" />
                            <span>Assign Out</span>
                          </button>
                        )}
                        {!t.user_id ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInvitePortal(t);
                            }}
                            disabled={invitingId === t.id}
                            className="px-2 py-1 text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded transition-colors flex items-center gap-1"
                            title="Create secure tenant portal activation invitation link"
                          >
                            <KeyRound className="w-3 h-3 text-blue-600" />
                            <span>{invitingId === t.id ? 'Inviting...' : 'Invite'}</span>
                          </button>
                        ) : (
                          <span
                            className="px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded"
                            title="Tenant portal account activated"
                          >
                            Active
                          </span>
                        )}
                        {(t.credit_balance_cents || 0) > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setRefundTenant({
                                id: t.id,
                                name: t.full_name,
                                creditBalanceCents: t.credit_balance_cents || 0
                              });
                              setRefundOpen(true);
                            }}
                            className="px-2 py-1 text-[11px] font-semibold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded transition-colors flex items-center gap-1"
                            title="Request or disburse refund from excess tenant credit"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Refund</span>
                          </button>
                        )}
                        <button
                          onClick={() => openTenantProfile(t.id)}
                          className="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded transition-colors flex items-center gap-1"
                        >
                          Profile <ChevronRight className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No tenants found matching criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tenant Profile Drawer / Modal */}
      {selectedTenantDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl h-full bg-white shadow-2xl flex flex-col border-l border-slate-200 overflow-hidden">
            {/* Drawer Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                {selectedTenantDetails.profile_photo_url ? (
                  <img
                    src={selectedTenantDetails.profile_photo_url}
                    alt={selectedTenantDetails.full_name}
                    className="w-12 h-12 rounded-full object-cover shrink-0 border-2 border-slate-700 shadow-xs"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-blue-600/30 text-blue-300 border border-blue-500/40 font-bold flex items-center justify-center shrink-0 text-base">
                    {selectedTenantDetails.full_name?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <span className="text-[10px] font-mono text-blue-400 uppercase tracking-wider block">
                    Tenant Ledger & Profile
                  </span>
                  <h3 className="text-lg font-bold mt-0.5">{selectedTenantDetails.full_name}</h3>
                  <p className="text-xs text-slate-400">
                    {selectedTenantDetails.phone_number} · ID: {selectedTenantDetails.national_id}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportTenantStatement(selectedTenantDetails)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors shadow-xs"
                  title="Export official tenant account statement as PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Statement (PDF)</span>
                </button>
                <button
                  onClick={() => setSelectedTenantDetails(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Profile Details & Contacts Summary */}
              <div className="grid grid-cols-2 gap-3 text-xs p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Primary Phone</span>
                  <span className="font-mono font-medium text-slate-900">{selectedTenantDetails.phone_number}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">M-Pesa Payment Phone</span>
                  <span className="font-mono font-medium text-emerald-800">
                    {selectedTenantDetails.mpesa_phone_number || selectedTenantDetails.phone_number}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Email Address</span>
                  <span className="text-slate-900 truncate block">{selectedTenantDetails.email}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-semibold block">Portal Status</span>
                  {selectedTenantDetails.user_id ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      Account Active
                    </span>
                  ) : (
                    <button
                      onClick={() => handleInvitePortal(selectedTenantDetails)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"
                    >
                      <KeyRound className="w-3 h-3 text-blue-600" />
                      Send Portal Invitation
                    </button>
                  )}
                </div>
              </div>

              {/* Emergency Contact Card */}
              {(selectedTenantDetails.emergency_contact_name || selectedTenantDetails.emergency_contact_phone) && (
                <div className="p-3 bg-rose-50/60 border border-rose-200/80 rounded-xl text-xs space-y-1">
                  <span className="text-[10px] uppercase font-bold text-rose-900 tracking-wider block">
                    Emergency Contact & Next of Kin
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-slate-800 pt-0.5">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Name:</span>
                      <span className="font-semibold">{selectedTenantDetails.emergency_contact_name || '—'}</span>
                      {selectedTenantDetails.emergency_contact_relationship && (
                        <span className="text-[11px] text-slate-500 block">
                          ({selectedTenantDetails.emergency_contact_relationship})
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Phone:</span>
                      <span className="font-mono font-semibold">{selectedTenantDetails.emergency_contact_phone || '—'}</span>
                      {selectedTenantDetails.emergency_contact_alt_phone && (
                        <span className="text-[11px] font-mono text-slate-500 block">
                          Alt: {selectedTenantDetails.emergency_contact_alt_phone}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Arrears Summary Card */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    Total Arrears Balance
                  </span>
                  <div
                    className={`font-mono text-2xl font-bold mt-1 ${
                      selectedTenantDetails.totalArrearsCents > 0 ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {formatKSh(selectedTenantDetails.totalArrearsCents)}
                  </div>
                </div>
                <button
                  onClick={onOpenRecordPayment}
                  className="px-3 py-1.5 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors"
                >
                  Record Payment
                </button>
              </div>

              {/* Tenancies Section */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">
                  Tenancies History
                </h4>
                <div className="space-y-2">
                  {selectedTenantDetails.tenancies?.map((ty: any) => (
                    <div key={ty.id} className="p-3 bg-white border border-slate-200 rounded-lg text-xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold text-slate-900">
                            {ty.property_name} (Unit {ty.unit_number})
                          </span>
                          <span className="text-[11px] text-slate-500 block mt-0.5">
                            From: {formatDate(ty.start_date)} {ty.end_date ? `to ${formatDate(ty.end_date)}` : '(Active)'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-bold text-slate-900 block">
                            {formatKSh(ty.rent_amount_cents)}/mo
                          </span>
                          {ty.is_active && (
                            <button
                              onClick={() => {
                                setAssignOutTenantId(selectedTenantDetails.id);
                                setAssignOutOpen(true);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded transition-colors mt-1"
                              title="Assign out tenant with complete settlement statement calculation"
                            >
                              <LogOut className="w-3 h-3 text-rose-600" />
                              <span>Assign Out Tenant</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rent Charges & Billing Register */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">
                  Monthly Rent Charges & Invoices
                </h4>
                <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 font-semibold text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="py-2 px-3">Month</th>
                        <th className="py-2 px-3">Rent Due</th>
                        <th className="py-2 px-3">Paid</th>
                        <th className="py-2 px-3">Balance</th>
                        <th className="py-2 px-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedTenantDetails.charges?.map((c: any) => (
                        <tr key={c.id}>
                          <td className="py-2 px-3 font-medium">{c.billing_month}</td>
                          <td className="py-2 px-3 font-mono">{formatKSh(c.rent_due_cents)}</td>
                          <td className="py-2 px-3 font-mono text-emerald-700">{formatKSh(c.amount_paid_cents)}</td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900">{formatKSh(c.balance_cents)}</td>
                          <td className="py-2 px-3 capitalize">
                            <span
                              className={`text-[10px] font-bold uppercase ${
                                c.status === 'paid'
                                  ? 'text-emerald-700'
                                  : c.status === 'overdue'
                                  ? 'text-rose-700'
                                  : 'text-amber-700'
                              }`}
                            >
                              {c.status.replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Payment Records & Receipts */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">
                  Payment History & Official Receipts
                </h4>
                <div className="space-y-2">
                  {selectedTenantDetails.payments?.map((py: any) => (
                    <div key={py.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-900">{formatKSh(py.amount_cents)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="capitalize">{py.payment_method === 'mpesa' ? 'M-Pesa' : py.payment_method}</span>
                          {py.transaction_reference && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-slate-600">{py.transaction_reference}</span>
                            </>
                          )}
                          {py.excess_credit_cents > 0 && (
                            <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-bold">
                              +{formatKSh(py.excess_credit_cents)} Excess Credit
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 block mt-0.5">
                          {formatDate(py.payment_date)} · Status: <span className="font-semibold uppercase">{py.status}</span>
                        </span>
                      </div>
                      {py.receipt_id && (
                        <button
                          onClick={() => onViewReceipt(py.receipt_id)}
                          className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-300 rounded hover:bg-slate-100 text-blue-700 transition-colors"
                        >
                          View Receipt
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Excess Credit Balance & Credit History */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                    Tenant Excess Credit Ledger
                  </h4>
                  {(selectedTenantDetails.credit_balance_cents || 0) > 0 && (
                    <button
                      onClick={() => {
                        setRefundTenant({
                          id: selectedTenantDetails.id,
                          name: selectedTenantDetails.full_name,
                          creditBalanceCents: selectedTenantDetails.credit_balance_cents || 0
                        });
                        setRefundOpen(true);
                      }}
                      className="px-2.5 py-1 text-xs font-bold bg-purple-700 hover:bg-purple-600 text-white rounded-lg transition-colors flex items-center gap-1 shadow-2xs"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Request / Disburse Refund</span>
                    </button>
                  )}
                </div>

                <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl mb-3 flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-semibold text-purple-900 uppercase">Available Credit Balance</span>
                    <div className="font-mono text-xl font-black text-purple-900">
                      {formatKSh(selectedTenantDetails.credit_balance_cents || 0)}
                    </div>
                    <span className="text-[10px] text-purple-700">
                      Automatically carried forward and applied to reduce future rent billing
                    </span>
                  </div>
                </div>

                {selectedTenantDetails.credit_transactions?.length > 0 ? (
                  <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 font-semibold text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Type</th>
                          <th className="py-2 px-3">Amount</th>
                          <th className="py-2 px-3">Balance After</th>
                          <th className="py-2 px-3">Description</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {selectedTenantDetails.credit_transactions.map((tx: any) => (
                          <tr key={tx.id}>
                            <td className="py-2 px-3 text-slate-600">{formatDate(tx.created_at)}</td>
                            <td className="py-2 px-3 font-sans font-bold capitalize">
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  tx.transaction_type === 'excess_payment'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : tx.transaction_type === 'refund'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
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
                ) : (
                  <div className="p-4 bg-slate-50 rounded-lg text-center text-slate-400 text-xs">
                    No credit transactions recorded yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assign Out Modal */}
      <AssignOutModal
        tenantId={assignOutTenantId}
        isOpen={assignOutOpen}
        onClose={() => {
          setAssignOutOpen(false);
          setAssignOutTenantId(null);
        }}
        onSuccess={() => {
          fetchTenants();
          if (selectedTenantDetails) {
            openTenantProfile(selectedTenantDetails.id);
          }
        }}
      />

      {/* Request Refund Modal */}
      {refundTenant && (
        <RequestRefundModal
          tenantId={refundTenant.id}
          tenantName={refundTenant.name}
          creditBalanceCents={refundTenant.creditBalanceCents}
          isOpen={refundOpen}
          onClose={() => {
            setRefundOpen(false);
            setRefundTenant(null);
          }}
          onSuccess={() => {
            fetchTenants();
            if (selectedTenantDetails) {
              openTenantProfile(selectedTenantDetails.id);
            }
          }}
        />
      )}
    </div>
  );
};
