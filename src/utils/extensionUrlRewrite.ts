/**
 * If we're running on a remote frontend (e.g. GitHub Pages) with a ?host= backend,
 * rewrite backend-absolute extension URLs to same-origin paths so the SW can proxy them.
 *
 * e.g. http://127.0.0.1:8188/extensions/rgthree-comfy/seed.js
 *   → /ComfyUI_frontend/extensions/rgthree-comfy/seed.js
 */
export function rewriteExtensionUrl(url: string): string {
  const hostParam = new URLSearchParams(window.location.search).get('host')
  if (!hostParam) return url // not using remote backend, no rewrite needed

  try {
    const backendOrigin = new URL(hostParam).origin // http://127.0.0.1:8188
    if (url.startsWith(backendOrigin)) {
      // Strip backend origin, prepend our frontend base path
      const path = url.slice(backendOrigin.length) // /extensions/rgthree-comfy/seed.js
      return `${window.location.origin}/ComfyUI_frontend${path}`
    }
  } catch {
    // malformed host param, leave url as-is
  }
  return url
}
