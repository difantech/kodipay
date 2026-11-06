/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatKSh } from '../lib/api.ts';
import { Property, RentalUnit } from '../types/index.ts';
import { Building2, Plus, DoorOpen, MapPin, Archive, AlertCircle, RefreshCw, BookmarkCheck } from 'lucide-react';
import { AddUnitModal } from '../components/AddUnitModal.tsx';
import { useAuth } from '../context/AuthContext.tsx';

interface PropertiesPageProps {
  onOpenAddProperty: () => void;
  onOpenAddTenantWithUnit: (unitId: string) => void;
  onOpenBookUnit?: (unitId: string) => void;
}

export const PropertiesPage: React.FC<PropertiesPageProps> = ({
  onOpenAddProperty,
  onOpenAddTenantWithUnit,
  onOpenBookUnit
}) => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add unit state
  const [addUnitTarget, setAddUnitTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetchProperties();
  }, []);

  const fetchProperties = async () => {
    setLoading(true);
    try {
      const res = await apiRequest<Property[]>('/api/properties');
      setProperties(res);
      if (res.length > 0 && !selectedProperty) {
        fetchPropertyDetails(res[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch properties');
    } finally {
      setLoading(false);
    }
  };

  const fetchPropertyDetails = async (id: string) => {
    try {
      const res = await apiRequest<Property>(`/api/properties/${id}`);
      setSelectedProperty(res);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch property details');
    }
  };

  const handleArchiveProperty = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to archive "${name}"? Only properties with zero active tenancies can be archived.`)) {
      return;
    }
    try {
      await apiRequest(`/api/properties/${id}`, { method: 'DELETE' });
      fetchProperties();
      if (selectedProperty?.id === id) {
        setSelectedProperty(null);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to archive property');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900">Managed Real Estate Properties</h2>
          <p className="text-xs text-slate-500">Residential complexes, commercial buildings, and apartment blocks</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchProperties}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          {isAdmin && (
            <button
              onClick={onOpenAddProperty}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Property</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-800">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Grid: Properties List & Active Property Units View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Properties List */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-1">
            Properties ({properties.length})
          </h3>

          <div className="space-y-2">
            {properties.map((p) => {
              const isSelected = selectedProperty?.id === p.id;
              const occPercent = p.total_units ? Math.round(((p.occupied_units || 0) / p.total_units) * 100) : 0;
              return (
                <div
                  key={p.id}
                  onClick={() => fetchPropertyDetails(p.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-blue-50/70 border-blue-500 shadow-xs ring-1 ring-blue-500'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">
                        {p.code}
                      </span>
                      <h4 className="font-bold text-sm text-slate-900 mt-1">{p.name}</h4>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        <span className="truncate">{p.estate ? `${p.estate}, ` : ''}{p.city}</span>
                      </p>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchiveProperty(p.id, p.name);
                        }}
                        title="Archive property"
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-800">{p.occupied_units || 0}/{p.total_units || 0}</span>
                      <span>Occupied ({occPercent}%)</span>
                    </div>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {formatKSh(p.expected_monthly_rent_cents || 0)}/mo
                    </span>
                  </div>
                </div>
              );
            })}

            {properties.length === 0 && !loading && (
              <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-xl border border-slate-200">
                No properties registered yet. Click "Add Property" to begin.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Detailed Property & Rental Units Grid */}
        <div className="lg:col-span-2">
          {selectedProperty ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              {/* Property Details Banner */}
              <div className="p-5 border-b border-slate-200 bg-slate-50/50">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 bg-blue-100 text-blue-900 rounded">
                        {selectedProperty.code}
                      </span>
                      <h3 className="font-bold text-lg text-slate-900">{selectedProperty.name}</h3>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{selectedProperty.address}</p>
                    {selectedProperty.description && (
                      <p className="text-xs text-slate-500 mt-0.5">{selectedProperty.description}</p>
                    )}
                  </div>

                  <button
                    onClick={() => setAddUnitTarget({ id: selectedProperty.id, name: selectedProperty.name })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Unit</span>
                  </button>
                </div>
              </div>

              {/* Units Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Unit #</th>
                      <th className="py-3 px-4">Layout / Type</th>
                      <th className="py-3 px-4">Monthly Rent</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Current Tenant</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedProperty.units && selectedProperty.units.length > 0 ? (
                      selectedProperty.units.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900">
                            {u.unit_number}
                            {u.floor && <span className="block text-[11px] font-normal text-slate-500">{u.floor}</span>}
                          </td>
                          <td className="py-3 px-4 text-slate-700">{u.unit_type}</td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-900 tabular-nums">
                            {formatKSh(u.monthly_rent_cents)}
                          </td>
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
                            {u.status === 'vacant' ? (
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
                                  Assign Tenant
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-500 font-medium">Occupied</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No units added to this property yet. Click "Add Unit" to add rental units.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center bg-white rounded-xl border border-slate-200 text-slate-400 text-xs">
              Select a property on the left to view units and occupancy details.
            </div>
          )}
        </div>
      </div>

      {/* Add Unit Modal */}
      {addUnitTarget && (
        <AddUnitModal
          isOpen={true}
          propertyId={addUnitTarget.id}
          propertyName={addUnitTarget.name}
          onClose={() => setAddUnitTarget(null)}
          onSuccess={() => {
            fetchPropertyDetails(addUnitTarget.id);
            fetchProperties();
          }}
        />
      )}
    </div>
  );
};
