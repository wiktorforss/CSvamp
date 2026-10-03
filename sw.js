// App shell is cached for offline start; weather API is network-first with cache fallback.
const VERSION = "v2";
const SHELL = ["./", "index.html", "style.css", "score.js", "app.js", "manifest.webmanifest", "icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const isApi = url.hostname.endsWith("open-meteo.com");
  const isTile = url.hostname.endsWith("openstreetmap.org");
  if (isTile) return; // let the browser handle map tiles
  // API + same-origin shell: network first (fresh data/code), cache fallback offline.
  // CDN libs: cache first.
  const cacheFirst = !isApi && url.origin !== location.origin;
  e.respondWith(cacheFirst ? fromCacheThenNet(req) : fromNetThenCache(req));
});
async function fromNetThenCache(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(req);
    if (hit) return hit;
    throw err;
  }
}
async function fromCacheThenNet(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") (await caches.open(VERSION)).put(req, res.clone());
  return res;
}
