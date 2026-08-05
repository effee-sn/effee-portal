/* Effee Portal service worker — Web Push. */

// Take control as soon as it's installed/updated, so push works without a reload.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// A pushed notification: render it. Payload is JSON { title, body, url }.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch { data = { title: event.data ? event.data.text() : 'Effee Portal' }; }

  const title = data.title || 'Effee Portal';
  const options = {
    body: data.body || '',
    tag: data.url || undefined,      // collapse repeats about the same ticket
    data: { url: data.url || '/dashboard' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Clicking it: focus an existing portal tab (and navigate it) or open a new one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if ('focus' in client) {
        if ('navigate' in client) { try { await client.navigate(url); } catch { /* ignore */ } }
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
    return undefined;
  })());
});
