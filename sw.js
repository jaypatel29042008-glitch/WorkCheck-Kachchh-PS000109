"use strict";
const CACHE = "workcheck-shell-v2";
const SHELL_URLS = [
  "./",
  "./index.html",
  "./404.html",
  "./styles.css",
  "./favicon.ico",
  "./favicon.svg",
  "./manifest.webmanifest",
  "./assets/kachchh_map.json",
  "./assets/fonts/jakarta.woff2",
  "./icons.js",
  "./qrcode.js",
  "./js/core.js",
  "./js/charts.js",
  "./js/login.js",
  "./js/today.js",
  "./js/workers.js",
  "./js/me.js",
  "./js/site.js",
  "./js/heat.js",
  "./js/evidence.js",
  "./js/wokwi.js",
  "./js/facilities.js",
  "./js/checkin.js",
  "./js/onboard.js",
  "./js/dashboard.js",
  "./js/trackers.js",
  "./js/team.js",
  "./js/boot.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL_URLS).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/health") return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
