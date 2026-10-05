// Mornward's service worker. Chrome on Android only offers its one-tap "Install app" prompt to sites that have
// one, and it also lets the morning open without a connection.
// Always asks the network first, so updates show up straight away. The saved copy is used offline, or when a page
// takes longer than NAV_TIMEOUT_MS to arrive and a saved copy exists (a weak signal shouldn't hold up the morning).
// It only touches this site's own GET requests: the anonymous stats (POSTs to Supabase) pass straight through.
// It only manages its own caches and never touches localStorage, so tasks and settings survive every update.
const CACHE = "mornward-v4";
const SHELL = ["./", "./index.html", "./terms.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png"];
const NAV_TIMEOUT_MS = 4000;

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("mornward-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const saved = (req) => caches.match(req, { ignoreSearch: true })
  .then((hit) => hit || (req.mode === "navigate" ? caches.match("./index.html") : undefined));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  const net = fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
    return res;
  });
  if (req.mode !== "navigate") {
    e.respondWith(net.catch(() => saved(req).then((hit) => hit || Response.error())));
    return;
  }
  // Pages: the network, unless it fails, or is slow and a saved copy exists. A late network reply still refreshes
  // the saved copy, so the next open has the update.
  e.respondWith(new Promise((resolve) => {
    let done = false;
    const answer = (res) => { if (!done) { done = true; resolve(res); } };
    const timer = setTimeout(() => saved(req).then((hit) => { if (hit) answer(hit); }), NAV_TIMEOUT_MS);
    net.then((res) => { clearTimeout(timer); answer(res); })
      .catch(() => { clearTimeout(timer); saved(req).then((hit) => answer(hit || Response.error())); });
  }));
  e.waitUntil(net.catch(() => {}));
});
