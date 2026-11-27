/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// ── iOS Fix: immediately activate and claim all clients ──────────────────────
// Without this, iOS WebKit's webpushd throws AbortError (code 20) because the
// service worker is registered but not yet controlling the page on first load.
self.addEventListener('install', (event: any) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event: any) => {
  event.waitUntil(self.clients.claim());
});

// Precache static assets built by Vite
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// ── Background Web Push Notification Listener (PW-2, PW-3) ──
self.addEventListener('push', (event: any) => {
  let data = {
    title: 'New Cartsy Order! 🛍️',
    body: 'You have received a new order on Cartsy.',
    url: '/admin/orders',
  };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
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
      tag: 'cartsy-order-' + Date.now(),
      renotify: true,
      vibrate: [200, 100, 200],
    } as NotificationOptions)
  );
});

// ── Click Notification to Open Store Admin ──
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
