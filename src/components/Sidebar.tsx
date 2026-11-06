/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import {
  LayoutDashboard,
  Building2,
  DoorOpen,
  Users,
  ReceiptText,
  CreditCard,
  AlertCircle,
  FileCheck,
  BarChart3,
  ShieldCheck,
  History,
  Settings,
  UserCheck,
  LogOut,
  Bell,
  X
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile
}) => {
  const { user, logout } = useAuth();
  if (!user) return null;

  const isTenant = user.role === 'tenant';
  const isAdmin = user.role === 'super_admin';
  const isCaretaker = user.role === 'caretaker';

  // Navigation Items according to 3-role model
  const navItems = isTenant
    ? [
        { id: 'tenant-overview', label: 'My Rental Home', icon: Building2 },
        { id: 'tenant-statement', label: 'Rent Statements', icon: ReceiptText },
        { id: 'tenant-receipts', label: 'My Receipts', icon: FileCheck },
        { id: 'tenant-profile', label: 'Contact Profile', icon: UserCheck },
      ]
    : isCaretaker
    ? [
        // Strictly Data Entry Only navigation items for Caretaker
        { id: 'dashboard', label: 'Data Entry Overview', icon: LayoutDashboard },
        { id: 'properties', label: 'Properties', icon: Building2 },
        { id: 'units', label: 'Rental Units', icon: DoorOpen },
        { id: 'tenants', label: 'Tenants & Bookings', icon: Users },
        { id: 'rent-collection', label: 'Rent Billing Entry', icon: ReceiptText },
        { id: 'payments', label: 'Record Payments', icon: CreditCard },
        { id: 'refunds', label: 'Refunds & Credits', icon: AlertCircle },
        { id: 'receipts', label: 'Receipts Archive', icon: FileCheck },
      ]
    : [
        // Super Administrator with full control
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'properties', label: 'Properties', icon: Building2 },
        { id: 'units', label: 'Rental Units', icon: DoorOpen },
        { id: 'tenants', label: 'Tenants', icon: Users },
        { id: 'rent-collection', label: 'Rent Collection', icon: ReceiptText },
        { id: 'payments', label: 'Payments', icon: CreditCard },
        { id: 'arrears', label: 'Arrears & Overdue', icon: AlertCircle },
        { id: 'refunds', label: 'Refunds & Credits', icon: ReceiptText },
        { id: 'receipts', label: 'Receipts & Statements', icon: FileCheck },
        { id: 'reports', label: 'Financial Reports', icon: BarChart3 },
        { id: 'users', label: 'User Management', icon: ShieldCheck },
        { id: 'audit-logs', label: 'Audit Trail', icon: History },
        { id: 'security-center', label: 'Security & Firewall', icon: ShieldCheck },
        { id: 'notifications', label: 'Notifications & AI', icon: Bell },
        { id: 'settings', label: 'Settings', icon: Settings },
      ];

  const handleNavClick = (id: string) => {
    onSelectTab(id);
    onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs md:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-[#0a1526] text-slate-300 flex flex-col border-r border-slate-800/80 transition-transform duration-200 md:static md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Area */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-sm tracking-tight shadow-md">
              KP
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-white block">KodiPay</span>
              <span className="text-[10px] text-slate-400 font-medium block -mt-0.5">Kenya Rental System</span>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="p-1 text-slate-400 hover:text-white rounded-md md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Role Indicator */}
        <div className="px-5 py-3 bg-[#0d1c33]/60 border-b border-slate-800/60">
          <div className="flex items-center justify-between">
            <div className="truncate">
              <span className="text-xs font-semibold text-white block truncate">{user.fullName}</span>
              <span className="text-[11px] text-slate-400 block truncate">
                {user.role === 'super_admin'
                  ? 'Super Administrator'
                  : user.role === 'caretaker'
                  ? 'Caretaker (Data Entry Only)'
                  : 'Tenant'}
              </span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 border border-blue-700/50 uppercase">
              KSh
            </span>
          </div>
          {isCaretaker && (
            <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-amber-400 bg-amber-950/40 border border-amber-800/60 rounded px-2 py-0.5 inline-block">
              Role: Strict Data Entry Only
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white font-semibold shadow-xs'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Footer Area */}
        <div className="p-3 border-t border-slate-800/80">
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
          <div className="px-3 pt-2 text-[10px] text-slate-500 font-mono">
            Timezone: Africa/Nairobi
          </div>
        </div>
      </aside>
    </>
  );
};
