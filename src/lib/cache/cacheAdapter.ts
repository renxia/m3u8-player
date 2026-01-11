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
  has(url: string): Promise<boolean>

  /** 批量检查 */
  hasMany(urls: string[]): Promise<Set<string>>

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

  async has(url: string): Promise<boolean> {
    return idbCacheManager.has(url)
  }

  async hasMany(urls: string[]): Promise<Set<string>> {
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
}

/**
 * PWA Cache API 适配器
 */
class PWACacheAdapter implements UnifiedCacheAdapter {
  async get(url: string): Promise<ArrayBuffer | undefined> {
    const response = await pwaCacheManager.get(url)
    if (!response) return undefined

    // 将 Response 转换为 ArrayBuffer
    try {
      const arrayBuffer = await response.arrayBuffer()
      return arrayBuffer
    } catch (error) {
      logger.error('[PWACacheAdapter] Failed to convert Response to ArrayBuffer:', error)
      return undefined
    }
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

  async has(url: string): Promise<boolean> {
    return pwaCacheManager.has(url)
  }

  async hasMany(urls: string[]): Promise<Set<string>> {
    return pwaCacheManager.hasMany(urls)
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
  const cacheType = config.cacheType

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
