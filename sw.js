// Dijla Ops service worker: keeps the app's own files on the phone so it opens fast and with a weak signal.
// Your loads, expenses and applicants are NOT stored here; they stay in Firebase (which has its own offline copy).
const VERSION = "dijla-ops-7851b51efe";
const ROOT = new URL("./", self.registration.scope).pathname;          // "/" on dijlatrucking.github.io
const SHELL = ["./", "./logo.png", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./apple-touch-icon.png", "./favicon-64.png", "./manifest.webmanifest"];
const FIREBASE = "https://www.gstatic.com/firebasejs/";                // versioned URLs, never change

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("dijla-ops-") && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// fresh copy when the network answers quickly; the saved copy when it doesn't (weak signal / offline)
function networkFirst(req, key, waitMs){
  return new Promise(resolve => {
    let done = false;
    const fallback = () => caches.match(key).then(hit => { if (!done && hit) { done = true; resolve(hit); } });
    const t = setTimeout(fallback, waitMs);
    fetch(req).then(res => {
      clearTimeout(t);
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(key, copy)); }
      if (!done) { done = true; resolve(res); }
    }).catch(() => { clearTimeout(t); caches.match(key).then(hit => { if (!done) { done = true; resolve(hit || Response.error()); } }); });
  });
}
function cacheFirst(req){
  return caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }));
}

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.href.startsWith(FIREBASE)) { e.respondWith(cacheFirst(req)); return; }       // Firebase code (not data)
  if (url.origin !== location.origin) return;                                           // Google sign-in, Firestore data, PDF tools: straight to the network
  const path = url.pathname;
  if (path.startsWith(ROOT + "jobs")) return;                                            // hiring page: left alone
  if (req.mode === "navigate" && (path === ROOT || path === ROOT + "index.html")) { e.respondWith(networkFirst(req, "./", 2500)); return; }
  if (SHELL.some(s => new URL(s, self.registration.scope).pathname === path)) e.respondWith(networkFirst(req, req, 2500));
});
