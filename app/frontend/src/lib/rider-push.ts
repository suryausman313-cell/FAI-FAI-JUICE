import { getAPIBaseURL } from '@/lib/config';

const PREF_KEY = 'rider_notifications';
const VAPID_KEY = 'fai_fai_rider_vapid_key';

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('rider_access_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i);
  return output;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return await navigator.serviceWorker.register('/rider-sw.js', { scope: '/rider' });
}

async function publicKey(): Promise<string> {
  const response = await fetch(`${getAPIBaseURL()}/api/v1/rider-push/public-key`, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.public_key) throw new Error('Rider notification key could not be loaded');
  return String(data.public_key);
}

export function riderPushSupported(): boolean {
  return supported();
}

export async function enableRiderPush(riderId: number): Promise<boolean> {
  if (!supported()) return false;
  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const reg = await registration();
  const key = await publicKey();
  let subscription = await reg.pushManager.getSubscription();
  const previousKey = localStorage.getItem(VAPID_KEY);
  if (subscription && previousKey && previousKey !== key) {
    await subscription.unsubscribe().catch(() => false);
    subscription = null;
  }
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }
  const json = subscription.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) throw new Error('Rider push keys missing');

  const response = await fetch(`${getAPIBaseURL()}/api/v1/rider-push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({
      rider_id: riderId,
      endpoint: subscription.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    }),
  });
  if (!response.ok) throw new Error('Rider push registration failed');
  localStorage.setItem(PREF_KEY, 'on');
  localStorage.setItem(VAPID_KEY, key);
  return true;
}

export async function syncRiderPushIfAllowed(riderId: number): Promise<boolean> {
  if (!supported()) return false;
  if (localStorage.getItem(PREF_KEY) === 'off') return false;
  if (Notification.permission !== 'granted') return false;
  try {
    return await enableRiderPush(riderId);
  } catch {
    return false;
  }
}

export async function disableRiderPush(riderId: number): Promise<void> {
  localStorage.setItem(PREF_KEY, 'off');
  if (!supported()) return;
  const reg = await registration();
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return;
  await fetch(`${getAPIBaseURL()}/api/v1/rider-push/unsubscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ rider_id: riderId, endpoint: subscription.endpoint }),
  }).catch(() => undefined);
  await subscription.unsubscribe().catch(() => false);
}
