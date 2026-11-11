/*
 * Service worker for Class Submissions (PWA).
 *
 * Deliberately minimal and SAFE for a live-production app whose real data
 * lives in Firestore/Auth and whose deployed JS/CSS are cache-busted with
 * manual ?v=N. Two hard rules make it safe:
 *
 *  1. It ONLY handles same-origin GET requests. Anything cross-origin
 *     (Firestore firestore.googleapis.com, Auth identitytoolkit/securetoken,
 *     Firebase SDK on gstatic.com, Google Fonts, accounts.google.com GSI) is
 *     left completely untouched - the fetch handler returns without calling
 *     respondWith, so those requests hit the network exactly as they would
 *     with no service worker. Live grades/submissions are NEVER cached.
 *
 *  2. Same-origin assets are NETWORK-FIRST. When online, the browser always
 *     gets the freshest HTML/CSS/JS straight from the network; the cache is
 *     only ever used as an offline fallback. A cached copy can never win over
 *     a reachable network, so a freshly deployed fix is never hidden.
 *
 * CACHE_NAME carries the version. Bump the number whenever cached asset
 * contents change on deploy (same mental model as the ?v=N busters). The
 * activate handler deletes every cache that isn't the current one.
 */

const CACHE_NAME = "class-submissions-v44";

self.addEventListener("install", () => {
  // Activate this worker as soon as it's installed, don't wait for old tabs
  // to close - safe here because everything is network-first anyway.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only ever touch same-origin GETs. Bail (no respondWith) on everything
  // else so Firestore/Auth/CDN/font requests behave exactly as without a SW.
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(networkFirst(req, event));
});

// Network-first, but a hung connection (weak signal) no longer blocks forever:
// if the network has not answered in NETWORK_TIMEOUT_MS and a cached copy
// exists, serve that, while the fetch keeps going and refreshes the cache.
// With no cached copy we still wait for the network (nothing else to show).
const NETWORK_TIMEOUT_MS = 4000;

async function networkFirst(req, event) {
  const cache = await caches.open(CACHE_NAME);
  const network = fetch(req).then((fresh) => {
    // Cache a copy for offline use. Only cache real successful responses
    // (skip opaque/partial/error) so we never persist a broken page.
    if (fresh && fresh.ok && fresh.type === "basic") {
      cache.put(req, fresh.clone());
    }
    return fresh;
  });
  // Keep the worker alive so a slow fetch can still finish refreshing the cache.
  if (event) event.waitUntil(network.catch(() => {}));
  try {
    const cachedFirst = await cache.match(req);
    if (!cachedFirst) return await network;
    let timer;
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS); });
    const winner = await Promise.race([network, timeout]);
    clearTimeout(timer);
    return winner || cachedFirst;
  } catch (err) {
    // Offline (or network failed): serve the cached copy if we have one.
    const cached = await cache.match(req);
    if (cached) return cached;
    // For a navigation with nothing cached, fall back to the app shell.
    if (req.mode === "navigate") {
      const shell = await cache.match("/index.html");
      if (shell) return shell;
    }
    throw err;
  }
}
