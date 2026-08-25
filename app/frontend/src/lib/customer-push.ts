import { getAPIBaseURL } from '@/lib/config';

const VAPID_KEY_STORAGE = 'fai_fai_customer_vapid_public_key';
const NOTIFICATION_PREF_STORAGE = 'fai_fai_customer_notifications_enabled';
const NOTIFICATION_PROMPTED_STORAGE = 'fai_fai_customer_notifications_prompted';

type PushPermission = NotificationPermission | 'unsupported';

interface NativePushBridge {
  isPushConfigured: () => boolean;
  getNotificationPermission: () => string;
  getNotificationsEnabled: () => boolean;
  requestNotificationPermission: () => void;
  setNotificationsEnabled: (enabled: boolean, bearerToken: string) => void;
  syncPushToken: (bearerToken: string) => void;
}

declare global {
  interface Window {
    FaiFaiNative?: NativePushBridge;
  }
}

export interface CustomerPushState {
  supported: boolean;
  permission: PushPermission;
  subscribed: boolean;
}

function nativeBridge(): NativePushBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.FaiFaiNative;
  if (!bridge) return null;
  try {
    return bridge.isPushConfigured() ? bridge : null;
  } catch {
    return null;
  }
}

function isWebPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function normalizePermission(value: unknown): PushPermission {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'granted' || normalized === 'denied' || normalized === 'default') {
    return normalized;
  }
  return 'unsupported';
}

function nativePermission(bridge: NativePushBridge): PushPermission {
  try {
    return normalizePermission(bridge.getNotificationPermission());
  } catch {
    return 'unsupported';
  }
}

function customerToken(): string {
  return localStorage.getItem('vita_customer_token') || '';
}

function hasCustomerToken(): boolean {
  return Boolean(customerToken());
}

function apiUrl(path: string): string {
  return `${getAPIBaseURL()}${path}`;
}

export function isCustomerPushPreferenceEnabled(): boolean {
  return localStorage.getItem(NOTIFICATION_PREF_STORAGE) !== '0';
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = customerToken();
  if (!token) throw new Error('Please login to enable order notifications');

  let response: Response | null = null;
  let lastError: unknown = null;
  // Render can briefly be unavailable while waking/redeploying. One retry also
  // prevents a temporary mobile-network drop from leaving Push setup stuck.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetch(apiUrl(path), {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options?.headers || {}),
        },
      });
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 0) {
        await new Promise(resolve => window.setTimeout(resolve, 1200));
      }
    }
  }
  if (!response) {
    throw new Error(
      lastError instanceof Error && lastError.message !== 'Failed to fetch'
        ? lastError.message
        : 'Notification server could not be reached. Please try again.',
    );
  }
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
  // This route is public. Avoiding Authorization/JSON headers also avoids an
  // unnecessary CORS preflight on Android browsers.
  const response = await fetch(apiUrl('/api/v1/customer-push/public-key'));
  const result = (await response.json().catch(() => ({}))) as { public_key?: string };
  if (!response.ok) throw new Error('Notification public key could not be loaded');
  if (!result.public_key) throw new Error('Notification public key was not returned');
  return result.public_key;
}

async function subscribeWebWithoutPrompt(): Promise<CustomerPushState> {
  if (!isWebPushSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false };
  }
  if (Notification.permission !== 'granted') {
    return { supported: true, permission: Notification.permission, subscribed: false };
  }
  if (!hasCustomerToken() || !isCustomerPushPreferenceEnabled()) {
    return { supported: true, permission: Notification.permission, subscribed: false };
  }

  const registration = await getRegistration();
  const key = await publicKey();
  let subscription = await registration.pushManager.getSubscription();
  const previousKey = localStorage.getItem(VAPID_KEY_STORAGE);

  if (subscription && previousKey && previousKey !== key) {
    await subscription.unsubscribe().catch(() => false);
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }

  try {
    await sendSubscription(subscription);
  } catch (firstError) {
    // Repair a stale browser subscription once. This is silent because browser
    // permission was already granted by the customer previously.
    await subscription.unsubscribe().catch(() => false);
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
    try {
      await sendSubscription(subscription);
    } catch {
      throw firstError;
    }
  }

  localStorage.setItem(VAPID_KEY_STORAGE, key);
  localStorage.setItem(NOTIFICATION_PREF_STORAGE, '1');
  return { supported: true, permission: 'granted', subscribed: true };
}

function getNativeState(bridge: NativePushBridge): CustomerPushState {
  const permission = nativePermission(bridge);
  let enabled = false;
  try {
    enabled = bridge.getNotificationsEnabled();
  } catch {
    enabled = false;
  }
  return {
    supported: permission !== 'unsupported',
    permission,
    subscribed:
      permission === 'granted' && enabled && isCustomerPushPreferenceEnabled(),
  };
}

function syncNativeToken(bridge: NativePushBridge, enabled: boolean): void {
  const token = customerToken();
  try {
    bridge.setNotificationsEnabled(enabled, token);
    if (enabled && token) bridge.syncPushToken(token);
  } catch {
    // Java bridge registration is best-effort; the next page/resume also syncs it.
  }
}

async function requestNativePermission(bridge: NativePushBridge): Promise<PushPermission> {
  const current = nativePermission(bridge);
  if (current !== 'default') return current;

  return await new Promise<PushPermission>(resolve => {
    let settled = false;
    let timer = 0;

    const finish = (value?: unknown) => {
      if (settled) return;
      settled = true;
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('fai-fai-native-notification-permission', onPermission);
      resolve(value ? normalizePermission(value) : nativePermission(bridge));
    };

    const onPermission = (event: Event) => {
      const custom = event as CustomEvent<{ permission?: string }>;
      finish(custom.detail?.permission);
    };

    window.addEventListener('fai-fai-native-notification-permission', onPermission);
    timer = window.setTimeout(() => finish(), 30000);
    try {
      bridge.requestNotificationPermission();
    } catch {
      finish('unsupported');
    }
  });
}

export async function requestCustomerPushPermissionOnLogin(): Promise<PushPermission> {
  const bridge = nativeBridge();
  if (bridge) {
    const permission = nativePermission(bridge);
    if (permission === 'default') {
      localStorage.setItem(NOTIFICATION_PROMPTED_STORAGE, '1');
      return await requestNativePermission(bridge);
    }
    return permission;
  }

  if (!isWebPushSupported()) return 'unsupported';
  if (Notification.permission === 'default') {
    localStorage.setItem(NOTIFICATION_PROMPTED_STORAGE, '1');
    return await Notification.requestPermission();
  }
  return Notification.permission;
}

export async function getCustomerPushState(): Promise<CustomerPushState> {
  const bridge = nativeBridge();
  if (bridge) return getNativeState(bridge);

  if (!isWebPushSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false };
  }
  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  return {
    supported: true,
    permission: Notification.permission,
    // App-level OFF must show as OFF even though browser permission remains granted.
    subscribed: Boolean(subscription) && isCustomerPushPreferenceEnabled(),
  };
}

export async function enableCustomerPush(): Promise<CustomerPushState> {
  const bridge = nativeBridge();
  if (bridge) {
    localStorage.setItem(NOTIFICATION_PROMPTED_STORAGE, '1');
    let permission = nativePermission(bridge);
    if (permission === 'default') permission = await requestNativePermission(bridge);
    if (permission !== 'granted') {
      throw new Error(
        permission === 'denied'
          ? 'Please allow notifications in Android app settings'
          : 'Native notifications are not configured for this app build',
      );
    }

    localStorage.setItem(NOTIFICATION_PREF_STORAGE, '1');
    syncNativeToken(bridge, true);
    return { supported: true, permission: 'granted', subscribed: true };
  }

  if (!isWebPushSupported()) throw new Error('This device does not support notifications');

  localStorage.setItem(NOTIFICATION_PROMPTED_STORAGE, '1');
  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();

  if (permission !== 'granted') {
    throw new Error('Please allow notifications in browser settings');
  }

  localStorage.setItem(NOTIFICATION_PREF_STORAGE, '1');
  return await subscribeWebWithoutPrompt();
}

export async function disableCustomerPush(): Promise<CustomerPushState> {
  localStorage.setItem(NOTIFICATION_PREF_STORAGE, '0');

  const bridge = nativeBridge();
  if (bridge) {
    syncNativeToken(bridge, false);
    return {
      supported: true,
      permission: nativePermission(bridge),
      subscribed: false,
    };
  }

  if (!isWebPushSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false };
  }

  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    // Tell backend first so this endpoint is no longer used for this customer.
    if (hasCustomerToken()) {
      await apiRequest('/api/v1/customer-push/unsubscribe', {
        method: 'POST',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }).catch(() => undefined);
    }
    await subscription.unsubscribe().catch(() => false);
  }

  return { supported: true, permission: Notification.permission, subscribed: false };
}

/**
 * Called on customer-app startup. Native Android FCM is preferred whenever the
 * installed app exposes FaiFaiNative; ordinary browsers/PWA keep using Web Push.
 */
export async function ensureCustomerPushOnAppOpen(): Promise<CustomerPushState> {
  const bridge = nativeBridge();
  if (bridge) {
    if (!hasCustomerToken() || !isCustomerPushPreferenceEnabled()) {
      return getNativeState(bridge);
    }

    let permission = nativePermission(bridge);
    if (
      permission === 'default' &&
      localStorage.getItem(NOTIFICATION_PROMPTED_STORAGE) !== '1'
    ) {
      localStorage.setItem(NOTIFICATION_PROMPTED_STORAGE, '1');
      permission = await requestNativePermission(bridge);
    }

    if (permission === 'granted') {
      localStorage.setItem(NOTIFICATION_PREF_STORAGE, '1');
      syncNativeToken(bridge, true);
    }
    return getNativeState(bridge);
  }

  if (!isWebPushSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false };
  }
  if (!hasCustomerToken() || !isCustomerPushPreferenceEnabled()) {
    return await getCustomerPushState();
  }

  if (Notification.permission === 'granted') {
    return await subscribeWebWithoutPrompt();
  }

  if (
    Notification.permission === 'default' &&
    localStorage.getItem(NOTIFICATION_PROMPTED_STORAGE) !== '1'
  ) {
    // Mark before requesting so closing/reopening the app never causes a prompt loop.
    localStorage.setItem(NOTIFICATION_PROMPTED_STORAGE, '1');
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      localStorage.setItem(NOTIFICATION_PREF_STORAGE, '1');
      return await subscribeWebWithoutPrompt();
    }
  }

  return await getCustomerPushState();
}

export async function syncCustomerPushIfAllowed(): Promise<CustomerPushState> {
  const bridge = nativeBridge();
  if (bridge) {
    const state = getNativeState(bridge);
    if (!state.supported || !isCustomerPushPreferenceEnabled()) {
      return { ...state, subscribed: false };
    }
    if (state.permission === 'granted' && hasCustomerToken()) {
      syncNativeToken(bridge, true);
      return { supported: true, permission: 'granted', subscribed: true };
    }
    return state;
  }

  const state = await getCustomerPushState();
  if (!state.supported || !isCustomerPushPreferenceEnabled()) {
    return { ...state, subscribed: false };
  }
  if (state.permission === 'granted') {
    // Permission already exists: silently recreate a missing subscription rather
    // than showing the customer an Enable button again.
    return await subscribeWebWithoutPrompt();
  }
  return state;
}
