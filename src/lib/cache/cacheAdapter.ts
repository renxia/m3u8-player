/**
 * 统一缓存接口适配器
 * 支持 IndexedDB 和 PWA Cache API 两种实现
 */

import { cacheManager } from './cacheManager'
import { pwaCacheManager, PWACacheManager } from './pwaCache'

/** 缓存类型 */
export type CacheType = 'indexeddb' | 'pwa' | 'auto'

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
}

/**
 * IndexedDB 缓存适配器
 */
class IndexedDBCacheAdapter implements UnifiedCacheAdapter {
  async get(url: string): Promise<ArrayBuffer | undefined> {
    return cacheManager.get(url)
  }

  async set(url: string, data: ArrayBuffer, m3u8Url: string): Promise<boolean> {
    return cacheManager.set(url, data, m3u8Url)
  }

  async has(url: string): Promise<boolean> {
    return cacheManager.has(url)
  }

  async hasMany(urls: string[]): Promise<Set<string>> {
    return cacheManager.hasMany(urls)
  }

  async delete(url: string): Promise<boolean> {
    const result = await cacheManager.delete(url)
    return result
  }

  async clear(): Promise<boolean> {
    return cacheManager.clear()
  }

  isEnabled(): boolean {
    return cacheManager.isEnabled()
  }

  async getStats(): Promise<{ count: number; totalSize: number }> {
    const stats = await cacheManager.getStats()
    return { count: stats.count, totalSize: stats.totalSize }
  }

  async getM3U8Stats(m3u8Url: string): Promise<{ count: number; size: number }> {
    return cacheManager.getM3U8CacheInfo(m3u8Url)
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
      console.error('[PWACacheAdapter] Failed to convert Response to ArrayBuffer:', error)
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
    const response = await pwaCacheManager.get(url)
    return response !== undefined
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
}

/**
 * 自动选择缓存适配器（优先 PWA，回退 IndexedDB）
 */
class AutoCacheAdapter implements UnifiedCacheAdapter {
  private adapter: UnifiedCacheAdapter

  constructor() {
    // 优先使用 PWA Cache API（如果支持）
    if (PWACacheManager.isSupported()) {
      this.adapter = new PWACacheAdapter()
    } else {
      this.adapter = new IndexedDBCacheAdapter()
    }
  }

  async get(url: string): Promise<ArrayBuffer | undefined> {
    return this.adapter.get(url)
  }

  async set(url: string, data: ArrayBuffer, m3u8Url: string): Promise<boolean> {
    return this.adapter.set(url, data, m3u8Url)
  }

  async has(url: string): Promise<boolean> {
    return this.adapter.has(url)
  }

  async hasMany(urls: string[]): Promise<Set<string>> {
    return this.adapter.hasMany(urls)
  }

  async delete(url: string): Promise<boolean> {
    return this.adapter.delete(url)
  }

  async clear(): Promise<boolean> {
    return this.adapter.clear()
  }

  isEnabled(): boolean {
    return this.adapter.isEnabled()
  }

  async getStats(): Promise<{ count: number; totalSize: number }> {
    return this.adapter.getStats()
  }

  async getM3U8Stats(m3u8Url: string): Promise<{ count: number; size: number }> {
    return this.adapter.getM3U8Stats(m3u8Url)
  }
}

/**
 * 创建缓存适配器
 */
 function createCacheAdapter(type: CacheType = 'auto'): UnifiedCacheAdapter {
  switch (type) {
    case 'indexeddb':
      return new IndexedDBCacheAdapter()
    case 'pwa':
      return new PWACacheAdapter()
    case 'auto':
    default:
      return new AutoCacheAdapter()
  }
}

/** 适配器实例缓存 */
let cachedAdapter: UnifiedCacheAdapter | null = null
let cachedCacheType: CacheType | null = null

/**
 * 获取当前配置的缓存适配器
 * 根据缓存管理器的配置动态创建适配器（带缓存）
 */
export function getCurrentCacheAdapter(): UnifiedCacheAdapter {
  const config = cacheManager.getConfig()
  const cacheType = config.cacheType || 'indexeddb'

  // 如果缓存类型未改变，返回缓存的适配器
  if (cachedAdapter && cachedCacheType === cacheType) {
    return cachedAdapter
  }

  // 创建新的适配器实例并缓存
  cachedAdapter = createCacheAdapter(cacheType)
  cachedCacheType = cacheType
  return cachedAdapter
}
