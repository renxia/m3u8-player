/**
 * 资源监控模块
 * 监控内存和存储状态，实现资源不足时的优雅降级
 */

import { logger } from '@/utils/logger'

/**
 * 内存状态
 */
export interface MemoryState {
  /** 已使用内存（估算，MB） */
  used: number
  /** 可用内存（估算，MB） */
  available: number
  /** 总内存（估算，MB） */
  total: number
  /** 内存使用率 (0-1) */
  usageRatio: number
  /** 是否内存不足 */
  isLow: boolean
  /** 内存压力等级 */
  pressure: 'low' | 'medium' | 'high' | 'critical'
  /** 最后更新时间 */
  lastUpdate: number
}

/**
 * 存储状态
 */
export interface StorageState {
  /** 已使用存储（字节） */
  used: number
  /** 可用存储（字节） */
  available: number
  /** 总存储（字节） */
  total: number
  /** 存储使用率 (0-1) */
  usageRatio: number
  /** 是否存储不足 */
  isLow: boolean
  /** 存储压力等级 */
  pressure: 'low' | 'medium' | 'high' | 'critical'
  /** 最后更新时间 */
  lastUpdate: number
}

/**
 * 资源降级策略
 */
export interface DegradationStrategy {
  /** 是否启用降级 */
  enabled: boolean
  /** 内存阈值（MB）低于此值触发降级 */
  memoryThreshold: number
  /** 存储阈值（MB）低于此值触发降级 */
  storageThreshold: number
  /** 是否启用缓存清理 */
  enableCacheCleanup: boolean
  /** 缓存清理比例 (0-1) */
  cacheCleanupRatio: number
  /** 是否禁用预加载 */
  disablePreload: boolean
  /** 是否降低视频质量 */
  reduceQuality: boolean
}

/**
 * 默认降级策略
 */
const DEFAULT_DEGRADATION_STRATEGY: DegradationStrategy = {
  enabled: true,
  memoryThreshold: 100, // 100MB 可用内存
  storageThreshold: 50, // 50MB 可用存储
  enableCacheCleanup: true,
  cacheCleanupRatio: 0.3, // 清理 30% 的缓存
  disablePreload: true,
  reduceQuality: true,
}

/**
 * 内存监控器
 */
class MemoryMonitor {
  private state: MemoryState = this.getInitialState()
  private updateInterval: ReturnType<typeof setInterval> | null = null
  private listeners: Set<(state: MemoryState) => void> = new Set()

  /**
   * 获取初始状态
   */
  private getInitialState(): MemoryState {
    return {
      used: 0,
      available: 1024, // 默认 1GB
      total: 2048, // 默认 2GB
      usageRatio: 0.5,
      isLow: false,
      pressure: 'low',
      lastUpdate: Date.now(),
    }
  }

  /**
   * 启动监控
   */
  start(intervalMs = 30000): void {
    if (this.updateInterval) {
      logger.warn('[MemoryMonitor] Already started')
      return
    }

    // 立即更新一次
    this.update()

    // 定期更新
    this.updateInterval = setInterval(() => {
      this.update()
    }, intervalMs)

    logger.log('[MemoryMonitor] Started')
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
    logger.log('[MemoryMonitor] Stopped')
  }

  /**
   * 更新内存状态
   */
  private update(): void {
    try {
      const oldState = { ...this.state }
      const newState = this.estimateMemoryState()

      this.state = {
        ...newState,
        lastUpdate: Date.now(),
      }

      // 检查状态变化
      if (oldState.pressure !== this.state.pressure) {
        logger.log('[MemoryMonitor] Memory pressure changed:', oldState.pressure, '→', this.state.pressure)
      }

      // 通知监听器
      this.notifyListeners()
    } catch (error) {
      logger.error('[MemoryMonitor] Error updating memory state:', error)
    }
  }

  /**
   * 估算内存状态
   */
  private estimateMemoryState(): Omit<MemoryState, 'lastUpdate'> {
    try {
      // 使用 performance.memory API (仅 Chrome)
      if ((performance as any).memory) {
        const memory = (performance as any).memory
        const used = memory.usedJSHeapSize / 1024 / 1024 // MB
        const total = memory.totalJSHeapSize / 1024 / 1024 // MB
        const limit = memory.jsHeapSizeLimit / 1024 / 1024 // MB
        const available = limit - used
        const usageRatio = used / limit

        return {
          used: Math.round(used),
          available: Math.round(available),
          total: Math.round(total),
          usageRatio,
          isLow: available < 100,
          pressure: this.calculatePressure(usageRatio, available),
        }
      }
    } catch (error) {
      logger.warn('[MemoryMonitor] performance.memory not available, using estimation')
    }

    // 使用估算值
    const total = 2048 // 2GB
    const used = Math.round(total * (0.4 + Math.random() * 0.3)) // 40-70% 使用
    const available = total - used
    const usageRatio = used / total

    return {
      used,
      available,
      total,
      usageRatio,
      isLow: available < 100,
      pressure: this.calculatePressure(usageRatio, available),
    }
  }

  /**
   * 计算内存压力等级
   */
  private calculatePressure(usageRatio: number, available: number): 'low' | 'medium' | 'high' | 'critical' {
    if (available < 50 || usageRatio > 0.9) {
      return 'critical'
    }
    if (available < 100 || usageRatio > 0.8) {
      return 'high'
    }
    if (available < 200 || usageRatio > 0.7) {
      return 'medium'
    }
    return 'low'
  }

  /**
   * 通知监听器
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state)
      } catch (error) {
        logger.error('[MemoryMonitor] Error in listener:', error)
      }
    })
  }

  /**
   * 添加监听器
   */
  addListener(listener: (state: MemoryState) => void): void {
    this.listeners.add(listener)
  }

  /**
   * 移除监听器
   */
  removeListener(listener: (state: MemoryState) => void): void {
    this.listeners.delete(listener)
  }

  /**
   * 获取当前状态
   */
  getState(): MemoryState {
    return { ...this.state }
  }
}

/**
 * 存储监控器
 */
class StorageMonitor {
  private state: StorageState = this.getInitialState()
  private updateInterval: ReturnType<typeof setInterval> | null = null
  private listeners: Set<(state: StorageState) => void> = new Set()

  /**
   * 获取初始状态
   */
  private getInitialState(): StorageState {
    return {
      used: 0,
      available: 512 * 1024 * 1024, // 默认 512MB
      total: 1024 * 1024 * 1024, // 默认 1GB
      usageRatio: 0.5,
      isLow: false,
      pressure: 'low',
      lastUpdate: Date.now(),
    }
  }

  /**
   * 启动监控
   */
  start(intervalMs = 30000): void {
    if (this.updateInterval) {
      logger.warn('[StorageMonitor] Already started')
      return
    }

    // 立即更新一次
    this.update()

    // 定期更新
    this.updateInterval = setInterval(() => {
      this.update()
    }, intervalMs)

    logger.log('[StorageMonitor] Started')
  }

  /**
   * 停止监控
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
    logger.log('[StorageMonitor] Stopped')
  }

  /**
   * 更新存储状态
   */
  private async update(): Promise<void> {
    try {
      const oldState = { ...this.state }
      const newState = await this.estimateStorageState()

      this.state = {
        ...newState,
        lastUpdate: Date.now(),
      }

      // 检查状态变化
      if (oldState.pressure !== this.state.pressure) {
        logger.log('[StorageMonitor] Storage pressure changed:', oldState.pressure, '→', this.state.pressure)
      }

      // 通知监听器
      this.notifyListeners()
    } catch (error) {
      logger.error('[StorageMonitor] Error updating storage state:', error)
    }
  }

  /**
   * 估算存储状态
   */
  private async estimateStorageState(): Promise<Omit<StorageState, 'lastUpdate'>> {
    try {
      // 估算 IndexedDB 配额
      if ('storage' in navigator && 'estimate' in (navigator as any).storage) {
        const estimate = await (navigator as any).storage.estimate()
        if (estimate) {
          const used = estimate.usage || 0
          const quota = estimate.quota || 1024 * 1024 * 1024
          const available = quota - used
          const usageRatio = used / quota

          return {
            used,
            available,
            total: quota,
            usageRatio,
            isLow: available < 50 * 1024 * 1024, // 50MB
            pressure: this.calculatePressure(usageRatio, available),
          }
        }
      }
    } catch (error) {
      logger.warn('[StorageMonitor] Storage API not available, using estimation')
    }

    // 使用估算值
    const total = 1024 * 1024 * 1024 // 1GB
    const used = Math.round(total * (0.3 + Math.random() * 0.4)) // 30-70% 使用
    const available = total - used
    const usageRatio = used / total

    return {
      used,
      available,
      total,
      usageRatio,
      isLow: available < 50 * 1024 * 1024,
      pressure: this.calculatePressure(usageRatio, available),
    }
  }

  /**
   * 计算存储压力等级
   */
  private calculatePressure(usageRatio: number, available: number): 'low' | 'medium' | 'high' | 'critical' {
    const availableMB = available / 1024 / 1024

    if (availableMB < 20 || usageRatio > 0.95) {
      return 'critical'
    }
    if (availableMB < 50 || usageRatio > 0.9) {
      return 'high'
    }
    if (availableMB < 100 || usageRatio > 0.8) {
      return 'medium'
    }
    return 'low'
  }

  /**
   * 通知监听器
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener(this.state)
      } catch (error) {
        logger.error('[StorageMonitor] Error in listener:', error)
      }
    })
  }

  /**
   * 添加监听器
   */
  addListener(listener: (state: StorageState) => void): void {
    this.listeners.add(listener)
  }

  /**
   * 移除监听器
   */
  removeListener(listener: (state: StorageState) => void): void {
    this.listeners.delete(listener)
  }

  /**
   * 获取当前状态
   */
  getState(): StorageState {
    return { ...this.state }
  }
}

/**
 * 资源降级管理器
 */
class DegradationManager {
  private strategy: DegradationStrategy
  private memoryMonitor: MemoryMonitor
  private storageMonitor: StorageMonitor
  private isDegraded = false
  private listeners: Set<(degraded: boolean, reason: string) => void> = new Set()

  constructor(strategy?: Partial<DegradationStrategy>) {
    this.strategy = { ...DEFAULT_DEGRADATION_STRATEGY, ...strategy }
    this.memoryMonitor = new MemoryMonitor()
    this.storageMonitor = new StorageMonitor()

    this.initialize()
  }

  /**
   * 初始化
   */
  private initialize(): void {
    // 监听内存状态变化
    this.memoryMonitor.addListener((state) => {
      this.checkResourceState(state, this.storageMonitor.getState())
    })

    // 监听存储状态变化
    this.storageMonitor.addListener((state) => {
      this.checkResourceState(this.memoryMonitor.getState(), state)
    })
  }

  /**
   * 检查资源状态，决定是否需要降级
   */
  private checkResourceState(memoryState: MemoryState, storageState: StorageState): void {
    if (!this.strategy.enabled) {
      return
    }

    const memoryLow = memoryState.available < this.strategy.memoryThreshold || memoryState.pressure === 'critical'
    const storageLow = storageState.available < this.strategy.storageThreshold || storageState.pressure === 'critical'

    if (memoryLow || storageLow) {
      if (!this.isDegraded) {
        const reason = memoryLow ? '内存不足' : '存储不足'
        this.applyDegradation(reason)
      }
    } else {
      if (this.isDegraded) {
        this.recoverFromDegradation()
      }
    }
  }

  /**
   * 应用降级策略
   */
  private applyDegradation(reason: string): void {
    logger.warn('[DegradationManager] Applying degradation:', reason)
    this.isDegraded = true

    // 清理缓存
    if (this.strategy.enableCacheCleanup) {
      this.cleanupCache()
    }

    // 通知监听器
    this.notifyListeners(true, reason)
  }

  /**
   * 清理缓存
   */
  private async cleanupCache(): Promise<void> {
    try {
      const { cacheConfigManager } = await import('@/lib/cache')
      const adapter = await import('@/lib/cache/cacheAdapter').then((m) => m.getCurrentCacheAdapter())

      if (adapter.isEnabled()) {
        // 获取所有缓存的 URL
        const keys = await adapter.keys()
        const cleanupCount = Math.floor(keys.length * this.strategy.cacheCleanupRatio)

        // 删除最旧的缓存
        const keysToDelete = keys.slice(0, cleanupCount)
        for (const key of keysToDelete) {
          await adapter.delete(key)
        }

        logger.log('[DegradationManager] Cleaned up', cleanupCount, 'cache entries')
      }
    } catch (error) {
      logger.error('[DegradationManager] Error cleaning cache:', error)
    }
  }

  /**
   * 从降级中恢复
   */
  private recoverFromDegradation(): void {
    logger.log('[DegradationManager] Recovering from degradation')
    this.isDegraded = false
    this.notifyListeners(false, '')
  }

  /**
   * 通知监听器
   */
  private notifyListeners(degraded: boolean, reason: string): void {
    this.listeners.forEach((listener) => {
      try {
        listener(degraded, reason)
      } catch (error) {
        logger.error('[DegradationManager] Error in listener:', error)
      }
    })
  }

  /**
   * 启动监控
   */
  start(): void {
    this.memoryMonitor.start()
    this.storageMonitor.start()
  }

  /**
   * 停止监控
   */
  stop(): void {
    this.memoryMonitor.stop()
    this.storageMonitor.stop()
  }

  /**
   * 是否处于降级状态
   */
  isDegradationActive(): boolean {
    return this.isDegraded
  }

  /**
   * 是否应该禁用预加载
   */
  shouldDisablePreload(): boolean {
    return this.isDegraded && this.strategy.disablePreload
  }

  /**
   * 是否应该降低视频质量
   */
  shouldReduceQuality(): boolean {
    return this.isDegraded && this.strategy.reduceQuality
  }

  /**
   * 添加监听器
   */
  addListener(listener: (degraded: boolean, reason: string) => void): void {
    this.listeners.add(listener)
  }

  /**
   * 移除监听器
   */
  removeListener(listener: (degraded: boolean, reason: string) => void): void {
    this.listeners.delete(listener)
  }

  /**
   * 获取内存状态
   */
  getMemoryState(): MemoryState {
    return this.memoryMonitor.getState()
  }

  /**
   * 获取存储状态
   */
  getStorageState(): StorageState {
    return this.storageMonitor.getState()
  }
}

/**
 * 创建资源监控管理器
 */
export function createResourceMonitor(strategy?: Partial<DegradationStrategy>): DegradationManager {
  return new DegradationManager(strategy)
}

/**
 * 单例实例
 */
let resourceMonitorInstance: DegradationManager | null = null

/**
 * 获取资源监控管理器单例
 */
export function getResourceMonitor(): DegradationManager {
  if (!resourceMonitorInstance) {
    resourceMonitorInstance = createResourceMonitor()
  }
  return resourceMonitorInstance
}

/**
 * 工具函数：格式化字节数
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

/**
 * 工具函数：格式化内存状态（用于 UI 显示）
 */
export function formatMemoryState(state: MemoryState): string {
  return `已使用: ${formatBytes(state.used * 1024 * 1024)} / ${formatBytes(state.total * 1024 * 1024)} (${Math.round(state.usageRatio * 100)}%)`
}

/**
 * 工具函数：格式化存储状态（用于 UI 显示）
 */
export function formatStorageState(state: StorageState): string {
  return `已使用: ${formatBytes(state.used)} / ${formatBytes(state.total)} (${Math.round(state.usageRatio * 100)}%)`
}
