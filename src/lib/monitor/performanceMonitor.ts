/**
 * 性能监控系统
 * 收集播放质量指标和缓存性能数据
 * 提供性能数据上报和可视化支持
 */

import { logger } from '@/utils/logger'

/**
 * 播放性能指标
 */
export interface PlaybackMetrics {
  /** 视频时长(秒) */
  duration: number
  /** 累计播放时长(秒) */
  totalPlayTime: number
  /** 累计缓冲时间(毫秒) */
  totalBufferTime: number
  /** 缓冲次数 */
  bufferCount: number
  /** 平均缓冲时间(毫秒) */
  avgBufferTime: number
  /** 缓冲率(0-1) */
  bufferRate: number
  /** 播放错误次数 */
  errorCount: number
  /** 错误类型统计 */
  errorTypes: Map<string, number>
  /** 最后更新时间 */
  lastUpdate: number
}

/**
 * 缓存性能指标
 */
export interface CachePerformanceMetrics {
  /** 缓存总请求数 */
  totalRequests: number
  /** 缓存命中数 */
  hits: number
  /** 缓存未命中数 */
  misses: number
  /** 命中率(0-1) */
  hitRate: number
  /** 平均响应时间(毫秒) */
  avgResponseTime: number
  /** 缓存写入次数 */
  writeCount: number
  /** 缓存删除次数 */
  deleteCount: number
  /** URL hash 缓存命中率 */
  urlHashHitRate: number
  /** 最后更新时间 */
  lastUpdate: number
}

/**
 * 网络性能指标
 */
export interface NetworkPerformanceMetrics {
  /** 平均带宽(Mbps) */
  avgBandwidth: number
  /** 最小带宽(Mbps) */
  minBandwidth: number
  /** 最大带宽(Mbps) */
  maxBandwidth: number
  /** 带宽波动标准差 */
  bandwidthStdDev: number
  /** 网络中断次数 */
  disconnectCount: number
  /** 网络恢复次数 */
  reconnectCount: number
  /** 离线时长(秒) */
  totalOfflineTime: number
  /** 最后更新时间 */
  lastUpdate: number
}

/**
 * 综合性能指标
 */
export interface PerformanceMetrics {
  /** 播放性能 */
  playback: PlaybackMetrics
  /** 缓存性能 */
  cache: CachePerformanceMetrics
  /** 网络性能 */
  network: NetworkPerformanceMetrics
  /** 最后更新时间 */
  lastUpdate: number
}

/**
 * 性能事件类型
 */
export type PerformanceEventType =
  | 'buffer-start'
  | 'buffer-end'
  | 'playback-start'
  | 'playback-pause'
  | 'playback-end'
  | 'playback-error'
  | 'cache-hit'
  | 'cache-miss'
  | 'network-change'

/**
 * 性能事件监听器
 */
export type PerformanceEventListener = (metrics: PerformanceMetrics) => void

/**
 * 性能监控器
 */
class PerformanceMonitor {
  private playbackMetrics: PlaybackMetrics = {
    duration: 0,
    totalPlayTime: 0,
    totalBufferTime: 0,
    bufferCount: 0,
    avgBufferTime: 0,
    bufferRate: 0,
    errorCount: 0,
    errorTypes: new Map(),
    lastUpdate: Date.now(),
  }

  private cacheMetrics: CachePerformanceMetrics = {
    totalRequests: 0,
    hits: 0,
    misses: 0,
    hitRate: 0,
    avgResponseTime: 0,
    writeCount: 0,
    deleteCount: 0,
    urlHashHitRate: 0,
    lastUpdate: Date.now(),
  }

  private networkMetrics: NetworkPerformanceMetrics = {
    avgBandwidth: 0,
    minBandwidth: Infinity,
    maxBandwidth: 0,
    bandwidthStdDev: 0,
    disconnectCount: 0,
    reconnectCount: 0,
    totalOfflineTime: 0,
    lastUpdate: Date.now(),
  }

  private bandwidthSamples: number[] = []
  private responseTimeSamples: number[] = []
  private offlineStartTime: number | null = null
  private listeners: Set<PerformanceEventListener> = new Set()
  private reportingInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.initializeReporting()
  }

  /**
   * 初始化定时报告
   */
  private initializeReporting(): void {
    // 每 10 秒更新一次指标
    this.reportingInterval = setInterval(() => {
      this.updateMetrics()
    }, 10000)
  }

  /**
   * 记录播放事件
   */
  recordPlaybackEvent(event: PerformanceEventType, data?: any): void {
    const now = Date.now()

    switch (event) {
      case 'playback-start':
        logger.log('[PerformanceMonitor] Playback started')
        break

      case 'playback-pause':
        logger.log('[PerformanceMonitor] Playback paused')
        break

      case 'playback-end':
        logger.log('[PerformanceMonitor] Playback ended')
        break

      case 'buffer-start':
        logger.log('[PerformanceMonitor] Buffer started')
        break

      case 'buffer-end':
        if (data?.duration) {
          this.playbackMetrics.totalBufferTime += data.duration
          this.playbackMetrics.bufferCount++
          this.calculateBufferMetrics()
          logger.log('[PerformanceMonitor] Buffer ended, duration:', data.duration, 'ms')
        }
        break

      case 'playback-error': {
        this.playbackMetrics.errorCount++
        const errorType = data?.errorType || 'unknown'
        const currentCount = this.playbackMetrics.errorTypes.get(errorType) || 0
        this.playbackMetrics.errorTypes.set(errorType, currentCount + 1)
        logger.error('[PerformanceMonitor] Playback error:', errorType)
        break
      }
    }

    this.playbackMetrics.lastUpdate = now
  }

  /**
   * 记录缓存事件
   */
  recordCacheEvent(event: PerformanceEventType, data?: any): void {
    const now = Date.now()

    switch (event) {
      case 'cache-hit':
        this.cacheMetrics.hits++
        logger.log('[PerformanceMonitor] Cache hit')
        break

      case 'cache-miss':
        this.cacheMetrics.misses++
        logger.log('[PerformanceMonitor] Cache miss')
        break
    }

    this.cacheMetrics.totalRequests++

    if (data?.responseTime) {
      this.responseTimeSamples.push(data.responseTime)
      if (this.responseTimeSamples.length > 100) {
        this.responseTimeSamples.shift()
      }
      this.calculateCacheMetrics()
    }

    this.cacheMetrics.lastUpdate = now
  }

  /**
   * 记录缓存写入
   */
  recordCacheWrite(): void {
    this.cacheMetrics.writeCount++
    this.cacheMetrics.lastUpdate = Date.now()
  }

  /**
   * 记录缓存删除
   */
  recordCacheDelete(): void {
    this.cacheMetrics.deleteCount++
    this.cacheMetrics.lastUpdate = Date.now()
  }

  /**
   * 记录 URL hash 缓存命中率
   */
  recordUrlHashHitRate(hitRate: number): void {
    this.cacheMetrics.urlHashHitRate = hitRate
    this.cacheMetrics.lastUpdate = Date.now()
  }

  /**
   * 记录网络带宽样本
   */
  recordBandwidthSample(bandwidth: number): void {
    const now = Date.now()

    this.bandwidthSamples.push(bandwidth)
    if (this.bandwidthSamples.length > 100) {
      this.bandwidthSamples.shift()
    }

    this.calculateNetworkMetrics()
    this.networkMetrics.lastUpdate = now

    logger.log('[PerformanceMonitor] Bandwidth sample:', bandwidth, 'Mbps')
  }

  /**
   * 记录网络状态变化
   */
  recordNetworkEvent(event: PerformanceEventType): void {
    const now = Date.now()

    switch (event) {
      case 'network-change':
        // 检查网络是否断开
        if (!navigator.onLine && this.offlineStartTime === null) {
          this.offlineStartTime = now
          this.networkMetrics.disconnectCount++
          logger.log('[PerformanceMonitor] Network disconnected')
        } else if (navigator.onLine && this.offlineStartTime !== null) {
          const offlineDuration = (now - this.offlineStartTime) / 1000 // 秒
          this.networkMetrics.totalOfflineTime += offlineDuration
          this.networkMetrics.reconnectCount++
          this.offlineStartTime = null
          logger.log('[PerformanceMonitor] Network reconnected, offline duration:', offlineDuration, 's')
        }
        break
    }

    this.networkMetrics.lastUpdate = now
  }

  /**
   * 计算缓冲指标
   */
  private calculateBufferMetrics(): void {
    if (this.playbackMetrics.bufferCount > 0) {
      this.playbackMetrics.avgBufferTime = this.playbackMetrics.totalBufferTime / this.playbackMetrics.bufferCount
    }

    if (this.playbackMetrics.totalPlayTime > 0) {
      this.playbackMetrics.bufferRate = this.playbackMetrics.totalBufferTime / 1000 / this.playbackMetrics.totalPlayTime
    }
  }

  /**
   * 计算缓存指标
   */
  private calculateCacheMetrics(): void {
    // 计算命中率
    const total = this.cacheMetrics.hits + this.cacheMetrics.misses
    this.cacheMetrics.hitRate = total > 0 ? this.cacheMetrics.hits / total : 0

    // 计算平均响应时间
    if (this.responseTimeSamples.length > 0) {
      const sum = this.responseTimeSamples.reduce((acc, val) => acc + val, 0)
      this.cacheMetrics.avgResponseTime = sum / this.responseTimeSamples.length
    }
  }

  /**
   * 计算网络指标
   */
  private calculateNetworkMetrics(): void {
    if (this.bandwidthSamples.length === 0) return

    // 计算平均带宽
    const sum = this.bandwidthSamples.reduce((acc, val) => acc + val, 0)
    this.networkMetrics.avgBandwidth = sum / this.bandwidthSamples.length

    // 计算最小/最大带宽
    this.networkMetrics.minBandwidth = Math.min(...this.bandwidthSamples)
    this.networkMetrics.maxBandwidth = Math.max(...this.bandwidthSamples)

    // 计算标准差
    const avg = this.networkMetrics.avgBandwidth
    const variance = this.bandwidthSamples.reduce((acc, val) => acc + (val - avg) ** 2, 0) / this.bandwidthSamples.length
    this.networkMetrics.bandwidthStdDev = Math.sqrt(variance)
  }

  /**
   * 更新所有指标
   */
  private updateMetrics(): void {
    this.calculateBufferMetrics()
    this.calculateCacheMetrics()
    this.calculateNetworkMetrics()

    const metrics: PerformanceMetrics = {
      playback: { ...this.playbackMetrics },
      cache: { ...this.cacheMetrics },
      network: { ...this.networkMetrics },
      lastUpdate: Date.now(),
    }

    // 通知所有监听器
    this.notifyListeners(metrics)
  }

  /**
   * 获取当前性能指标
   */
  getMetrics(): PerformanceMetrics {
    return {
      playback: { ...this.playbackMetrics },
      cache: { ...this.cacheMetrics },
      network: { ...this.networkMetrics },
      lastUpdate: Date.now(),
    }
  }

  /**
   * 添加性能事件监听器
   */
  addEventListener(listener: PerformanceEventListener): void {
    this.listeners.add(listener)
  }

  /**
   * 移除性能事件监听器
   */
  removeEventListener(listener: PerformanceEventListener): void {
    this.listeners.delete(listener)
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(metrics: PerformanceMetrics): void {
    for (const listener of this.listeners) {
      try {
        listener(metrics)
      } catch (error) {
        logger.error('[PerformanceMonitor] Error in event listener:', error)
      }
    }
  }

  /**
   * 重置所有指标
   */
  reset(): void {
    this.playbackMetrics = {
      duration: 0,
      totalPlayTime: 0,
      totalBufferTime: 0,
      bufferCount: 0,
      avgBufferTime: 0,
      bufferRate: 0,
      errorCount: 0,
      errorTypes: new Map(),
      lastUpdate: Date.now(),
    }

    this.cacheMetrics = {
      totalRequests: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      avgResponseTime: 0,
      writeCount: 0,
      deleteCount: 0,
      urlHashHitRate: 0,
      lastUpdate: Date.now(),
    }

    this.networkMetrics = {
      avgBandwidth: 0,
      minBandwidth: Infinity,
      maxBandwidth: 0,
      bandwidthStdDev: 0,
      disconnectCount: 0,
      reconnectCount: 0,
      totalOfflineTime: 0,
      lastUpdate: Date.now(),
    }

    this.bandwidthSamples = []
    this.responseTimeSamples = []
    this.offlineStartTime = null

    logger.log('[PerformanceMonitor] Metrics reset')
  }

  /**
   * 导出性能报告
   */
  exportReport(): string {
    const metrics = this.getMetrics()

    return `
=== Performance Report ===

Playback Metrics:
- Duration: ${metrics.playback.duration.toFixed(2)}s
- Total Play Time: ${metrics.playback.totalPlayTime.toFixed(2)}s
- Total Buffer Time: ${metrics.playback.totalBufferTime.toFixed(2)}ms
- Buffer Count: ${metrics.playback.bufferCount}
- Average Buffer Time: ${metrics.playback.avgBufferTime.toFixed(2)}ms
- Buffer Rate: ${(metrics.playback.bufferRate * 100).toFixed(2)}%
- Error Count: ${metrics.playback.errorCount}

Cache Metrics:
- Total Requests: ${metrics.cache.totalRequests}
- Hits: ${metrics.cache.hits}
- Misses: ${metrics.cache.misses}
- Hit Rate: ${(metrics.cache.hitRate * 100).toFixed(2)}%
- Avg Response Time: ${metrics.cache.avgResponseTime.toFixed(2)}ms
- Writes: ${metrics.cache.writeCount}
- Deletes: ${metrics.cache.deleteCount}
- URL Hash Hit Rate: ${(metrics.cache.urlHashHitRate * 100).toFixed(2)}%

Network Metrics:
- Avg Bandwidth: ${metrics.network.avgBandwidth.toFixed(2)} Mbps
- Min Bandwidth: ${metrics.network.minBandwidth.toFixed(2)} Mbps
- Max Bandwidth: ${metrics.network.maxBandwidth.toFixed(2)} Mbps
- Bandwidth StdDev: ${metrics.network.bandwidthStdDev.toFixed(2)} Mbps
- Disconnect Count: ${metrics.network.disconnectCount}
- Reconnect Count: ${metrics.network.reconnectCount}
- Total Offline Time: ${metrics.network.totalOfflineTime.toFixed(2)}s

Last Update: ${new Date(metrics.lastUpdate).toLocaleString()}
    `.trim()
  }

  /**
   * 销毁监控器
   */
  destroy(): void {
    if (this.reportingInterval) {
      clearInterval(this.reportingInterval)
      this.reportingInterval = null
    }

    this.listeners.clear()
    logger.log('[PerformanceMonitor] Destroyed')
  }
}

/**
 * 单例实例
 */
let performanceMonitorInstance: PerformanceMonitor | null = null

/**
 * 获取性能监控器单例
 */
export function getPerformanceMonitor(): PerformanceMonitor {
  if (!performanceMonitorInstance) {
    performanceMonitorInstance = new PerformanceMonitor()
  }
  return performanceMonitorInstance
}
