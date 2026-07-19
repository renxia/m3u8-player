/**
 * 统一缓存接口适配器
 * 支持 IndexedDB 和 PWA Cache API 两种实现
 */

import { logger } from '@/utils/logger'
import { idbCacheManager } from './IDBCacheManager'
import { pwaCacheManager, PWACacheManager } from './pwaCache'
import { cacheConfigManager } from './cacheConfigManager'
import type { CacheType } from './cacheConfigManager'

/** 统一缓存接口 */
export interface UnifiedCacheAdapter {
  /** 获取缓存（返回 ArrayBuffer） */
  get(url: string): Promise<ArrayBuffer | undefined>

  /** 设置缓存 */
  set(url: string, data: ArrayBuffer, m3u8Url: string): Promise<boolean>

  /** 检查是否存在 */
  has(url: string, m3u8Url?: string): Promise<boolean>

  /** 批量检查 */
  hasMany(urls: string[], m3u8Url?: string): Promise<Set<string>>

  /** 删除 */
  delete(url: string): Promise<boolean>

  /** 清空 */
  clear(): Promise<boolean>

  /** 是否启用 */
  isEnabled(): boolean

  /** 获取统计信息 */
  getStats(): Promise<{ count: number; totalSize: number }>

  /** 获取 M3U8 统计 */
  getM3U8Stats(m3u8Url: string): Promise<{ count: number; size: number }>

  /** 获取最旧的缓存键（用于 LRU 淘汰） */
  getOldestKeys(limit: number): Promise<string[]>

  /** 获取运行时命中率统计（可选，各实现自行统计缓存读取命中情况） */
  getRuntimeStats?(): { hits: number; misses: number; hitRate: number }
}

/**
 * IndexedDB 缓存适配器
 */
class IndexedDBCacheAdapter implements UnifiedCacheAdapter {
  async get(url: string): Promise<ArrayBuffer | undefined> {
    return idbCacheManager.get(url)
  }

  async set(url: string, data: ArrayBuffer, m3u8Url: string): Promise<boolean> {
    return idbCacheManager.set(url, data, m3u8Url)
  }

  async has(url: string, _m3u8Url?: string): Promise<boolean> {
    // IndexedDB 实现不需要 m3u8Url，保持原有逻辑
    return idbCacheManager.has(url)
  }

  async hasMany(urls: string[], _m3u8Url?: string): Promise<Set<string>> {
    // IndexedDB 实现不需要 m3u8Url，保持原有逻辑
    return idbCacheManager.hasMany(urls)
  }

  async delete(url: string): Promise<boolean> {
    const result = await idbCacheManager.delete(url)
    return result
  }

  async clear(): Promise<boolean> {
    return idbCacheManager.clear()
  }

  isEnabled(): boolean {
    return idbCacheManager.isEnabled()
  }

  async getStats(): Promise<{ count: number; totalSize: number }> {
    const stats = await idbCacheManager.getStats()
    return { count: stats.count, totalSize: stats.totalSize }
  }

  async getM3U8Stats(m3u8Url: string): Promise<{ count: number; size: number }> {
    return idbCacheManager.getM3U8CacheInfo(m3u8Url)
  }

  async getOldestKeys(limit: number): Promise<string[]> {
    const { indexedDBStore } = await import('./indexedDB')
    const oldestEntries = await indexedDBStore.getOldestEntries(limit)
    return oldestEntries.map((entry) => entry.originalUrl)
  }

  getRuntimeStats(): { hits: number; misses: number; hitRate: number } {
    return idbCacheManager.getRuntimeStats()
  }
}

/**
 * PWA Cache API 适配器
 */
class PWACacheAdapter implements UnifiedCacheAdapter {
  /** 运行时命中率统计（PWA Cache 本身不统计，在适配器层按读取结果计数） */
  private runtimeStats = { hits: 0, misses: 0 }

  async get(url: string): Promise<ArrayBuffer | undefined> {
    const response = await pwaCacheManager.get(url)
    if (!response) {
      this.runtimeStats.misses++
      return undefined
    }

    // 将 Response 转换为 ArrayBuffer
    try {
      const arrayBuffer = await response.arrayBuffer()
      this.runtimeStats.hits++
      return arrayBuffer
    } catch (error) {
      this.runtimeStats.misses++
      logger.error('[PWACacheAdapter] Failed to convert Response to ArrayBuffer:', error)
      return undefined
    }
  }

  getRuntimeStats(): { hits: number; misses: number; hitRate: number } {
    const totalRequests = this.runtimeStats.hits + this.runtimeStats.misses
    const hitRate = totalRequests > 0 ? this.runtimeStats.hits / totalRequests : 0
    return { ...this.runtimeStats, hitRate }
  }

  async set(url: string, data: ArrayBuffer, m3u8Url: string): Promise<boolean> {
    // 将 ArrayBuffer 转换为 Response
    const response = new Response(data, {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    })

    const result = await pwaCacheManager.add(url, response, m3u8Url)
    return result.success
  }

  async has(url: string, m3u8Url?: string): Promise<boolean> {
    return pwaCacheManager.has(url, m3u8Url)
  }

  async hasMany(urls: string[], m3u8Url?: string): Promise<Set<string>> {
    return pwaCacheManager.hasMany(urls, m3u8Url)
  }

  async delete(url: string): Promise<boolean> {
    const result = await pwaCacheManager.delete(url)
    return result.success
  }

  async clear(): Promise<boolean> {
    const result = await pwaCacheManager.clear()
    return result.success
  }

  isEnabled(): boolean {
    return PWACacheManager.isSupported()
  }

  async getStats(): Promise<{ count: number; totalSize: number }> {
    const stats = await pwaCacheManager.getStats()
    return { count: stats.count, totalSize: stats.totalSize }
  }

  async getM3U8Stats(m3u8Url: string): Promise<{ count: number; size: number }> {
    return pwaCacheManager.getM3U8Stats(m3u8Url)
  }

  async getOldestKeys(limit: number): Promise<string[]> {
    const items = await pwaCacheManager.query({ limit })
    // items 已按 cachedAt 降序排序（最新的在前），反转获取最旧的
    return items.reverse().map((item) => item.url)
  }
}

/**
 * 创建缓存适配器
 */
function createCacheAdapter(type: CacheType = 'indexeddb'): UnifiedCacheAdapter {
  switch (type) {
    case 'indexeddb':
      return new IndexedDBCacheAdapter()
    case 'pwa':
      return new PWACacheAdapter()
    default:
      return new IndexedDBCacheAdapter()
  }
}

/** 适配器实例缓存 */
let cachedAdapter: UnifiedCacheAdapter | null = null
let cachedCacheType: CacheType | null = null

/**
 * 获取当前配置的缓存适配器
 * 根据配置管理器的配置动态创建适配器（带缓存）
 */
export function getCurrentCacheAdapter(): UnifiedCacheAdapter {
  const config = cacheConfigManager.getConfig()
  // 使用 effective 缓存类型：PWA 不支持时自动回退 indexeddb
  const cacheType = cacheConfigManager.getCacheType()

  // 同步 IndexedDB 缓存管理器的启用状态
  idbCacheManager.setEnabled(config.enabled)

  // 同步 IndexedDB 缓存管理器的配置
  const idbConfig = cacheConfigManager.getIndexedDBConfig()
  idbCacheManager.updateConfig(idbConfig)

  // 如果缓存类型未改变，返回缓存的适配器
  if (cachedAdapter && cachedCacheType === cacheType) {
    return cachedAdapter
  }

  // 创建新的适配器实例并缓存
  cachedAdapter = createCacheAdapter(cacheType)
  cachedCacheType = cacheType
  return cachedAdapter
}
