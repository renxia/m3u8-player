/**
 * Service Worker 类型定义
 */

export interface ServiceWorkerMessageData {
  type: 'SKIP_WAITING' | 'CLEAR_CACHE' | 'CACHE_URL'
  data?: {
    cacheName?: string
    url?: string
  }
}

export interface CacheStrategy {
  cacheName: string
  strategy: 'cacheFirst' | 'networkFirst' | 'cacheOnly' | 'networkOnly'
  maxAge?: number
}

export interface CacheConfig {
  name: string
  strategy: CacheStrategy
  maxEntries?: number
  maxAge?: number
}

export interface M3U8CacheEntry {
  url: string
  timestamp: number
  size: number
  duration?: number
  segments?: string[]
}
