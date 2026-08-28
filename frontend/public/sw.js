/* offline-first PWA service worker.
 *
 * Strategy:
 *   - JS / CSS / fonts / icons  → cache-first (filename-hashed, safe to cache)
 *   - /assets/hero/* (marketing slides) → network-first, NO cache.
 *     The shop owner updates these PNGs in place (no rename); a stale
 *     cached image here is a UX bug ("hero pehli baar dikhta hai, phir
 *     purana wapas aa jaata hai" — service worker never invalidates).
 *   - /api/* → never touch (let the network handle it; the worker must
 *     not serve stale order / settings data).
 *   - All other GETs → network-first with cache fallback for offline.
 *
 * Cache versioning:
 *   The CACHE name includes a build stamp. Bump the stamp (or just
 *   change the CACHE constant) to force-activate and clear old caches
 *   after every deploy.
 */
const BUILD = '2026-08-28-hero'
const CACHE = 'dorito-' + BUILD
const APP_SHELL = ['/', '/index.html', '/manifest.json', '/favicon.svg', '/icon-192.png', '/icon-512.png']

// Static-ish files that are content-hashed and safe to cache long-term.
const CACHEABLE_PREFIXES = [
  '/assets/index-',  // Vite content-hashed JS + CSS bundles
  '/assets/menu/',   // menu SVG/PNG assets (names stable, content stable)
  '/images/menu/',
]

// Files that must NEVER be served from cache — they change in place
// (same URL, different bytes) and stale copies are user-visible bugs.
const NEVER_CACHE_PREFIXES = [
  '/assets/hero/',   // ← the actual bug we just fixed
]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).catch(() => {})
  )
})

self.addEventListener('activate', (event) => {
  // Delete every cache that isn't our current CACHE — this is what
  // nukes the stale 'dorito-v1' / 'dorito-v2' / etc. from previous builds.
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

function isApi(url) { return url.includes('/api/') }
function isNeverCache(url) { return NEVER_CACHE_PREFIXES.some((p) => url.includes(p)) }
function isCacheableStatic(url) { return CACHEABLE_PREFIXES.some((p) => url.includes(p)) }

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = request.url

  // 1. API: always network, never touch cache
  if (isApi(url)) return

  // 2. Marketing assets that change in place: network-only, ignore cache
  if (isNeverCache(url)) {
    event.respondWith(
      fetch(request).catch(() => new Response('', { status: 504, statusText: 'Offline' }))
    )
    return
  }

  // 3. Content-hashed bundles: cache-first (they're immutable for the
  //    lifetime of the URL — Vite bumps the filename on every build).
  if (isCacheableStatic(url)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put(request, copy))
        return res
      }))
    )
    return
  }

  // 4. Everything else (HTML, navigations, other static): network-first
  //    with cache fallback. This is the only sane default for a small
  //    marketing PWA — it makes the next deploy's new files show up
  //    immediately on next reload, and only falls back to cache when
  //    the device is truly offline.
  event.respondWith(
    fetch(request)
      .then((res) => {
        // only cache successful basic responses
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy))
        }
        return res
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('/index.html'))),
  )
})

// Optional: allow the page to ask the SW to skip waiting / clear caches
// (used by a manual "Update available — reload" UI). Safe no-op otherwise.
self.addEventListener('message', (event) => {
  if (!event.data) return
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data.type === 'CLEAR_CACHES') {
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
  }
})