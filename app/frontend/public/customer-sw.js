const CUSTOMER_PUSH_TAG = 'fai-fai-customer-ready';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: 'Fai Fai Juice',
      body: event.data ? event.data.text() : 'Your order status was updated.',
    };
  }

  const options = {
    body: payload.body || 'Your order is ready.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || CUSTOMER_PUSH_TAG,
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 120, 300, 120, 500],
    data: { url: payload.url || '/my-orders' },
  };
  event.waitUntil(
    self.registration.showNotification(payload.title || 'Fai Fai Juice', options),
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL(
    event.notification?.data?.url || '/my-orders',
    self.location.origin,
  ).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of windows) {
        try {
          if ('navigate' in client) await client.navigate(targetUrl);
        } catch {
          // Opening a new window below is the fallback.
        }
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })(),
  );
});
