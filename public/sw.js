/**
 * @type {ServiceWorkerGlobalScope}
 */
// @ts-ignore

const IS_DEV = location.hostname.startsWith('localhost')
/** 默认缓存名称 */
const CACHE_NAME = 'm3u8-player-v1'
/** 静态资源缓存名 */
const OFFLINE_CACHE = 'm3u8-player-offline-v1'
/** M3U8 媒体资源缓存名 - 需与 pwaCache 中保持一致 */
const M3U8_CACHE = 'm3u8-player-media-v1'
/** 元数据存储键前缀 */
const METADATA_KEY_PREFIX = '__metadata__'
// 缓存策略配置
const CACHE_STRATEGIES = {
  // 静态资源：Cache First
  static: {
    cacheName: CACHE_NAME,
    strategy: cacheFirst,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7天
  },
  // API 请求：Network First
  api: {
    cacheName: CACHE_NAME,
    strategy: networkFirst,
    maxAge: 5 * 60 * 1000, // 5分钟
  },
  // M3U8 媒体资源：Network First with Cache
  // 注意：使用与 pwaCache.ts 相同的缓存名称，确保缓存共享
  media: {
    cacheName: M3U8_CACHE,
    strategy: cacheFirst, // networkFirst
    maxAge: 3 * 24 * 60 * 60 * 1000, // 3 天
  },
  // 离线页面：Cache Only
  offline: {
    cacheName: OFFLINE_CACHE,
    strategy: cacheOnly,
  },
};

// 需要缓存的静态资源
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/assets/favicon.png',
]

// M3U8 相关的 URL 模式
const M3U8_PATTERNS = [
  /\.m3u8(\?.*)?$/i,
  /\.ts(\?.*)?$/i,
  /\.mp4(\?.*)?$/i,
  /video\//i,
  /media\//i,
]

// 检查是否为 M3U8 媒体资源
/**
 * @param {string} url
 * @returns {boolean}
 */
function isM3U8Resource(url) {
  return M3U8_PATTERNS.some((pattern) => pattern.test(url))
}

// 检查是否为静态资源
/**
 * @param {string} url
 * @returns {boolean}
 */
function isStaticAsset(url) {
  return (
    url.endsWith('.js') ||
    url.endsWith('.css') ||
    url.endsWith('.png') ||
    url.endsWith('.jpg') ||
    url.endsWith('.jpeg') ||
    url.endsWith('.svg') ||
    url.endsWith('.webp') ||
    url.endsWith('.woff') ||
    url.endsWith('.woff2')
  )
}

// 清理过期缓存
/**
 * @param {string} cacheName
 * @param {number} maxAge
 * @returns {Promise<void>}
 */
async function cleanExpiredCache(cacheName, maxAge) {
  const cache = await caches.open(cacheName)
  const now = Date.now()
  const requests = await cache.keys()
  // 对于 M3U8_CACHE，使用 URL 字符串作为 key
  const useUrlKey = cacheName === M3U8_CACHE

  for (const request of requests) {
    // 跳过元数据 key（pwaCache.ts 使用的前缀）
    if (useUrlKey && request.url.includes(METADATA_KEY_PREFIX)) {
      continue
    }

    const cacheKey = useUrlKey ? request.url : request
    const response = await cache.match(cacheKey)
    if (response) {
      const cacheTime = parseInt(response.headers.get('sw-cache-time') || '0')
      if (now - cacheTime > maxAge) {
        await cache.delete(cacheKey)
      }
    }
  }
}

// Cache First 策略
/**
 * @param {Request} request
 * @param {string} cacheName
 * @param {number} maxAge
 * @returns {Promise<Response>}
 */
async function cacheFirst(request, cacheName, maxAge) {
  const cache = await caches.open(cacheName)
  // 对于 M3U8_CACHE，使用 URL 字符串作为 key，确保与 pwaCache.ts 兼容
  const cacheKey = cacheName === M3U8_CACHE ? request.url : request
  const cached = await cache.match(cacheKey)

  if (cached) {
    // 检查是否过期
    const cacheTime = parseInt(cached.headers.get('sw-cache-time') || '0')
    if (Date.now() - cacheTime < maxAge) {
      return cached
    }
    // 过期则删除缓存
    await cache.delete(cacheKey)
  }

  try {
    const network = await fetch(request)
    if (network.ok) {
      // 只有 GET 请求才能被缓存
      if (request.method === 'GET') {
        // 克隆响应，避免 body 被锁定
        const responseClone = network.clone()
        await cache.put(cacheKey, responseClone)
      }
    }
    return network
  } catch (error) {
    // 网络失败，尝试返回缓存（即使过期）
    const cached = await cache.match(cacheKey)
    if (cached) {
      return cached
    }
    throw error
  }
}

/**
 * Network First 策略
 * @param {Request} request
 * @param {string} cacheName
 * @param {number} maxAge
 * @returns {Promise<Response>}
 */
async function networkFirst(request, cacheName, _maxAge) {
  const cache = await caches.open(cacheName)
  // 对于 M3U8_CACHE，使用 URL 字符串作为 key，确保与 pwaCache.ts 兼容
  const cacheKey = cacheName === M3U8_CACHE ? request.url : request

  try {
    // console.debug('networkfirst', request.url)
    const network = await fetch(request)
    if (network.ok) {
      // 只有 GET 请求才能被缓存
      if (request.method === 'GET') {
        // 克隆响应，避免 body 被锁定
        const responseClone = network.clone()
        await cache.put(cacheKey, responseClone)
      }
    }
    return network
  } catch (error) {
    // 网络失败，返回缓存
    const cached = await cache.match(cacheKey)
    if (cached) {
      return cached
    }
    throw error
  }
}

// Cache Only 策略（离线页面）
/**
 * @param {Request} request
 * @param {string} cacheName
 * @returns {Promise<Response>}
 */
async function cacheOnly(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  if (cached) {
    return cached
  }

  throw new Error('Resource not available offline')
}

// 处理导航请求（预缓存离线页面）
/**
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handleNavigation(request) {
  const cache = await caches.open(OFFLINE_CACHE)

  try {
    const network = await fetch(request)
    if (network.ok) {
      // 只有 GET 请求才能被缓存
      if (request.method === 'GET') {
        await cache.put(request, network.clone())
      }
    }
    return network
  } catch (error) {
    const cached = await cache.match(request)
    if (cached) {
      return cached
    }

    // 返回离线页面
    const offlineResponse = await cache.match('/')
    if (offlineResponse) {
      return offlineResponse
    }

    throw error
  }
}

/**
 * 安装 Service Worker
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...')

  event.waitUntil(
    Promise.all([
      // 缓存静态资源
      caches.open(CACHE_NAME).then((cache) => {
        console.log('[SW] Caching static assets...')
        return cache.addAll(STATIC_ASSETS)
      }),
      // 预缓存离线页面
      caches.open(OFFLINE_CACHE).then((cache) => {
        console.log('[SW] Pre-caching offline pages...')
        return cache.add('/')
      }),
    ])
      .then(() => {
        console.log('[SW] Installation complete')
        return self.skipWaiting()
      })
      .catch((error) => {
        console.error('[SW] Installation failed:', error)
      }),
  )
})

/**
 * 激活 Service Worker
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...')

  event.waitUntil(
    Promise.all([
      // 清理旧缓存
      caches
        .keys()
        .then((cacheNames) => {
          return Promise.all(
            cacheNames
              .filter((name) => name !== CACHE_NAME && name !== OFFLINE_CACHE && name !== M3U8_CACHE)
              .map((name) => {
                console.log('[SW] Deleting old cache:', name)
                return caches.delete(name)
              }),
          )
        })
        .then(() => {
          console.log('[SW] Activation complete')
          return self.clients.claim()
        }),
      // 清理过期缓存
      cleanExpiredCache(M3U8_CACHE, CACHE_STRATEGIES.media.maxAge),
      cleanExpiredCache(CACHE_NAME, CACHE_STRATEGIES.static.maxAge),
    ])
      .catch((error) => {
        console.error('[SW] Activation failed:', error)
      }),
  )
})

// 处理请求
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 忽略非 HTTP 请求（chrome-extension, data, 等）
  if (!url.protocol.startsWith("http")) {
    return;
  }

  if (IS_DEV) {
    // 忽略 Vite 开发服务器的特殊请求，避免拦截开发资源
    const devPatterns = [/\/(@|\.)vite\//, /\/@react-refresh/, /\/src\//, /\/.pnpm\//];
    if (devPatterns.some((pattern) => pattern.test(url.pathname))) {
      return;
    }
  }

  // 处理导航请求（页面跳转）
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // 默认使用 Network First
  let cacheStrategy = CACHE_STRATEGIES.api;
  // 处理 M3U8 媒体资源
  if (isM3U8Resource(url.href) && url.origin !== location.origin) {
    cacheStrategy = CACHE_STRATEGIES.media;
  } else if (isStaticAsset(url.href) && !url.pathname.includes("?t=")) {
    // 处理静态资源（但排除 Vite 开发构建的资源）
    cacheStrategy = CACHE_STRATEGIES.static;
  }

  event.respondWith(cacheStrategy.strategy(request, cacheStrategy.cacheName, cacheStrategy.maxAge));
})

// 处理消息（用于手动更新缓存）
self.addEventListener('message', async (event) => {
  const { type, data } = event.data

  switch (type) {
    case 'SKIP_WAITING':
      console.log('[SW] Skipping waiting...')
      self.skipWaiting()
      break

    case 'CLEAR_CACHE':
      console.log('[SW] Clearing cache:', data?.cacheName)
      if (data?.cacheName) {
        caches.delete(data.cacheName)
      } else {
        caches.keys().then((cacheNames) => {
          cacheNames.forEach((name) => caches.delete(name))
        })
      }
      break

    case 'CACHE_URL':
      console.log('[SW] Caching URL:', data?.url)
      if (data?.url) {
        const cacheName = data?.cacheName || CACHE_NAME
        const cache = await caches.open(cacheName)
        const response = await fetch(data.url)
        // 克隆响应，避免 body 被锁定
        const responseClone = response.clone()
        // 对于 M3U8_CACHE，使用 URL 字符串作为 key，确保与 pwaCache.ts 兼容
        const cacheKey = cacheName === M3U8_CACHE ? data.url : new Request(data.url)
        await cache.put(cacheKey, responseClone)
      }
      break

    default:
      console.warn('[SW] Unknown message type:', type)
  }
})

console.log('[SW] Service Worker loaded')
