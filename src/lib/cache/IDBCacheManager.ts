/**
 * IndexedDB 缓存管理器
 * 基于 IndexedDB 实现的缓存管理，提供 LRU 淘汰策略和统计信息
 */

import { indexedDBStore, type CacheStats } from './indexedDB'
import { cacheConfigManager, type IndexedDBCacheConfig } from './cacheConfigManager'
import { logger } from '@/utils/logger'

/** IndexedDB 缓存统计（运行时） */
interface RuntimeStats {
  /** 命中次数 */
  hits: number
  /** 未命中次数 */
  misses: number
}

/** IndexedDB 缓存变化事件类型 */
export type IDBCacheEventType = 'hit' | 'miss' | 'add' | 'remove' | 'clear'

/** IndexedDB 缓存事件监听器 */
export type IDBCacheEventListener = (event: IDBCacheEventType, data?: unknown) => void

/**
 * IndexedDB 缓存管理器类
 * 负责基于 IndexedDB 的缓存存储、LRU 淘汰策略和统计信息
 */
class IdbCacheManager {
  private config: IndexedDBCacheConfig
  private enabled: boolean
  private runtimeStats: RuntimeStats = { hits: 0, misses: 0 }
  private listeners: Set<IDBCacheEventListener> = new Set()
  /** 增量统计：缓存总数（避免每次 getStats 全量扫描） */
  private _count = 0
  /** 增量统计：缓存总大小 */
  private _totalSize = 0
  /** 增量统计：按 M3U8 URL 分组 */
  private _byM3U8: Record<string, { count: number; size: number }> = {}

  constructor(config: IndexedDBCacheConfig, enabled: boolean) {
    this.config = config
    this.enabled = enabled
    // 初始化时从 IndexedDB 加载一次统计
    this.initStats()
  }

  /**
   * 初始化增量统计（从 IndexedDB 加载当前 count/size，byM3U8 按需构建）
   */
  private async initStats(): Promise<void> {
    try {
      const stats = await indexedDBStore.getStats()
      this._count = stats.count
      this._totalSize = stats.totalSize
    } catch (error) {
      logger.warn('[IDBCacheManager] initStats failed:', error)
    }
  }

  /**
   * 增量添加统计（内部调用）
   */
  private addToStats(_url: string, size: number, m3u8Url?: string): void {
    this._count++
    this._totalSize += size
    if (m3u8Url) {
      if (!this._byM3U8[m3u8Url]) this._byM3U8[m3u8Url] = { count: 0, size: 0 }
      this._byM3U8[m3u8Url].count++
      this._byM3U8[m3u8Url].size += size
    }
  }

  /**
   * 增量移除统计（内部调用）
   */
  private removeFromStats(_url: string, size: number, m3u8Url?: string): void {
    this._count = Math.max(0, this._count - 1)
    this._totalSize = Math.max(0, this._totalSize - size)
    if (m3u8Url && this._byM3U8[m3u8Url]) {
      const g = this._byM3U8[m3u8Url]
      g.count = Math.max(0, g.count - 1)
      g.size = Math.max(0, g.size - size)
      if (g.count === 0) delete this._byM3U8[m3u8Url]
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: IndexedDBCacheConfig): void {
    this.config = config
  }

  /**
   * 更新启用状态
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /**
   * 检查缓存是否启用
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * 添加事件监听器
   */
  addEventListener(listener: IDBCacheEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * 触发事件
   */
  private emit(event: IDBCacheEventType, data?: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(event, data)
      } catch (error) {
        logger.error('[idbCacheManager] Event listener error:', error)
      }
    }
  }

  /**
   * 获取缓存
   */
  async get(url: string): Promise<ArrayBuffer | undefined> {
    if (!this.enabled) return undefined

    const entry = await indexedDBStore.get(url)
    if (entry) {
      this.runtimeStats.hits++
      this.emit('hit', url)
      return entry.data
    }

    this.runtimeStats.misses++
    this.emit('miss', url)
    return undefined
  }

  /**
   * 检查缓存是否存在
   */
  async has(url: string): Promise<boolean> {
    if (!this.enabled) return false
    return indexedDBStore.has(url)
  }

  /**
   * 批量检查多个 URL 是否存在（优化性能）
   */
  async hasMany(urls: string[]): Promise<Set<string>> {
    if (!this.enabled || urls.length === 0) return new Set()
    return indexedDBStore.hasMany(urls)
  }

  /**
   * 添加缓存
   */
  async set(url: string, data: ArrayBuffer, m3u8Url: string): Promise<boolean> {
    if (!this.enabled) return false

    // 检查是否需要淘汰
    await this.ensureCapacity()

    // 覆盖写：先记下旧条目的 size/m3u8Url，写入成功后扣减，避免统计只增不减
    const existing = await indexedDBStore.getMetadata(url)

    const success = await indexedDBStore.set({
      url,
      data,
      size: data.byteLength,
      accessTime: Date.now(),
      m3u8Url,
    })
    if (success) {
      if (existing) this.removeFromStats(url, existing.size, existing.m3u8Url)
      this.addToStats(url, data.byteLength, m3u8Url)
      this.emit('add', url)
    }
    return success
  }

  /**
   * 删除缓存
   */
  async delete(url: string): Promise<boolean> {
    // 先查元数据以获取 size/m3u8Url 用于增量统计
    const metadata = await indexedDBStore.getMetadata(url)
    const success = await indexedDBStore.delete(url)
    if (success) {
      if (metadata) this.removeFromStats(url, metadata.size, metadata.m3u8Url)
      this.emit('remove', url)
    }
    return success
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<boolean> {
    const prevCount = this._count
    const success = await indexedDBStore.clear()
    if (success) {
      this._count = 0
      this._totalSize = 0
      this._byM3U8 = {}
      this.runtimeStats = { hits: 0, misses: 0 }
      if (prevCount > 0) this.emit('clear')
    }
    return success
  }

  /**
   * 确保有足够空间（LRU 淘汰）
   */
  private async ensureCapacity(): Promise<void> {
    // 使用增量统计判断是否需要淘汰（O(1)）
    if (this._count < this.config.maxCount) return

    // 计算需要删除的数量（使用配置的淘汰比例）
    const deleteCount = Math.max(1, Math.floor(this.config.maxCount * this.config.lruEvictionRatio))
    const oldestEntries = await indexedDBStore.getOldestEntries(deleteCount)
    const urlsToDelete = oldestEntries.map((entry) => entry.originalUrl)

    if (urlsToDelete.length > 0) {
      // 删除并更新增量统计
      for (const url of urlsToDelete) {
        const metadata = await indexedDBStore.getMetadata(url)
        const deleted = await indexedDBStore.delete(url)
        if (deleted && metadata) {
          this.removeFromStats(url, metadata.size, metadata.m3u8Url)
        }
      }
      logger.warn(`[IDBCacheManager] LRU evicted ${urlsToDelete.length} entries`)
    }
  }

  /**
   * 获取缓存统计信息（O(1) 直接返回增量统计）
   */
  getStats(): CacheStats {
    return { count: this._count, totalSize: this._totalSize }
  }

  /**
   * 获取运行时统计
   */
  getRuntimeStats(): RuntimeStats & { hitRate: number } {
    const totalRequests = this.runtimeStats.hits + this.runtimeStats.misses
    const hitRate = totalRequests > 0 ? this.runtimeStats.hits / totalRequests : 0
    return {
      ...this.runtimeStats,
      hitRate,
    }
  }

  /**
   * 重置运行时统计
   */
  resetRuntimeStats(): void {
    this.runtimeStats = { hits: 0, misses: 0 }
  }

  /**
   * 获取指定 M3U8 的缓存统计（O(1) 直接返回增量统计）
   */
  getM3U8Stats(m3u8Url: string): { count: number; size: number } {
    const group = this._byM3U8[m3u8Url]
    return group ? { ...group } : { count: 0, size: 0 }
  }

  /**
   * 获取指定 M3U8 的缓存信息（兼容旧接口，按需查询）
   */
  async getM3U8CacheInfo(m3u8Url: string): Promise<{ count: number; size: number }> {
    const entries = await indexedDBStore.getByM3U8(m3u8Url)
    const size = entries.reduce((sum, entry) => sum + entry.size, 0)
    return { count: entries.length, size }
  }

  /**
   * 清除指定 M3U8 的所有缓存
   */
  async clearM3U8Cache(m3u8Url: string): Promise<boolean> {
    const entries = await indexedDBStore.getByM3U8(m3u8Url)
    const urls = entries.map((entry) => entry.originalUrl)
    return indexedDBStore.deleteMany(urls)
  }
}

/** 导出单例实例 */
export const idbCacheManager = new IdbCacheManager(
  {
    maxCount: cacheConfigManager.getIndexedDBConfig().maxCount,
    lruEvictionRatio: cacheConfigManager.getIndexedDBConfig().lruEvictionRatio,
  },
  true,
)
