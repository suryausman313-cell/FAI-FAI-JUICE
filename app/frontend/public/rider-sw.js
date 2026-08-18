// Fai Fai Rider Service Worker - final combined delivery flow.
// Background polling is best effort; the open Rider page handles the repeating alarm.
const CACHE_NAME = 'fai-fai-rider-presence-v2';
let riderId = null;
let apiBaseUrl = '';
let riderToken = '';
let pollingInterval = null;
let lastKnownDeliveryIds = [];

self.addEventListener('message', (event) => {
  const { type, data = {} } = event.data || {};

  if (type === 'RIDER_LOGIN') {
    riderId = data.riderId;
    apiBaseUrl = String(data.apiBaseUrl || '').replace(/\/$/, '');
    riderToken = String(data.token || '');
    lastKnownDeliveryIds = data.currentDeliveryIds || [];
    startPolling();
  }

  if (type === 'RIDER_LOGOUT') {
    riderId = null;
    apiBaseUrl = '';
    riderToken = '';
    lastKnownDeliveryIds = [];
    stopPolling();
  }

  if (type === 'UPDATE_DELIVERIES') {
    lastKnownDeliveryIds = data.deliveryIds || [];
  }
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/rider') && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow('/rider') : undefined;
    }),
  );
});

function startPolling() {
  stopPolling();
  pollingInterval = setInterval(checkForNewDeliveries, 10000);
  checkForNewDeliveries();
}

function stopPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = null;
}

async function checkForNewDeliveries() {
  if (!riderId || !apiBaseUrl || !riderToken) return;

  try {
    // Best-effort background presence. A service worker may be suspended by the
    // browser/OS, but whenever it is awake we refresh the rider heartbeat so Admin
    // does not incorrectly show an active signed-in rider as offline.
    try {
      await fetch(`${apiBaseUrl}/api/v1/rider/heartbeat/${riderId}`, {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: `Bearer ${riderToken}` },
        cache: 'no-store',
      });
    } catch {
      // Presence is best effort and must never block delivery polling.
    }

    const response = await fetch(`${apiBaseUrl}/api/v1/rider/deliveries/${riderId}`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${riderToken}` },
      cache: 'no-store',
    });
    if (!response.ok) return;

    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const activeItems = items.filter((item) => !['delivered', 'rejected'].includes(item.status));
    const currentIds = activeItems.map((item) => item.id);
    const newAssignments = activeItems.filter(
      (item) => item.status === 'assigned' && !lastKnownDeliveryIds.includes(item.id),
    );

    for (const delivery of newAssignments) {
      await self.registration.showNotification('🛵 New Delivery — Accept or Reject', {
        body: `Order #${delivery.order_id} - ${delivery.customer_name}\n${delivery.customer_address || 'Open Rider App'}`,
        icon: '/vite.svg',
        badge: '/vite.svg',
        tag: `delivery-${delivery.id}`,
        renotify: true,
        requireInteraction: true,
        vibrate: [250, 120, 250, 120, 250],
        data: { deliveryId: delivery.id, orderId: delivery.order_id },
      });
    }

    lastKnownDeliveryIds = currentIds;
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach((client) => {
      client.postMessage({ type: 'DELIVERIES_UPDATE', data: { items } });
    });
  } catch (error) {
    console.log('Rider background check failed', error);
  }
}
