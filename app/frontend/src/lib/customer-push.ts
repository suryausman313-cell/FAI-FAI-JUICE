import { getAPIBaseURL } from '@/lib/config';

const VAPID_KEY_STORAGE = 'fai_fai_customer_vapid_public_key';

export interface CustomerPushState {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
}

function isSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function apiUrl(path: string): string {
  return `${getAPIBaseURL()}${path}`;
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('vita_customer_token') || '';
  if (!token) throw new Error('Please login to enable order notifications');

  const response = await fetch(apiUrl(path), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.detail || data?.message || 'Notification request failed');
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

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/customer-sw.js', {
    scope: '/customer-push/',
  });
  await registration.update().catch(() => undefined);
  return registration;
}

async function sendSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Browser did not return notification encryption keys');
  }

  await apiRequest('/api/v1/customer-push/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });
}

async function publicKey(): Promise<string> {
  const result = await apiRequest<{ public_key: string }>(
    '/api/v1/customer-push/public-key',
  );
  if (!result.public_key) throw new Error('Notification public key was not returned');
  return result.public_key;
}

export async function getCustomerPushState(): Promise<CustomerPushState> {
  if (!isSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false };
  }
  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
  };
}

export async function enableCustomerPush(): Promise<CustomerPushState> {
  if (!isSupported()) throw new Error('This browser does not support notifications');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Please allow notifications in browser settings');
  }

  const registration = await getRegistration();
  const key = await publicKey();
  let subscription = await registration.pushManager.getSubscription();
  const previousKey = localStorage.getItem(VAPID_KEY_STORAGE);
  if (subscription && previousKey && previousKey !== key) {
    await subscription.unsubscribe();
    subscription = null;
  }
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }

  await sendSubscription(subscription);
  localStorage.setItem(VAPID_KEY_STORAGE, key);
  return { supported: true, permission, subscribed: true };
}

export async function syncCustomerPushIfAllowed(): Promise<CustomerPushState> {
  const state = await getCustomerPushState();
  if (!state.supported || state.permission !== 'granted' || !state.subscribed) {
    return state;
  }
  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await sendSubscription(subscription);
  return { ...state, subscribed: true };
}
