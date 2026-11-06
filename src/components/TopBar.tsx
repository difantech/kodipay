/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { Menu, Plus, CreditCard, Calendar, Download, Bell, Sparkles } from 'lucide-react';
import { ExportDataModal } from './ExportDataModal.tsx';

interface TopBarProps {
  currentTab: string;
  onOpenMobile: () => void;
  onOpenRecordPayment?: () => void;
  onOpenAddTenant?: () => void;
  onOpenBillingModal?: () => void;
  onNavigateTab?: (tab: string) => void;
}

const TAB_TITLES: Record<string, string> = {
  dashboard: 'Landlord & Property Dashboard',
  properties: 'Managed Properties & Units',
  units: 'Rental Units Inventory',
  tenants: 'Tenants & Tenancies Directory',
  'rent-collection': 'Rent Register & Collection',
  payments: 'Payment Records & Reversals',
  arrears: 'Arrears & Overdue Balances',
  refunds: 'Tenant Credits, Overpayments & Refunds',
  receipts: 'Official Receipts & Statements',
  reports: 'Financial & Occupancy Analytics',
  notifications: 'Notification Center & AI Studio',
  users: 'System User Administration',
  'audit-logs': 'Audit Trail & Financial Logs',
  'security-center': 'Security & Firewall Operations Center',
  settings: 'System & Currency Settings',
  'tenant-overview': 'Tenant Rental Home',
  'tenant-statement': 'Rent Statement & Invoices',
  'tenant-receipts': 'Payment Receipts Archive',
  'tenant-profile': 'Tenant Contact Profile',
};

export const TopBar: React.FC<TopBarProps> = ({
  currentTab,
  onOpenMobile,
  onOpenRecordPayment,
  onOpenAddTenant,
  onOpenBillingModal,
  onNavigateTab
}) => {
  const { user } = useAuth();
  if (!user) return null;

  const [exportModalOpen, setExportModalOpen] = useState(false);

  const title = TAB_TITLES[currentTab] || 'KodiPay Kenya';
  const isTenant = user.role === 'tenant';

  // Nairobi date
  const todayStr = new Intl.DateTimeFormat('en-KE', {
    timeZone: 'Africa/Nairobi',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date());

  return (
    <>
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
        {/* Left: Mobile Toggle & Breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenMobile}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md md:hidden"
            aria-label="Toggle Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span>KodiPay Kenya</span>
              <span aria-hidden="true">/</span>
              <span className="capitalize">{currentTab.replace('-', ' ')}</span>
            </div>
            <h1 className="text-base font-bold text-slate-900 leading-tight truncate">
              {title}
            </h1>
          </div>
        </div>

        {/* Right: Quick Actions & Nairobi Clock */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <span className="hidden lg:inline-block text-xs font-mono text-slate-500 bg-slate-50 px-2.5 py-1 rounded border border-slate-200">
            {todayStr} (EAT)
          </span>

          {/* Export Property & Tenant Data Button */}
          <button
            onClick={() => setExportModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition-colors border border-slate-300/80 shadow-2xs"
            title="Export property and tenant data to CSV or PDF report"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">Export Data</span>
            <span className="sm:hidden">Export</span>
          </button>

          {/* Notification Center & AI Quick Action */}
          {!isTenant && onNavigateTab && (
            <button
              onClick={() => onNavigateTab('notifications')}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border shadow-2xs ${
                currentTab === 'notifications'
                  ? 'bg-blue-50 text-blue-800 border-blue-400 ring-1 ring-blue-300'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300/80'
              }`}
              title="Notification Hub & AI Studio"
            >
              <Bell className="w-3.5 h-3.5 text-blue-700" />
              <span className="hidden sm:inline">Notifications</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
            </button>
          )}

          {!isTenant && (
            <div className="flex items-center gap-2">
              {onOpenRecordPayment && (
                <button
                  onClick={onOpenRecordPayment}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg shadow-xs transition-colors"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Record Payment</span>
                </button>
              )}

              {onOpenAddTenant && (
                <button
                  onClick={onOpenAddTenant}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition-colors border border-slate-300/80"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Tenant</span>
                </button>
              )}

              {onOpenBillingModal && (
                <button
                  onClick={onOpenBillingModal}
                  className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg transition-colors border border-slate-300/80"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Generate Billing</span>
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Export Property and Tenant Data Modal */}
      <ExportDataModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        isTenant={isTenant}
      />
    </>
  );
};
