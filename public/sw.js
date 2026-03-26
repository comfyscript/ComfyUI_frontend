/* eslint-env serviceworker */
/* global self, URL, fetch, console, Response */
// sw.js
// @knipIgnore

const SW_BASE = self.location.pathname.replace(/\/sw\.js$/, '')
// → "/ComfyUI_frontend" on GitHub Pages, or "" on root deployments

const BACKEND_PATH_PATTERNS = [
  /\/([a-zA-Z0-9_-]+_async\/.*)/,
  /\/(extensions\/.*)/,
  /\/(custom_nodes\/.*)/
]

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_BACKEND') {
    self.__backendBase__ = event.data.backendBase
  }
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  if (url.origin !== self.location.origin) return

  const backendBase = self.__backendBase__
  if (!backendBase) return

  // Strip the SW base prefix before pattern matching
  const strippedPath = url.pathname.startsWith(SW_BASE)
    ? url.pathname.slice(SW_BASE.length)
    : url.pathname

  for (const pattern of BACKEND_PATH_PATTERNS) {
    const match = strippedPath.match(pattern)
    if (match) {
      const backendPath = '/' + match[1]
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
