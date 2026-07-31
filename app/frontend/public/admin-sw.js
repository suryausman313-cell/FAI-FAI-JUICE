
const ADMIN_CACHE = 'vita-admin-push-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: 'Vita Napoli Admin',
      body: event.data ? event.data.text() : 'New Admin notification',
    };
  }

  const title = payload.title || 'Vita Napoli Admin';
  const options = {
    body: payload.body || 'New Admin notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || ADMIN_CACHE,
    renotify: true,
    requireInteraction: payload.kind === 'cash' || payload.kind === 'ready',
    vibrate: [200, 100, 200],
    data: {
      url: payload.url || '/admin/dashboard',
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetPath = event.notification?.data?.url || '/admin/dashboard';
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of windows) {
        if ('focus' in client) {
          try {
            if ('navigate' in client) {
              await client.navigate(targetUrl);
            }
          } catch {
            // Opening a new window below is the fallback.
          }
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })(),
  );
});
