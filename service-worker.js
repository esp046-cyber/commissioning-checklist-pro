/* Commissioning Checklist Pro — Service Worker
   Cache-first app shell with a safe versioned-cache update strategy.
   Bump CACHE_VERSION whenever any shell file changes so clients pick up the update. */

var CACHE_VERSION = "ccp-v2";
var SHELL_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./gdrive-sync.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(SHELL_FILES);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) { return key !== CACHE_VERSION; })
            .map(function (key) { return caches.delete(key); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  // Never let the service worker touch Google Sign-In / Drive API / Picker
  // traffic (or any other cross-origin request). These must always go
  // straight to the network and are never cached, so no OAuth token or
  // Drive response is ever stored by the service worker.
  var reqUrl = new URL(event.request.url);
  if (reqUrl.origin !== self.location.origin) {
    return; // let the browser handle it normally, untouched
  }

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var networkFetch = fetch(event.request).then(function (response) {
        if (response && response.status === 200 && response.type === "basic") {
          var copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(event.request, copy); });
        }
        return response;
      }).catch(function () {
        // Offline and not cached: fall back to the app shell for navigations.
        if (event.request.mode === "navigate") return caches.match("./index.html");
        return cached;
      });
      // Cache-first: serve cached immediately if present, else wait on network.
      return cached || networkFetch;
    })
  );
});
