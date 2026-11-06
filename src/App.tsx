/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { TopBar } from './components/TopBar.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { PropertiesPage } from './pages/PropertiesPage.tsx';
import { UnitsPage } from './pages/UnitsPage.tsx';
import { TenantsPage } from './pages/TenantsPage.tsx';
import { RentCollectionPage } from './pages/RentCollectionPage.tsx';
import { PaymentsPage } from './pages/PaymentsPage.tsx';
import { ArrearsPage } from './pages/ArrearsPage.tsx';
import { ReceiptsPage } from './pages/ReceiptsPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { UsersPage } from './pages/UsersPage.tsx';
import { AuditPage } from './pages/AuditPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { NotificationsPage } from './pages/NotificationsPage.tsx';
import { TenantPortalPage } from './pages/TenantPortalPage.tsx';
import { RefundsPage } from './pages/RefundsPage.tsx';
import { SecurityCenterPage } from './pages/SecurityCenterPage.tsx';
import { useInactivityTimeout } from './hooks/useInactivityTimeout.ts';

// Modals
import { RecordPaymentModal } from './components/RecordPaymentModal.tsx';
import { AddTenantModal } from './components/AddTenantModal.tsx';
import { AddPropertyModal } from './components/AddPropertyModal.tsx';
import { GenerateChargesModal } from './components/GenerateChargesModal.tsx';
import { ReceiptModal } from './components/ReceiptModal.tsx';
import { PortalActivationModal } from './components/PortalActivationModal.tsx';
import { apiRequest } from './lib/api.ts';
import { Property, Receipt } from './types/index.ts';
import { CheckCircle2, X, Smartphone, Mail, AlertTriangle } from 'lucide-react';

const MainApp: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Automatic Session Inactivity Logout Monitor (30 mins inactivity, 60s warning)
  const { showWarning, secondsRemaining, handleKeepAlive, handlePerformLogout } = useInactivityTimeout({
    timeoutMinutes: 30,
    warningSeconds: 60
  });

  // Modals state
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [paymentPreselectedTenancy, setPaymentPreselectedTenancy] = useState<string | undefined>(undefined);

  const [addTenantOpen, setAddTenantOpen] = useState(false);
  const [tenantPreselectedUnit, setTenantPreselectedUnit] = useState<string | undefined>(undefined);
  const [tenantBookingMode, setTenantBookingMode] = useState<boolean>(false);

  const [addPropertyOpen, setAddPropertyOpen] = useState(false);
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);

  const [properties, setProperties] = useState<Property[]>([]);

  // Real-time Money Collected Banner State
  const [paymentBanner, setPaymentBanner] = useState<{
    amountKSh: number;
    message: string;
    notificationsDispatched?: number;
    ownerNotified?: { name?: string; phone?: string; email?: string };
    tenantNotified?: { name?: string; phone?: string; email?: string };
  } | null>(null);

  React.useEffect(() => {
    if (user && user.role === 'tenant') {
      setCurrentTab('tenant-overview');
    } else if (user && user.role === 'caretaker') {
      // Caretaker is strictly data entry only: restrict admin and analytics tabs
      const forbiddenCaretakerTabs = ['reports', 'users', 'audit-logs', 'settings', 'notifications'];
      if (forbiddenCaretakerTabs.includes(currentTab)) {
        setCurrentTab('dashboard');
      }
    } else if (user) {
      fetchProperties();
    }
  }, [user, currentTab]);

  // Real-time payment notifications and money collected banner listener
  React.useEffect(() => {
    const handlePaymentRecorded = (event: Event) => {
      const customEvent = event as CustomEvent;
      const detail = customEvent.detail || {};
      const amount =
        detail.moneyCollectedKSh ||
        (detail.payment?.amount_cents ? parseInt(detail.payment.amount_cents, 10) / 100 : 0);

      if (amount > 0) {
        setPaymentBanner({
          amountKSh: amount,
          message:
            detail.message ||
            `Money Collected: KSh ${amount.toLocaleString()} received and allocated!`,
          notificationsDispatched: detail.notificationsDispatched || 2,
          ownerNotified: detail.ownerNotified,
          tenantNotified: detail.tenantNotified
        });

        // Refresh global properties and tallies
        fetchProperties();

        // Auto dismiss banner after 10 seconds
        const timer = setTimeout(() => {
          setPaymentBanner(null);
        }, 10000);
        return () => clearTimeout(timer);
      }
    };

    window.addEventListener('kodipay:payment-recorded', handlePaymentRecorded);
    return () => {
      window.removeEventListener('kodipay:payment-recorded', handlePaymentRecorded);
    };
  }, []);

  const fetchProperties = async () => {
    try {
      const res = await apiRequest<Property[]>('/api/properties');
      setProperties(res);
    } catch {
      // Ignore
    }
  };

  const handleViewReceipt = async (receiptId: string) => {
    try {
      const res = await apiRequest<Receipt>(`/api/receipts/${receiptId}`);
      setActiveReceipt(res);
    } catch (err: any) {
      alert(err.message || 'Failed to load receipt');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="font-bold text-sm tracking-wide">Initializing KodiPay Kenya...</span>
        <span className="text-xs text-slate-400 mt-1">Connecting to PostgreSQL engine</span>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row antialiased text-slate-900">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <TopBar
          currentTab={currentTab}
          onOpenMobile={() => setMobileSidebarOpen(true)}
          onOpenRecordPayment={() => {
            setPaymentPreselectedTenancy(undefined);
            setRecordPaymentOpen(true);
          }}
          onOpenAddTenant={() => {
            setTenantPreselectedUnit(undefined);
            setAddTenantOpen(true);
          }}
          onOpenBillingModal={() => setBillingModalOpen(true)}
          onNavigateTab={setCurrentTab}
        />

        {/* Real-Time Money Collected & Notification Toast Banner */}
        {paymentBanner && (
          <div className="bg-emerald-900 border-b border-emerald-700 text-white px-4 py-3 shadow-md transition-all">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-sm tracking-wide text-white">
                      💰 Money Collected: KSh {paymentBanner.amountKSh.toLocaleString()}
                    </span>
                    <span className="text-[11px] bg-emerald-800 text-emerald-200 px-2 py-0.5 rounded-full border border-emerald-600 font-medium">
                      Live System Updated
                    </span>
                    <span className="text-[11px] bg-emerald-800/80 text-emerald-100 px-2 py-0.5 rounded-full border border-emerald-500 flex items-center gap-1 font-medium">
                      <Smartphone className="w-3 h-3 text-emerald-300" />
                      <Mail className="w-3 h-3 text-emerald-300" />
                      SMS & Email Dispatched Automatically
                    </span>
                  </div>
                  <p className="text-xs text-emerald-100 mt-0.5">
                    {paymentBanner.message}
                    {paymentBanner.ownerNotified?.phone && ` · Owner: ${paymentBanner.ownerNotified.phone}`}
                    {paymentBanner.tenantNotified?.phone && ` · Tenant: ${paymentBanner.tenantNotified.phone}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPaymentBanner(null)}
                className="text-emerald-300 hover:text-white p-1 rounded-md hover:bg-emerald-800 transition-colors shrink-0"
                aria-label="Dismiss banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <main className="p-4 sm:p-6 lg:p-8 flex-1">
          {/* Tenant Portal Views */}
          {user.role === 'tenant' ? (
            <TenantPortalPage
              subTab={currentTab}
              onViewReceipt={handleViewReceipt}
            />
          ) : (
            <>
              {currentTab === 'dashboard' && (
                <DashboardPage
                  onOpenRecordPayment={() => {
                    setPaymentPreselectedTenancy(undefined);
                    setRecordPaymentOpen(true);
                  }}
                  onOpenAddTenant={() => {
                    setTenantPreselectedUnit(undefined);
                    setAddTenantOpen(true);
                  }}
                  onOpenAddProperty={() => setAddPropertyOpen(true)}
                  onOpenBillingModal={() => setBillingModalOpen(true)}
                  onViewReceipt={handleViewReceipt}
                  onNavigateTab={setCurrentTab}
                />
              )}

              {currentTab === 'properties' && (
                <PropertiesPage
                  onOpenAddProperty={() => setAddPropertyOpen(true)}
                  onOpenAddTenantWithUnit={(uId) => {
                    setTenantPreselectedUnit(uId);
                    setTenantBookingMode(false);
                    setAddTenantOpen(true);
                  }}
                  onOpenBookUnit={(uId) => {
                    setTenantPreselectedUnit(uId);
                    setTenantBookingMode(true);
                    setAddTenantOpen(true);
                  }}
                />
              )}

              {currentTab === 'units' && (
                <UnitsPage
                  onOpenAddProperty={() => setAddPropertyOpen(true)}
                  onOpenAddTenantWithUnit={(uId) => {
                    setTenantPreselectedUnit(uId);
                    setTenantBookingMode(false);
                    setAddTenantOpen(true);
                  }}
                  onOpenBookUnit={(uId) => {
                    setTenantPreselectedUnit(uId);
                    setTenantBookingMode(true);
                    setAddTenantOpen(true);
                  }}
                />
              )}

              {currentTab === 'tenants' && (
                <TenantsPage
                  onOpenAddTenant={() => {
                    setTenantPreselectedUnit(undefined);
                    setAddTenantOpen(true);
                  }}
                  onOpenRecordPayment={() => {
                    setPaymentPreselectedTenancy(undefined);
                    setRecordPaymentOpen(true);
                  }}
                  onViewReceipt={handleViewReceipt}
                />
              )}

              {currentTab === 'rent-collection' && (
                <RentCollectionPage
                  onOpenRecordPaymentWithTenancy={(tId) => {
                    setPaymentPreselectedTenancy(tId);
                    setRecordPaymentOpen(true);
                  }}
                  onOpenBillingModal={() => setBillingModalOpen(true)}
                />
              )}

              {currentTab === 'payments' && (
                <PaymentsPage
                  onOpenRecordPayment={() => {
                    setPaymentPreselectedTenancy(undefined);
                    setRecordPaymentOpen(true);
                  }}
                  onViewReceipt={handleViewReceipt}
                />
              )}

              {currentTab === 'arrears' && user.role === 'super_admin' && (
                <ArrearsPage
                  onOpenRecordPaymentWithTenancy={(tId) => {
                    setPaymentPreselectedTenancy(tId);
                    setRecordPaymentOpen(true);
                  }}
                />
              )}

              {currentTab === 'refunds' && (
                <RefundsPage />
              )}

              {currentTab === 'receipts' && (
                <ReceiptsPage onViewReceipt={handleViewReceipt} />
              )}

              {/* Super Admin Restricted Administrative Views */}
              {currentTab === 'reports' && user.role === 'super_admin' && <ReportsPage />}

              {currentTab === 'users' && user.role === 'super_admin' && <UsersPage />}

              {currentTab === 'audit-logs' && user.role === 'super_admin' && <AuditPage />}

              {currentTab === 'notifications' && user.role === 'super_admin' && <NotificationsPage />}

              {currentTab === 'security-center' && user.role === 'super_admin' && <SecurityCenterPage />}

              {currentTab === 'settings' && user.role === 'super_admin' && <SettingsPage />}
            </>
          )}
        </main>
      </div>

      {/* Global Modals */}
      <RecordPaymentModal
        isOpen={recordPaymentOpen}
        preselectedTenancyId={paymentPreselectedTenancy}
        onClose={() => setRecordPaymentOpen(false)}
        onSuccess={(receipt) => {
          if (receipt?.id) {
            handleViewReceipt(receipt.id);
          }
        }}
      />

      <AddTenantModal
        isOpen={addTenantOpen}
        preselectedUnitId={tenantPreselectedUnit}
        initialBookingMode={tenantBookingMode}
        onClose={() => {
          setAddTenantOpen(false);
          setTenantPreselectedUnit(undefined);
          setTenantBookingMode(false);
        }}
        onSuccess={() => {
          fetchProperties();
        }}
      />

      <AddPropertyModal
        isOpen={addPropertyOpen}
        onClose={() => setAddPropertyOpen(false)}
        onSuccess={() => {
          fetchProperties();
        }}
      />

      <GenerateChargesModal
        isOpen={billingModalOpen}
        properties={properties}
        onClose={() => setBillingModalOpen(false)}
        onSuccess={(res) => {
          alert(res.message);
        }}
      />

      <ReceiptModal
        receipt={activeReceipt}
        onClose={() => setActiveReceipt(null)}
      />

      <PortalActivationModal />

      {/* Inactivity Auto-Logout Warning Dialog */}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 border border-amber-200">
            <div className="flex items-center gap-3 text-amber-600 mb-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="font-semibold text-stone-900">Session Inactivity Warning</h3>
                <p className="text-xs text-stone-500">Security & Session Management</p>
              </div>
            </div>
            <p className="text-sm text-stone-600 mb-4">
              You have been inactive. For security compliance and protection against unauthorized access, your session will automatically log out in:
            </p>
            <div className="text-center py-3 bg-amber-50 rounded-lg border border-amber-200 mb-5">
              <span className="text-2xl font-bold font-mono text-amber-700">{secondsRemaining}s</span>
              <p className="text-xs text-amber-600 mt-0.5">Click "Keep Me Signed In" to continue your session</p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={handlePerformLogout}
                className="px-4 py-2 border border-stone-300 text-stone-700 text-sm font-medium rounded-lg hover:bg-stone-50 transition-colors"
              >
                Log Out Now
              </button>
              <button
                onClick={handleKeepAlive}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
              >
                Keep Me Signed In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
