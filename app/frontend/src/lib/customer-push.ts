import { backendRequest } from '@/lib/api';
import { getAPIBaseURL } from '@/lib/config';

const VAPID_KEY_STORAGE = 'fai_fai_customer_vapid_public_key';
const CUSTOMER_TOKEN_KEY = 'vita_customer_token';

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

function getCustomerToken(): string {
  const token =
    localStorage.getItem(CUSTOMER_TOKEN_KEY) ||
    sessionStorage.getItem(CUSTOMER_TOKEN_KEY) ||
    '';

  if (token && !localStorage.getItem(CUSTOMER_TOKEN_KEY)) {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  }

  return token;
}

function apiBaseUrl(): string {
  return String(getAPIBaseURL() || '').replace(/\/$/, '');
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

async function waitForWorker(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorkerRegistration> {
  if (registration.active) return registration;

  const worker = registration.installing || registration.waiting;
  if (!worker) return registration;

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('Service worker activation timed out'));
    }, 12000);

    worker.addEventListener('statechange', () => {
      if (worker.state === 'activated') {
        window.clearTimeout(timeout);
        resolve();
      } else if (worker.state === 'redundant') {
        window.clearTimeout(timeout);
        reject(new Error('Service worker became redundant'));
      }
    });
  });

  return registration;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  try {
    // Register/update the same worker. Do NOT unregister it on every check,
    // otherwise the saved PushSubscription is deleted again.
    const registration = await navigator.serviceWorker.register(
      '/customer-sw.js?v=4',
      { scope: '/' },
    );

    await registration.update().catch(() => undefined);
    return await waitForWorker(registration);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Service worker failed: ${message}`);
  }
}

async function getPublicKey(): Promise<string> {
  const url = `${apiBaseUrl()}/api/v1/customer-push/public-key`;
  let lastError: unknown = null;

  // This route is public. No Authorization header means no unnecessary
  // CORS preflight before loading the VAPID key.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        mode: 'cors',
      });

      const data = (await response.json().catch(() => ({}))) as {
        public_key?: string;
        detail?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.detail ||
            data.message ||
            `Public key request failed (${response.status})`,
        );
      }

      const key = String(data.public_key || '').trim();
      if (!key) {
        throw new Error('Backend returned no notification public key');
      }

      return key;
    } catch (error: unknown) {
      lastError = error;
      if (attempt < 3) {
        await new Promise(resolve => window.setTimeout(resolve, 2500));
      }
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Notification backend/public key failed: ${message}`);
}

async function createBrowserSubscription(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<PushSubscription> {
  try {
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Browser push subscription failed: ${message}`);
  }
}

async function sendSubscription(
  subscription: PushSubscription,
): Promise<void> {
  const json = subscription.toJSON();

  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error(
      'Browser did not return complete notification subscription data',
    );
  }

  try {
    await backendRequest('/api/v1/customer-push/subscribe', 'POST', {
      endpoint: json.endpoint,
      keys: {
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Saving subscription to backend failed: ${message}`);
  }
}

export async function getCustomerPushState(): Promise<CustomerPushState> {
  if (!isSupported()) {
    return {
      supported: false,
      permission: 'unsupported',
      subscribed: false,
    };
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
  if (!isSupported()) {
    throw new Error('This browser does not support notifications');
  }

  if (!getCustomerToken()) {
    throw new Error('Please login to enable order notifications');
  }

  // Permission request remains inside the button click flow.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Please allow notifications in browser settings');
  }

  const registration = await getRegistration();
  const publicKey = await getPublicKey();

  let subscription = await registration.pushManager.getSubscription();
  const previousKey = localStorage.getItem(VAPID_KEY_STORAGE);

  if (subscription && previousKey && previousKey !== publicKey) {
    await subscription.unsubscribe().catch(() => false);
    subscription = null;
  }

  if (!subscription) {
    subscription = await createBrowserSubscription(registration, publicKey);
  }

  try {
    await sendSubscription(subscription);
  } catch (firstError) {
    await subscription.unsubscribe().catch(() => false);
    subscription = await createBrowserSubscription(registration, publicKey);

    try {
      await sendSubscription(subscription);
    } catch {
      throw firstError;
    }
  }

  localStorage.setItem(VAPID_KEY_STORAGE, publicKey);

  return {
    supported: true,
    permission,
    subscribed: true,
  };
}

export async function syncCustomerPushIfAllowed(): Promise<CustomerPushState> {
  if (!isSupported()) {
    return {
      supported: false,
      permission: 'unsupported',
      subscribed: false,
    };
  }

  if (Notification.permission !== 'granted') {
    return {
      supported: true,
      permission: Notification.permission,
      subscribed: false,
    };
  }

  const registration = await getRegistration();
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return {
      supported: true,
      permission: Notification.permission,
      subscribed: false,
    };
  }

  await sendSubscription(subscription);

  return {
    supported: true,
    permission: Notification.permission,
    subscribed: true,
  };
}
