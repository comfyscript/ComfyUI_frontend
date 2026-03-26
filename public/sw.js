/* eslint-env serviceworker */
/* global self, URL, fetch, console, Response */

const FRONTEND_ORIGIN = self.location.origin
const FRONTEND_BASE = '/ComfyUI_frontend'

// Known backend path patterns from custom nodes / ComfyUI core
const BACKEND_PATH_PATTERNS = [
  /^\/ComfyUI_frontend\/([a-zA-Z0-9_-]+_async\/.*)/, // e.g. kjweb_async/
  /^\/ComfyUI_frontend\/(extensions\/.*)/,
  /^\/ComfyUI_frontend\/(custom_nodes\/.*)/
]

// In-memory backend base URL set by the main app via postMessage
let backendBase = null

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_BACKEND') {
    backendBase = event.data.backendBase // e.g. http://127.0.0.1:8188
  }
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Only intercept requests to our own origin
  if (url.origin !== FRONTEND_ORIGIN) return
  if (!backendBase) return

  for (const pattern of BACKEND_PATH_PATTERNS) {
    const match = url.pathname.match(pattern)
    if (match) {
      const backendPath = '/' + match[1] // e.g. /kjweb_async/marked.min.js
      const rewrittenUrl = backendBase + backendPath

      event.respondWith(
        fetch(rewrittenUrl, {
          method: event.request.method,
          headers: event.request.headers,
          body: ['GET', 'HEAD'].includes(event.request.method)
            ? undefined
            : event.request.body,
          mode: 'cors',
          credentials: 'omit'
        }).catch((err) => {
          console.warn(`[SW] Failed to proxy ${rewrittenUrl}:`, err)
          return new Response(`SW proxy failed for ${backendPath}`, {
            status: 502
          })
        })
      )
      return
    }
  }
})
