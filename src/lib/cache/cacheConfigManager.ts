/**
 * 缓存配置管理器
 * 负责全局缓存配置的统一管理，独立于具体的缓存实现
 */

import { isCacheAllowed } from '@/lib/embed'
import { logger } from '@/utils/logger'
import { PWACacheManager } from './pwaCache'

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
  /** PWA 回退警告是否已打印过（避免在 HLS 分片加载等热路径中刷屏） */
  private pwaFallbackWarned = false

  constructor() {
    this.loadConfig()
  }

  /**
   * 从 localStorage 加载配置，失败时尝试 IndexedDB
   */
  private loadConfig(): void {
    try {
      const stored = localStorage.getItem(CONFIG_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        // 合并配置，保留新增字段的默认值
        this.config = { ...DEFAULT_CONFIG, ...parsed }
        return
      }
    } catch (error) {
      logger.error('[CacheConfigManager] Failed to load config from localStorage:', error)
    }
    
    // 如果 localStorage 中没有配置或加载失败，尝试 IndexedDB（异步，不阻塞）
    this.loadFromIndexedDB()
      .then((idbConfig) => {
        if (idbConfig) {
          this.config = { ...DEFAULT_CONFIG, ...idbConfig }
          logger.debug('[CacheConfigManager] Config loaded from IndexedDB')
          // 通知配置已更新
          this.emit('config', this.config)
        }
      })
      .catch((idbError) => {
        logger.debug('[CacheConfigManager] No config found in IndexedDB, using defaults:', idbError)
      })
  }

  /**
   * 保存配置到 localStorage
   * 如果 localStorage 失败，尝试 IndexedDB 作为备用存储（异步）
   */
  private saveConfig(): void {
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(this.config))
      return
    } catch (error) {
      const storageError = error as DOMException
      
      // 如果是配额超出错误，提供更详细的日志
      if (storageError.name === 'QuotaExceededError') {
        logger.error('[CacheConfigManager] localStorage quota exceeded, config not saved:', {
          configSize: JSON.stringify(this.config).length,
          error: storageError.message,
        })
        
        // 尝试清理其他数据或提示用户
        this.notifyStorageQuotaExceeded()
      } else {
        logger.error('[CacheConfigManager] Failed to save config to localStorage:', storageError)
      }
      
      // 尝试使用 IndexedDB 作为备用存储（异步，不阻塞）
      this.saveToIndexedDB()
        .then(() => {
          logger.debug('[CacheConfigManager] Config saved to IndexedDB as fallback')
        })
        .catch((idbError) => {
          logger.error('[CacheConfigManager] Failed to save config to IndexedDB:', idbError)
          // 最后的手段：使用内存存储（会话期间有效）
          this.saveToMemory()
        })
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
   * embed 模式下还需结合嵌入设置中的缓存开关（可在设置页配置）
   */
  isEnabled(): boolean {
    if (!this.config.enabled) return false
    return isCacheAllowed()
  }

  /**
   * 检测 PWA Cache API 是否可用
   * 同时受浏览器支持情况和安全上下文（HTTPS）影响
   */
  isPWACacheSupported(): boolean {
    return PWACacheManager.isSupported()
  }

  /**
   * 获取当前实际生效的缓存类型
   * 当配置为 pwa 但运行环境不支持（如非 HTTPS 上下文、低版本浏览器）时，自动回退到 indexeddb
   * 注意：不会修改持久化保存的用户偏好，仅在运行时返回有效类型
   *       保留 pwa 偏好可使后续在 HTTPS 环境下自动恢复 PWA 模式
   */
  getCacheType(): CacheType {
    if (this.config.cacheType === 'pwa' && !this.isPWACacheSupported()) {
      // 仅在首次进入回退分支时打印一次警告，避免 HLS 分片加载等热路径刷屏
      if (!this.pwaFallbackWarned) {
        this.pwaFallbackWarned = true
        logger.warn('[CacheConfigManager] PWA cache not supported (non-secure context or unsupported browser), falling back to indexeddb at runtime')
      }
      return 'indexeddb'
    }
    // 回退条件不再满足时重置标记，便于后续再次进入回退时重新警告
    this.pwaFallbackWarned = false
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

  /**
   * 保存配置到 IndexedDB（备用存储）
   */
  private async saveToIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open('m3u8_cache_config', 1)
        
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction('config', 'readwrite')
          const store = transaction.objectStore('config')
          const putRequest = store.put(this.config, CONFIG_STORAGE_KEY)
          
          putRequest.onerror = () => reject(putRequest.error)
          putRequest.onsuccess = () => resolve()
        }
        
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result
          if (!db.objectStoreNames.contains('config')) {
            db.createObjectStore('config')
          }
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 从 IndexedDB 加载配置（备用存储）
   */
  private async loadFromIndexedDB(): Promise<CacheConfig | null> {
    return new Promise((resolve, reject) => {
      try {
        const request = indexedDB.open('m3u8_cache_config', 1)
        
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const transaction = db.transaction('config', 'readonly')
          const store = transaction.objectStore('config')
          const getRequest = store.get(CONFIG_STORAGE_KEY)
          
          getRequest.onerror = () => reject(getRequest.error)
          getRequest.onsuccess = () => resolve(getRequest.result || null)
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * 保存配置到内存（最后的手段）
   */
  private saveToMemory(): void {
    // 内存存储，仅在当前会话有效
    // 在类级别已经有 this.config，所以不需要额外存储
    logger.warn('[CacheConfigManager] Config saved to memory only (session lifetime)')
  }

  /**
   * 通知存储配额超出
   */
  private notifyStorageQuotaExceeded(): void {
    // 记录详细的存储使用情况
    let totalSize = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        const value = localStorage.getItem(key) || ''
        totalSize += key.length + value.length
      }
    }
    
    logger.warn('[CacheConfigManager] localStorage usage:', {
      totalItems: localStorage.length,
      estimatedSize: totalSize,
      configKey: CONFIG_STORAGE_KEY,
    })
    
    // 可以在这里触发 UI 通知，但为了解耦，只记录日志
    // UI 组件可以监听日志或添加专门的事件
  }
}

/** 导出单例实例 */
export const cacheConfigManager = new CacheConfigManager()

/** 导出类（用于测试） */
export { CacheConfigManager }
