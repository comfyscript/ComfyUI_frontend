/* eslint-env serviceworker */
/* global self, URL, fetch, console, Response */
// sw.js
// @knipIgnore

const FRONTEND_ORIGIN = self.location.origin
const FRONTEND_BASE = '/ComfyUI_frontend'

// These prefixes are definitively frontend-only — never proxy these
const FRONTEND_ONLY_PREFIXES = [
  `${FRONTEND_BASE}/assets/`,
  `${FRONTEND_BASE}/index.html`,
  `${FRONTEND_BASE}/sw.js`
]

function getBackendBase() {
  return self.__backendBase__ || null
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_BACKEND') {
    self.__backendBase__ = event.data.backendBase // e.g. http://127.0.0.1:8188
  }
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Only intercept same-origin GET requests under our base
  if (url.origin !== FRONTEND_ORIGIN) return
  if (!url.pathname.startsWith(FRONTEND_BASE + '/')) return
  if (event.request.method !== 'GET') return

  // Never proxy known frontend-only paths
  if (FRONTEND_ONLY_PREFIXES.some((p) => url.pathname.startsWith(p))) return

  const backendBase = getBackendBase()
  if (!backendBase) return

  event.respondWith(tryFrontendThenBackend(event.request, url, backendBase))
})

async function tryFrontendThenBackend(request, url, backendBase) {
  // 1. Try the original frontend URL first
  try {
    const frontendRes = await fetch(request.url, {
      method: 'GET',
      // Use 'same-origin' to avoid CORS preflight on GitHub Pages
      mode: 'same-origin',
      // Don't use cache so we get a real 404 signal
      cache: 'no-cache'
    })

    if (frontendRes.ok) {
      return frontendRes
    }

    // Only fall back on 404 — don't swallow real errors like 500
    if (frontendRes.status !== 404) {
      return frontendRes
    }
  } catch (err) {
    // Network error on frontend fetch — fall through to backend
    console.warn(
      `[SW] Frontend fetch error for ${url.pathname}, trying backend`,
      err
    )
  }

  // 2. Rewrite path: strip /ComfyUI_frontend prefix, keep query string
  const backendPath = url.pathname.slice('/ComfyUI_frontend'.length) // e.g. /rgthree/logo_markup.svg
  const backendUrl = backendBase + backendPath + url.search

  console.warn(`[SW] 404 on frontend, proxying to backend: ${backendUrl}`)

  try {
    const backendRes = await fetch(backendUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit'
    })
    return backendRes
  } catch (err) {
    console.warn(`[SW] Backend fetch also failed for ${backendUrl}:`, err)
    return new Response(
      `Resource not found on frontend or backend: ${backendPath}`,
      {
        status: 404,
        headers: { 'Content-Type': 'text/plain' }
      }
    )
  }
}
