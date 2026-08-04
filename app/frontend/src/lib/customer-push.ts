import { backendRequest } from '@/lib/api';

function decodeKey(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function customerPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function enableCustomerPush(): Promise<void> {
  if (!customerPushSupported()) throw new Error('Notifications are not supported on this device');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not allowed');
  const registration = await navigator.serviceWorker.register('/customer-sw.js');
  const keyResult = await backendRequest('/api/v1/customer-push/public-key') as any;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(keyResult.data.public_key),
    });
  }
  const json = subscription.toJSON();
  await backendRequest('/api/v1/customer-push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  localStorage.setItem('vita_customer_push_enabled', '1');
}
