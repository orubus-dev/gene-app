/* Gene app service worker — offline-first after first visit.
   - app shell: precached
   - python runtime: self-hosted ./pyodide/, cached on first fetch (immutable)
   - model bundles: cached by the app itself (Cache API, gene-model-<ver>)
*/
const SHELL = "gene-shell-v2";
const RUNTIME = "gene-runtime-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512-maskable.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES))
    .then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) {
      if (![SHELL, RUNTIME].includes(k) && !k.startsWith("gene-model-")) {
        await caches.delete(k);
      }
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // model bundles: app manages its own cache — pass through
  if (url.pathname.includes("/model/")) return;

  // same-origin: cache-first, refresh in background
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(req, { ignoreSearch: true });

      // pyodide runtime: version-pinned directory, immutable — cache-first
      // forever, never burn 14 MB of background refresh on every visit
      if (url.pathname.includes("/pyodide/")) {
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return hit || new Response("runtime not cached yet", { status: 503 });
        }
      }

      const net = fetch(req).then((res) => {
        if (res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => hit);
      return hit || net;
    })());
    return;
  }

  // CDN (pyodide): cache-first forever after first success — the runtime never changes
  if (/jsdelivr\.net$/.test(url.hostname) || /cdn\.jsdelivr\.net$/.test(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === "opaque") cache.put(req, res.clone());
        return res;
      } catch (err) {
        return new Response("offline and runtime not cached yet", { status: 503 });
      }
    })());
  }
});
