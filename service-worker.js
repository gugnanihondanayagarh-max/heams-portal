const CACHE_NAME = "eams-cache-v73";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./admin.html",
  "./css/style.css",
  "./css/dashboard.css",
  "./css/attendance.css",
  "./css/admin.css",
  "./js/auth.js",
  "./js/api.js",
  "./js/employee.js",
  "./js/admin.js",
  "./js/utils.js",
  "./manifest.json",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css",
  "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
  "https://cdn.jsdelivr.net/npm/sweetalert2@11",
  "https://cdn.jsdelivr.net/npm/chart.js"
];

// Install Event - cache core resources
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - clean up obsolete caches
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - network-first fallback to cache
self.addEventListener("fetch", event => {
  // Only cache GET requests (ignore API POST calls)
  if (event.request.method !== "GET") return;
  // Ignore chrome-extension or other non-http request schemes
  if (!event.request.url.startsWith("http")) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Clone and store in cache
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, resClone);
        });
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
