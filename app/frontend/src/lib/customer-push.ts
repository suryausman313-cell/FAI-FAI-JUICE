import { getAPIBaseURL } from '@/lib/config';

const VAPID_KEY_STORAGE = 'fai_fai_customer_vapid_public_key';
const NOTIFICATION_PREF_STORAGE = 'fai_fai_customer_notifications_enabled';
const NOTIFICATION_PROMPTED_STORAGE = 'fai_fai_customer_notifications_prompted';

interface FaiFaiNativeBridge {
  isPushConfigured: () => boolean;
  getNotificationPermission: () => string;
  getNotificationsEnabled: () => boolean;
  requestNotificationPermission: () => void;
  setNotificationsEnabled: (enabled: boolean, bearerToken: string) => void;
  syncPushToken: (bearerToken: string) => void;
}

declare global {
  interface Window {
    FaiFaiNative?: FaiFaiNativeBridge;
  }
}

export interface CustomerPushState {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
}

function nativeBridge(): FaiFaiNativeBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.FaiFaiNative;
  if (!bridge) return null;
  try {
    if (typeof bridge.isPushConfigured !== 'function' || !bridge.isPushConfigured()) return null;
    return bridge;
  } catch {
    return null;
  }
}

function browserPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function apiUrl(path: string): string { return `${getAPIBaseURL()}${path}`; }
function customerToken(): string { return localStorage.getItem('vita_customer_token') || ''; }
function hasCustomerToken(): boolean { return Boolean(customerToken()); }
export function isCustomerPushPreferenceEnabled(): boolean { return localStorage.getItem(NOTIFICATION_PREF_STORAGE) !== '0'; }

function nativePermission(bridge: FaiFaiNativeBridge): NotificationPermission | 'unsupported' {
  try {
    const value = String(bridge.getNotificationPermission() || '').toLowerCase();
    if (value === 'granted' || value === 'denied' || value === 'default') return value as NotificationPermission;
  } catch { /* ignore */ }
  return 'unsupported';
}

function nativeState(bridge: FaiFaiNativeBridge): CustomerPushState {
  const permission = nativePermission(bridge);
  let enabled = isCustomerPushPreferenceEnabled();
  try { enabled = enabled && bridge.getNotificationsEnabled(); } catch { /* ignore */ }
  return { supported: permission !== 'unsupported', permission, subscribed: permission === 'granted' && enabled && hasCustomerToken() };
}

async function requestNativePermission(bridge: FaiFaiNativeBridge): Promise<NotificationPermission | 'unsupported'> {
  const before = nativePermission(bridge);
  if (before !== 'default') return before;
  localStorage.setItem(NOTIFICATION_PROMPTED_STORAGE, '1');
  bridge.requestNotificationPermission();
  return await new Promise(resolve => {
    let done = false;
    const finish = (p: NotificationPermission | 'unsupported') => {
      if (done) return; done = true;
      window.removeEventListener('fai-fai-native-notification-permission', onPermission as EventListener);
      window.clearInterval(timer); window.clearTimeout(timeout); resolve(p);
    };
    const onPermission = () => { const p = nativePermission(bridge); if (p !== 'default') finish(p); };
    const timer = window.setInterval(onPermission, 250);
    const timeout = window.setTimeout(() => finish(nativePermission(bridge)), 15000);
    window.addEventListener('fai-fai-native-notification-permission', onPermission as EventListener);
    onPermission();
  });
}

function nativeSync(bridge: FaiFaiNativeBridge): void {
  try { bridge.syncPushToken(customerToken()); } catch { /* retried on resume */ }
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const token = customerToken();
  if (!token) throw new Error('Please login to enable order notifications');
  const response = await fetch(apiUrl(path), {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(options?.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.detail || data?.message || 'Notification request failed');
  return data as T;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i);
  return output;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/customer-sw.js', { scope: '/customer-push/' });
  await registration.update().catch(() => undefined);
  return registration;
}

async function sendSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) throw new Error('Browser did not return notification encryption keys');
  await apiRequest('/api/v1/customer-push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } }) });
}

async function publicKey(): Promise<string> {
  const response = await fetch(apiUrl('/api/v1/customer-push/public-key'));
  const result = (await response.json().catch(() => ({}))) as { public_key?: string };
  if (!response.ok || !result.public_key) throw new Error('Notification public key could not be loaded');
  return result.public_key;
}

async function subscribeWithoutPrompt(): Promise<CustomerPushState> {
  const native = nativeBridge();
  if (native) {
    const state = nativeState(native);
    if (state.permission === 'granted' && hasCustomerToken() && isCustomerPushPreferenceEnabled()) {
      try { native.setNotificationsEnabled(true, customerToken()); } catch { nativeSync(native); }
      nativeSync(native);
      return { supported: true, permission: 'granted', subscribed: true };
    }
    return state;
  }
  if (!browserPushSupported()) return { supported: false, permission: 'unsupported', subscribed: false };
  if (Notification.permission !== 'granted' || !hasCustomerToken() || !isCustomerPushPreferenceEnabled()) return { supported: true, permission: Notification.permission, subscribed: false };
  const registration = await getRegistration();
  const key = await publicKey();
  let subscription = await registration.pushManager.getSubscription();
  const previousKey = localStorage.getItem(VAPID_KEY_STORAGE);
  if (subscription && previousKey && previousKey !== key) { await subscription.unsubscribe().catch(() => false); subscription = null; }
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  await sendSubscription(subscription);
  localStorage.setItem(VAPID_KEY_STORAGE, key);
  localStorage.setItem(NOTIFICATION_PREF_STORAGE, '1');
  return { supported: true, permission: 'granted', subscribed: true };
}

export async function requestCustomerPushPermissionOnLogin(): Promise<NotificationPermission | 'unsupported'> {
  const native = nativeBridge(); if (native) return await requestNativePermission(native);
  if (!browserPushSupported()) return 'unsupported';
  if (Notification.permission === 'default') { localStorage.setItem(NOTIFICATION_PROMPTED_STORAGE, '1'); return await Notification.requestPermission(); }
  return Notification.permission;
}

export async function getCustomerPushState(): Promise<CustomerPushState> {
  const native = nativeBridge(); if (native) { nativeSync(native); return nativeState(native); }
  if (!browserPushSupported()) return { supported: false, permission: 'unsupported', subscribed: false };
  const registration = await getRegistration(); const subscription = await registration.pushManager.getSubscription();
  return { supported: true, permission: Notification.permission, subscribed: Boolean(subscription) && isCustomerPushPreferenceEnabled() };
}

export async function enableCustomerPush(): Promise<CustomerPushState> {
  const native = nativeBridge();
  if (native) {
    if (!hasCustomerToken()) throw new Error('Please login to enable order notifications');
    localStorage.setItem(NOTIFICATION_PROMPTED_STORAGE, '1'); localStorage.setItem(NOTIFICATION_PREF_STORAGE, '1');
    const permission = await requestNativePermission(native);
    if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Please allow notifications in Android app settings' : 'Native notifications are not configured for this app build');
    native.setNotificationsEnabled(true, customerToken()); nativeSync(native);
    return { supported: true, permission: 'granted', subscribed: true };
  }
  if (!browserPushSupported()) throw new Error('This browser does not support notifications');
  localStorage.setItem(NOTIFICATION_PROMPTED_STORAGE, '1');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Please allow notifications in browser settings');
  localStorage.setItem(NOTIFICATION_PREF_STORAGE, '1'); return await subscribeWithoutPrompt();
}

export async function disableCustomerPush(): Promise<CustomerPushState> {
  localStorage.setItem(NOTIFICATION_PREF_STORAGE, '0');
  const native = nativeBridge();
  if (native) { try { native.setNotificationsEnabled(false, customerToken()); } catch { /* ignore */ } const p = nativePermission(native); return { supported: p !== 'unsupported', permission: p, subscribed: false }; }
  if (!browserPushSupported()) return { supported: false, permission: 'unsupported', subscribed: false };
  const registration = await getRegistration(); const subscription = await registration.pushManager.getSubscription();
  if (subscription) { if (hasCustomerToken()) await apiRequest('/api/v1/customer-push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => undefined); await subscription.unsubscribe().catch(() => false); }
  return { supported: true, permission: Notification.permission, subscribed: false };
}

export async function ensureCustomerPushOnAppOpen(): Promise<CustomerPushState> {
  const native = nativeBridge();
  if (native) {
    if (!hasCustomerToken() || !isCustomerPushPreferenceEnabled()) return nativeState(native);
    const current = nativePermission(native);
    if (current === 'granted') { nativeSync(native); return { supported: true, permission: 'granted', subscribed: true }; }
    if (current === 'default' && localStorage.getItem(NOTIFICATION_PROMPTED_STORAGE) !== '1') {
      localStorage.setItem(NOTIFICATION_PROMPTED_STORAGE, '1'); const permission = await requestNativePermission(native);
      if (permission === 'granted') { localStorage.setItem(NOTIFICATION_PREF_STORAGE, '1'); native.setNotificationsEnabled(true, customerToken()); nativeSync(native); return { supported: true, permission: 'granted', subscribed: true }; }
    }
    return nativeState(native);
  }
  if (!browserPushSupported()) return { supported: false, permission: 'unsupported', subscribed: false };
  if (!hasCustomerToken() || !isCustomerPushPreferenceEnabled()) return await getCustomerPushState();
  if (Notification.permission === 'granted') return await subscribeWithoutPrompt();
  if (Notification.permission === 'default' && localStorage.getItem(NOTIFICATION_PROMPTED_STORAGE) !== '1') {
    localStorage.setItem(NOTIFICATION_PROMPTED_STORAGE, '1'); const permission = await Notification.requestPermission();
    if (permission === 'granted') { localStorage.setItem(NOTIFICATION_PREF_STORAGE, '1'); return await subscribeWithoutPrompt(); }
  }
  return await getCustomerPushState();
}

export async function syncCustomerPushIfAllowed(): Promise<CustomerPushState> {
  const native = nativeBridge();
  if (native) { const state = nativeState(native); if (!state.supported || !isCustomerPushPreferenceEnabled()) return { ...state, subscribed: false }; if (state.permission === 'granted' && hasCustomerToken()) { nativeSync(native); return { supported: true, permission: 'granted', subscribed: true }; } return state; }
  const state = await getCustomerPushState(); if (!state.supported || !isCustomerPushPreferenceEnabled()) return { ...state, subscribed: false };
  if (state.permission === 'granted') return await subscribeWithoutPrompt(); return state;
}
