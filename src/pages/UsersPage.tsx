/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { apiRequest, formatDate } from '../lib/api.ts';
import { User, UserRole } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import {
  ShieldAlert,
  UserPlus,
  Check,
  X,
  AlertCircle,
  RefreshCw,
  KeyRound,
  ShieldCheck,
  Search,
  Filter,
  Users,
  Building2,
  DoorOpen,
  Edit,
  Trash2,
  Clock,
  Activity,
  Lock,
  Eye,
  EyeOff,
  UserCheck,
  UserX,
  Shield
} from 'lucide-react';

interface UserStatsSummary {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  superAdmins: number;
  caretakers: number;
  tenants: number;
  recentLogins24h: number;
  recentLogins7d: number;
}

interface UserActivityPayload {
  user: { id: string; email: string; full_name: string };
  auditLogs: Array<{
    id: string;
    action: string;
    entity_type: string;
    ip_address?: string;
    created_at: string;
    changes?: any;
  }>;
  sessions: Array<{
    id: string;
    ip_address?: string;
    user_agent?: string;
    is_revoked: boolean;
    created_at: string;
    last_active_at?: string;
  }>;
}

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<UserStatsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTargetUser, setEditTargetUser] = useState<User | null>(null);
  const [resetTargetUser, setResetTargetUser] = useState<User | null>(null);
  const [activityTargetUser, setActivityTargetUser] = useState<User | null>(null);
  const [activityData, setActivityData] = useState<UserActivityPayload | null>(null);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<User | null>(null);

  // Form states - Create
  const [createForm, setCreateForm] = useState({
    fullName: '',
    email: '',
    password: 'Password2026!',
    phoneNumber: '+254',
    nationalId: '',
    role: 'caretaker' as UserRole
  });

  // Form states - Edit
  const [editForm, setEditForm] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    nationalId: '',
    role: 'caretaker' as UserRole,
    status: 'active' as 'active' | 'suspended' | 'deactivated'
  });

  // Form states - Reset Password
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchUsersAndStats();
  }, [roleFilter, statusFilter]);

  const fetchUsersAndStats = async () => {
    setLoading(true);
    setError(null);
    try {
      // Build query string
      const params = new URLSearchParams();
      if (roleFilter !== 'all') params.append('role', roleFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (searchTerm.trim()) params.append('search', searchTerm.trim());

      const url = `/api/users${params.toString() ? `?${params.toString()}` : ''}`;
      const [usersRes, statsRes] = await Promise.all([
        apiRequest<User[]>(url),
        apiRequest<UserStatsSummary>('/api/users/stats/summary').catch(() => null)
      ]);

      setUsers(usersRes);
      if (statsRes) setStats(statsRes);
    } catch (err: any) {
      setError(err.message || 'Failed to load user accounts');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsersAndStats();
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: createForm.fullName.trim(),
          email: createForm.email.trim().toLowerCase(),
          password: createForm.password,
          phoneNumber: createForm.phoneNumber.trim(),
          nationalId: createForm.nationalId.trim() || undefined,
          role: createForm.role
        })
      });

      setShowCreateModal(false);
      setCreateForm({
        fullName: '',
        email: '',
        password: 'Password2026!',
        phoneNumber: '+254',
        nationalId: '',
        role: 'caretaker'
      });
      setActionSuccess('New user account created successfully.');
      setTimeout(() => setActionSuccess(null), 5000);
      fetchUsersAndStats();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (user: User) => {
    setEditTargetUser(user);
    setEditForm({
      fullName: user.fullName,
      email: user.email,
      phoneNumber: user.phoneNumber || '',
      nationalId: user.nationalId || '',
      role: user.role,
      status: (user.status || (user.isActive ? 'active' : 'suspended')) as any
    });
    setError(null);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTargetUser) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest(`/api/users/${editTargetUser.id}`, {
        method: 'PUT',
        body: JSON.stringify(editForm)
      });

      setEditTargetUser(null);
      setActionSuccess(`User '${editForm.email}' updated successfully.`);
      setTimeout(() => setActionSuccess(null), 5000);
      fetchUsersAndStats();
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      const res = await apiRequest<{ message: string; user: User }>(`/api/users/${user.id}/toggle-status`, {
        method: 'PATCH'
      });
      setActionSuccess(res.message);
      setTimeout(() => setActionSuccess(null), 4000);
      fetchUsersAndStats();
    } catch (err: any) {
      alert(err.message || 'Failed to toggle account status');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTargetUser) return;
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest(`/api/users/${resetTargetUser.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword })
      });

      setActionSuccess(`Password reset successfully for ${resetTargetUser.email}. Previous sessions were revoked.`);
      setTimeout(() => setActionSuccess(null), 5000);
      setResetTargetUser(null);
      setNewPassword('');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTargetUser) return;
    setSubmitting(true);
    try {
      await apiRequest(`/api/users/${deleteTargetUser.id}`, { method: 'DELETE' });
      setActionSuccess(`Account '${deleteTargetUser.email}' deleted successfully.`);
      setTimeout(() => setActionSuccess(null), 5000);
      setDeleteTargetUser(null);
      fetchUsersAndStats();
    } catch (err: any) {
      alert(err.message || 'Failed to delete user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewActivity = async (user: User) => {
    setActivityTargetUser(user);
    setLoadingActivity(true);
    try {
      const res = await apiRequest<UserActivityPayload>(`/api/users/${user.id}/activity`);
      setActivityData(res);
    } catch (err: any) {
      alert(err.message || 'Failed to load user activity');
      setActivityTargetUser(null);
    } finally {
      setLoadingActivity(false);
    }
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
    let pwd = '';
    for (let i = 0; i < 12; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(pwd);
  };

  const formatLastLogin = (dateStr?: string | null) => {
    if (!dateStr) return 'Never logged in';
    const d = new Date(dateStr);
    const diffMs = Date.now() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateStr);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Permanent Super Admin Identity & Status */}
      <div className="bg-gradient-to-r from-[#0B1528] to-[#122340] text-white p-5 rounded-2xl shadow-md border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
            <ShieldCheck className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white tracking-tight">Super Administrator User Center</h2>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
                Active & Verified
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Logged in as <strong className="text-white font-mono">{currentUser?.email}</strong>. Unrestricted access to system users, roles, password resets, and audit logs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors shadow-xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add User</span>
          </button>
          <button
            onClick={fetchUsersAndStats}
            title="Refresh list"
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800/60 rounded-xl transition-colors border border-slate-700/60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Success Banner */}
      {actionSuccess && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-rose-700 hover:text-rose-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Users</span>
          <span className="text-xl font-bold text-slate-900 mt-1 block">
            {stats ? stats.totalUsers : users.length}
          </span>
          <span className="text-[10px] text-slate-500">In Neon Database</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 block">Super Admins</span>
          <span className="text-xl font-bold text-indigo-950 mt-1 block">
            {stats ? stats.superAdmins : users.filter((u) => u.role === 'super_admin').length}
          </span>
          <span className="text-[10px] text-slate-500">Unrestricted Access</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 block">Caretakers</span>
          <span className="text-xl font-bold text-amber-950 mt-1 block">
            {stats ? stats.caretakers : users.filter((u) => u.role === 'caretaker').length}
          </span>
          <span className="text-[10px] text-slate-500">Data Entry Only</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">Tenants</span>
          <span className="text-xl font-bold text-emerald-950 mt-1 block">
            {stats ? stats.tenants : users.filter((u) => u.role === 'tenant').length}
          </span>
          <span className="text-[10px] text-slate-500">Portal Accounts</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 block">Active Status</span>
          <span className="text-xl font-bold text-emerald-950 mt-1 block">
            {stats ? stats.activeUsers : users.filter((u) => u.isActive !== false).length}
          </span>
          <span className="text-[10px] text-slate-500">Operational</span>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">24h Logins</span>
          <span className="text-xl font-bold text-blue-950 mt-1 block">
            {stats ? stats.recentLogins24h : 0}
          </span>
          <span className="text-[10px] text-slate-500">Recent Sessions</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 min-w-[240px] max-w-md relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, email, phone, or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
            <span className="text-slate-500 font-medium">Role:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none"
            >
              <option value="all">All Roles</option>
              <option value="super_admin">Super Administrator</option>
              <option value="caretaker">Caretaker (Data Entry)</option>
              <option value="tenant">Tenant</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
            <span className="text-slate-500 font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>

          {(searchTerm || roleFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setRoleFilter('all');
                setStatusFilter('all');
              }}
              className="text-xs text-blue-700 hover:text-blue-900 font-semibold px-2 py-1"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Users Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 text-slate-600 uppercase font-bold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">System Role</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4">Last Login</th>
                <th className="py-3 px-4">Registered</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                    Loading system users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No user accounts match the current filter criteria.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isCurrent = currentUser?.id === u.id;
                  const isPrimarySuperAdmin = u.email === (currentUser?.email || 'joshkingtechnologies@gmail.com');
                  const isSuspended = u.status === 'suspended' || u.isActive === false;

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Name & ID */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase shrink-0 ${
                              u.role === 'super_admin'
                                ? 'bg-indigo-100 text-indigo-700'
                                : u.role === 'caretaker'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {u.fullName.slice(0, 2)}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900 block flex items-center gap-1.5">
                              {u.fullName}
                              {isCurrent && (
                                <span className="text-[9px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.2 rounded">
                                  YOU
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-[10px] text-slate-400 block">ID: {u.id.slice(0, 8)}...</span>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="py-3 px-4">
                        <span className="font-mono text-slate-800 block">{u.email}</span>
                        <span className="font-mono text-[11px] text-slate-500 block">
                          {u.phoneNumber || '—'} {u.nationalId ? `• ID: ${u.nationalId}` : ''}
                        </span>
                      </td>

                      {/* System Role */}
                      <td className="py-3 px-4">
                        {u.role === 'super_admin' ? (
                          <span className="inline-flex items-center gap-1 font-bold text-indigo-900 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-[11px]">
                            <Shield className="w-3 h-3 text-indigo-600" />
                            Super Administrator
                          </span>
                        ) : u.role === 'caretaker' ? (
                          <span className="inline-flex items-center gap-1 font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px]">
                            <Edit className="w-3 h-3 text-amber-600" />
                            Caretaker (Data Entry)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-900 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                            <Building2 className="w-3 h-3 text-emerald-600" />
                            Tenant Portal
                          </span>
                        )}
                      </td>

                      {/* Account Status */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isSuspended ? 'bg-rose-500' : 'bg-emerald-500'
                            }`}
                          />
                          <span
                            className={`font-semibold capitalize text-[11px] ${
                              isSuspended ? 'text-rose-700' : 'text-emerald-700'
                            }`}
                          >
                            {isSuspended ? 'Suspended' : 'Active'}
                          </span>
                        </div>
                      </td>

                      {/* Last Login */}
                      <td className="py-3 px-4 text-slate-600 text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{formatLastLogin(u.lastLoginAt)}</span>
                        </div>
                      </td>

                      {/* Registered Date */}
                      <td className="py-3 px-4 text-slate-500 text-[11px] whitespace-nowrap">
                        {formatDate(u.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEdit(u)}
                            title="Edit user information & role"
                            className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => {
                              setResetTargetUser(u);
                              setNewPassword('');
                            }}
                            title="Reset password"
                            className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleViewActivity(u)}
                            title="View user activity & audit logs"
                            className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            <Activity className="w-3.5 h-3.5" />
                          </button>

                          {!isCurrent && (
                            <button
                              onClick={() => handleToggleStatus(u)}
                              title={isSuspended ? 'Reactivate account' : 'Suspend account'}
                              className={`p-1.5 rounded-lg transition-colors ${
                                isSuspended
                                  ? 'text-emerald-600 hover:bg-emerald-50'
                                  : 'text-amber-600 hover:bg-amber-50'
                              }`}
                            >
                              {isSuspended ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                            </button>
                          )}

                          {!isCurrent && !isPrimarySuperAdmin && (
                            <button
                              onClick={() => setDeleteTargetUser(u)}
                              title="Delete account permanently"
                              className="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE USER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-[#0B1528] px-6 py-4 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm text-white">Create New System User</h3>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={createForm.fullName}
                    onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                    placeholder="e.g. Samuel Ochieng"
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="e.g. samuel@example.com"
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={createForm.phoneNumber}
                    onChange={(e) => setCreateForm({ ...createForm, phoneNumber: e.target.value })}
                    placeholder="+254712345678"
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">National ID (Optional)</label>
                  <input
                    type="text"
                    value={createForm.nationalId}
                    onChange={(e) => setCreateForm({ ...createForm, nationalId: e.target.value })}
                    placeholder="e.g. 33445566"
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Temporary Password *</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    className="w-full h-9 pl-3 pr-9 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Role & Permissions *</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserRole })}
                  className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  <option value="caretaker">Caretaker (Strict Data Entry: Record payments, tenants, units)</option>
                  <option value="super_admin">Super Administrator (Unrestricted administrative & financial control)</option>
                  <option value="tenant">Tenant (Dedicated Tenant Portal only)</option>
                </select>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Caretakers can enter daily records but cannot access system settings, reports, or delete records.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {editTargetUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-[#0B1528] px-6 py-4 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm text-white">Edit User: {editTargetUser.email}</h3>
              </div>
              <button
                onClick={() => setEditTargetUser(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={editForm.fullName}
                    onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={editForm.phoneNumber}
                    onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">National ID</label>
                  <input
                    type="text"
                    value={editForm.nationalId}
                    onChange={(e) => setEditForm({ ...editForm, nationalId: e.target.value })}
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">System Role</label>
                  <select
                    value={editForm.role}
                    disabled={currentUser?.id === editTargetUser.id}
                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value as UserRole })}
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="super_admin">Super Administrator</option>
                    <option value="caretaker">Caretaker (Data Entry)</option>
                    <option value="tenant">Tenant</option>
                  </select>
                  {currentUser?.id === editTargetUser.id && (
                    <span className="text-[10px] text-amber-600 mt-1 block">
                      Cannot change own role to prevent lockout.
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Account Status</label>
                  <select
                    value={editForm.status}
                    disabled={currentUser?.id === editTargetUser.id}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                    className="w-full h-9 px-3 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditTargetUser(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD MODAL */}
      {resetTargetUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-[#0B1528] px-6 py-4 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm text-white">Reset Password</h3>
              </div>
              <button
                onClick={() => setResetTargetUser(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                Enter a new password for <strong className="text-slate-900">{resetTargetUser.fullName}</strong> (
                {resetTargetUser.email}). Any existing active sessions will be terminated immediately.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                    className="w-full h-9 pl-3 pr-20 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 font-mono"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-1 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={generateRandomPassword}
                      className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded hover:bg-blue-100"
                    >
                      Generate
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setResetTargetUser(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !newPassword}
                  className="px-4 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-xl transition-colors shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Updating...' : 'Confirm Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* USER ACTIVITY MODAL */}
      {activityTargetUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-[#0B1528] px-6 py-4 text-white flex items-center justify-between border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm text-white">
                  Activity Trail: {activityTargetUser.fullName} ({activityTargetUser.email})
                </h3>
              </div>
              <button
                onClick={() => setActivityTargetUser(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {loadingActivity ? (
                <div className="py-12 text-center text-slate-400">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                  Loading activity trail...
                </div>
              ) : activityData ? (
                <>
                  {/* Sessions Summary */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                      Recent Login Sessions ({activityData.sessions.length})
                    </h4>
                    <div className="space-y-2">
                      {activityData.sessions.length === 0 ? (
                        <p className="text-xs text-slate-400">No session records found.</p>
                      ) : (
                        activityData.sessions.map((s) => (
                          <div
                            key={s.id}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between"
                          >
                            <div>
                              <span className="font-mono font-bold text-slate-800 block">IP: {s.ip_address || '—'}</span>
                              <span className="text-[11px] text-slate-500 block truncate max-w-sm">
                                {s.user_agent || 'Standard Client'}
                              </span>
                            </div>
                            <div className="text-right">
                              <span
                                className={`text-[10px] font-bold uppercase tracking-wider ${
                                  s.is_revoked ? 'text-slate-400' : 'text-emerald-700'
                                }`}
                              >
                                {s.is_revoked ? 'Revoked' : 'Active'}
                              </span>
                              <span className="text-[10px] text-slate-400 block">{formatDate(s.created_at)}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Audit Trail */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-2">
                      Administrative Audit Logs ({activityData.auditLogs.length})
                    </h4>
                    <div className="space-y-2">
                      {activityData.auditLogs.length === 0 ? (
                        <p className="text-xs text-slate-400">No audit records recorded for this user.</p>
                      ) : (
                        activityData.auditLogs.map((a) => (
                          <div key={a.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-slate-900 font-mono text-[11px]">{a.action}</span>
                              <span className="text-[10px] text-slate-400">{formatDate(a.created_at)}</span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] text-slate-500">
                              <span>Entity: {a.entity_type}</span>
                              <span className="font-mono">IP: {a.ip_address || '—'}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            <div className="p-4 border-t border-slate-100 flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setActivityTargetUser(null)}
                className="px-4 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTargetUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="bg-rose-900 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-300" />
                <h3 className="font-bold text-sm text-white">Delete User Account</h3>
              </div>
              <button
                onClick={() => setDeleteTargetUser(null)}
                className="text-rose-200 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-700 leading-relaxed">
                Are you sure you want to permanently delete the user account for{' '}
                <strong className="text-slate-900">{deleteTargetUser.fullName}</strong> ({deleteTargetUser.email})?
              </p>
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-800 leading-relaxed">
                <strong>Warning:</strong> All active sessions will be terminated and user associations in Neon
                PostgreSQL will be disassociated. This action cannot be undone.
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDeleteTargetUser(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleDeleteUser}
                  className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition-colors shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Deleting...' : 'Delete Account'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
