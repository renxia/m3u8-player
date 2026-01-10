/**
 * 缓存配置管理器
 * 负责全局缓存配置的统一管理，独立于具体的缓存实现
 */

import { logger } from '@/utils/logger'

/** 缓存类型 */
export type CacheType = 'indexeddb' | 'pwa'

/** 全局缓存配置 */
export interface CacheGlobalConfig {
  /** 是否启用缓存 */
  enabled: boolean
  /** 缓存类型 */
  cacheType: CacheType
}

/** 预加载配置 */
export interface PreloadConfig {
  /** 自动预加载片段数 */
  preloadCount: number
  /** 预加载并发数 */
  preloadConcurrency: number
}

/** IndexedDB 缓存特定配置 */
export interface IndexedDBCacheConfig {
  /** 最大缓存数量 */
  maxCount: number
  /** LRU 淘汰比例（每次淘汰 10%） */
  lruEvictionRatio: number
}

/** 完整缓存配置 */
export interface CacheConfig extends CacheGlobalConfig, PreloadConfig, IndexedDBCacheConfig {}

/** 默认配置 */
const DEFAULT_CONFIG: CacheConfig = {
  // 全局配置
  enabled: true,
  cacheType: 'pwa',
  // 预加载配置
  preloadCount: 5,
  preloadConcurrency: 3,
  // IndexedDB 特定配置
  maxCount: 5000,
  lruEvictionRatio: 0.1,
}

/** 缓存配置存储键 */
const CONFIG_STORAGE_KEY = 'mp_cache_config'

/** 缓存配置变化事件类型 */
export type ConfigEventType = 'config'

/** 配置事件监听器 */
export type ConfigEventListener = (event: ConfigEventType, config: CacheConfig) => void

/**
 * 缓存配置管理器类
 * 负责全局配置的加载、保存和分发，与具体缓存实现解耦
 */
class CacheConfigManager {
  private config: CacheConfig = { ...DEFAULT_CONFIG }
  private listeners: Set<ConfigEventListener> = new Set()

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
        // 合并配置，保留新增字段的默认值
        this.config = { ...DEFAULT_CONFIG, ...parsed }
      }
    } catch (error) {
      logger.error('[CacheConfigManager] Failed to load config:', error)
    }
  }

  /**
   * 保存配置到 localStorage
   */
  private saveConfig(): void {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(this.config))
    } catch (error) {
      logger.error('[CacheConfigManager] Failed to save config:', error)
    }
  }

  /**
   * 获取当前完整配置
   */
  getConfig(): CacheConfig {
    return { ...this.config }
  }

  /**
   * 获取全局配置
   */
  getGlobalConfig(): CacheGlobalConfig {
    const { enabled, cacheType } = this.config
    return { enabled, cacheType }
  }

  /**
   * 获取预加载配置
   */
  getPreloadConfig(): PreloadConfig {
    const { preloadCount, preloadConcurrency } = this.config
    return { preloadCount, preloadConcurrency }
  }

  /**
   * 获取 IndexedDB 特定配置
   */
  getIndexedDBConfig(): IndexedDBCacheConfig {
    const { maxCount, lruEvictionRatio } = this.config
    return { maxCount, lruEvictionRatio }
  }

  /**
   * 验证配置
   */
  private validateConfig(config: Partial<CacheConfig>): void {
    if (config.maxCount !== undefined) {
      if (!Number.isFinite(config.maxCount) || config.maxCount < 100 || config.maxCount > 100000) {
        logger.warn(`[CacheConfigManager] Invalid maxCount: ${config.maxCount}, using default 5000`)
        config.maxCount = DEFAULT_CONFIG.maxCount
      }
    }

    if (config.preloadCount !== undefined) {
      if (!Number.isInteger(config.preloadCount) || config.preloadCount < 0 || config.preloadCount > 50) {
        logger.warn(`[CacheConfigManager] Invalid preloadCount: ${config.preloadCount}, using default 5`)
        config.preloadCount = DEFAULT_CONFIG.preloadCount
      }
    }

    if (config.preloadConcurrency !== undefined) {
      if (!Number.isInteger(config.preloadConcurrency) || config.preloadConcurrency < 1 || config.preloadConcurrency > 10) {
        logger.warn(`[CacheConfigManager] Invalid preloadConcurrency: ${config.preloadConcurrency}, using default 3`)
        config.preloadConcurrency = DEFAULT_CONFIG.preloadConcurrency
      }
    }

    if (config.lruEvictionRatio !== undefined) {
      if (!Number.isFinite(config.lruEvictionRatio) || config.lruEvictionRatio < 0.01 || config.lruEvictionRatio > 1) {
        logger.warn(`[CacheConfigManager] Invalid lruEvictionRatio: ${config.lruEvictionRatio}, using default 0.1`)
        config.lruEvictionRatio = DEFAULT_CONFIG.lruEvictionRatio
      }
    }
  }

  /**
   * 更新完整配置
   */
  setConfig(updates: Partial<CacheConfig>): void {
    const validatedUpdates = { ...updates }
    this.validateConfig(validatedUpdates)
    this.config = { ...this.config, ...validatedUpdates }
    this.saveConfig()
    this.emit('config', this.config)
  }

  /**
   * 仅更新全局配置
   */
  setGlobalConfig(updates: Partial<CacheGlobalConfig>): void {
    this.setConfig(updates)
  }

  /**
   * 仅更新预加载配置
   */
  setPreloadConfig(updates: Partial<PreloadConfig>): void {
    this.setConfig(updates)
  }

  /**
   * 仅更新 IndexedDB 配置
   */
  setIndexedDBConfig(updates: Partial<IndexedDBCacheConfig>): void {
    this.setConfig(updates)
  }

  /**
   * 检查缓存是否启用
   */
  isEnabled(): boolean {
    return this.config.enabled
  }

  /**
   * 获取当前缓存类型
   */
  getCacheType(): CacheType {
    return this.config.cacheType
  }

  /**
   * 添加配置事件监听器
   * @returns 取消监听的函数
   */
  addEventListener(listener: ConfigEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * 触发配置变化事件
   */
  private emit(event: ConfigEventType, config: CacheConfig): void {
    for (const listener of this.listeners) {
      try {
        listener(event, config)
      } catch (error) {
        logger.error('[CacheConfigManager] Config event listener error:', error)
      }
    }
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG }
    this.saveConfig()
    this.emit('config', this.config)
  }
}

/** 导出单例实例 */
export const cacheConfigManager = new CacheConfigManager()

/** 导出类（用于测试） */
export { CacheConfigManager }
