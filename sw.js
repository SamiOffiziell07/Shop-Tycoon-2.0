// sw.js – Service Worker: legt alle Spieldateien im Cache ab, damit das Spiel ohne Internet startet.
// Wichtig: Wenn du Dateien änderst, erhöhe die Zahl bei VERSION, dann holt sich das iPhone die neuen Dateien.
'use strict';

const VERSION = 'v3-phase3';
const CACHE = 'cst-' + VERSION;
const ASSETS = [
  './',
  'index.html',
  'style.css',
  'engine.js',
  'world.js',
  'controls.js',
  'storage.js',
  'hardware.js',
  'economy.js',
  'progression.js',
  'suppliers.js',
  'builder.js',
  'sim.js',
  'jobs.js',
  'customers.js',
  'tutorial.js',
  'achievements.js',
  'audio.js',
  'ui-common.js',
  'ui-office.js',
  'ui-bench.js',
  'ui-counter.js',
  'game.css',
  'inventory.js',
  'shop.js',
  'ui-shop.js',
  'shop.css',
  'data-cpu.json',
  'data-gpu.json',
  'data-mainboard.json',
  'data-ram.json',
  'data-ssd.json',
  'data-psu.json',
  'data-cooler.json',
  'data-case.json',
  'data-fan.json',
  'game.js',
  'manifest.json',
  'icon-180.png',
  'icon-192.png',
  'icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cst-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
      // Im Hintergrund aktualisieren, wenn Internet da ist (stale-while-revalidate)
      const refresh = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => undefined);
      if (cached) {
        refresh.catch(() => {});
        return cached;
      }
      const res = await refresh;
      return res || new Response('Offline und Datei nicht im Cache.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })
  );
});
