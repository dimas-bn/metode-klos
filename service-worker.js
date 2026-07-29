// service-worker.js — Metode Klos
// Strategi: stale-while-revalidate untuk file di domain sendiri (HTML/CSS/JS/ikon),
// dan SELALU lewat langsung ke network untuk:
//   - permintaan non-GET (mis. kirim hasil latihan / auth guru)
//   - endpoint /api/* (Gemini) dan domain lain (Supabase, CDN font/library)
// supaya data selalu segar dan tidak pernah dilayani dari cache basi.

const CACHE_NAME = 'metode-klos-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/guru.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => { /* biarkan install tetap lanjut walau sebagian gagal di-precache */ })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return; // jangan sentuh POST/PUT/DELETE (mis. kirim hasil ke guru)

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // biarkan Supabase/Gemini/CDN font apa adanya
  if (url.pathname.startsWith('/api/')) return; // jangan cache hasil generate AI

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => cached); // offline & belum ada di cache → biar browser yang tangani
      return cached || networkFetch;
    })
  );
});
