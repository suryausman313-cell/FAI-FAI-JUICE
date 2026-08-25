// Fai Fai Rider Service Worker
// Server Web Push provides reliable background/closed alerts. Polling remains a
// best-effort fallback while the service worker is awake.
const CACHE_NAME = 'fai-fai-rider-presence-v3';
let riderId = null;
let apiBaseUrl = '';
let riderToken = '';
let pollingInterval = null;
let lastKnownDeliveryIds = [];
let lastKnownOrderStatus = {};

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
    lastKnownOrderStatus = {};
    stopPolling();
  }

  if (type === 'UPDATE_DELIVERIES') {
    lastKnownDeliveryIds = data.deliveryIds || [];
  }
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Fai Fai Rider', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Fai Fai Rider';
  const options = {
    body: data.body || 'Rider update',
    icon: '/vite.svg',
    badge: '/vite.svg',
    tag: data.tag || 'fai-fai-rider-update',
    renotify: true,
    requireInteraction: data.kind === 'assignment' || data.kind === 'ready_for_pickup',
    vibrate: [250, 120, 250, 120, 250],
    data: { url: data.url || '/rider', kind: data.kind || 'rider_update' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  const target = String(event.notification?.data?.url || '/rider');
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/rider') && 'focus' in client) {
          if ('navigate' in client) client.navigate(target).catch(() => undefined);
          return client.focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    }),
  );
});

function startPolling() {
  stopPolling();
  pollingInterval = setInterval(checkForUpdates, 10000);
  checkForUpdates();
}

function stopPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = null;
}

async function checkForUpdates() {
  if (!riderId || !apiBaseUrl || !riderToken) return;

  try {
    try {
      await fetch(`${apiBaseUrl}/api/v1/rider/heartbeat/${riderId}`, {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: `Bearer ${riderToken}` },
        cache: 'no-store',
      });
    } catch {
      // Presence is best effort and never blocks delivery polling.
    }

    const response = await fetch(`${apiBaseUrl}/api/v1/rider/deliveries/${riderId}`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${riderToken}` },
      cache: 'no-store',
    });
    if (!response.ok) return;

    const data = await response.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    const activeItems = items.filter((item) => !['delivered', 'rejected', 'cancelled'].includes(String(item.status || '').toLowerCase()));
    const currentIds = activeItems.map((item) => item.id);

    const newAssignments = activeItems.filter(
      (item) => String(item.status || '').toLowerCase() === 'assigned' && !lastKnownDeliveryIds.includes(item.id),
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
        data: { url: '/rider', deliveryId: delivery.id, orderId: delivery.order_id },
      });
    }

    // Fallback Ready alert if server Web Push was unavailable. Track the order
    // status independently of assignment status.
    for (const delivery of activeItems) {
      const key = String(delivery.id);
      const current = String(delivery.order_status || '').toLowerCase();
      const previous = String(lastKnownOrderStatus[key] || '').toLowerCase();
      const canPickup = ['assigned', 'accepted'].includes(String(delivery.status || '').toLowerCase());
      if (previous && previous !== 'ready' && current === 'ready' && canPickup) {
        await self.registration.showNotification(`✅ Order #${delivery.order_id} is Ready`, {
          body: 'Kitchen marked this delivery Ready. Please pick it up from the shop.',
          icon: '/vite.svg',
          badge: '/vite.svg',
          tag: `rider-ready-${delivery.order_id}`,
          renotify: true,
          requireInteraction: true,
          vibrate: [250, 120, 250, 120, 250],
          data: { url: '/rider', deliveryId: delivery.id, orderId: delivery.order_id },
        });
      }
      lastKnownOrderStatus[key] = current;
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
