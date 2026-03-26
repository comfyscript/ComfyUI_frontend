import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'
import * as Sentry from '@sentry/vue'
import { initializeApp } from 'firebase/app'
import { createPinia } from 'pinia'
import 'primeicons/primeicons.css'
import PrimeVue from 'primevue/config'
import ConfirmationService from 'primevue/confirmationservice'
import ToastService from 'primevue/toastservice'
import Tooltip from 'primevue/tooltip'
import { createApp } from 'vue'
import { VueFire, VueFireAuth } from 'vuefire'

import { getFirebaseConfig } from '@/config/firebase'
import '@/lib/litegraph/public/css/litegraph.css'
import router from '@/router'
import { useBootstrapStore } from '@/stores/bootstrapStore'

import App from './App.vue'
// Intentionally relative import to ensure the CSS is loaded in the right order (after litegraph.css)
import './assets/css/style.css'
import { i18n } from './i18n'
import { api } from './scripts/api' // adjust import path

/**
 * CRITICAL: Load remote config FIRST for cloud builds to ensure
 * window.__CONFIG__is available for all modules during initialization
 */
const isCloud = __DISTRIBUTION__ === 'cloud'

if (isCloud) {
  const { refreshRemoteConfig } =
    await import('@/platform/remoteConfig/refreshRemoteConfig')
  await refreshRemoteConfig({ useAuth: false })

  const { initTelemetry } = await import('@/platform/telemetry/initTelemetry')
  await initTelemetry()
}

const ComfyUIPreset = definePreset(Aura, {
  semantic: {
    // @ts-expect-error fixme ts strict error
    primary: Aura['primitive'].blue
  }
})

const firebaseApp = initializeApp(getFirebaseConfig())

const app = createApp(App)
const pinia = createPinia()

Sentry.init({
  app,
  dsn: __SENTRY_DSN__,
  enabled: __SENTRY_ENABLED__,
  release: __COMFYUI_FRONTEND_VERSION__,
  normalizeDepth: 8,
  tracesSampleRate: isCloud ? 1.0 : 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  // Only set these for non-cloud builds
  ...(isCloud
    ? {}
    : {
        integrations: [],
        autoSessionTracking: false,
        defaultIntegrations: false
      })
})
app.directive('tooltip', Tooltip)
app
  .use(router)
  .use(PrimeVue, {
    theme: {
      preset: ComfyUIPreset,
      options: {
        prefix: 'p',
        cssLayer: {
          name: 'primevue',
          order: 'theme, base, primevue'
        },
        // This is a workaround for the issue with the dark mode selector
        // https://github.com/primefaces/primevue/issues/5515
        darkModeSelector: '.dark-theme, :root:has(.dark-theme)'
      }
    }
  })
  .use(ConfirmationService)
  .use(ToastService)
  .use(pinia)
  .use(i18n)
  .use(VueFire, {
    firebaseApp,
    modules: [VueFireAuth()]
  })

const bootstrapStore = useBootstrapStore(pinia)
void bootstrapStore.startStoreBootstrap()

// Intercepting Requests
async function registerProxySW() {
  if (!('serviceWorker' in navigator)) return

  const hostParam = new URLSearchParams(window.location.search).get('host')
  if (!hostParam) return

  try {
    const reg = await navigator.serviceWorker.register('./sw.js', {
      scope: './'
    })

    // Wait for the SW to be active
    const sw = reg.active ?? reg.installing ?? reg.waiting
    if (!sw) return

    const sendBackend = (worker: ServiceWorker) => {
      worker.postMessage({
        type: 'SET_BACKEND',
        backendBase: hostParam.replace(/\/$/, '') // e.g. http://127.0.0.1:8188
      })
    }

    if (reg.active) {
      sendBackend(reg.active)
    } else {
      sw.addEventListener('statechange', () => {
        if (sw.state === 'activated') sendBackend(sw)
      })
    }
  } catch (err) {
    console.warn('[SW] Registration failed:', err)
  }
}

function patchApiForRemoteFrontend() {
  const hostParam = new URLSearchParams(window.location.search).get('host')
  if (!hostParam) return

  const frontendBase = import.meta.env.BASE_URL.replace(/\/$/, '')
  // e.g. "/ComfyUI_frontend"

  const originalGetExtensions = api.getExtensions.bind(api)

  api.getExtensions = async () => {
    const extensions = await originalGetExtensions()

    return extensions.map((ext: string) => {
      try {
        // ext could be a full URL like http://127.0.0.1:8188/extensions/...
        // or a relative path like /extensions/...
        const extUrl = new URL(ext, hostParam)
        // Rewrite to same-origin frontend path so SW can intercept
        return frontendBase + extUrl.pathname
        // Result: /ComfyUI_frontend/extensions/rgthree-comfy/reroute.js
      } catch {
        return ext
      }
    })
  }
}

patchApiForRemoteFrontend()

await registerProxySW()

app.mount('#vue-app')
