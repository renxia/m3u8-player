/**
 * 预加载器
 * 支持自动预加载和手动预加载 TS 片段
 * 集成网络状态感知，实现自适应预加载
 * 集成资源监控，实现资源不足时的优雅降级
 */

import { cacheConfigManager } from './cacheConfigManager'
import { getCurrentCacheAdapter } from './cacheAdapter'
import { fetchAndParseM3U8, getSegmentsInRange, type TSSegment } from './m3u8Parser'
import { logger } from '@/utils/logger'
import { downloadManager, DownloadPriority } from './downloadManager'
import { getNetworkMonitor } from '@/lib/network/networkMonitor'
import { getResourceMonitor } from '@/lib/resource/resourceMonitor'
import { getSmartPreloader } from './smartPreloader'

/** 预加载进度回调 */
export interface PreloadProgress {
  /** 已完成数量 */
  loaded: number
  /** 总数量 */
  total: number
  /** 当前下载的 URL */
  currentUrl: string
  /** 已下载字节数 */
  loadedBytes: number
  /** 进度百分比 (0-100) */
  percent: number
}

/** 预加载选项 */
export interface PreloadOptions {
  /** 并发下载数 */
  concurrency?: number
  /** 进度回调 */
  onProgress?: (progress: PreloadProgress) => void
  /** 完成回调 */
  onComplete?: () => void
  /** 错误回调 */
  onError?: (error: Error) => void
  /** 中止信号 */
  signal?: AbortSignal
}

/** 预加载状态 */
export type PreloadStatus = 'idle' | 'loading' | 'paused' | 'completed' | 'error'

class Preloader {
  private currentM3U8Url = ''
  private segments: TSSegment[] = []
  private status: PreloadStatus = 'idle'
  private abortController: AbortController | null = null
  private autoPreloadTimer: ReturnType<typeof setTimeout> | null = null
  private networkMonitor = getNetworkMonitor()
  private resourceMonitor = getResourceMonitor()
  private smartPreloader = getSmartPreloader()

  /**
   * 获取当前预加载状态
   */
  getStatus(): PreloadStatus {
    return this.status
  }

  /**
   * 获取当前 M3U8 URL
   */
  getCurrentM3U8Url(): string {
    return this.currentM3U8Url
  }

  /**
   * 获取当前片段列表
   */
  getSegments(): TSSegment[] {
    return this.segments
  }

  /**
   * 获取自适应预加载配置
   * 结合用户配置、网络状态、资源状态和智能预测动态调整
   */
  private getAdaptivePreloadConfig(): { preloadCount: number; concurrency: number } {
    const userConfig = cacheConfigManager.getPreloadConfig()
    const networkConfig = this.networkMonitor.getPreloadConfig()
    const isDegraded = this.resourceMonitor.isDegradationActive()

    // 如果资源降级已激活或网络监控建议禁用预加载，则禁用
    if (!networkConfig.enabled || (isDegraded && this.resourceMonitor.shouldDisablePreload())) {
      return { preloadCount: 0, concurrency: 1 }
    }

    // 取用户配置和网络配置的较小值
    let preloadCount = Math.min(userConfig.preloadCount, networkConfig.preloadCount)
    let concurrency = Math.min(userConfig.preloadConcurrency, networkConfig.concurrency)

    // 应用智能预加载策略
    const smartStrategy = this.smartPreloader.getPreloadStrategy(preloadCount, concurrency)
    preloadCount = smartStrategy.preloadCount
    concurrency = smartStrategy.concurrency

    return { preloadCount, concurrency }
  }

  /**
   * 解析 M3U8 并准备预加载
   */
  async prepare(m3u8Url: string): Promise<TSSegment[]> {
    this.currentM3U8Url = m3u8Url
    const result = await fetchAndParseM3U8(m3u8Url)
    this.segments = result.segments
    return this.segments
  }

  /**
   * 手动预加载所有片段
   */
  async preloadAll(m3u8Url: string, options: PreloadOptions = {}): Promise<void> {
    const adapter = getCurrentCacheAdapter()
    if (!adapter.isEnabled()) {
      logger.log('[Preloader] Cache is disabled, skipping preload')
      return
    }

    // 检查是否已有预加载任务在运行
    if (!this.acquirePreloadLock()) {
      logger.log('[Preloader] Another preload task is running, skipping')
      return
    }

    this.stop() // 停止之前的预加载

    this.abortController = new AbortController()
    const signal = options.signal || this.abortController.signal

    try {
      this.status = 'loading'

      // 解析 M3U8 获取片段列表
      if (m3u8Url !== this.currentM3U8Url || this.segments.length === 0) {
        await this.prepare(m3u8Url)
      }

      // 使用自适应预加载配置
      const adaptiveConfig = this.getAdaptivePreloadConfig()
      const concurrency = options.concurrency || adaptiveConfig.concurrency

      await this.preloadSegments(this.segments, m3u8Url, { ...options, signal, concurrency })

      this.status = 'completed'
      options.onComplete?.()
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        this.status = 'paused'
      } else {
        this.status = 'error'
        options.onError?.(error as Error)
      }
    } finally {
      this.releasePreloadLock()
    }
  }

  /**
   * 预加载指定范围的片段
   */
  async preloadRange(m3u8Url: string, startIndex: number, count: number, options: PreloadOptions = {}): Promise<void> {
    const adapter = getCurrentCacheAdapter()
    if (!adapter.isEnabled()) return

    // 解析 M3U8 获取片段列表
    if (m3u8Url !== this.currentM3U8Url || this.segments.length === 0) {
      await this.prepare(m3u8Url)
    }

    const segmentsToLoad = getSegmentsInRange(this.segments, startIndex, count)
    await this.preloadSegments(segmentsToLoad, m3u8Url, options)
  }

  /**
   * 自动预加载（播放时预缓存后续片段）
   * 使用较低的并发数，避免与播放器竞争资源
   * 根据网络状态自适应调整预加载策略
   */
  startAutoPreload(m3u8Url: string, currentIndex: number): void {
    const adapter = getCurrentCacheAdapter()
    if (!adapter.isEnabled()) return

    // 使用自适应预加载配置
    const adaptiveConfig = this.getAdaptivePreloadConfig()

    // 清除之前的定时器
    if (this.autoPreloadTimer) {
      clearTimeout(this.autoPreloadTimer)
    }

    // 延迟 500ms 开始预加载，避免影响当前播放
    // 使用较低的并发数（1-2），避免与播放器竞争网络和存储资源
    this.autoPreloadTimer = setTimeout(() => {
      const reducedConcurrency = Math.max(1, Math.floor(adaptiveConfig.concurrency / 2))
      this.preloadRange(m3u8Url, currentIndex + 1, adaptiveConfig.preloadCount, {
        concurrency: reducedConcurrency,
      }).catch((err) => {
        logger.warn('[Preloader] Auto preload error:', err)
      })
    }, 500)
  }

  /**
   * 停止预加载
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
    if (this.autoPreloadTimer) {
      clearTimeout(this.autoPreloadTimer)
      this.autoPreloadTimer = null
    }
    this.status = 'idle'
  }

  /**
   * 暂停预加载
   */
  pause(): void {
    if (this.status === 'loading') {
      this.abortController?.abort()
      this.status = 'paused'
    }
  }

  /**
   * 恢复预加载
   */
  async resume(options: PreloadOptions = {}): Promise<void> {
    if (this.status !== 'paused' || !this.currentM3U8Url) return

    // 检查是否已有预加载任务在运行
    if (!this.acquirePreloadLock()) {
      logger.warn('[Preloader] Another preload task is running, cannot resume')
      return
    }

    try {
      const adapter = getCurrentCacheAdapter()
      // 找到第一个未缓存的片段（优化性能：批量查询）
      const segmentUrls = this.segments.map((s) => s.url)
      const cachedUrls = await adapter.hasMany(segmentUrls)
      const startIndex = segmentUrls.findIndex(d => !cachedUrls.has(d))
      
      // 从该位置继续预加载
      const remainingSegments = this.segments.slice(startIndex)
      if (remainingSegments.length > 0) {
        this.abortController = new AbortController()
        this.status = 'loading'

        try {
          await this.preloadSegments(remainingSegments, this.currentM3U8Url, {
            ...options,
            signal: this.abortController.signal,
          })
          this.status = 'completed'
          options.onComplete?.()
        } catch (error) {
          if ((error as Error).name === 'AbortError') {
            this.status = 'paused'
          } else {
            this.status = 'error'
            options.onError?.(error as Error)
          }
        }
      }
    } finally {
      this.releasePreloadLock()
    }
  }

  /** 预加载任务锁 */
  private preloadTaskLock = false

  /**
   * 获取预加载任务锁
   */
  private acquirePreloadLock(): boolean {
    if (this.preloadTaskLock) {
      return false
    }
    this.preloadTaskLock = true
    return true
  }

  /**
   * 释放预加载任务锁
   */
  private releasePreloadLock(): void {
    this.preloadTaskLock = false
  }

  /**
   * 预加载片段列表（内部方法）
   */
  private async preloadSegments(segments: TSSegment[], m3u8Url: string, options: PreloadOptions = {}): Promise<void> {
    const { concurrency = cacheConfigManager.getPreloadConfig().preloadConcurrency, onProgress, signal } = options
    const adapter = getCurrentCacheAdapter()

    let loaded = 0
    let loadedBytes = 0
    const total = segments.length

    // 批量过滤已缓存的片段（优化性能）
    const segmentUrls = segments.map((s) => s.url)
    const cachedUrls = await adapter.hasMany(segmentUrls)

    const uncachedSegments: TSSegment[] = []
    for (const segment of segments) {
      if (cachedUrls.has(segment.url)) {
        loaded++
      } else {
        uncachedSegments.push(segment)
      }
    }

    if (uncachedSegments.length === 0) {
      onProgress?.({
        loaded: total,
        total,
        currentUrl: '',
        loadedBytes: 0,
        percent: 100,
      })
      return
    }

    // 并发下载队列
    const queue = [...uncachedSegments]
    const activePromises: Promise<void>[] = []

    const downloadNext = async (): Promise<void> => {
      while (queue.length > 0) {
        if (signal?.aborted) {
          throw new DOMException('Preload aborted', 'AbortError')
        }

        const segment = queue.shift()
        if (!segment) break

        try {
          // 使用下载管理器下载（较低优先级）
          const data = await downloadManager.download(segment.url, DownloadPriority.PRELOAD, signal)

          await adapter.set(segment.url, data, m3u8Url)

          loaded++
          loadedBytes += data.byteLength

          onProgress?.({
            loaded,
            total,
            currentUrl: segment.url,
            loadedBytes,
            percent: Math.round((loaded / total) * 100),
          })
        } catch (error) {
          if ((error as Error).name === 'AbortError') {
            throw error
          }
          logger.warn(`[Preloader] Error loading ${segment.url}:`, error)
        }
      }
    }

    // 启动并发下载
    for (let i = 0; i < Math.min(concurrency, uncachedSegments.length); i++) {
      activePromises.push(downloadNext())
    }

    await Promise.all(activePromises)
  }

  /**
   * 获取预加载进度
   */
  async getProgress(m3u8Url?: string): Promise<PreloadProgress> {
    const url = m3u8Url || this.currentM3U8Url
    if (!url || this.segments.length === 0) {
      return { loaded: 0, total: 0, currentUrl: '', loadedBytes: 0, percent: 0 }
    }

    const adapter = getCurrentCacheAdapter()
    // 批量查询已缓存的片段（性能优化：一次查询替代多次查询）
    const segmentUrls = this.segments.map((s) => s.url)
    const cachedUrls = await adapter.hasMany(segmentUrls)

    const total = segmentUrls.length
    const loaded = cachedUrls.size

    return {
      loaded,
      total,
      currentUrl: '',
      loadedBytes: 0,
      percent: total > 0 ? Math.round((loaded / total) * 100) : 0,
    }
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.stop()
    this.segments = []
    this.currentM3U8Url = ''
  }
}

/** 导出单例实例 */
export const preloader = new Preloader()
