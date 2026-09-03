// ponytail: app-shell cache only (icons + manifest), not a full offline-first
// asset precache. Upgrade to vite-plugin-pwa/Workbox if per-route offline or
// background sync is actually needed.
const CACHE = "ohw-shell-v2";
const SHELL_ASSETS = ["/manifest.webmanifest", "/icon.svg", "/icon-maskable.svg", "/favicon-32.png", "/favicon-192.png", "/apple-touch-icon-180.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (!SHELL_ASSETS.some((path) => event.request.url.endsWith(path))) return;

  event.respondWith(
    caches.match(event.request).then((cached) => cached ?? fetch(event.request)),
  );
});
