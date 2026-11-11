/* Gastos: service worker. Caches the app shell only (never the data) and leaves requests to other origins alone.
   To ship a new version, change VERSION. */
'use strict';
var VERSION = '1.0.0';
var CACHE_NAME = 'gastos-' + VERSION;
var SHELL = [
  './',
  './index.html',
  './app.js',
  './logic.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon-180.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE_NAME).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (k) { return k.indexOf('gastos-') === 0 && k !== CACHE_NAME; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // other origins are never intercepted or cached
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./index.html', { cacheName: CACHE_NAME }).then(function (r) { return r || fetch(req); }));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: CACHE_NAME, ignoreSearch: true }).then(function (r) { return r || fetch(req); }));
});

self.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'version' && e.ports && e.ports[0]) e.ports[0].postMessage({ version: VERSION });
});
