self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) {
    payload = { body: event.data ? event.data.text() : 'Your order was updated.' };
  }
  event.waitUntil(self.registration.showNotification(payload.title || 'Fai Fai Juice', {
    body: payload.body || 'Your order was updated.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    tag: payload.tag || 'customer-order-update',
    data: { url: payload.url || '/my-orders' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || '/my-orders';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((items) => {
    for (const client of items) {
      if ('focus' in client) { client.navigate(url); return client.focus(); }
    }
    return clients.openWindow(url);
  }));
});
