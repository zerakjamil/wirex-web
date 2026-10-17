// wireX Offline Service Worker
const CACHE_NAME = 'wirex-cache-QUoQWDk3Gdhrunk2VuB8C'
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/icon.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    fetch('/offline-assets.json', { cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Offline asset manifest is unavailable.')
      const manifest = await response.json()
      if (!Array.isArray(manifest.assets) || manifest.assets.some(asset => typeof asset !== 'string' || !asset.startsWith('/_next/static/'))) throw new Error('Invalid offline asset manifest.')
      const cache = await caches.open(CACHE_NAME)
      await cache.addAll([...PRECACHE_ASSETS, ...manifest.assets])
    })
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && (key.startsWith('wireforge-cache-') || key.startsWith('wirex-cache-'))) {
            return caches.delete(key)
          }
        })
      )
    }).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  // Skip non-GET and foreign origin requests
  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return
  }

  // Imported PKT conversion remains a server operation in the browser release.
  if (url.pathname.startsWith('/api/')) {
    return
  }

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone))
        }
        return networkResponse
      })
      .catch(async () => {
        const cache = await caches.open(CACHE_NAME)
        const match = await cache.match(req)
        if (match) return match
        if (req.mode === 'navigate') {
          const shell = await cache.match('/')
          if (shell) return shell
        }
        return new Response('Offline: wireX resource not cached.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain' },
        })
      })
  )
})
