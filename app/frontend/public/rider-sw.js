// Rider Service Worker for background push notifications
const CACHE_NAME = 'rider-notifications-final-v4';
let riderId = null;
let pollingInterval = null;
let lastKnownDeliveryIds = [];
let apiBase = '';

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  if (type === 'RIDER_LOGIN') {
    riderId = data.riderId;
    apiBase = String(data.apiBase || '').replace(/\/$/, '');
    lastKnownDeliveryIds = data.currentDeliveryIds || [];
    startPolling();
  }
  
  if (type === 'RIDER_LOGOUT') {
    riderId = null;
    lastKnownDeliveryIds = [];
    stopPolling();
  }

  if (type === 'UPDATE_DELIVERIES') {
    lastKnownDeliveryIds = data.deliveryIds || [];
  }
});

// Install event
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // Focus or open the rider panel
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus an existing window
      for (const client of clientList) {
        if (client.url.includes('/rider') && 'focus' in client) {
          return client.focus();
        }
      }
      // Open new window if none found
      if (self.clients.openWindow) {
        return self.clients.openWindow('/rider');
      }
    })
  );
});

function startPolling() {
  stopPolling(); // Clear any existing interval
  // Poll every 10 seconds for new deliveries
  pollingInterval = setInterval(checkForNewDeliveries, 10000);
  // Also check immediately
  checkForNewDeliveries();
}

function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

async function checkForNewDeliveries() {
  if (!riderId) return;
  
  try {
    const baseUrl = apiBase || self.location.origin;
    const response = await fetch(`${baseUrl}/api/v1/rider/deliveries/${riderId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) return;
    
    const data = await response.json();
    const items = data?.items || [];
    
    // Find new deliveries that weren't in our last known list
    const currentIds = items.filter(d => d.status !== 'delivered').map(d => d.id);
    const newDeliveries = items.filter(d => 
      d.status !== 'delivered' && !lastKnownDeliveryIds.includes(d.id)
    );
    
    if (newDeliveries.length > 0) {
      // Show notification for each new delivery
      for (const delivery of newDeliveries) {
        await showNotification(delivery);
      }
    }
    
    // Update known delivery IDs
    lastKnownDeliveryIds = currentIds;
    
    // Also notify the main app about updates
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client => {
      client.postMessage({ type: 'DELIVERIES_UPDATE', data: { items } });
    });
    
  } catch (error) {
    // Silent fail - network might be unavailable
    console.log('SW: Poll failed', error);
  }
}

async function showNotification(delivery) {
  const title = '🍕 New Delivery Order!';
  const options = {
    body: `Order #${delivery.order_id} - ${delivery.customer_name}\n${delivery.customer_address || 'Ready for pickup'}`,
    icon: '/vite.svg',
    badge: '/vite.svg',
    tag: `delivery-${delivery.id}`,
    renotify: true,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200],
    data: {
      deliveryId: delivery.id,
      orderId: delivery.order_id,
    },
    actions: [
      { action: 'open', title: '📍 Open App' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };
  
  await self.registration.showNotification(title, options);
}