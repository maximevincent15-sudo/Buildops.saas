/*
 * Service Worker Firovia : l'app complète reste sur l'appareil.
 *
 * - À l'installation, tous les fichiers de l'app (pages, scripts, scanner,
 *   générateur de PDF, polices) sont gardés : elle s'ouvre et fonctionne
 *   sans réseau. La liste et la version sont écrites au build (vite.config.ts).
 * - Une nouvelle version remplace l'ancienne d'elle-même.
 * - Les données (Supabase) ne passent pas ici : la couche hors ligne de
 *   l'app (src/shared/lib/offline) les garde et met les envois en attente.
 */

const BUILD_VERSION = '__BUILD_VERSION__';
const PRECACHE_ASSETS = [] /* __PRECACHE_ASSETS__ */;

const CACHE_PREFIX = 'firovia-';
const STATIC_CACHE = `${CACHE_PREFIX}${BUILD_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_PREFIX}${BUILD_VERSION}-runtime`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  ...PRECACHE_ASSETS,
];

// Domaines jamais gardés ici (API, connexion, statistiques)
const NEVER_CACHE_HOSTS = [
  'supabase.co',
  'supabase.in',
  '_vercel/insights',
  '_vercel/speed-insights',
  'sentry.io',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      // Un fichier manquant ne doit pas bloquer l'installation
      .then((cache) => Promise.all(PRECACHE_URLS.map((u) => cache.add(u).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && !k.startsWith(`${CACHE_PREFIX}${BUILD_VERSION}-`))
          .map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

const NAVIGATION_TIMEOUT_MS = 4000;

function keptApp() {
  return caches.match('/').then((r) => r || caches.match('/index.html'));
}

async function openPage(request) {
  const network = fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(RUNTIME_CACHE).then((cache) => cache.put('/', copy));
    }
    return response;
  });
  network.catch(() => undefined);
  const timeout = new Promise((resolve) => setTimeout(resolve, NAVIGATION_TIMEOUT_MS, 'timeout'));
  try {
    const winner = await Promise.race([network, timeout]);
    if (winner !== 'timeout') return winner;
    // Réseau trop lent : l'app gardée, sinon on continue d'attendre le réseau
    return (await keptApp()) || network;
  } catch {
    return (await keptApp()) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (NEVER_CACHE_HOSTS.some((host) => url.href.includes(host))) return;

  // Pages : réseau d'abord, sinon l'app gardée (index.html). Avec une barre de
  // réseau, on n'attend pas plus de quelques secondes : l'app gardée s'ouvre.
  if (request.mode === 'navigate') {
    event.respondWith(openPage(request));
    return;
  }

  // Fichiers de l'app : depuis l'appareil d'abord
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type === 'opaque') {
          return response;
        }
        if (url.origin === self.location.origin) {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
    }),
  );
});
