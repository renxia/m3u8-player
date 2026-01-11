/**
 * 网络状态监控和自适应预加载
 * 实现基于网络状态的智能预加载策略
 */

import { logger } from '@/utils/logger'

/**
 * 网络连接类型
 */
export type ConnectionType = 'slow-2g' | '2g' | '3g' | '4g' | '5g' | 'wifi' | 'ethernet' | 'unknown'

/**
 * 网络有效类型
 */
export type EffectiveType = 'slow-2g' | '2g' | '3g' | '4g'

/**
 * 网络状态
 */
export interface NetworkState {
  /** 是否在线 */
  online: boolean
  /** 连接类型 */
  connectionType: ConnectionType
  /** 有效连接类型（估算） */
  effectiveType: EffectiveType
  /** 估算带宽（Mbps） */
  downlink: number
  /** 往返时间（ms） */
  rtt: number
  /** 是否省电模式 */
  saveData: boolean
  /** 最后更新时间 */
  lastUpdate: number
}

/**
 * 网络质量等级
 */
export enum NetworkQuality {
  VerySlow = 'very-slow',
  Slow = 'slow',
  Medium = 'medium',
  Fast = 'fast',
  VeryFast = 'very-fast',
}

/**
 * 预加载配置（基于网络状态）
 */
export interface PreloadConfig {
  /** 预加载片段数量 */
  preloadCount: number
  /** 并发下载数 */
  concurrency: number
  /** 视频质量优先级 */
  qualityPriority: 'low' | 'medium' | 'high' | 'auto'
  /** 是否启用预加载 */
  enabled: boolean
}

/**
 * 网络事件类型
 */
export type NetworkEventType = 'online' | 'offline' | 'change' | 'quality-up' | 'quality-down' | 'bandwidth-update'

/**
 * 网络事件监听器
 */
export type NetworkEventListener = (state: NetworkState, event: NetworkEventType) => void

/**
 * 默认网络状态
 */
const DEFAULT_NETWORK_STATE: NetworkState = {
  online: navigator.onLine,
  connectionType: 'unknown',
  effectiveType: '4g',
  downlink: 10,
  rtt: 100,
  saveData: false,
  lastUpdate: Date.now(),
}

/**
 * 网络监控器
 */
class NetworkMonitor {
  private state: NetworkState = { ...DEFAULT_NETWORK_STATE }
  private listeners: Map<NetworkEventType, Set<NetworkEventListener>> = new Map()
  private bandwidthHistory: Array<{ timestamp: number; bandwidth: number }> = []
  private qualityHistory: NetworkQuality[] = []
  private currentQuality: NetworkQuality = NetworkQuality.Fast
  private updateInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.initialize()
  }

  /**
   * 初始化网络监控
   */
  private initialize(): void {
    // 初始化事件监听器映射
    const eventTypes: NetworkEventType[] = ['online', 'offline', 'change', 'quality-up', 'quality-down', 'bandwidth-update']
    eventTypes.forEach((type) => {
      this.listeners.set(type, new Set())
    })

    // 监听在线/离线事件
    window.addEventListener('online', this.handleOnline)
    window.addEventListener('offline', this.handleOffline)

    // 监听网络变化事件
    this.setupNetworkInformationListener()

    // 初始状态更新
    this.updateNetworkState()

    // 定期更新带宽历史
    this.startBandwidthMonitoring()

    logger.log('[NetworkMonitor] Initialized', this.state)
  }

  /**
   * 设置网络信息监听器
   */
  private setupNetworkInformationListener(): void {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection

    if (connection) {
      connection.addEventListener('change', this.handleNetworkChange)

      // 初始化连接类型
      this.updateFromNetworkInformation(connection)
    } else {
      logger.warn('[NetworkMonitor] Network Information API not supported')
    }
  }

  /**
   * 从 Network Information API 更新状态
   */
  private updateFromNetworkInformation(connection: any): void {
    this.state.connectionType = connection.type || 'unknown'
    this.state.effectiveType = connection.effectiveType || '4g'
    this.state.downlink = connection.downlink || 10
    this.state.rtt = connection.rtt || 100
    this.state.saveData = connection.saveData || false
    this.state.lastUpdate = Date.now()

    this.updateNetworkQuality()
  }

  /**
   * 在线事件处理
   */
  private handleOnline = (): void => {
    this.state.online = true
    this.state.lastUpdate = Date.now()
    this.emit('online', this.state)
    logger.log('[NetworkMonitor] Online', this.state)
  }

  /**
   * 离线事件处理
   */
  private handleOffline = (): void => {
    this.state.online = false
    this.state.lastUpdate = Date.now()
    this.emit('offline', this.state)
    logger.log('[NetworkMonitor] Offline', this.state)
  }

  /**
   * 网络变化事件处理
   */
  private handleNetworkChange = (): void => {
    const oldQuality = this.currentQuality
    this.updateNetworkState()
    const newQuality = this.currentQuality

    this.emit('change', this.state)

    if (oldQuality !== newQuality) {
      if (this.compareQuality(oldQuality, newQuality) < 0) {
        this.emit('quality-up', this.state)
        logger.log('[NetworkMonitor] Quality improved', oldQuality, '→', newQuality)
      } else {
        this.emit('quality-down', this.state)
        logger.log('[NetworkMonitor] Quality degraded', oldQuality, '→', newQuality)
      }
    }
  }

  /**
   * 更新网络状态
   */
  private updateNetworkState(): void {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection

    if (connection) {
      this.updateFromNetworkInformation(connection)
    } else {
      // 如果不支持 Network Information API，使用默认值
      this.state.online = navigator.onLine
      this.state.lastUpdate = Date.now()
    }

    this.updateNetworkQuality()
  }

  /**
   * 计算网络质量等级
   */
  private updateNetworkQuality(): void {
    let quality: NetworkQuality

    const { downlink, effectiveType, saveData } = this.state

    // 省电模式下降低质量
    if (saveData) {
      quality = NetworkQuality.Slow
    } else {
      // 根据有效类型和带宽判断质量
      switch (effectiveType) {
        case 'slow-2g':
          quality = NetworkQuality.VerySlow
          break
        case '2g':
          quality = NetworkQuality.Slow
          break
        case '3g':
          quality = NetworkQuality.Medium
          break
        case '4g':
          // 进一步细分 4g
          if (downlink < 2) {
            quality = NetworkQuality.Slow
          } else if (downlink < 5) {
            quality = NetworkQuality.Medium
          } else if (downlink < 10) {
            quality = NetworkQuality.Fast
          } else {
            quality = NetworkQuality.VeryFast
          }
          break
        default:
          // 根据带宽判断
          if (downlink < 1) {
            quality = NetworkQuality.VerySlow
          } else if (downlink < 2) {
            quality = NetworkQuality.Slow
          } else if (downlink < 5) {
            quality = NetworkQuality.Medium
          } else if (downlink < 10) {
            quality = NetworkQuality.Fast
          } else {
            quality = NetworkQuality.VeryFast
          }
      }
    }

    // 记录质量历史
    this.qualityHistory.push(quality)
    if (this.qualityHistory.length > 10) {
      this.qualityHistory.shift()
    }

    this.currentQuality = quality
  }

  /**
   * 比较网络质量
   * @returns -1: quality1 < quality2, 0: quality1 == quality2, 1: quality1 > quality2
   */
  private compareQuality(quality1: NetworkQuality, quality2: NetworkQuality): number {
    const order = [NetworkQuality.VerySlow, NetworkQuality.Slow, NetworkQuality.Medium, NetworkQuality.Fast, NetworkQuality.VeryFast]
    const index1 = order.indexOf(quality1)
    const index2 = order.indexOf(quality2)

    if (index1 < index2) return -1
    if (index1 > index2) return 1
    return 0
  }

  /**
   * 开始带宽监控
   */
  private startBandwidthMonitoring(): void {
    // 每分钟记录一次带宽信息
    this.updateInterval = setInterval(() => {
      this.bandwidthHistory.push({
        timestamp: Date.now(),
        bandwidth: this.state.downlink,
      })

      // 只保留最近 10 条记录
      if (this.bandwidthHistory.length > 10) {
        this.bandwidthHistory.shift()
      }

      this.emit('bandwidth-update', this.state)
    }, 60000)
  }

  /**
   * 发送事件
   */
  private emit(event: NetworkEventType, state: NetworkState): void {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(state, event)
        } catch (error) {
          logger.error('[NetworkMonitor] Error in event listener:', error)
        }
      })
    }
  }

  /**
   * 添加事件监听器
   */
  addEventListener(event: NetworkEventType, listener: NetworkEventListener): void {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.add(listener)
    }
  }

  /**
   * 移除事件监听器
   */
  removeEventListener(event: NetworkEventType, listener: NetworkEventListener): void {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.delete(listener)
    }
  }

  /**
   * 获取当前网络状态
   */
  getState(): NetworkState {
    return { ...this.state }
  }

  /**
   * 获取当前网络质量
   */
  getQuality(): NetworkQuality {
    return this.currentQuality
  }

  /**
   * 获取平均带宽（基于历史记录）
   */
  getAverageBandwidth(): number {
    if (this.bandwidthHistory.length === 0) {
      return this.state.downlink
    }

    const sum = this.bandwidthHistory.reduce((acc, record) => acc + record.bandwidth, 0)
    return sum / this.bandwidthHistory.length
  }

  /**
   * 根据网络质量获取预加载配置
   */
  getPreloadConfig(): PreloadConfig {
    const quality = this.currentQuality
    const online = this.state.online

    // 离线时禁用预加载
    if (!online) {
      return {
        preloadCount: 0,
        concurrency: 1,
        qualityPriority: 'low',
        enabled: false,
      }
    }

    // 根据网络质量返回不同的配置
    switch (quality) {
      case NetworkQuality.VerySlow:
        return {
          preloadCount: 1,
          concurrency: 1,
          qualityPriority: 'low',
          enabled: true,
        }
      case NetworkQuality.Slow:
        return {
          preloadCount: 2,
          concurrency: 1,
          qualityPriority: 'low',
          enabled: true,
        }
      case NetworkQuality.Medium:
        return {
          preloadCount: 3,
          concurrency: 2,
          qualityPriority: 'medium',
          enabled: true,
        }
      case NetworkQuality.Fast:
        return {
          preloadCount: 5,
          concurrency: 3,
          qualityPriority: 'high',
          enabled: true,
        }
      case NetworkQuality.VeryFast:
        return {
          preloadCount: 8,
          concurrency: 4,
          qualityPriority: 'high',
          enabled: true,
        }
      default:
        return {
          preloadCount: 3,
          concurrency: 2,
          qualityPriority: 'auto',
          enabled: true,
        }
    }
  }

  /**
   * 获取网络状态描述（用于 UI 显示）
   */
  getStateDescription(): string {
    const { online, effectiveType, downlink } = this.state

    if (!online) {
      return '离线'
    }

    const quality = this.currentQuality
    const qualityText = {
      [NetworkQuality.VerySlow]: '网络极慢',
      [NetworkQuality.Slow]: '网络较慢',
      [NetworkQuality.Medium]: '网络一般',
      [NetworkQuality.Fast]: '网络良好',
      [NetworkQuality.VeryFast]: '网络极佳',
    }

    return `${qualityText[quality]} (${downlink} Mbps)`
  }

  /**
   * 测试网络速度
   */
  async testBandwidth(): Promise<number> {
    const startTime = Date.now()
    const _testFileSize = 1024 * 1024 // 1MB

    try {
      // 使用一个小文件测试网络速度
      const response = await fetch(`https://www.google.com/favicon.ico?t=${Date.now()}`, {
        cache: 'no-cache',
        mode: 'cors',
      })
      const blob = await response.blob()
      const duration = (Date.now() - startTime) / 1000 // 秒
      const fileSizeInBits = blob.size * 8
      const bandwidth = fileSizeInBits / duration / 1000000 // Mbps

      logger.log('[NetworkMonitor] Bandwidth test result:', bandwidth, 'Mbps')
      return bandwidth
    } catch (error) {
      logger.warn('[NetworkMonitor] Bandwidth test failed:', error)
      return this.state.downlink
    }
  }

  /**
   * 销毁监控器
   */
  destroy(): void {
    // 移除事件监听器
    window.removeEventListener('online', this.handleOnline)
    window.removeEventListener('offline', this.handleOffline)

    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection
    if (connection) {
      connection.removeEventListener('change', this.handleNetworkChange)
    }

    // 清除定时器
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }

    // 清空监听器
    this.listeners.forEach((listeners) => listeners.clear())
    this.listeners.clear()

    logger.log('[NetworkMonitor] Destroyed')
  }
}

/**
 * 创建网络监控器实例
 */
export function createNetworkMonitor(): NetworkMonitor {
  return new NetworkMonitor()
}

/**
 * 单例实例
 */
let networkMonitorInstance: NetworkMonitor | null = null

/**
 * 获取网络监控器单例
 */
export function getNetworkMonitor(): NetworkMonitor {
  if (!networkMonitorInstance) {
    networkMonitorInstance = createNetworkMonitor()
  }
  return networkMonitorInstance
}

/**
 * 工具函数：根据网络状态判断是否应该加载高质量视频
 */
export function shouldLoadHighQuality(state: NetworkState): boolean {
  return state.online && state.downlink >= 5 && !state.saveData
}

/**
 * 工具函数：根据网络状态获取推荐的视频质量
 */
export function getRecommendedQuality(state: NetworkState): 'low' | 'medium' | 'high' {
  if (!state.online || state.saveData || state.downlink < 2) {
    return 'low'
  }
  if (state.downlink < 5) {
    return 'medium'
  }
  return 'high'
}
