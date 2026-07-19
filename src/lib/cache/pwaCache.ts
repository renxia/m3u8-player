/**
 * PWA 缓存管理器
 * 基于浏览器 Cache API 实现的资源缓存方案
 * 提供查询、删除、统计等能力，与应用逻辑解耦
 */

import { logger } from '@/utils/logger'
import QuickLRU from "quick-lru";
import type {
  PWACacheItem,
  PWACacheStats,
  PWACacheQueryOptions,
  PWACacheOperationResult,
} from './pwaCache.types'

/** 默认缓存名称 */
const DEFAULT_CACHE_NAME = "m3u8-player-media-v1"

/** 元数据存储键前缀 */
const METADATA_KEY_PREFIX = '__metadata__'

/**
 * PWA 缓存管理器类
 */
class PWACacheManager {
  private cacheName: string
  private metadataCache: Map<string, PWACacheItem> = new Map()
  // LRU 缓存已缓存的 URL（key: url, value: true）
  private cacheKeysLRU: QuickLRU<string, true>

  constructor(cacheName: string = DEFAULT_CACHE_NAME) {
    this.cacheName = cacheName
    this.cacheKeysLRU = new QuickLRU({ maxSize: 3000 })
    // 启动元数据加载（异步，不阻塞构造函数）
    // 注意：getStats() 等方法会在调用时重新加载元数据以确保数据最新
    this.loadMetadata().catch((error) => {
      logger.warn('[PWACache] Initial metadata load failed:', error)
    })
  }

  /**
   * 检查浏览器是否支持 Cache API
   * 需同时满足：caches API 可用 + 当前为安全上下文（HTTPS/localhost）
   * 非 HTTPS 环境下（如 HTTP 页面或被 HTTP 父页面嵌入的 iframe）Cache API 不可用
   */
  static isSupported(): boolean {
    return typeof caches !== 'undefined' && 'open' in caches && window.isSecureContext
  }

  /**
   * 失效指定 URL 的 LRU 缓存（在添加或删除缓存时调用）
   */
  private invalidateCacheKeyLRU(url: string): void {
    this.cacheKeysLRU.delete(url)
  }

  /**
   * 获取缓存对象
   */
  private async getCache(): Promise<Cache | null> {
    if (!PWACacheManager.isSupported()) {
      logger.warn('[PWACache] Cache API is not supported')
      return null
    }

    try {
      return await caches.open(this.cacheName)
    } catch (error) {
      logger.error('[PWACache] Failed to open cache:', error)
      return null
    }
  }

  /**
   * 从缓存中加载元数据
   * 同时为没有 metadata 的资源补充 metadata（例如 sw.js 缓存的资源）
   */
  private async loadMetadata(): Promise<void> {
    const cache = await this.getCache()
    if (!cache) return

    try {
      const keys = await cache.keys()
      const metadataKeys = keys.filter(d => d.url.includes(METADATA_KEY_PREFIX))

      // 加载已有的 metadata
      const metadataPromises = metadataKeys.map(async (metadataKey) => {
        try {
          const response = await cache.match(metadataKey)

          if (response) {
            const metadata: PWACacheItem = await response.json()
            // 确保使用元数据中保存的原始 URL
            this.metadataCache.set(metadata.url, metadata)
          }
        } catch (error) {
          logger.warn('[PWACache] Failed to load metadata item:', metadataKey.url, error)
        }
      })

      await Promise.all(metadataPromises)

      logger.log('[PWACache] Loaded metadata:', this.metadataCache.size, 'items')
    } catch (error) {
      logger.error('[PWACache] Failed to load metadata:', error)
    }
  }

  /**
   * 保存元数据
   */
  private async saveMetadata(item: PWACacheItem): Promise<void> {
    const cache = await this.getCache()
    if (!cache) return

    try {
      // 构建元数据 key
      // 注意：Cache API 可能会将非标准 URL 格式转换为绝对 URL
      // 例如：__metadata__https://example.com/file.ts
      // 可能被转换为：http://localhost:3009/__metadata__https://example.com/file.ts
      const metadataKey = `${METADATA_KEY_PREFIX}${item.url}`

      const metadataResponse = new Response(JSON.stringify(item), {
        headers: { 'Content-Type': 'application/json' },
      })

      // 直接使用字符串 URL 保存
      // Cache API 会自动处理 URL 转换，我们在加载时会处理这种情况
      await cache.put(metadataKey, metadataResponse)

      // 同时更新内存中的元数据缓存
      this.metadataCache.set(item.url, item)
    } catch (error) {
      logger.error('[PWACache] Failed to save metadata:', error)
    }
  }

  /**
   * 删除元数据
   */
  private async deleteMetadata(url: string): Promise<void> {
    const cache = await this.getCache()
    if (!cache) return

    try {
      const metadataKey = `${METADATA_KEY_PREFIX}${url}`

      // 尝试删除元数据（可能需要处理 URL 转换问题）
      let deleted = await cache.delete(metadataKey)

      // 如果直接删除失败，尝试使用 Request 对象
      if (!deleted) {
        try {
          const metadataRequest = new Request(metadataKey, { method: 'GET' })
          deleted = await cache.delete(metadataRequest)
        } catch {
          // 忽略错误
        }
      }

      // 如果仍然失败，尝试查找并删除（处理 URL 转换问题）
      if (!deleted) {
        const keys = await cache.keys()
        const currentOrigin = typeof window !== 'undefined' ? window.location.origin : ''

        for (const key of keys) {
          const keyUrl = key.url
          // 检查是否是我们要删除的元数据
          if (keyUrl.includes(METADATA_KEY_PREFIX) && keyUrl.includes(url)) {
            // 尝试匹配：可能是完整 URL 或包含 origin 前缀
            if (keyUrl === metadataKey ||
                (currentOrigin && keyUrl === `${currentOrigin}/${metadataKey}`) ||
                keyUrl.endsWith(metadataKey)) {
              await cache.delete(key)
              deleted = true
              break
            }
          }
        }
      }

      if (deleted) {
        this.metadataCache.delete(url)
      }
    } catch (error) {
      logger.error('[PWACache] Failed to delete metadata:', error)
    }
  }

  /**
   * 获取资源大小（从 Response）
   * 优化：优先使用 Content-Length header，避免读取 blob
   */
  private async getResponseSize(response: Response): Promise<number> {
    // 优先使用 Content-Length header（不需要读取 blob）
    const contentLength = response.headers.get('Content-Length')
    if (contentLength) {
      const size = parseInt(contentLength, 10)
      if (!isNaN(size) && size > 0) {
        return size
      }
    }

    // 如果没有 Content-Length header，才读取 blob
    const blob = await response.blob()
    return blob.size
  }

  /**
   * 更新 metadata 的 m3u8Url（内部方法，性能优化：仅更新字段）
   * @param url 资源 URL
   * @param m3u8Url M3U8 URL
   */
  private async updateM3U8Url(url: string, m3u8Url: string): Promise<void> {
    const metadata = this.metadataCache.get(url)
    if (!metadata) {
      // metadata 不存在，需要完整补齐（这种情况较少）
      const cache = await this.getCache()
      if (!cache) return

      try {
        const response = await cache.match(url)
        if (response) {
          // 使用优化后的 getResponseSize（优先使用 Content-Length）
          const size = await this.getResponseSize(response)
          const contentType = response.headers.get('Content-Type') || undefined

          const newMetadata: PWACacheItem = {
            url,
            cachedAt: Date.now(),
            size,
            contentType,
            m3u8Url,
          }
          await this.saveMetadata(newMetadata)
          logger.debug('[PWACache] Created metadata with m3u8Url for:', url)
        }
      } catch (error) {
        logger.warn('[PWACache] Failed to create metadata with m3u8Url:', url, error)
      }
      return
    }

    // metadata 已存在，只需更新 m3u8Url
    if (metadata.m3u8Url === m3u8Url) {
      // 已经是最新的，不需要更新
      return
    }

    metadata.m3u8Url = m3u8Url
    this.metadataCache.set(url, metadata)

    // 保存到 Cache API（异步，不阻塞）
    try {
      await this.saveMetadata(metadata)
      logger.debug('[PWACache] Updated m3u8Url for:', url)
    } catch (error) {
      logger.warn('[PWACache] Failed to save updated m3u8Url:', url, error)
    }
  }

  /**
   * 缓存资源
   * @param url 资源 URL
   * @param response Response 对象或 Request 对象
   * @param m3u8Url 关联的 M3U8 URL（可选）
   */
  async add(
    url: string,
    response: Response | Request,
    m3u8Url?: string,
  ): Promise<PWACacheOperationResult> {
    const cache = await this.getCache()
    if (!cache) {
      return { success: false, error: 'Cache API is not supported' }
    }

    try {
      // 如果是 Request，需要先 fetch
      let responseToCache: Response
      if (response instanceof Request) {
        responseToCache = await fetch(response)
      } else {
        responseToCache = response
      }

      // 克隆 Response（因为 Response 只能读取一次）
      const clonedResponse = responseToCache.clone()

      // 直接使用 URL 字符串保存，确保保存和读取使用相同的 key
      // Cache API 的 put 方法可以直接接受 URL 字符串
      await cache.put(url, clonedResponse)

      // 获取资源大小和类型
      const size = await this.getResponseSize(responseToCache)
      const contentType = responseToCache.headers.get('Content-Type') || undefined

      // 保存元数据
      const metadata: PWACacheItem = {
        url, // 保存原始 URL（不带 Request 包装）
        cachedAt: Date.now(),
        size,
        contentType,
        m3u8Url,
      }
      await this.saveMetadata(metadata)

      // 添加到 LRU 缓存
      this.cacheKeysLRU.set(url, true)

      logger.log('[PWACache] Cached:', url.substring(url.lastIndexOf('/') + 1), `(${(size / 1024).toFixed(2)}KB)`)

      return { success: true, affected: 1 }
    } catch (error) {
      logger.error('[PWACache] Failed to add cache:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * 批量缓存资源
   */
  async addMany(
    items: Array<{ url: string; response: Response | Request; m3u8Url?: string }>,
  ): Promise<PWACacheOperationResult> {
    const results = await Promise.allSettled(
      items.map((item) => this.add(item.url, item.response, item.m3u8Url)),
    )

    const successCount = results.filter((r) => r.status === 'fulfilled' && r.value.success).length
    const failedCount = results.length - successCount

    return {
      success: failedCount === 0,
      affected: successCount,
      error: failedCount > 0 ? `${failedCount} items failed` : undefined,
    }
  }

  /**
   * 获取缓存的资源
   */
  async get(url: string): Promise<Response | undefined> {
    const startTime = Date.now()
    const cache = await this.getCache()
    if (!cache) return undefined

    try {
      const d =  await cache.match(url)
      logger.debug("[PWACache][get] timecost:", Date.now() - startTime, url);
      return d
    } catch (error) {
      logger.debug('[PWACache] Failed to get cache:', error)
      return undefined
    }
  }

  /**
   * 检查单个资源是否已缓存
   * 优化方案：使用 LRU 缓存已查询过的 URL，避免重复 IO
   */
  async has(url: string, m3u8Url?: string, slient = false): Promise<boolean> {
    const startTime = Date.now()
    const cache = await this.getCache()
    if (!cache) return false

    try {
      // 先检查 LRU 缓存
      if (this.cacheKeysLRU.has(url)) {
        // LRU 命中：资源已确认存在，检查是否需要补齐 m3u8Url
        if (m3u8Url) {
          const metadata = this.metadataCache.get(url)
          if (!metadata?.m3u8Url) {
            // 异步更新 m3u8Url（不阻塞返回）
            this.updateM3U8Url(url, m3u8Url).catch((error: unknown) => {
              logger.warn('[PWACache] Failed to update m3u8Url in has():', error)
            })
          }
        }
        logger.debug('[PWACache][has] LRU hit, timecost:', Date.now() - startTime, url)
        return true
      }

      // LRU 未命中，从 cache 查询
      const response = await cache.match(url)
      if (response) {
        // 缓存到 LRU
        this.cacheKeysLRU.set(url, true)

        // 如果提供了 m3u8Url，则补充 metadata
        if (m3u8Url) {
          // 异步更新（不阻塞返回）
          this.updateM3U8Url(url, m3u8Url).catch((error: unknown) => {
            logger.warn('[PWACache] Failed to update m3u8Url in has():', error)
          })
        }

        if (!slient) logger.debug('[PWACache][has] cache hit, timecost:', Date.now() - startTime, url)
        return true
      }

      if (!slient) logger.debug('[PWACache][has] cache miss, timecost:', Date.now() - startTime, url)
      return false
    } catch (error) {
      logger.warn('[PWACache][has] Failed to check cache:', error)
      return false
    }
  }

  /**
   * 批量检查资源是否已缓存
   * @param urls 资源 URL 数组
   * @param m3u8Url 可选的 M3U8 URL，如果提供且资源存在但没有 m3u8Url，会自动补齐
   */
  async hasMany(urls: string[], m3u8Url?: string): Promise<Set<string>> {
    const startTime = Date.now()
    const cache = await this.getCache()
    if (!cache) return new Set()

    try {
      const results = await Promise.all(urls.map(url => this.has(url, m3u8Url, true)))
      const hits = new Set(urls.filter((_url, index) => results[index]))
      logger.debug('[PWACache][hasMany] timecost:', Date.now() - startTime, `to check ${urls.length} urls, hits: ${results.filter(Boolean).length}`)
      return hits
    } catch (error) {
      logger.warn('[PWACache][hasMany] Failed to check cache:', error)
      return new Set()
    }
  }

  /**
   * 删除缓存的资源
   */
  async delete(url: string): Promise<PWACacheOperationResult> {
    const cache = await this.getCache()
    if (!cache) {
      return { success: false, error: 'Cache API is not supported' }
    }

    try {
      const deleted = await cache.delete(url)
      if (deleted) {
        await this.deleteMetadata(url)
        // 从 LRU 缓存中移除
        this.invalidateCacheKeyLRU(url)
      }
      return { success: deleted, affected: deleted ? 1 : 0 }
    } catch (error) {
      logger.error('[PWACache] Failed to delete cache:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * 批量删除缓存的资源
   */
  async deleteMany(urls: string[]): Promise<PWACacheOperationResult> {
    const cache = await this.getCache()
    if (!cache) {
      return { success: false, error: 'Cache API is not supported' }
    }

    try {
      const results = await Promise.allSettled(
        urls.map((url) => cache.delete(url)),
      )

      const deletedCount = results.filter(
        (r) => r.status === 'fulfilled' && r.value === true,
      ).length

      // 删除元数据
      await Promise.allSettled(urls.map((url) => this.deleteMetadata(url)))

      // 从 LRU 缓存中移除
      urls.forEach((url) => this.invalidateCacheKeyLRU(url))

      return {
        success: deletedCount === urls.length,
        affected: deletedCount,
        error:
          deletedCount < urls.length ? `${urls.length - deletedCount} items failed` : undefined,
      }
    } catch (error) {
      logger.error('[PWACache] Failed to delete many cache:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<PWACacheOperationResult> {
    if (!PWACacheManager.isSupported()) {
      return { success: false, error: 'Cache API is not supported' }
    }

    try {
      const deleted = await caches.delete(this.cacheName)
      this.metadataCache.clear()
      this.cacheKeysLRU.clear()

      // 重新打开缓存以创建新的空缓存
      if (deleted) {
        await this.getCache()
      }

      return { success: deleted, affected: deleted ? this.metadataCache.size : 0 }
    } catch (error) {
      logger.error('[PWACache] Failed to clear cache:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * 查询缓存项
   */
  async query(options: PWACacheQueryOptions = {}): Promise<PWACacheItem[]> {
    await this.loadMetadata()

    let items = Array.from(this.metadataCache.values())

    // 按 M3U8 URL 过滤
    if (options.m3u8Url) {
      items = items.filter((item) => item.m3u8Url === options.m3u8Url)
    }

    // 按缓存时间排序（最新的在前）
    items.sort((a, b) => b.cachedAt - a.cachedAt)

    // 分页
    if (options.offset !== undefined) {
      items = items.slice(options.offset)
    }
    if (options.limit !== undefined) {
      items = items.slice(0, options.limit)
    }

    return items
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<PWACacheStats> {
    // 重新加载元数据，确保数据是最新的
    await this.loadMetadata()

    const items = Array.from(this.metadataCache.values())
    const totalSize = items.reduce((sum, item) => sum + item.size, 0)

    // 按 M3U8 URL 分组统计
    const byM3U8: Record<string, { count: number; size: number }> = {}
    items.forEach((item) => {
      if (item.m3u8Url) {
        if (!byM3U8[item.m3u8Url]) {
          byM3U8[item.m3u8Url] = { count: 0, size: 0 }
        }
        byM3U8[item.m3u8Url].count++
        byM3U8[item.m3u8Url].size += item.size
      }
    })

    logger.log('[PWACache] Stats:', {
      count: items.length,
      totalSize: `${(totalSize / 1024 / 1024).toFixed(2)}MB`,
      byM3U8: Object.keys(byM3U8).length,
    })

    return {
      count: items.length,
      totalSize,
      byM3U8,
    }
  }

  /**
   * 获取指定 M3U8 URL 的缓存统计
   */
  async getM3U8Stats(m3u8Url: string): Promise<{ count: number; size: number }> {
    await this.loadMetadata()

    const items = Array.from(this.metadataCache.values()).filter(
      (item) => item.m3u8Url === m3u8Url,
    )

    return {
      count: items.length,
      size: items.reduce((sum, item) => sum + item.size, 0),
    }
  }

  /**
   * 删除指定 M3U8 URL 的所有缓存
   */
  async deleteByM3U8(m3u8Url: string): Promise<PWACacheOperationResult> {
    await this.loadMetadata()

    const items = Array.from(this.metadataCache.values()).filter(
      (item) => item.m3u8Url === m3u8Url,
    )

    const urls = items.map((item) => item.url)
    return this.deleteMany(urls)
  }

  /**
   * 获取所有缓存项（用于调试）
   */
  async getAllItems(): Promise<PWACacheItem[]> {
    await this.loadMetadata()
    return Array.from(this.metadataCache.values())
  }
}

/** 导出单例实例 */
export const pwaCacheManager = new PWACacheManager()

/** 导出类（用于创建自定义实例） */
export { PWACacheManager }
