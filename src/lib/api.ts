/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const TOKEN_KEY = 'kodipay_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

/**
 * Format cents into Kenyan Shillings (KSh)
 * 3500000 cents -> "KSh 35,000"
 */
export function formatKSh(cents: number | undefined | null): string {
  if (cents === undefined || cents === null || isNaN(cents)) return 'KSh 0';
  const shillings = cents / 100;
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 0,
    maximumFractionDigits: shillings % 1 !== 0 ? 2 : 0
  }).format(shillings).replace('KES', 'KSh');
}

/**
 * Format Date to Africa/Nairobi legible string
 */
export function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return new Intl.DateTimeFormat('en-KE', {
      timeZone: 'Africa/Nairobi',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(d);
  } catch {
    return dateString;
  }
}

/**
 * Format Billing Month '2026-10' -> 'October 2026'
 */
export function formatMonth(monthStr: string | undefined | null): string {
  if (!monthStr || !monthStr.includes('-')) return monthStr || '—';
  try {
    const [year, month] = monthStr.split('-');
    const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return new Intl.DateTimeFormat('en-KE', {
      month: 'long',
      year: 'numeric'
    }).format(d);
  } catch {
    return monthStr;
  }
}

/**
 * API fetch request wrapper
 */
export async function apiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data as T;
}
