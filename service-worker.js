const CACHE_NAME = 'notepad-app-v44';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png'
];

// Install event - cache files
self.addEventListener('install', (event) => {
  // Without this, a newly-installed worker sits "waiting" until every open
  // tab/PWA instance of the old one fully closes — which on Android often
  // means it never takes over at all, since backgrounding an app doesn't
  // reliably kill its process. skipWaiting activates it immediately instead.
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate event - clean up old caches and take control of open pages now
// (clients.claim) instead of waiting for their next navigation.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      self.clients.claim(),
    ])
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // The Android share sheet (share_target in manifest.json) navigates
        // here with query params (?title=&text=&url=) that never match the
        // plain './' cache entry above. Retry ignoring the query string
        // before falling back to network, so sharing into the app still
        // opens the cached shell while offline.
        return caches.match(event.request, { ignoreSearch: true })
          .then((fallback) => fallback || fetch(event.request));
      }
    )
  );
});
