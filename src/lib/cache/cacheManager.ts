/**
 * 缓存管理器
 * 提供 LRU 淘汰策略、统计信息、配置管理
 */

import { indexedDBStore, type CacheStats } from './indexedDB'

/** 缓存配置 */
export interface CacheConfig {
  /** 是否启用缓存 */
  enabled: boolean
  /** 最大缓存数量 */
  maxCount: number
  /** 自动预加载片段数 */
  preloadCount: number
  /** 预加载并发数 */
  preloadConcurrency: number
  /** 缓存类型：indexeddb | pwa | auto */
  cacheType?: 'indexeddb' | 'pwa' | 'auto'
}

/** 默认配置 */
const DEFAULT_CONFIG: CacheConfig = {
  enabled: true,
  maxCount: 5000,
  preloadCount: 5,
  preloadConcurrency: 3,
  cacheType: 'auto'
}

/** 缓存配置存储键 */
const CONFIG_STORAGE_KEY = 'mp_cache_config'

/** 缓存统计（运行时） */
interface RuntimeStats {
  /** 命中次数 */
  hits: number
  /** 未命中次数 */
  misses: number
}

/** 缓存变化事件类型 */
export type CacheEventType = 'hit' | 'miss' | 'add' | 'remove' | 'clear' | 'config'

/** 缓存事件监听器 */
export type CacheEventListener = (event: CacheEventType, data?: unknown) => void

class CacheManager {
  private config: CacheConfig = { ...DEFAULT_CONFIG }
  private runtimeStats: RuntimeStats = { hits: 0, misses: 0 }
  private listeners: Set<CacheEventListener> = new Set()

  constructor() {
    this.loadConfig()
  }

  /**
   * 从 localStorage 加载配置
   */
  private loadConfig(): void {
    try {
      const stored = localStorage.getItem(CONFIG_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        this.config = { ...DEFAULT_CONFIG, ...parsed }
      }
    } catch (error) {
      console.error('Failed to load cache config:', error)
    }
  }

  /**
   * 保存配置到 localStorage
   */
  private saveConfig(): void {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(this.config))
    } catch (error) {
      console.error('Failed to save cache config:', error)
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): CacheConfig {
    return { ...this.config }
  }

  /**
   * 更新配置
   */
  setConfig(updates: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...updates }
    this.saveConfig()
    this.emit('config', this.config)
  }

  /**
   * 检查缓存是否启用
   */
  isEnabled(): boolean {
    return this.config.enabled
  }

  /**
   * 添加事件监听器
   */
  addEventListener(listener: CacheEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * 触发事件
   */
  private emit(event: CacheEventType, data?: unknown): void {
    for (const listener of this.listeners) {
      try {
        listener(event, data)
      } catch (error) {
        console.error('Cache event listener error:', error)
      }
    }
  }

  /**
   * 获取缓存
   */
  async get(url: string): Promise<ArrayBuffer | undefined> {
    if (!this.config.enabled) return undefined

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
    if (!this.config.enabled) return false
    return indexedDBStore.has(url)
  }

  /**
   * 批量检查多个 URL 是否存在（优化性能）
   */
  async hasMany(urls: string[]): Promise<Set<string>> {
    if (!this.config.enabled || urls.length === 0) return new Set()
    return indexedDBStore.hasMany(urls)
  }

  /**
   * 添加缓存
   */
  async set(url: string, data: ArrayBuffer, m3u8Url: string): Promise<boolean> {
    if (!this.config.enabled) return false

    // 检查是否需要淘汰
    await this.ensureCapacity()

    const success = await indexedDBStore.set({
      url,
      data,
      size: data.byteLength,
      accessTime: Date.now(),
      m3u8Url,
    })
    if (success) {
      this.emit('add', url)
    }
    return success
  }

  /**
   * 删除缓存
   */
  async delete(url: string): Promise<boolean> {
    const success = await indexedDBStore.delete(url)
    if (success) {
      this.emit('remove', url)
    }
    return success
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<boolean> {
    const success = await indexedDBStore.clear()
    if (success) {
      this.runtimeStats = { hits: 0, misses: 0 }
      this.emit('clear')
    }
    return success
  }

  /**
   * 确保有足够空间（LRU 淘汰）
   */
  private async ensureCapacity(): Promise<void> {
    const stats = await indexedDBStore.getStats()
    if (stats.count < this.config.maxCount) return

    // 计算需要删除的数量（删除 10% 以避免频繁淘汰）
    const deleteCount = Math.max(1, Math.floor(this.config.maxCount * 0.1))
    const oldestEntries = await indexedDBStore.getOldestEntries(deleteCount)
    const urlsToDelete = oldestEntries.map((entry) => entry.originalUrl)

    if (urlsToDelete.length > 0) {
      await indexedDBStore.deleteMany(urlsToDelete)
      console.log(`[CacheManager] LRU evicted ${urlsToDelete.length} entries`)
    }
  }

  /**
   * 获取缓存统计信息
   */
  async getStats(): Promise<CacheStats & { hitRate: number }> {
    const dbStats = await indexedDBStore.getStats()
    const totalRequests = this.runtimeStats.hits + this.runtimeStats.misses
    const hitRate = totalRequests > 0 ? this.runtimeStats.hits / totalRequests : 0

    return {
      ...dbStats,
      hitRate,
    }
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
   * 获取指定 M3U8 的缓存信息
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
export const cacheManager = new CacheManager()
