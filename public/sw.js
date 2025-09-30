importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js"
);

workbox.setConfig({ debug: false });
workbox.loadModule("workbox-routing");
workbox.loadModule("workbox-strategies");

const { registerRoute, setCatchHandler } = workbox.routing;
const { NetworkFirst, StaleWhileRevalidate } = workbox.strategies;

const APP_SHELL_CACHE = "app-shell-v1";
const STATIC_CACHE = "static-resources-v1";
const PAGE_CACHE = "page-cache-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(["/", "/index.html"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name !== APP_SHELL_CACHE && name !== STATIC_CACHE && name !== PAGE_CACHE
            )
            .map((name) => caches.delete(name))
        )
      )
  );
  self.clients.claim();
});

registerRoute(
  ({ request }) => request.destination === "document",
  new NetworkFirst({
    cacheName: PAGE_CACHE,
  })
);

registerRoute(
  ({ request }) => request.destination === "script",
  new StaleWhileRevalidate({
    cacheName: STATIC_CACHE,
  })
);

registerRoute(
  ({ request }) => request.destination === "style",
  new StaleWhileRevalidate({
    cacheName: STATIC_CACHE,
  })
);

setCatchHandler(async ({ event }) => {
  if (event.request.destination === "document") {
    const cache = await caches.open(APP_SHELL_CACHE);
    const cached = await cache.match("/index.html");
    if (cached) {
      return cached;
    }
  }
  return Response.error();
});
