import { backendRequest } from '@/lib/api';

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

  // backendRequest localStorage se customer token uthata hai.
  if (token && !localStorage.getItem(CUSTOMER_TOKEN_KEY)) {
    localStorage.setItem(CUSTOMER_TOKEN_KEY, token);
  }

  return token;
}

async function apiRequest<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  data?: Record<string, unknown>,
): Promise<T> {
  if (!getCustomerToken()) {
    throw new Error('Please login to enable order notifications');
  }

  try {
    const response = await backendRequest(path, method, data);
    return response.data as T;
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Notification request failed';

    throw new Error(message);
  }
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

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  // Purani narrow-scope customer registration remove karo.
  const registrations = await navigator.serviceWorker.getRegistrations();

  for (const registration of registrations) {
    if (
      registration.scope.includes('/customer-push/') ||
      registration.active?.scriptURL.includes('/customer-sw.js')
    ) {
      await registration.unregister().catch(() => false);
    }
  }

  // Root scope se worker customer pages par properly active rahega.
  const registration = await navigator.serviceWorker.register(
    '/customer-sw.js?v=3',
    { scope: '/' },
  );

  await registration.update().catch(() => undefined);

  if (registration.installing) {
    await new Promise<void>((resolve) => {
      const worker = registration.installing;
      if (!worker) {
        resolve();
        return;
      }

      const timeout = window.setTimeout(resolve, 5000);
      worker.addEventListener('statechange', () => {
        if (worker.state === 'activated' || worker.state === 'redundant') {
          window.clearTimeout(timeout);
          resolve();
        }
      });
    });
  }

  return registration;
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

  await apiRequest('/api/v1/customer-push/subscribe', 'POST', {
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  });
}

async function getPublicKey(): Promise<string> {
  const result = await apiRequest<{ public_key?: string }>(
    '/api/v1/customer-push/public-key',
    'GET',
  );

  const key = String(result.public_key || '').trim();

  if (!key) {
    throw new Error('Notification public key was not returned by backend');
  }

  return key;
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

  const permission = await Notification.requestPermission();

  if (permission !== 'granted') {
    throw new Error('Please allow notifications in browser settings');
  }

  const registration = await getRegistration();
  const publicKey = await getPublicKey();

  let subscription = await registration.pushManager.getSubscription();
  const previousKey = localStorage.getItem(VAPID_KEY_STORAGE);

  if (subscription && previousKey !== publicKey) {
    await subscription.unsubscribe().catch(() => false);
    subscription = null;
  }

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  try {
    await sendSubscription(subscription);
  } catch (firstError) {
    await subscription.unsubscribe().catch(() => false);

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    try {
      await sendSubscription(subscription);
    } catch (secondError) {
      throw secondError instanceof Error ? secondError : firstError;
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
