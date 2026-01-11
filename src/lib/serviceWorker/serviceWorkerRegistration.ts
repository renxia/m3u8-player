/**
 * Service Worker 注册和管理
 */

export interface ServiceWorkerRegistrationOptions {
  onSuccess?: (registration: ServiceWorkerRegistration) => void
  onUpdate?: (registration: ServiceWorkerRegistration) => void
  onError?: (error: Error) => void
}

export interface ServiceWorkerController {
  register: () => Promise<ServiceWorkerController>
  update: () => Promise<void>
  skipWaiting: () => Promise<void>
  getRegistration: () => ServiceWorkerRegistration | undefined
  clearCache: (cacheName?: string) => Promise<void>
}

/**
 * 检查浏览器是否支持 Service Worker
 */
export function isServiceWorkerSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

/**
 * 注册 Service Worker
 */
export async function registerServiceWorker(
  scriptUrl: string,
  options: ServiceWorkerRegistrationOptions = {},
): Promise<ServiceWorkerController> {
  if (!isServiceWorkerSupported()) {
    const error = new Error('Service Worker is not supported in this browser')
    options.onError?.(error)
    throw error
  }

  let registration: ServiceWorkerRegistration | undefined

  try {
    // 注册 Service Worker
    registration = await navigator.serviceWorker.register(scriptUrl, {
      scope: '/',
    })

    console.log('[SW] Service Worker registered:', registration.scope)

    // 检查更新
    checkForUpdates(registration, options)

    options.onSuccess?.(registration)

    const controller: ServiceWorkerController = {
      register: () => registerServiceWorker(scriptUrl, options),
      update: () => updateServiceWorker(registration),
      skipWaiting: () => skipWaiting(registration),
      getRegistration: () => registration,
      clearCache: (cacheName) => clearCache(registration, cacheName),
    }

    return controller
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    console.error('[SW] Service Worker registration failed:', err)
    options.onError?.(err)
    throw err
  }
}

/**
 * 检查 Service Worker 更新
 */
function checkForUpdates(registration: ServiceWorkerRegistration, options: ServiceWorkerRegistrationOptions): void {
  // 检查是否有新的 Service Worker
  if (registration.waiting) {
    options.onUpdate?.(registration)
    return
  }

  // 监听新的 Service Worker 安装
  registration.addEventListener('updatefound', () => {
    const newWorker = registration.installing
    if (!newWorker) return

    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        // 有新的 Service Worker 可用
        console.log('[SW] New Service Worker available')
        options.onUpdate?.(registration)
      }
    })
  })
}

/**
 * 更新 Service Worker
 */
export async function updateServiceWorker(registration?: ServiceWorkerRegistration): Promise<void> {
  const reg = registration || (await navigator.serviceWorker.getRegistration())
  if (!reg) {
    throw new Error('Service Worker not registered')
  }

  console.log('[SW] Checking for updates...')
  await reg.update()
}

/**
 * 跳过等待，立即激活新的 Service Worker
 */
export async function skipWaiting(registration?: ServiceWorkerRegistration): Promise<void> {
  const reg = registration || (await navigator.serviceWorker.getRegistration())
  if (!reg) {
    throw new Error('Service Worker not registered')
  }

  if (reg.waiting) {
    console.log('[SW] Skipping waiting...')
    reg.waiting.postMessage({ type: 'SKIP_WAITING' })
  } else {
    console.log('[SW] No waiting Service Worker')
  }
}

/**
 * 清除缓存
 */
export async function clearCache(registration?: ServiceWorkerRegistration, cacheName?: string): Promise<void> {
  const reg = registration || (await navigator.serviceWorker.getRegistration())
  if (!reg) {
    throw new Error('Service Worker not registered')
  }

  if (reg.active) {
    console.log('[SW] Clearing cache:', cacheName || 'all')
    reg.active.postMessage({
      type: 'CLEAR_CACHE',
      data: { cacheName },
    })
  }
}

/**
 * 缓存指定 URL
 */
export async function cacheUrl(url: string, registration?: ServiceWorkerRegistration): Promise<void> {
  const reg = registration || (await navigator.serviceWorker.getRegistration())
  if (!reg) {
    throw new Error('Service Worker not registered')
  }

  if (reg.active) {
    console.log('[SW] Caching URL:', url)
    reg.active.postMessage({
      type: 'CACHE_URL',
      data: { url },
    })
  }
}

/**
 * 获取 Service Worker 控制状态
 */
export function isControlled(): boolean {
  return !!navigator.serviceWorker.controller
}
