/*
 * Service Worker Firovia — PWA Niveau 1 (cache interface)
 *
 * Stratégie :
 * - Cache des ressources statiques (HTML, CSS, JS, fonts, images) au premier chargement
 * - Network-first pour les API Supabase (toujours données fraîches)
 * - Cache-first pour les assets statiques (rechargement instantané)
 * - L'interface s'ouvre sans réseau, mais la création de données nécessite la connexion.
 */

const CACHE_VERSION = 'firovia-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Ressources de base à pré-cacher au premier chargement
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

// Domaines à ne JAMAIS cacher (API, auth, Supabase realtime)
const NEVER_CACHE_HOSTS = [
  'supabase.co',
  'supabase.in',
  '_vercel/insights',
  '_vercel/speed-insights',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => !k.startsWith(CACHE_VERSION))
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip : POST/PUT/PATCH/DELETE (jamais cachés)
  if (request.method !== 'GET') return;

  // Skip : domaines API qu'on veut toujours network-first
  if (NEVER_CACHE_HOSTS.some((host) => url.href.includes(host))) return;

  // Navigation HTML : network-first avec fallback cache (app shell)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/'))),
    );
    return;
  }

  // Assets statiques (CSS, JS, fonts, images) : cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        const copy = response.clone();
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        return response;
      }).catch(() => cached);
    }),
  );
});
