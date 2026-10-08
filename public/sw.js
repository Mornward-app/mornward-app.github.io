/* Retired. Mornward is no longer a PWA and keeps no offline cache of old screens. */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try { for (const k of await caches.keys()) await caches.delete(k) } catch (e) { /* ignore */ }
    try { await self.registration.unregister() } catch (e) { /* ignore */ }
    try {
      const clients = await self.clients.matchAll({ type: 'window' })
      clients.forEach((c) => c.navigate(c.url))
    } catch (e) { /* ignore */ }
  })())
})
