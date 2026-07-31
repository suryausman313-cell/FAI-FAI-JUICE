
import { getAPIBaseURL } from '@/lib/config';

const VAPID_KEY_STORAGE = 'vita_admin_vapid_public_key';
const CASH_PREF_STORAGE = 'vita_admin_push_cash';
const READY_PREF_STORAGE = 'vita_admin_push_ready';

export interface AdminPushPreferences {
  cashEnabled: boolean;
  readyEnabled: boolean;
}

export interface AdminPushState extends AdminPushPreferences {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
}

function apiUrl(path: string): string {
  return `${getAPIBaseURL()}${path}`;
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || 'Admin notification request failed');
  }

  return data as T;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getStoredAdminPushPreferences(): AdminPushPreferences {
  return {
    cashEnabled: localStorage.getItem(CASH_PREF_STORAGE) !== 'off',
    readyEnabled: localStorage.getItem(READY_PREF_STORAGE) !== 'off',
  };
}

function savePreferences(preferences: AdminPushPreferences): void {
  localStorage.setItem(CASH_PREF_STORAGE, preferences.cashEnabled ? 'on' : 'off');
  localStorage.setItem(READY_PREF_STORAGE, preferences.readyEnabled ? 'on' : 'off');
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/admin-sw.js', {
    scope: '/admin/',
  });
  await registration.update().catch(() => undefined);
  return registration;
}

async function getPublicKey(): Promise<string> {
  const result = await apiRequest<{ public_key: string }>(
    '/api/v1/admin-push/public-key',
  );
  if (!result.public_key) {
    throw new Error('Admin notification public key was not returned');
  }
  return result.public_key;
}

async function sendSubscriptionToBackend(
  subscription: PushSubscription,
  preferences: AdminPushPreferences,
): Promise<void> {
  const json = subscription.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;

  if (!p256dh || !auth) {
    throw new Error('Browser did not return push encryption keys');
  }

  await apiRequest('/api/v1/admin-push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: { p256dh, auth },
      cash_enabled: preferences.cashEnabled,
      ready_enabled: preferences.readyEnabled,
    }),
  });
}

export async function getAdminPushState(): Promise<AdminPushState> {
  const preferences = getStoredAdminPushPreferences();

  if (!isSupported()) {
    return {
      ...preferences,
      supported: false,
      permission: 'unsupported',
      subscribed: false,
    };
  }

  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();

  return {
    ...preferences,
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
  };
}

export async function enableAdminPush(
  preferences: AdminPushPreferences,
): Promise<AdminPushState> {
  if (!isSupported()) {
    throw new Error('This browser does not support background notifications');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Notification permission was not allowed');
  }

  const registration = await getRegistration();
  const publicKey = await getPublicKey();
  let subscription = await registration.pushManager.getSubscription();
  const previousKey = localStorage.getItem(VAPID_KEY_STORAGE);

  if (subscription && previousKey && previousKey !== publicKey) {
    await subscription.unsubscribe();
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  savePreferences(preferences);
  localStorage.setItem(VAPID_KEY_STORAGE, publicKey);
  await sendSubscriptionToBackend(subscription, preferences);

  return {
    ...preferences,
    supported: true,
    permission,
    subscribed: true,
  };
}

export async function updateAdminPushPreferences(
  preferences: AdminPushPreferences,
): Promise<AdminPushState> {
  savePreferences(preferences);

  if (!isSupported()) {
    return {
      ...preferences,
      supported: false,
      permission: 'unsupported',
      subscribed: false,
    };
  }

  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await apiRequest('/api/v1/admin-push/preferences', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        cash_enabled: preferences.cashEnabled,
        ready_enabled: preferences.readyEnabled,
      }),
    });
  }

  return {
    ...preferences,
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
  };
}

export async function disableAdminPush(): Promise<AdminPushState> {
  const preferences = getStoredAdminPushPreferences();

  if (!isSupported()) {
    return {
      ...preferences,
      supported: false,
      permission: 'unsupported',
      subscribed: false,
    };
  }

  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();

  if (subscription) {
    await apiRequest('/api/v1/admin-push/unsubscribe', {
      method: 'POST',
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
    await subscription.unsubscribe();
  }

  return {
    ...preferences,
    supported: true,
    permission: Notification.permission,
    subscribed: false,
  };
}

export async function sendAdminPushTest(): Promise<number> {
  const result = await apiRequest<{ sent: number }>('/api/v1/admin-push/test', {
    method: 'POST',
    body: '{}',
  });
  return Number(result.sent || 0);
}

export async function scanAdminPushEventsNow(): Promise<void> {
  await apiRequest('/api/v1/admin-push/scan-now', {
    method: 'POST',
    body: '{}',
  });
}
