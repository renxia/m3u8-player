/**
 * 预加载器
 * 支持自动预加载和手动预加载 TS 片段
 * 集成网络状态感知，实现自适应预加载
 * 集成资源监控，实现资源不足时的优雅降级
 *
 * 设计要点：
 * - 统一任务模型：手动/自动预加载共用同一把任务锁、同一个 AbortController、同一套状态机，
 *   stop()/pause() 对任意预加载任务均可生效；手动任务可抢占自动任务
 * - 事件驱动：状态/进度/URL 变更通过事件推送（负载携带任务 URL），UI 订阅即可，无需轮询
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

/** 预加载任务类型（数值越小优先级越高，用于抢占判断） */
export enum PreloadTaskPriority {
  /** 用户手动全量预加载（最高优先级，不可被抢占） */
  MANUAL = 0,
  /** 拖动播放位置后的预加载（可抢占 auto） */
  SEEK = 1,
  /** 播放时自动预加载后续片段 */
  AUTO = 2,
}

/** 预加载任务类型（兼容旧字段） */
export type PreloadTaskType = 'manual' | 'auto' | 'seek'

/** 预加载任务信息 */
export interface PreloadTaskInfo {
  /** 当前任务状态 */
  status: PreloadStatus
  /** 任务对应的 M3U8 URL（无任务时为最近一次预加载的 URL） */
  url: string
  /** 任务类型（空闲时为 null） */
  type: PreloadTaskType | null
}

/** 预加载事件类型 */
export type PreloadEventType = 'status' | 'progress' | 'urlchange'

/** 预加载事件负载（始终携带任务 URL，便于 UI 按 URL 匹配展示） */
export interface PreloadEventPayload {
  /** 当前任务状态 */
  status: PreloadStatus
  /** 任务对应的 M3U8 URL */
  url: string
  /** 任务类型（空闲时为 null） */
  type: PreloadTaskType | null
  /** 进度信息（仅 progress 事件携带） */
  progress?: PreloadProgress
}

/** 预加载事件监听器 */
export type PreloadEventListener = (event: PreloadEventType, payload: PreloadEventPayload) => void

/** 空的进度对象 */
const EMPTY_PROGRESS: PreloadProgress = { loaded: 0, total: 0, currentUrl: '', loadedBytes: 0, percent: 0 }

class Preloader {
  private currentM3U8Url = ''
  private segments: TSSegment[] = []
  private status: PreloadStatus = 'idle'
  private taskType: PreloadTaskType | null = null
  /** 当前播放位置对应的片段索引（用于优先级排序） */
  private currentSegmentIndex = 0
  /** 当前预加载任务已完成的片段数（用于快速返回进度，避免重复 IO） */
  private preloadLoadedCount = 0
  /** 当前预加载任务的总片段数 */
  private preloadTotalCount = 0
  private abortController: AbortController | null = null
  /** 中止原因：区分 stop 与 pause，使任务 catch 能收敛到正确状态 */
  private abortReason: 'stop' | 'pause' | null = null
  private autoPreloadTimer: ReturnType<typeof setTimeout> | null = null
  /** 预加载任务锁（手动/自动任务共用，保证任意时刻只有一个预加载任务） */
  private preloadTaskLock = false
  private listeners: Set<PreloadEventListener> = new Set()
  private networkMonitor = getNetworkMonitor()
  private resourceMonitor = getResourceMonitor()
  private smartPreloader = getSmartPreloader()

  /**
   * 添加事件监听器
   * @returns 取消订阅函数
   */
  addEventListener(listener: PreloadEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * 触发事件
   */
  private emit(event: PreloadEventType, payload: PreloadEventPayload): void {
    for (const listener of this.listeners) {
      try {
        listener(event, payload)
      } catch (error) {
        logger.error('[Preloader] Event listener error:', error)
      }
    }
  }

  /**
   * 设置任务状态并推送事件
   * @param url 事件携带的任务 URL（默认当前 URL）。任务刚启动、尚未 prepare 时需显式传入，
   *            否则事件携带的是上一个任务的 URL，UI 按 URL 匹配后会把状态判为 idle
   */
  private setStatus(status: PreloadStatus, url: string = this.currentM3U8Url): void {
    if (this.status === status) return
    this.status = status
    this.emit('status', { status, url, type: this.taskType })
  }

  /**
   * 获取当前预加载状态
   */
  getStatus(): PreloadStatus {
    return this.status
  }

  /**
   * 获取当前任务信息（状态 + URL + 类型）
   */
  getTaskInfo(): PreloadTaskInfo {
    return { status: this.status, url: this.currentM3U8Url, type: this.taskType }
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
   * 设置当前播放位置对应的片段索引（用于预加载优先级排序）
   */
  setCurrentSegmentIndex(index: number): void {
    this.currentSegmentIndex = index
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
    const urlChanged = m3u8Url !== this.currentM3U8Url
    this.currentM3U8Url = m3u8Url
    const result = await fetchAndParseM3U8(m3u8Url)
    this.segments = result.segments
    if (urlChanged) {
      this.emit('urlchange', { status: this.status, url: m3u8Url, type: this.taskType })
    }
    return this.segments
  }

  /**
   * 手动预加载所有片段
   * @returns 是否真正启动了预加载（缓存关闭或锁竞争失败时返回 false）
   */
  async preloadAll(m3u8Url: string, options: PreloadOptions = {}): Promise<boolean> {
    return this.runPreloadTask(
      async () => {
        // 解析 M3U8 获取片段列表
        if (m3u8Url !== this.currentM3U8Url || this.segments.length === 0) {
          await this.prepare(m3u8Url)
        }
        return this.segments
      },
      m3u8Url,
      options,
      'manual',
    )
  }

  /**
   * 预加载指定范围的片段
   * @param m3u8Url M3U8 地址
   * @param startIndex 起始片段索引
   * @param count 预加载数量
   * @param options 预加载选项
   * @param taskType 任务类型（auto 或 seek，seek 可抢占 auto）
   * @returns 是否真正启动了预加载
   */
  async preloadRange(
    m3u8Url: string,
    startIndex: number,
    count: number,
    options: PreloadOptions = {},
    taskType: PreloadTaskType = 'auto',
  ): Promise<boolean> {
    return this.runPreloadTask(
      async () => {
        // 解析 M3U8 获取片段列表
        if (m3u8Url !== this.currentM3U8Url || this.segments.length === 0) {
          await this.prepare(m3u8Url)
        }
        return getSegmentsInRange(this.segments, startIndex, count)
      },
      m3u8Url,
      options,
      taskType,
    )
  }

  /**
   * 自动预加载（播放时预缓存后续片段）
   * 使用较低的并发数，避免与播放器竞争资源
   * 根据网络状态自适应调整预加载策略
   */
  startAutoPreload(m3u8Url: string, currentIndex: number, options: PreloadOptions = {}): void {
    const adapter = getCurrentCacheAdapter()
    if (!adapter.isEnabled()) return

    // 当前视频已被手动全量预加载完成，无需再自动预加载
    if (this.status === 'completed' && this.currentM3U8Url === m3u8Url) return

    // 使用自适应预加载配置
    const adaptiveConfig = this.getAdaptivePreloadConfig()

    // 清除之前的定时器
    if (this.autoPreloadTimer) {
      clearTimeout(this.autoPreloadTimer)
    }

    // 延迟 500ms 开始预加载，避免影响当前播放
    // 使用较低的并发数（1-2），避免与播放器竞争网络和存储资源
    this.autoPreloadTimer = setTimeout(() => {
      this.autoPreloadTimer = null
      // 用户已暂停预加载，自动预加载不再启动
      if (this.status === 'paused') return

      const reducedConcurrency = Math.max(1, Math.floor(adaptiveConfig.concurrency / 2))
      this.preloadRange(m3u8Url, currentIndex + 1, adaptiveConfig.preloadCount, {
        concurrency: reducedConcurrency,
        onError: options.onError,
      }).catch((err) => {
        logger.warn('[Preloader] Auto preload error:', err)
      })
    }, 500)
  }

  /**
   * 从指定时间位置开始预加载（用于拖动播放位置后）
   * 会中止当前正在运行的自动预加载任务，优先下载新位置附近的片段
   *
   * @param m3u8Url M3U8 地址
   * @param currentTime 当前播放时间（秒）
   */
  preloadFromSeek(m3u8Url: string, currentTime: number): void {
    if (!getCurrentCacheAdapter().isEnabled()) return

    const config = cacheConfigManager.getPreloadConfig()
    if (config.preloadCount <= 0) return

    // 清除自动预加载定时器，避免旧位置的自动预加载在延迟后启动
    if (this.autoPreloadTimer) {
      clearTimeout(this.autoPreloadTimer)
      this.autoPreloadTimer = null
    }

    // 延迟 300ms 启动，避免频繁拖动时反复重启预加载
    this.autoPreloadTimer = setTimeout(async () => {
      this.autoPreloadTimer = null

      // 确保片段列表已就绪（prepare 会更新 this.segments 和 this.currentM3U8Url）
      if (m3u8Url !== this.currentM3U8Url || this.segments.length === 0) {
        try {
          await this.prepare(m3u8Url)
        } catch (error) {
          logger.warn('[Preloader] Seek preload prepare failed:', error)
          return
        }
      }

      // 时间 → 片段索引（各级别片段时间线一致，直接用当前解析的 segments）
      let segmentIndex = 0
      let accumulated = 0
      for (let i = 0; i < this.segments.length; i++) {
        accumulated += this.segments[i].duration
        if (accumulated > currentTime) {
          segmentIndex = i
          break
        }
      }

      // 更新当前播放位置，供 preloadSegments 排序使用
      this.currentSegmentIndex = segmentIndex

      const concurrency = Math.max(1, Math.floor(config.preloadConcurrency / 2))
      // 使用 'seek' 优先级，可抢占正在运行的 'auto' 任务
      this.preloadRange(m3u8Url, segmentIndex + 1, config.preloadCount, {
        concurrency,
      }, 'seek').catch((err) => {
        logger.warn('[Preloader] Seek preload error:', err)
      })
    }, 300)
  }

  /**
   * 停止预加载（对手动/自动任务均生效）
   */
  stop(): void {
    this.abortReason = 'stop'
    this.abortController?.abort()
    this.abortController = null
    if (this.autoPreloadTimer) {
      clearTimeout(this.autoPreloadTimer)
      this.autoPreloadTimer = null
    }
    this.preloadLoadedCount = 0
    this.preloadTotalCount = 0
    // 立即反馈 UI；运行中的任务 catch 后也会按 abortReason 收敛到 idle（幂等）
    this.setStatus('idle')
  }

  /**
   * 暂停预加载（对手动/自动任务均生效）
   */
  pause(): void {
    if (this.status !== 'loading') return
    this.abortReason = 'pause'
    this.abortController?.abort()
    // 状态由运行中任务的 catch 按 abortReason 收敛为 paused，避免双重设置竞态
  }

  /**
   * 恢复预加载
   * @returns 是否真正恢复了预加载
   */
  async resume(options: PreloadOptions = {}): Promise<boolean> {
    if (this.status !== 'paused' || !this.currentM3U8Url) return false

    const url = this.currentM3U8Url
    return this.runPreloadTask(
      async () => {
        // 传入全部片段：preloadSegments 会批量过滤已缓存片段并计入进度，
        // 既保证进度连续，也避免了 findIndex 返回 -1 时 slice(-1) 误下最后一个分片的问题
        return this.segments
      },
      url,
      options,
      'manual',
    )
  }

  /**
   * 中止当前活动任务（供内部新任务启动前调用）
   */
  private abortActiveTask(reason: 'stop' | 'pause'): void {
    this.abortReason = reason
    this.abortController?.abort()
    if (this.autoPreloadTimer) {
      clearTimeout(this.autoPreloadTimer)
      this.autoPreloadTimer = null
    }
  }

  /**
   * 等待任务锁释放
   */
  private async waitForLockRelease(timeoutMs: number): Promise<boolean> {
    const start = Date.now()
    while (this.preloadTaskLock) {
      if (Date.now() - start > timeoutMs) return false
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return true
  }

  /**
   * 统一预加载任务执行器
   * 所有预加载入口（手动全量/范围/自动/恢复）都经由该方法，共用同一把锁、
   * 同一个 AbortController 和同一套状态机
   *
   * @param segmentsLoader 异步获取待预加载片段列表
   * @param m3u8Url 任务对应的 M3U8 URL
   * @param options 预加载选项
   * @param taskType 任务类型（manual 可抢占正在运行的 auto 任务）
   * @returns 是否真正启动了预加载
   */
  private async runPreloadTask(
    segmentsLoader: () => Promise<TSSegment[]>,
    m3u8Url: string,
    options: PreloadOptions,
    taskType: PreloadTaskType,
  ): Promise<boolean> {
    const adapter = getCurrentCacheAdapter()
    if (!adapter.isEnabled()) {
      logger.log('[Preloader] Cache is disabled, skipping preload')
      return false
    }

    // 锁被占用时按优先级决定是否抢占：
    // - auto 任务优先级最低，直接放弃，避免与正在运行的任务重复下载；
    // - seek 任务可抢占正在运行的 auto 任务，但不会抢占 manual；
    // - manual 任务优先级最高，可抢占任何正在运行的任务。
    if (this.preloadTaskLock) {
      const runningType = this.taskType

      // 同一 URL 的手动预加载已在运行：直接复用当前任务，避免"中断自己再重启"的无谓抖动
      if (taskType === 'manual' && runningType === 'manual' && this.currentM3U8Url === m3u8Url && this.status === 'loading') {
        return true
      }

      if (runningType) {
        const currentPriority = PreloadTaskPriority[runningType.toUpperCase() as keyof typeof PreloadTaskPriority] ?? PreloadTaskPriority.AUTO
        const newPriority = PreloadTaskPriority[taskType.toUpperCase() as keyof typeof PreloadTaskPriority] ?? PreloadTaskPriority.AUTO
        if (newPriority >= currentPriority) {
          logger.log(`[Preloader] Task priority ${taskType} not higher than running ${runningType}, skip`)
          return false
        }
      }
      this.abortActiveTask('stop')
      const released = await this.waitForLockRelease(2000)
      if (!released) {
        logger.warn('[Preloader] Failed to acquire preload lock (timeout)')
        return false
      }
    }
    this.preloadTaskLock = true

    // 防御性中止可能残留的上一个任务
    this.abortActiveTask('stop')

    const controller = new AbortController()
    this.abortController = controller
    this.abortReason = null

    // 外部 signal 转发到任务控制器，保证 stop()/pause() 始终生效
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort()
      } else {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true })
      }
    }

    this.taskType = taskType
    // 提前把任务 URL 同步到状态事件：UI 可立即按 URL 匹配并切换到 loading/进度视图，
    // 不必等到 prepare() 完成（大列表解析可能需要数秒，期间用户会认为"点了没反应"）
    this.setStatus('loading', m3u8Url)

    try {
      const segments = await segmentsLoader()
      // 手动全量预加载解析不到片段时按失败处理：否则会以 total=0 的形态静默"完成"，
      // UI 既不显示进度也不显示完成提示，用户感受就是点击无效
      if (segments.length === 0 && taskType === 'manual') {
        throw new Error('[Preloader] No segments parsed from m3u8, cannot preload')
      }
      // 记录预加载任务总量，供 getCachedProgress 快速返回
      this.preloadTotalCount = segments.length
      this.preloadLoadedCount = 0
      await this.preloadSegments(segments, m3u8Url, {
        ...options,
        signal: controller.signal,
        onProgress: (progress) => {
          this.preloadLoadedCount = progress.loaded
          options.onProgress?.(progress)
          this.emit('progress', { status: this.status, url: m3u8Url, type: this.taskType, progress })
        },
      })

      // 自动预加载只是阶段性后台预取，完成后回到 idle，不占用 completed 状态
      this.setStatus(taskType === 'manual' ? 'completed' : 'idle')
      options.onComplete?.()
      return true
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        // 按中止原因收敛状态：pause → paused；stop/被新任务替换 → idle
        this.setStatus(this.abortReason === 'pause' ? 'paused' : 'idle')
      } else {
        this.setStatus('error')
        options.onError?.(error as Error)
      }
      return false
    } finally {
      if (this.abortController === controller) {
        this.abortController = null
      }
      this.taskType = null
      this.preloadTaskLock = false
    }
  }

  /**
   * 获取预加载进度（O(1) 直接返回内部计数器，无需 IO 查询）
   * 适用于 UI 频繁刷新场景，避免重复查询缓存适配器
   */
  getCachedProgress(_m3u8Url: string): PreloadProgress {
    const total = this.preloadTotalCount
    const loaded = this.preloadLoadedCount
    return {
      loaded,
      total,
      currentUrl: '',
      loadedBytes: 0,
      percent: total > 0 ? Math.round((loaded / total) * 100) : 0,
    }
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
    const cachedUrls = await adapter.hasMany(segmentUrls, m3u8Url)

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
        percent: total > 0 ? 100 : 0,
      })
      return
    }

    // 按距当前播放位置的远近排序：越近的片段优先级越高，拖动后优先下载新位置附近的分片
    const curIdx = this.currentSegmentIndex
    const indexByUrl = new Map(segmentUrls.map((u, i) => [u, i]))
    uncachedSegments.sort((a, b) => {
      const idxA = indexByUrl.get(a.url) ?? 0
      const idxB = indexByUrl.get(b.url) ?? 0
      return Math.abs(idxA - curIdx) - Math.abs(idxB - curIdx)
    })

    // 并发下载队列（已按距离排序）
    const queue = [...uncachedSegments]
    const activePromises: Promise<void>[] = []

    const downloadNext = async (): Promise<void> => {
      while (queue.length > 0) {
        if (signal?.aborted) {
          throw new DOMException('Preload aborted', 'AbortError')
        }

        // 预加载过程中用户关闭了缓存：立即停止，避免继续下载消耗流量
        // 用 cacheConfigManager.isEnabled()（含 embed 设置）判断，PWA 适配器的 isEnabled 只反映环境支持
        if (!cacheConfigManager.isEnabled() || !adapter.isEnabled()) {
          throw new DOMException('Preload aborted: cache disabled', 'AbortError')
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
   * 当目标 URL 与当前预加载 URL 不一致时，独立解析目标 URL 的分片进行统计，
   * 避免用当前视频的分片列表统计其他视频导致进度张冠李戴
   */
  async getProgress(m3u8Url?: string): Promise<PreloadProgress> {
    const url = m3u8Url || this.currentM3U8Url
    if (!url) return { ...EMPTY_PROGRESS }

    let segments = this.segments
    if (url !== this.currentM3U8Url) {
      try {
        const result = await fetchAndParseM3U8(url)
        segments = result.segments
      } catch (error) {
        logger.warn('[Preloader] Failed to parse m3u8 for progress:', error)
        return { ...EMPTY_PROGRESS }
      }
    } else if (segments.length === 0) {
      try {
        segments = await this.prepare(url)
      } catch (error) {
        logger.warn('[Preloader] Failed to prepare m3u8 for progress:', error)
        return { ...EMPTY_PROGRESS }
      }
    }

    if (segments.length === 0) return { ...EMPTY_PROGRESS }

    const adapter = getCurrentCacheAdapter()
    // 批量查询已缓存的片段（性能优化：一次查询替代多次查询）
    const segmentUrls = segments.map((s) => s.url)
    const cachedUrls = await adapter.hasMany(segmentUrls, url)

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
    if (this.currentM3U8Url) {
      this.currentM3U8Url = ''
      this.emit('urlchange', { status: this.status, url: '', type: null })
    }
  }
}

/** 导出单例实例 */
export const preloader = new Preloader()
