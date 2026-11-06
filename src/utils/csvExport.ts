/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Property } from '../types/index.ts';

// Helper to escape CSV values according to RFC 4180
const escapeCSV = (value: any): string => {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  // If string contains comma, quote, or newline, escape quotes and wrap in quotes
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
};

// Helper to trigger browser download of CSV with UTF-8 BOM
export const downloadCSV = (filename: string, content: string) => {
  const bom = '\uFEFF'; // UTF-8 Byte Order Mark for Excel compatibility
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Export Properties Data to CSV
 */
export const exportPropertiesCSV = (properties: Property[]) => {
  const headers = [
    'Property ID',
    'Property Name',
    'Property Code',
    'Property Type',
    'Physical Address',
    'Estate',
    'City',
    'County',
    'Landlord / Manager',
    'Total Units',
    'Occupied Units',
    'Vacant Units',
    'Occupancy Rate (%)',
    'Expected Monthly Rent (KSh)',
    'Created At'
  ];

  const rows = properties.map((p: any) => {
    const totalUnits = parseInt(p.total_units || 0, 10);
    const occupiedUnits = parseInt(p.occupied_units || 0, 10);
    const vacantUnits = parseInt(p.vacant_units || 0, 10);
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
    const rentKSh = p.expected_monthly_rent_cents
      ? (parseInt(p.expected_monthly_rent_cents, 10) / 100).toFixed(2)
      : '0.00';

    return [
      escapeCSV(p.id),
      escapeCSV(p.name),
      escapeCSV(p.code),
      escapeCSV(p.property_type || 'Residential'),
      escapeCSV(p.address),
      escapeCSV(p.estate || ''),
      escapeCSV(p.city || 'Nairobi'),
      escapeCSV(p.county || 'Nairobi'),
      escapeCSV(p.landlord_name || 'Assigned Manager'),
      escapeCSV(totalUnits),
      escapeCSV(occupiedUnits),
      escapeCSV(vacantUnits),
      escapeCSV(`${occupancyRate}%`),
      escapeCSV(rentKSh),
      escapeCSV(p.created_at ? new Date(p.created_at).toISOString().slice(0, 10) : '')
    ].join(',');
  });

  const csvContent = [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
  const dateTag = new Date().toISOString().slice(0, 10);
  downloadCSV(`KodiPay_Properties_${dateTag}.csv`, csvContent);
};

/**
 * Export Tenants Data to CSV
 */
export const exportTenantsCSV = (tenants: any[]) => {
  const headers = [
    'Tenant ID',
    'Full Name',
    'Phone Number',
    'National ID / Passport',
    'Email Address',
    'Assigned Property',
    'Property Code',
    'Unit Number',
    'Monthly Rent (KSh)',
    'Current Arrears / Balance (KSh)',
    'Lease Start Date',
    'Tenancy Status',
    'Registration Date'
  ];

  const rows = tenants.map((t: any) => {
    const rentKSh = t.rent_amount_cents
      ? (parseInt(t.rent_amount_cents, 10) / 100).toFixed(2)
      : '0.00';
    const balanceKSh = t.total_balance_cents
      ? (parseInt(t.total_balance_cents, 10) / 100).toFixed(2)
      : '0.00';

    return [
      escapeCSV(t.id),
      escapeCSV(t.full_name || t.name),
      escapeCSV(t.phone_number || t.phone),
      escapeCSV(t.national_id || ''),
      escapeCSV(t.email || ''),
      escapeCSV(t.property_name || 'Unassigned'),
      escapeCSV(t.property_code || ''),
      escapeCSV(t.unit_number ? `Unit ${t.unit_number}` : 'Unassigned'),
      escapeCSV(rentKSh),
      escapeCSV(balanceKSh),
      escapeCSV(t.start_date ? new Date(t.start_date).toISOString().slice(0, 10) : ''),
      escapeCSV(t.is_active === false ? 'Past / Terminated' : (t.property_name ? 'Active' : 'Registered')),
      escapeCSV(t.created_at ? new Date(t.created_at).toISOString().slice(0, 10) : '')
    ].join(',');
  });

  const csvContent = [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
  const dateTag = new Date().toISOString().slice(0, 10);
  downloadCSV(`KodiPay_Tenants_${dateTag}.csv`, csvContent);
};

/**
 * Export Combined Properties & Tenants to a Unified CSV
 */
export const exportCombinedCSV = (properties: Property[], tenants: any[]) => {
  const lines: string[] = [];

  // Header Summary Section
  lines.push(escapeCSV('KODIPAY KENYA - PROPERTY & TENANT MASTER REPORT'));
  lines.push(escapeCSV(`Generated at: ${new Date().toISOString()} (Africa/Nairobi EAT)`));
  lines.push('');

  // 1. PROPERTIES SECTION
  lines.push(escapeCSV('=== SECTION 1: MANAGED PROPERTIES & OCCUPANCY ==='));
  const propHeaders = [
    'Property Name',
    'Code',
    'Type',
    'Address',
    'Estate / City',
    'County',
    'Total Units',
    'Occupied Units',
    'Vacant Units',
    'Occupancy %',
    'Expected Monthly Rent (KSh)'
  ];
  lines.push(propHeaders.map(escapeCSV).join(','));

  properties.forEach((p: any) => {
    const totalUnits = parseInt(p.total_units || 0, 10);
    const occupiedUnits = parseInt(p.occupied_units || 0, 10);
    const vacantUnits = parseInt(p.vacant_units || 0, 10);
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
    const rentKSh = p.expected_monthly_rent_cents
      ? (parseInt(p.expected_monthly_rent_cents, 10) / 100).toFixed(2)
      : '0.00';

    lines.push([
      escapeCSV(p.name),
      escapeCSV(p.code),
      escapeCSV(p.property_type || 'Residential'),
      escapeCSV(p.address),
      escapeCSV(`${p.estate || ''} ${p.city || 'Nairobi'}`.trim()),
      escapeCSV(p.county || 'Nairobi'),
      escapeCSV(totalUnits),
      escapeCSV(occupiedUnits),
      escapeCSV(vacantUnits),
      escapeCSV(`${occupancyRate}%`),
      escapeCSV(rentKSh)
    ].join(','));
  });

  lines.push('');
  lines.push('');

  // 2. TENANTS SECTION
  lines.push(escapeCSV('=== SECTION 2: REGISTERED TENANTS & LEASE DIRECTORY ==='));
  const tenantHeaders = [
    'Full Name',
    'Phone Number',
    'National ID',
    'Email Address',
    'Assigned Property',
    'Unit Number',
    'Monthly Rent (KSh)',
    'Arrears / Balance (KSh)',
    'Lease Start Date',
    'Status'
  ];
  lines.push(tenantHeaders.map(escapeCSV).join(','));

  tenants.forEach((t: any) => {
    const rentKSh = t.rent_amount_cents
      ? (parseInt(t.rent_amount_cents, 10) / 100).toFixed(2)
      : '0.00';
    const balanceKSh = t.total_balance_cents
      ? (parseInt(t.total_balance_cents, 10) / 100).toFixed(2)
      : '0.00';

    lines.push([
      escapeCSV(t.full_name || t.name),
      escapeCSV(t.phone_number || t.phone),
      escapeCSV(t.national_id || ''),
      escapeCSV(t.email || ''),
      escapeCSV(t.property_name || 'Unassigned'),
      escapeCSV(t.unit_number ? `Unit ${t.unit_number}` : 'Unassigned'),
      escapeCSV(rentKSh),
      escapeCSV(balanceKSh),
      escapeCSV(t.start_date ? new Date(t.start_date).toISOString().slice(0, 10) : ''),
      escapeCSV(t.is_active === false ? 'Past / Terminated' : (t.property_name ? 'Active' : 'Registered'))
    ].join(','));
  });

  const dateTag = new Date().toISOString().slice(0, 10);
  downloadCSV(`KodiPay_Master_Report_${dateTag}.csv`, lines.join('\r\n'));
};
