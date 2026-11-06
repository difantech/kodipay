/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest } from '../lib/api.ts';
import { Property } from '../types/index.ts';
import {
  exportPropertiesCSV,
  exportTenantsCSV,
  exportCombinedCSV
} from '../utils/csvExport.ts';
import {
  exportPropertiesPDF,
  exportTenantsPDF,
  exportCombinedReportPDF
} from '../utils/pdfExport.ts';
import {
  X,
  Download,
  FileSpreadsheet,
  FileText,
  Building2,
  Users,
  CheckCircle2,
  Layers,
  RefreshCw,
  Sparkles
} from 'lucide-react';

interface ExportDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  isTenant?: boolean;
}

export const ExportDataModal: React.FC<ExportDataModalProps> = ({
  isOpen,
  onClose,
  isTenant = false
}) => {
  const [scope, setScope] = useState<'both' | 'properties' | 'tenants'>('both');
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isTenant) {
        // Fetch tenant-specific overview
        const overview = await apiRequest('/api/tenant-portal/overview');
        const p = overview?.profile;
        if (p) {
          setProperties([{
            id: p.property_id || 'tenant-prop',
            name: p.property_name || 'My Residence',
            code: p.property_code || 'RES',
            address: p.property_address || '',
            total_units: 1,
            occupied_units: 1,
            vacant_units: 0,
            expected_monthly_rent_cents: p.rent_amount_cents || 0,
            created_at: p.start_date || new Date().toISOString()
          } as any]);

          setTenants([{
            id: p.tenant_id || 'me',
            full_name: p.tenant_name,
            phone_number: p.phone_number,
            national_id: p.national_id,
            email: p.email,
            property_name: p.property_name,
            unit_number: p.unit_number,
            rent_amount_cents: p.rent_amount_cents,
            total_balance_cents: overview?.financials?.totalArrearsCents || 0,
            start_date: p.start_date,
            is_active: true
          }]);
        }
      } else {
        const [propsRes, tenantsRes] = await Promise.all([
          apiRequest<Property[]>('/api/properties'),
          apiRequest<any[]>('/api/tenants')
        ]);
        setProperties(propsRes || []);
        setTenants(tenantsRes || []);
      }
    } catch (err: any) {
      console.error('Failed to load data for export:', err);
      setError(err.message || 'Failed to load property and tenant data');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleExport = () => {
    setExporting(true);
    try {
      if (format === 'csv') {
        if (scope === 'properties') {
          exportPropertiesCSV(properties);
        } else if (scope === 'tenants') {
          exportTenantsCSV(tenants);
        } else {
          exportCombinedCSV(properties, tenants);
        }
      } else {
        // PDF format
        if (scope === 'properties') {
          exportPropertiesPDF(properties);
        } else if (scope === 'tenants') {
          exportTenantsPDF(tenants);
        } else {
          exportCombinedReportPDF(properties, tenants);
        }
      }
      setTimeout(() => {
        setExporting(false);
        onClose();
      }, 500);
    } catch (err: any) {
      console.error('Export error:', err);
      setError(err.message || 'Error occurred while generating report file');
      setExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 text-white rounded-lg shadow-xs">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base tracking-tight">Export Property & Tenant Data</h3>
              <p className="text-xs text-slate-300">
                Official Kenya property portfolio & tenant reports
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center gap-2">
              <span>{error}</span>
            </div>
          )}

          {/* Live Data Summary Counter */}
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-600" />
                <span className="text-slate-600">Properties:</span>
                <span className="font-bold text-slate-900 font-mono">
                  {loading ? '...' : properties.length}
                </span>
              </div>
              <div className="w-px h-4 bg-slate-200" />
              <div className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-600" />
                <span className="text-slate-600">Tenants:</span>
                <span className="font-bold text-slate-900 font-mono">
                  {loading ? '...' : tenants.length}
                </span>
              </div>
            </div>

            <button
              onClick={loadData}
              disabled={loading}
              className="text-[11px] text-slate-500 hover:text-slate-900 flex items-center gap-1 font-semibold"
              title="Refresh record counts"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* 1. Scope Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              1. Select Data Scope
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Both */}
              <button
                type="button"
                onClick={() => setScope('both')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  scope === 'both'
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-600/20'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <Layers className={`w-4 h-4 ${scope === 'both' ? 'text-blue-600' : 'text-slate-500'}`} />
                  {scope === 'both' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-900">Master Report</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Properties & Tenants combined</div>
                </div>
              </button>

              {/* Properties Only */}
              <button
                type="button"
                onClick={() => setScope('properties')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  scope === 'properties'
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-600/20'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <Building2 className={`w-4 h-4 ${scope === 'properties' ? 'text-blue-600' : 'text-slate-500'}`} />
                  {scope === 'properties' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-900">Properties Only</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Buildings, units, occupancy</div>
                </div>
              </button>

              {/* Tenants Only */}
              <button
                type="button"
                onClick={() => setScope('tenants')}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                  scope === 'tenants'
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-600/20'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <Users className={`w-4 h-4 ${scope === 'tenants' ? 'text-blue-600' : 'text-slate-500'}`} />
                  {scope === 'tenants' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-900">Tenants Only</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Contacts, units, balances</div>
                </div>
              </button>
            </div>
          </div>

          {/* 2. Format Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-600">
              2. Select Export Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* PDF */}
              <button
                type="button"
                onClick={() => setFormat('pdf')}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  format === 'pdf'
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-600/20'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="p-2 bg-rose-100 text-rose-700 rounded-lg shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">PDF Document</span>
                    {format === 'pdf' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Styled official printable document with KPI badges & headers
                  </p>
                </div>
              </button>

              {/* CSV */}
              <button
                type="button"
                onClick={() => setFormat('csv')}
                className={`p-3.5 rounded-xl border text-left transition-all flex items-start gap-3 ${
                  format === 'csv'
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-600/20'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">CSV Spreadsheet</span>
                    {format === 'csv' && <CheckCircle2 className="w-4 h-4 text-blue-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Universal format for Microsoft Excel, Google Sheets, or ERP
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Quick Direct Actions */}
          <div className="pt-2 border-t border-slate-100">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Quick 1-Click Exports
            </span>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                onClick={() => exportPropertiesCSV(properties)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium flex items-center gap-1.5 transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Properties (CSV)</span>
              </button>
              <button
                onClick={() => exportPropertiesPDF(properties)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium flex items-center gap-1.5 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600" />
                <span>Properties (PDF)</span>
              </button>
              <button
                onClick={() => exportTenantsCSV(tenants)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium flex items-center gap-1.5 transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Tenants (CSV)</span>
              </button>
              <button
                onClick={() => exportTenantsPDF(tenants)}
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium flex items-center gap-1.5 transition-colors"
              >
                <FileText className="w-3.5 h-3.5 text-rose-600" />
                <span>Tenants (PDF)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={handleExport}
            disabled={loading || exporting || (properties.length === 0 && tenants.length === 0)}
            className="flex items-center gap-2 px-5 py-2 text-xs font-bold bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg shadow-xs transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>
              {exporting
                ? 'Generating File...'
                : `Download ${scope === 'both' ? 'Master' : scope === 'properties' ? 'Properties' : 'Tenants'} (${format.toUpperCase()})`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
