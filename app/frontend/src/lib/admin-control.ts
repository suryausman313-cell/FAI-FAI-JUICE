import { getAPIBaseURL } from '@/lib/config';

export const ADMIN_TOKEN_KEY = 'fai_fai_admin_token';

export interface AdminPermissions {
  orders: boolean;
  menu: boolean;
  sales: boolean;
  customers: boolean;
  settings: boolean;
  deals: boolean;
  notifications: boolean;
  feedback: boolean;
  accounts: boolean;
  riders: boolean;
  kitchen: boolean;
  logs: boolean;
}

export interface AdminSession {
  username: string;
  role: 'super_admin' | 'admin' | 'manager';
  permissions: AdminPermissions;
  branch_id?: number | null;
}

export interface AdminAccount {
  id: string;
  username: string;
  role: 'admin' | 'manager';
  branch_id: number | null;
  permissions: AdminPermissions;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ResetPreviewEntry {
  rows: number;
  tables: Record<string, number>;
}

export interface ResetPreview {
  resets: Record<string, ResetPreviewEntry>;
}

function getToken(): string {
  return localStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

function errorMessage(payload: any, status: number): string {
  return (
    payload?.detail ||
    payload?.message ||
    `Request failed (${status})`
  );
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  authenticated = true,
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (authenticated) {
    const token = getToken();
    if (!token) {
      throw new Error('Admin login required');
    }
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(
    `${getAPIBaseURL()}/api/v1/fai-fai-admin-control${path}`,
    {
      ...options,
      headers,
    },
  );

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401) {
      clearAdminSession();
    }
    throw new Error(errorMessage(payload, response.status));
  }

  return payload as T;
}

export function saveAdminSession(
  token: string,
  session: AdminSession,
): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
  localStorage.setItem(
    'admin_auth',
    JSON.stringify({
      ...session,
      loggedIn: true,
      timestamp: Date.now(),
    }),
  );
}

export function clearAdminSession(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem('admin_auth');
}

export function readAdminSession(): AdminSession | null {
  try {
    const value = JSON.parse(
      localStorage.getItem('admin_auth') || '{}',
    );
    if (!value.loggedIn) return null;
    return {
      username: String(value.username || ''),
      role: value.role,
      permissions: value.permissions || {},
      branch_id: value.branch_id == null ? null : Number(value.branch_id),
    } as AdminSession;
  } catch {
    return null;
  }
}

export async function loginAdmin(
  username: string,
  password: string,
): Promise<AdminSession> {
  const response = await request<{
    token: string;
    username: string;
    role: AdminSession['role'];
    permissions: AdminPermissions;
    branch_id?: number | null;
  }>(
    '/login',
    {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    },
    false,
  );

  const session: AdminSession = {
    username: response.username,
    role: response.role,
    permissions: response.permissions,
    branch_id: response.branch_id == null ? null : Number(response.branch_id),
  };
  saveAdminSession(response.token, session);
  return session;
}

export async function getAdminMe(): Promise<AdminSession> {
  return request<AdminSession>('/me');
}

export async function updateSuperAdmin(data: {
  current_password: string;
  new_username: string;
  new_password: string;
}): Promise<{ success: boolean; message: string; username: string }> {
  return request('/super-admin', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function listAdminAccounts(): Promise<AdminAccount[]> {
  const response = await request<{ items: AdminAccount[] }>(
    '/accounts',
  );
  return response.items || [];
}

export async function createAdminAccount(data: {
  username: string;
  password: string;
  role: 'admin' | 'manager';
  branch_id: number;
  permissions: AdminPermissions;
}): Promise<void> {
  await request('/accounts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateAdminAccount(
  id: string,
  data: Partial<{
    username: string;
    password: string;
    role: 'admin' | 'manager';
    branch_id: number;
    permissions: AdminPermissions;
    is_active: boolean;
  }>,
): Promise<void> {
  await request(`/accounts/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteAdminAccount(id: string): Promise<void> {
  await request(`/accounts/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function loadResetPreview(): Promise<ResetPreview> {
  return request('/reset/preview');
}

export async function runDataReset(
  resetType: string,
  confirmation: string,
): Promise<{
  success: boolean;
  message: string;
  deleted_rows: number;
  deleted_tables: Record<string, number>;
}> {
  return request('/reset', {
    method: 'POST',
    body: JSON.stringify({
      reset_type: resetType,
      confirmation,
    }),
  });
}
