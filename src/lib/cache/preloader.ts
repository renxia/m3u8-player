/**
 * 预加载器
 * 支持自动预加载和手动预加载 TS 片段
 */

import { cacheManager } from './cacheManager'
import { fetchAndParseM3U8, getSegmentsInRange, type TSSegment } from './m3u8Parser'

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
    if (!cacheManager.isEnabled()) {
      console.log('[Preloader] Cache is disabled, skipping preload')
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

      await this.preloadSegments(this.segments, m3u8Url, { ...options, signal })

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

  /**
   * 预加载指定范围的片段
   */
  async preloadRange(m3u8Url: string, startIndex: number, count: number, options: PreloadOptions = {}): Promise<void> {
    if (!cacheManager.isEnabled()) return

    // 解析 M3U8 获取片段列表
    if (m3u8Url !== this.currentM3U8Url || this.segments.length === 0) {
      await this.prepare(m3u8Url)
    }

    const segmentsToLoad = getSegmentsInRange(this.segments, startIndex, count)
    await this.preloadSegments(segmentsToLoad, m3u8Url, options)
  }

  /**
   * 自动预加载（播放时预缓存后续片段）
   */
  startAutoPreload(m3u8Url: string, currentIndex: number): void {
    if (!cacheManager.isEnabled()) return

    const config = cacheManager.getConfig()
    const { preloadCount } = config

    // 清除之前的定时器
    if (this.autoPreloadTimer) {
      clearTimeout(this.autoPreloadTimer)
    }

    // 延迟 500ms 开始预加载，避免影响当前播放
    this.autoPreloadTimer = setTimeout(() => {
      this.preloadRange(m3u8Url, currentIndex + 1, preloadCount, {
        concurrency: config.preloadConcurrency,
      }).catch((err) => {
        console.warn('[Preloader] Auto preload error:', err)
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

    // 找到第一个未缓存的片段
    let startIndex = 0
    for (let i = 0; i < this.segments.length; i++) {
      const cached = await cacheManager.has(this.segments[i].url)
      if (!cached) {
        startIndex = i
        break
      }
    }

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
  }

  /**
   * 预加载片段列表（内部方法）
   */
  private async preloadSegments(segments: TSSegment[], m3u8Url: string, options: PreloadOptions = {}): Promise<void> {
    const { concurrency = cacheManager.getConfig().preloadConcurrency, onProgress, signal } = options

    let loaded = 0
    let loadedBytes = 0
    const total = segments.length

    // 批量过滤已缓存的片段（优化性能）
    const segmentUrls = segments.map((s) => s.url)
    const cachedUrls = await cacheManager.hasMany(segmentUrls)

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
          const response = await fetch(segment.url, { signal })
          if (!response.ok) {
            console.warn(`[Preloader] Failed to fetch ${segment.url}: ${response.status}`)
            continue
          }

          const data = await response.arrayBuffer()
          await cacheManager.set(segment.url, data, m3u8Url)

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
          console.warn(`[Preloader] Error loading ${segment.url}:`, error)
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

    let loaded = 0
    for (const segment of this.segments) {
      const cached = await cacheManager.has(segment.url)
      if (cached) loaded++
    }

    return {
      loaded,
      total: this.segments.length,
      currentUrl: '',
      loadedBytes: 0,
      percent: this.segments.length > 0 ? Math.round((loaded / this.segments.length) * 100) : 0,
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
