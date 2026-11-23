/**
 * HLS 实例创建和配置
 * 统一的 HLS 实例创建函数，支持缓存和预加载
 */

import { cacheConfigManager, getSmartPreloader, HlsCachedFragmentLoader, preloader, setCurrentM3U8Url } from '@/lib/cache'
import { fetchAndParseM3U8 } from '@/lib/cache/m3u8Parser'

/**
 * HLS 实例配置选项
 */
export interface HlsInstanceOptions {
  /** M3U8 URL */
  url: string
  /** Video 元素 */
  video: HTMLVideoElement
  /** 是否启用自动预加载 */
  enableAutoPreload?: boolean
  /** 是否启用悬停预加载 */
  enableHoverPreload?: boolean
  /** 预加载回调 */
  onPreloadError?: (error: Error) => void
}

/**
 * HLS 实例结果
 */
export interface HlsInstanceResult {
  /** HLS 实例 */
  hls: any
  /** 清理函数 */
  cleanup: () => void
}

/**
 * 创建 HLS 实例（带缓存支持）
 */
export function createHlsInstance(options: HlsInstanceOptions): HlsInstanceResult {
  const { url, video, enableAutoPreload = true, onPreloadError } = options

  const Hls = window.Hls
  if (!Hls?.isSupported()) {
    throw new Error('HLS is not supported')
  }

  // 设置当前 M3U8 URL 用于缓存关联
  setCurrentM3U8Url(url)

  // 获取智能预加载器实例
  const smartPreloader = getSmartPreloader()

  // 创建带缓存的 HLS 配置
  const hlsConfig: Record<string, unknown> = {
    // 禁用自动质量切换，避免额外请求
    abrEwmaDefaultEstimate: 500000,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    fLoader: HlsCachedFragmentLoader,
  }

  // 创建 HLS 实例
  const hls = new Hls(hlsConfig)
  hls.loadSource(url)
  hls.attachMedia(video)

  // 跟踪实际使用的 level（用于自动模式），供 getCurrentPlaylistUrl 使用
  let actualLevelIndex = -1

  const cleanupFunctions: Array<() => void> = []

  // 监听播放事件，记录到智能预加载器
  const handlePlay = () => {
    smartPreloader.recordEvent({
      type: 'play',
      currentTime: video.currentTime,
      playbackRate: video.playbackRate,
      m3u8Url: url,
    })
  }

  const handlePause = () => {
    smartPreloader.recordEvent({
      type: 'pause',
      currentTime: video.currentTime,
      playbackRate: video.playbackRate,
      m3u8Url: url,
    })
  }

  const handleSeek = () => {
    smartPreloader.recordEvent({
      type: 'seek',
      currentTime: video.currentTime,
      playbackRate: video.playbackRate,
      m3u8Url: url,
    })

    // 拖动后：中止旧位置的预加载，从新位置开始预加载
    // 注意：preloadFromSeek 内部有 300ms 延迟去抖，避免频繁拖动反复重启
    if (enableAutoPreload && cacheConfigManager.isEnabled() && cacheConfigManager.getPreloadConfig().preloadCount > 0) {
      const playlistUrl = getCurrentPlaylistUrl()
      preloader.preloadFromSeek(playlistUrl, video.currentTime)
    }
  }

  // 获取当前实际的 M3U8 URL（可能是子播放列表 URL）
  const getCurrentPlaylistUrl = (): string => {
    if (hls.levels && hls.levels.length > 0) {
      // 优先使用实际使用的 level（自动模式下 actualLevelIndex 更准确）
      let levelIndex = actualLevelIndex >= 0 ? actualLevelIndex : hls.currentLevel
      if (levelIndex < 0) levelIndex = 0
      const currentLevel = hls.levels[levelIndex]
      if (currentLevel?.url) return currentLevel.url
    }
    return url
  }

  const handleRateChange = () => {
    smartPreloader.recordEvent({
      type: 'speed-change',
      currentTime: video.currentTime,
      playbackRate: video.playbackRate,
      m3u8Url: url,
    })
  }

  const handleEnded = () => {
    smartPreloader.recordEvent({
      type: 'ended',
      currentTime: video.currentTime,
      playbackRate: video.playbackRate,
      m3u8Url: url,
    })
  }

  video.addEventListener('play', handlePlay)
  video.addEventListener('pause', handlePause)
  video.addEventListener('seeked', handleSeek)
  video.addEventListener('ratechange', handleRateChange)
  video.addEventListener('ended', handleEnded)

  cleanupFunctions.push(() => {
    video.removeEventListener('play', handlePlay)
    video.removeEventListener('pause', handlePause)
    video.removeEventListener('seeked', handleSeek)
    video.removeEventListener('ratechange', handleRateChange)
    video.removeEventListener('ended', handleEnded)
  })

  // 监听片段加载事件，按 preloadCount 预取后续片段（自动预加载的唯一入口）
  // 说明：MANIFEST_PARSED 后不再做「整部视频全量预加载」——那是用户点击「预加载」才应触发的行为，
  // 自动全量下载会远超「自动预加载片段数」的配置语义，并让手动预加载长期处于已完成/不可见状态
  if (enableAutoPreload && cacheConfigManager.isEnabled()) {
    const config = cacheConfigManager.getPreloadConfig()
    if (config.preloadCount > 0) {
      const fragLoadedHandler = (_event: string, data: { frag: { sn: number } }) => {
        const currentIndex = data.frag.sn
        if (typeof currentIndex === 'number') {
          // 同步当前播放位置，供预加载排序使用
          preloader.setCurrentSegmentIndex(currentIndex)
          preloader.startAutoPreload(getCurrentPlaylistUrl(), currentIndex, { onError: onPreloadError })
        }
      }
      hls.on(Hls.Events.FRAG_LOADED, fragLoadedHandler)
      cleanupFunctions.push(() => {
        hls.off(Hls.Events.FRAG_LOADED, fragLoadedHandler)
      })

      // 画质切换：只中止针对旧清晰度的自动/拖动预加载，用户手动发起的预加载不受影响
      const levelSwitchedHandler = (_event: string, data: { level: number }) => {
        actualLevelIndex = data.level
        const taskType = preloader.getTaskInfo().type
        if (taskType === 'auto' || taskType === 'seek') preloader.stop()
      }
      hls.on(Hls.Events.LEVEL_SWITCHED, levelSwitchedHandler)
      cleanupFunctions.push(() => {
        hls.off(Hls.Events.LEVEL_SWITCHED, levelSwitchedHandler)
      })

      // 记录初始 level（自动模式下 currentLevel 可能为 -1，需等 LEVEL_SWITCHED）
      const initialLevelHandler = () => {
        if (hls.currentLevel >= 0) actualLevelIndex = hls.currentLevel
      }
      hls.on(Hls.Events.MANIFEST_PARSED, initialLevelHandler)
      cleanupFunctions.push(() => {
        hls.off(Hls.Events.MANIFEST_PARSED, initialLevelHandler)
      })
    }
  }

  // 清理函数
  const cleanup = () => {
    cleanupFunctions.forEach((fn) => fn())
    hls.destroy()
  }

  return { hls, cleanup }
}

/**
 * 创建用于缩略图的 HLS 实例（简化版，不包含预加载）
 */
export function createThumbnailHlsInstance(url: string, video: HTMLVideoElement): { hls: any; cleanup: () => void } {
  const Hls = window.Hls
  if (!Hls?.isSupported()) {
    throw new Error('HLS is not supported')
  }

  // 设置当前 M3U8 URL 用于缓存关联
  setCurrentM3U8Url(url)

  // 创建带缓存的 HLS 配置
  const hlsConfig: Record<string, unknown> = {
    fLoader: HlsCachedFragmentLoader,
  }
  // if (cacheConfigManager.isEnabled()) {
  //   hlsConfig.fLoader = HlsCachedFragmentLoader
  // }

  // 创建 HLS 实例
  const hls = new Hls(hlsConfig)
  hls.loadSource(url)
  hls.attachMedia(video)

  const cleanup = () => {
    hls.destroy()
  }

  return { hls, cleanup }
}

/**
 * 预加载指定时间点对应的片段
 */
export async function preloadSegmentForTime(
  url: string,
  time: number,
  options?: { concurrency?: number; onError?: (error: Error) => void },
): Promise<void> {
  if (!cacheConfigManager.isEnabled()) return

  try {
    // 解析 M3U8 获取片段信息
    const parseResult = await fetchAndParseM3U8(url)
    if (!parseResult.segments || parseResult.segments.length === 0) return

    // 计算时间点对应的片段索引
    let accumulatedTime = 0
    let segmentIndex = 0
    for (let i = 0; i < parseResult.segments.length; i++) {
      accumulatedTime += parseResult.segments[i].duration
      if (accumulatedTime >= time) {
        segmentIndex = i
        break
      }
    }

    // 预加载当前片段及后续几个片段
    const config = cacheConfigManager.getPreloadConfig()
    if (config.preloadCount > 0) {
      await preloader.preloadRange(url, segmentIndex, config.preloadCount, {
        concurrency: options?.concurrency || config.preloadConcurrency,
      })
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    options?.onError?.(err)
    throw err
  }
}
