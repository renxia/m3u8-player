/**
 * 播放失败自动降级策略
 * 实现 HLS → MP4 → 备用源的自动降级机制
 */

import type { PlayerType, VideoType } from '@/types'
import { logger } from '@/utils/logger'

/**
 * 播放选项
 */
export interface PlayOptions {
  /** 视频 URL */
  url: string
  /** 自定义类型 */
  customType?: string
  /** 播放器类型 */
  playerType: PlayerType
  /** 备用源列表（降级使用） */
  fallbackUrls?: string[]
  /** 最大重试次数 */
  maxRetries?: number
  /** 降级策略 */
  fallbackStrategy?: FallbackStrategy
  /** 回调函数 */
  onFallback?: (attempt: FallbackAttempt) => void
  /** 播放结束回调 */
  onEnd?: (url: string) => void
}

/**
 * 降级策略
 */
export interface FallbackStrategy {
  /** 是否启用自动降级 */
  enabled: boolean
  /** 是否允许格式降级（HLS → MP4） */
  allowFormatFallback: boolean
  /** 是否允许播放器降级（ArtPlayer → DPlayer） */
  allowPlayerFallback: boolean
  /** 是否使用备用源 */
  useFallbackUrls: boolean
  /** 降级延迟（毫秒） */
  fallbackDelay: number
}

/**
 * 降级尝试记录
 */
export interface FallbackAttempt {
  /** 尝试次数 */
  attempt: number
  /** 当前 URL */
  url: string
  /** 当前视频类型 */
  videoType: VideoType
  /** 当前播放器类型 */
  playerType: PlayerType
  /** 降级原因 */
  reason: string
  /** 降级策略 */
  strategy: 'format' | 'player' | 'fallback-url' | 'retry'
  /** 时间戳 */
  timestamp: number
}

/**
 * 默认降级策略
 */
const DEFAULT_FALLBACK_STRATEGY: FallbackStrategy = {
  enabled: true,
  allowFormatFallback: true,
  allowPlayerFallback: true,
  useFallbackUrls: true,
  fallbackDelay: 1000,
}

/**
 * 降级管理器
 */
class ResilientPlayerManager {
  private fallbackAttempts: FallbackAttempt[] = []
  private currentAttempt = 0
  private strategy: FallbackStrategy

  constructor(strategy?: Partial<FallbackStrategy>) {
    this.strategy = { ...DEFAULT_FALLBACK_STRATEGY, ...strategy }
  }

  /**
   * 记录降级尝试
   */
  private recordAttempt(attempt: FallbackAttempt): void {
    this.fallbackAttempts.push(attempt)
    this.currentAttempt = attempt.attempt
    logger.warn('[ResilientPlayer] Fallback attempt:', attempt)
  }

  /**
   * 获取降级历史
   */
  getFallbackAttempts(): FallbackAttempt[] {
    return [...this.fallbackAttempts]
  }

  /**
   * 清空降级历史
   */
  clearFallbackAttempts(): void {
    this.fallbackAttempts = []
    this.currentAttempt = 0
  }

  /**
   * 获取当前尝试次数
   */
  getCurrentAttempt(): number {
    return this.currentAttempt
  }

  /**
   * 处理播放失败，返回下一个播放选项
   */
  async handlePlaybackError(options: PlayOptions, videoType: VideoType, error: Error): Promise<PlayOptions | null> {
    const { url, playerType, fallbackUrls = [], maxRetries = 3, fallbackStrategy, onFallback } = options

    // 检查是否启用降级
    const strategy = { ...this.strategy, ...fallbackStrategy }
    if (!strategy.enabled || this.currentAttempt >= maxRetries) {
      logger.error('[ResilientPlayer] Max retries reached or fallback disabled')
      return null
    }

    const nextAttempt = this.currentAttempt + 1

    // 确定降级策略
    const attemptResult = await this.determineFallbackStrategy(nextAttempt, url, videoType, playerType, fallbackUrls, error, strategy)

    if (!attemptResult) {
      return null
    }

    const { url: nextUrl, videoType: nextVideoType, playerType: nextPlayerType, strategy: fallbackType } = attemptResult

    // 记录降级尝试
    const fallbackAttempt: FallbackAttempt = {
      attempt: nextAttempt,
      url: nextUrl,
      videoType: nextVideoType,
      playerType: nextPlayerType,
      reason: error.message || 'Playback error',
      strategy: fallbackType,
      timestamp: Date.now(),
    }
    this.recordAttempt(fallbackAttempt)

    // 通知回调
    onFallback?.(fallbackAttempt)

    // 延迟后返回新选项
    if (strategy.fallbackDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, strategy.fallbackDelay))
    }

    return {
      ...options,
      url: nextUrl,
      playerType: nextPlayerType,
    }
  }

  /**
   * 确定降级策略
   */
  private async determineFallbackStrategy(
    attempt: number,
    url: string,
    videoType: VideoType,
    playerType: PlayerType,
    fallbackUrls: string[],
    error: Error,
    strategy: FallbackStrategy,
  ): Promise<{
    url: string
    videoType: VideoType
    playerType: PlayerType
    strategy: 'format' | 'player' | 'fallback-url' | 'retry'
  } | null> {
    const errorMsg = error.message.toLowerCase()
    const isNetworkError = errorMsg.includes('network') || errorMsg.includes('timeout') || errorMsg.includes('fetch')
    const isFormatError = errorMsg.includes('format') || errorMsg.includes('unsupported') || errorMsg.includes('hls')

    // 策略 1: 格式降级 (HLS → MP4)
    if (strategy.allowFormatFallback && attempt === 1 && isFormatError) {
      const nextVideoType = this.getFormatFallbackType(videoType, url)
      if (nextVideoType !== videoType) {
        logger.log('[ResilientPlayer] Using format fallback:', videoType, '→', nextVideoType)
        return {
          url,
          videoType: nextVideoType,
          playerType,
          strategy: 'format',
        }
      }
    }

    // 策略 2: 播放器降级 (ArtPlayer → DPlayer)
    if (strategy.allowPlayerFallback && attempt === 2) {
      const nextPlayerType = playerType === 'artplayer' ? 'dplayer' : 'artplayer'
      logger.log('[ResilientPlayer] Using player fallback:', playerType, '→', nextPlayerType)
      return {
        url,
        videoType,
        playerType: nextPlayerType,
        strategy: 'player',
      }
    }

    // 策略 3: 备用源降级
    if (strategy.useFallbackUrls && fallbackUrls.length > 0) {
      const fallbackIndex = Math.min(attempt - 1, fallbackUrls.length - 1)
      const fallbackUrl = fallbackUrls[fallbackIndex]
      if (fallbackUrl && fallbackUrl !== url) {
        logger.log('[ResilientPlayer] Using fallback URL:', fallbackUrl)
        return {
          url: fallbackUrl,
          videoType: this.detectVideoType(fallbackUrl),
          playerType,
          strategy: 'fallback-url',
        }
      }
    }

    // 策略 4: 重试原 URL（仅限网络错误）
    if (isNetworkError) {
      logger.log('[ResilientPlayer] Retrying due to network error')
      return {
        url,
        videoType,
        playerType,
        strategy: 'retry',
      }
    }

    logger.error('[ResilientPlayer] No available fallback strategy')
    return null
  }

  /**
   * 获取格式降级类型
   */
  private getFormatFallbackType(videoType: VideoType, url: string): VideoType {
    // HLS → MP4
    if (videoType === 'customHls' || videoType === 'hls' || videoType === 'm3u8') {
      // 尝试将 .m3u8 URL 转换为 .mp4
      if (url.includes('.m3u8')) {
        return 'mp4'
      }
    }

    // FLV → MP4
    if (videoType === 'customFlv' || videoType === 'flv') {
      return 'mp4'
    }

    return videoType
  }

  /**
   * 检测视频类型（简化版）
   */
  private detectVideoType(url: string): VideoType {
    if (url.includes('.m3u8')) return 'm3u8'
    if (url.includes('.mp4')) return 'mp4'
    if (url.includes('.flv')) return 'flv'
    return 'auto'
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.clearFallbackAttempts()
  }
}

/**
 * 创建降级播放器管理器
 */
export function createResilientPlayer(strategy?: Partial<FallbackStrategy>): ResilientPlayerManager {
  return new ResilientPlayerManager(strategy)
}

/**
 * 错误分类工具
 */
export class ErrorClassifier {
  /**
   * 判断是否为网络错误
   */
  static isNetworkError(error: Error): boolean {
    const msg = error.message.toLowerCase()
    return msg.includes('network') || msg.includes('timeout') || msg.includes('fetch') || msg.includes('abort')
  }

  /**
   * 判断是否为格式错误
   */
  static isFormatError(error: Error): boolean {
    const msg = error.message.toLowerCase()
    return msg.includes('format') || msg.includes('unsupported') || msg.includes('hls') || msg.includes('codec') || msg.includes('decode')
  }

  /**
   * 判断是否为源错误
   */
  static isSourceError(error: Error): boolean {
    const msg = error.message.toLowerCase()
    return msg.includes('404') || msg.includes('403') || msg.includes('not found') || msg.includes('forbidden')
  }

  /**
   * 判断是否可重试
   */
  static isRetriable(error: Error): boolean {
    return ErrorClassifier.isNetworkError(error) || ErrorClassifier.isFormatError(error)
  }

  /**
   * 获取错误友好提示
   */
  static getUserFriendlyMessage(error: Error): string {
    if (ErrorClassifier.isNetworkError(error)) {
      return '网络连接失败，请检查网络设置'
    }
    if (ErrorClassifier.isFormatError(error)) {
      return '视频格式不支持，正在尝试其他播放方式'
    }
    if (ErrorClassifier.isSourceError(error)) {
      return '视频源不可用，请检查视频地址'
    }
    return '播放失败，请重试'
  }
}

/**
 * 降级统计
 */
export class FallbackStats {
  private stats: Map<string, { count: number; lastAttempt: number }> = new Map()

  /**
   * 记录降级
   */
  record(url: string): void {
    const existing = this.stats.get(url) || { count: 0, lastAttempt: 0 }
    this.stats.set(url, {
      count: existing.count + 1,
      lastAttempt: Date.now(),
    })
  }

  /**
   * 获取降级次数
   */
  getCount(url: string): number {
    return this.stats.get(url)?.count || 0
  }

  /**
   * 获取最后降级时间
   */
  getLastAttempt(url: string): number {
    return this.stats.get(url)?.lastAttempt || 0
  }

  /**
   * 获取所有降级统计
   */
  getAllStats(): Map<string, { count: number; lastAttempt: number }> {
    return new Map(this.stats)
  }

  /**
   * 清空统计
   */
  clear(): void {
    this.stats.clear()
  }
}
