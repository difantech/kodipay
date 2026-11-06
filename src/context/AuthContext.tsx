/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types/index.ts';
import { apiRequest, getStoredToken, setStoredToken } from '../lib/api.ts';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  needsSetup: boolean;
  login: (token: string, user: User) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  checkSetupStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  const checkSetupStatus = async () => {
    try {
      const res = await apiRequest<{ needsInitialSetup: boolean }>('/api/auth/setup-status');
      setNeedsSetup(res.needsInitialSetup);
    } catch (err) {
      console.warn('Could not check setup status:', err);
    }
  };

  const refreshUser = async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await apiRequest<{ user: User }>('/api/auth/me');
      setUser(res.user);
    } catch {
      // Normal session expiry or invalidation: clear token and reset user state cleanly
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      await checkSetupStatus();
      await refreshUser();
    };
    init();
  }, []);

  const login = (token: string, userData: User) => {
    setStoredToken(token);
    setUser(userData);
    setNeedsSetup(false);
  };

  const logout = async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    } finally {
      setStoredToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        needsSetup,
        login,
        logout,
        refreshUser,
        checkSetupStatus
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
