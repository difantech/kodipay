/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatKSh } from '../lib/api.ts';
import { Property, RentalUnit } from '../types/index.ts';
import { DoorOpen, Search, Filter, Plus, RefreshCw, BookmarkCheck, LogOut } from 'lucide-react';
import { AssignOutModal } from '../components/AssignOutModal.tsx';

interface UnitsPageProps {
  onOpenAddProperty: () => void;
  onOpenAddTenantWithUnit: (unitId: string) => void;
  onOpenBookUnit?: (unitId: string) => void;
}

export const UnitsPage: React.FC<UnitsPageProps> = ({
  onOpenAddTenantWithUnit,
  onOpenBookUnit
}) => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [allUnits, setAllUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [propertyFilter, setPropertyFilter] = useState('');
  const [assignOutTenantId, setAssignOutTenantId] = useState<string | null>(null);
  const [assignOutOpen, setAssignOutOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const props = await apiRequest<Property[]>('/api/properties');
      setProperties(props);

      const units: any[] = [];
      for (const p of props) {
        // Fetch detailed property
        const full = await apiRequest<Property>(`/api/properties/${p.id}`);
        if (full.units) {
          full.units.forEach((u) => {
            units.push({
              ...u,
              property_name: p.name,
              property_code: p.code,
              property_address: p.address
            });
          });
        }
      }
      setAllUnits(units);
    } catch (err) {
      console.error('Error fetching units:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredUnits = allUnits.filter((u) => {
    const matchesSearch =
      u.unit_number.toLowerCase().includes(search.toLowerCase()) ||
      u.property_name.toLowerCase().includes(search.toLowerCase()) ||
      (u.tenant_name && u.tenant_name.toLowerCase().includes(search.toLowerCase())) ||
      u.unit_type.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = !statusFilter || u.status === statusFilter;
    const matchesProperty = !propertyFilter || u.property_id === propertyFilter;

    return matchesSearch && matchesStatus && matchesProperty;
  });

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by unit number, tenant, or property..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="">All Statuses</option>
            <option value="vacant">Vacant</option>
            <option value="occupied">Occupied</option>
            <option value="maintenance">Maintenance</option>
          </select>

          <select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value)}
            className="h-9 px-3 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="">All Properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            onClick={fetchData}
            title="Refresh units list"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="text-xs text-slate-500">
          Showing <span className="font-bold text-slate-900">{filteredUnits.length}</span> units
        </div>
      </div>

      {/* Units Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Property</th>
                <th className="py-3 px-4">Unit #</th>
                <th className="py-3 px-4">Type / Layout</th>
                <th className="py-3 px-4">Monthly Rent</th>
                <th className="py-3 px-4">Due Day</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Current Occupant</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUnits.length > 0 ? (
                filteredUnits.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 block">{u.property_name}</span>
                      <span className="text-[11px] text-slate-500 font-mono">{u.property_code}</span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {u.unit_number}
                      {u.floor && <span className="block text-[11px] font-normal text-slate-500">{u.floor}</span>}
                    </td>
                    <td className="py-3 px-4 text-slate-700">{u.unit_type}</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 tabular-nums">
                      {formatKSh(u.monthly_rent_cents)}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">Day {u.default_due_day || 5}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block font-semibold uppercase text-[10px] tracking-wider ${
                          u.status === 'occupied'
                            ? 'text-emerald-700'
                            : u.status === 'vacant'
                            ? 'text-blue-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {u.tenant_name ? (
                        <div>
                          <span className="font-semibold text-slate-900 block">{u.tenant_name}</span>
                          <span className="text-[11px] text-slate-500 font-mono">{u.tenant_phone}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">None (Vacant)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {u.status === 'vacant' && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onOpenBookUnit ? onOpenBookUnit(u.id) : onOpenAddTenantWithUnit(u.id)}
                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 rounded border border-amber-300 transition-colors shadow-2xs"
                            title="Book and reserve this vacant rental unit"
                          >
                            <BookmarkCheck className="w-3 h-3 text-amber-600" />
                            <span>Book Unit</span>
                          </button>
                          <button
                            onClick={() => onOpenAddTenantWithUnit(u.id)}
                            className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded border border-emerald-300 transition-colors"
                            title="Assign tenant to unit immediately"
                          >
                            Assign Unit
                          </button>
                        </div>
                      )}
                      {u.status === 'occupied' && u.tenant_id && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setAssignOutTenantId(u.tenant_id);
                              setAssignOutOpen(true);
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 rounded border border-rose-300 transition-colors"
                            title="Vacate tenant, calculate final settlement statement and free up unit"
                          >
                            <LogOut className="w-3 h-3 text-rose-600" />
                            <span>Assign Out</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No rental units matching filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AssignOutModal
        isOpen={assignOutOpen}
        tenantId={assignOutTenantId}
        onClose={() => {
          setAssignOutOpen(false);
          setAssignOutTenantId(null);
        }}
        onSuccess={() => {
          fetchData();
        }}
      />
    </div>
  );
};
