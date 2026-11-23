/// <reference lib="webworker" />
declare let self: ServiceWorkerGlobalScope;

self.addEventListener('push', (event: any) => {
  let data = { title: 'New Cartsy Order', body: 'You have received a new order!', url: '/admin/orders' };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: { url: data.url || '/admin/orders' },
      tag: 'cartsy-order',
      renotify: true,
    } as NotificationOptions)
  );
});

self.addEventListener('notificationclick', (event: any) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/admin/orders';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes('/admin') && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
