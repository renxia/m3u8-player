/**
 * M3U8 媒体缓存管理器
 * 用于管理 M3U8 视频的缓存策略和预加载
 */

import { cacheUrl, isServiceWorkerSupported, type ServiceWorkerController } from './serviceWorkerRegistration'

export interface M3U8CacheOptions {
  enabled: boolean
  maxSize?: number // 最大缓存大小（字节）
  maxDuration?: number // 最大缓存时长（秒）
  preloadSegments?: number // 预加载片段数
}

export interface M3U8CacheStats {
  cachedUrls: number
  totalSize: number
  totalDuration: number
}

/**
 * M3U8 缓存管理器
 */
export class M3U8CacheManager {
  private options: M3U8CacheOptions
  private controller: ServiceWorkerController | undefined
  private cacheMap: Map<string, M3U8CacheEntry> = new Map()

  constructor(options: M3U8CacheOptions) {
    this.options = {
      maxSize: 500 * 1024 * 1024, // 500MB
      maxDuration: 3600, // 1小时
      preloadSegments: 3,
      ...options,
    }
  }

  /**
   * 初始化缓存管理器
   */
  async init(controller: ServiceWorkerController): Promise<void> {
    if (!isServiceWorkerSupported() || !this.options.enabled) {
      console.log('[M3U8CacheManager] Service Worker not supported or disabled')
      return
    }

    this.controller = controller
    console.log('[M3U8CacheManager] Initialized')
  }

  /**
   * 缓存 M3U8 资源
   */
  async cacheM3U8(url: string, metadata?: Partial<M3U8CacheEntry>): Promise<void> {
    if (!this.options.enabled || !this.controller) {
      return
    }

    try {
      // 缓存主 M3U8 文件
      await cacheUrl(url, this.controller.getRegistration())

      // 保存元数据
      const entry: M3U8CacheEntry = {
        url,
        timestamp: Date.now(),
        size: 0,
        duration: metadata?.duration,
        segments: metadata?.segments,
      }

      this.cacheMap.set(url, entry)

      console.log('[M3U8CacheManager] Cached:', url)
    } catch (error) {
      console.error('[M3U8CacheManager] Cache failed:', error)
    }
  }

  /**
   * 缓存 M3U8 片段
   */
  async cacheSegment(segmentUrl: string): Promise<void> {
    if (!this.options.enabled || !this.controller) {
      return
    }

    try {
      await cacheUrl(segmentUrl, this.controller.getRegistration())
      console.log('[M3U8CacheManager] Cached segment:', segmentUrl)
    } catch (error) {
      console.error('[M3U8CacheManager] Segment cache failed:', error)
    }
  }

  /**
   * 批量预加载片段
   */
  async preloadSegments(segments: string[]): Promise<void> {
    if (!this.options.enabled || !this.controller || !this.options.preloadSegments) {
      return
    }

    const segmentsToCache = segments.slice(0, this.options.preloadSegments)

    // 并发缓存片段
    await Promise.allSettled(segmentsToCache.map((segment) => this.cacheSegment(segment)))

    console.log('[M3U8CacheManager] Preloaded', segmentsToCache.length, 'segments')
  }

  /**
   * 检查 URL 是否已缓存
   */
  isCached(url: string): boolean {
    return this.cacheMap.has(url)
  }

  /**
   * 获取缓存条目
   */
  getCacheEntry(url: string): M3U8CacheEntry | undefined {
    return this.cacheMap.get(url)
  }

  /**
   * 获取缓存统计
   */
  getStats(): M3U8CacheStats {
    const entries = Array.from(this.cacheMap.values())
    return {
      cachedUrls: entries.length,
      totalSize: entries.reduce((sum, entry) => sum + entry.size, 0),
      totalDuration: entries.reduce((sum, entry) => sum + (entry.duration || 0), 0),
    }
  }

  /**
   * 清除过期缓存
   */
  async clearExpiredCache(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const now = Date.now()
    const expiredUrls: string[] = []

    this.cacheMap.forEach((entry, url) => {
      if (now - entry.timestamp > maxAge) {
        expiredUrls.push(url)
      }
    })

    expiredUrls.forEach((url) => {
      this.cacheMap.delete(url)
    })

    if (expiredUrls.length > 0) {
      console.log('[M3U8CacheManager] Cleared', expiredUrls.length, 'expired entries')
    }
  }

  /**
   * 清除所有缓存
   */
  async clearAll(): Promise<void> {
    this.cacheMap.clear()
    if (this.controller) {
      await this.controller.clearCache('m3u8-player-media-v1')
    }
    console.log('[M3U8CacheManager] Cleared all cache')
  }

  /**
   * 更新配置
   */
  updateOptions(options: Partial<M3U8CacheOptions>): void {
    this.options = { ...this.options, ...options }
  }

  /**
   * 销毁缓存管理器
   */
  destroy(): void {
    this.cacheMap.clear()
    this.controller = undefined
    console.log('[M3U8CacheManager] Destroyed')
  }
}

/**
 * M3U8 缓存条目
 */
export interface M3U8CacheEntry {
  url: string
  timestamp: number
  size: number
  duration?: number
  segments?: string[]
}

/**
 * 创建全局缓存管理器实例
 */
let globalM3U8CacheManager: M3U8CacheManager | undefined

export function getM3U8CacheManager(options?: M3U8CacheOptions): M3U8CacheManager {
  if (!globalM3U8CacheManager) {
    globalM3U8CacheManager = new M3U8CacheManager(
      options || {
        enabled: false,
        maxSize: 500 * 1024 * 1024,
        maxDuration: 3600,
        preloadSegments: 3,
      },
    )
  } else if (options) {
    globalM3U8CacheManager.updateOptions(options)
  }

  return globalM3U8CacheManager
}
