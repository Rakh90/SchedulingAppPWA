const CACHE_NAME = 'notepad-app-v118';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './icons/folder-fox.png',
  './icons/folder-rainbow.png',
  './icons/folder-clockwork.png',
  './icons/folder-ginkgo.png',
  './icons/folder-leaf.png',
  './icons/folder-seaweed.png',
  './icons/folder-galaxy.png',
  './icons/folder-crystal.png',
  './icons/folder-blossom.png',
  './icons/folder-frost.png',
  './icons/folder-aurora.png',
  './icons/folder-gem.png',
  './icons/folder-butterfly.png',
  './icons/folder-ember.png',
  './icons/folder-void.png',
  './icons/app-identity-den.png'
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
        // cache.addAll() uses a plain fetch() under the hood, which honors
        // the browser's own HTTP cache — GitHub Pages sends a real
        // Cache-Control max-age, so even a brand-new install (e.g. right
        // after manually unregistering the old worker) could silently pull
        // a stale copy of index.html straight out of HTTP cache instead of
        // the network. {cache: 'reload'} forces every file here to be
        // fetched fresh, so a new CACHE_NAME always means genuinely new
        // content, not just a new wrapper around old content.
        return Promise.all(urlsToCache.map((url) =>
          fetch(url, { cache: 'reload' }).then((response) => cache.put(url, response))
        ));
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

// The Android share sheet (share_target in manifest.json) POSTs here as
// multipart/form-data (needed to carry shared image files, not just text).
// A static GitHub Pages host can't run a server-side handler for that POST,
// so the service worker intercepts it directly: read the form fields/files,
// stash them in IndexedDB for the page to pick up, then redirect to a plain
// GET so the browser lands on the normal cached app shell.
function openShareDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('notepad-db', 3);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('notes')) db.createObjectStore('notes', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('shareInbox')) db.createObjectStore('shareInbox', { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

async function handleShareTargetPost(request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('images').filter((f) => f instanceof File && f.size > 0);
    const payload = {
      id: 'pending',
      title: formData.get('title') || '',
      text: formData.get('text') || '',
      url: formData.get('url') || '',
      files,
      createdAt: Date.now(),
    };
    const db = await openShareDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('shareInbox', 'readwrite');
      tx.objectStore('shareInbox').put(payload);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Share target handling failed:', err);
  }
  return Response.redirect('./', 303);
}

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  if (event.request.method === 'POST') {
    event.respondWith(handleShareTargetPost(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        // Retry ignoring any query string before falling back to network, so
        // a navigation with unexpected params still opens the cached shell.
        return caches.match(event.request, { ignoreSearch: true })
          .then((fallback) => fallback || fetch(event.request));
      }
    )
  );
});
