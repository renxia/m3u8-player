/**
 * HLS 实例创建和配置
 * 统一的 HLS 实例创建函数，支持缓存和预加载
 */

import { cacheManager, createCachedFragmentLoader, preloader, setCurrentM3U8Url } from '@/lib/cache'
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

  // 创建带缓存的 HLS 配置
  const hlsConfig: Record<string, unknown> = {
    // 禁用自动质量切换，避免额外请求
    abrEwmaDefaultEstimate: 500000,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
  }

  if (cacheManager.isEnabled()) {
    hlsConfig.fLoader = createCachedFragmentLoader(Hls)
  }

  // 创建 HLS 实例
  const hls = new Hls(hlsConfig)
  hls.loadSource(url)
  hls.attachMedia(video)

  const cleanupFunctions: Array<() => void> = []

  // 监听片段加载事件，触发自动预加载
  if (enableAutoPreload && cacheManager.isEnabled()) {
    const config = cacheManager.getConfig()
    if (config.preloadCount > 0) {
      // 跟踪实际使用的 level（用于自动模式）
      let actualLevelIndex = -1

      // 获取当前实际的 M3U8 URL（可能是子播放列表 URL）
      const getCurrentPlaylistUrl = (): string => {
        // 如果 HLS 已经加载了 level，使用当前 level 的 URL
        if (hls.levels && hls.levels.length > 0) {
          // 优先使用实际使用的 level（自动模式下）
          let levelIndex = actualLevelIndex >= 0 ? actualLevelIndex : hls.currentLevel
          // 如果 currentLevel 为 -1（自动模式）且没有记录实际 level，使用第一个 level
          if (levelIndex < 0) {
            levelIndex = 0
          }
          const currentLevel = hls.levels[levelIndex]
          if (currentLevel?.url) {
            return currentLevel.url
          }
        }
        // 否则使用原始 URL
        return url
      }

      const fragLoadedHandler = (_event: string, data: { frag: { sn: number } }) => {
        const currentIndex = data.frag.sn
        if (typeof currentIndex === 'number') {
          const currentPlaylistUrl = getCurrentPlaylistUrl()
          preloader.startAutoPreload(currentPlaylistUrl, currentIndex)
        }
      }
      hls.on(Hls.Events.FRAG_LOADED, fragLoadedHandler)
      cleanupFunctions.push(() => {
        hls.off(Hls.Events.FRAG_LOADED, fragLoadedHandler)
      })

      // 当 HLS 准备好后，自动开始预加载剩余片段
      const manifestParsedHandler = async () => {
        // 延迟一下，确保播放器已经开始播放
        setTimeout(async () => {
          try {
            const currentPlaylistUrl = getCurrentPlaylistUrl()
            const currentStatus = preloader.getStatus()
            const currentM3U8Url = preloader.getCurrentM3U8Url()

            // 如果当前没有预加载任务，或者 URL 不匹配，开始预加载
            if (currentStatus === 'idle' || currentM3U8Url !== currentPlaylistUrl) {
              // 更新当前 M3U8 URL
              setCurrentM3U8Url(currentPlaylistUrl)
              // 预加载所有剩余片段（会自动跳过已缓存的）
              await preloader.preloadAll(currentPlaylistUrl, {
                concurrency: config.preloadConcurrency,
                onComplete: () => {
                  // 完成回调
                },
                onError: (error) => {
                  onPreloadError?.(error)
                },
              })
            }
          } catch (error) {
            onPreloadError?.(error instanceof Error ? error : new Error(String(error)))
          }
        }, 1000)
      }
      hls.on(Hls.Events.MANIFEST_PARSED, manifestParsedHandler)
      cleanupFunctions.push(() => {
        hls.off(Hls.Events.MANIFEST_PARSED, manifestParsedHandler)
      })

      // 监听画质切换事件，当切换画质时更新缓存逻辑
      const levelSwitchedHandler = async (_event: string, data: { level: number }) => {
        try {
          // 更新实际使用的 level
          actualLevelIndex = data.level

          const currentLevel = hls.levels[data.level]
          if (currentLevel?.url) {
            const newPlaylistUrl = currentLevel.url
            console.log('[HLS] Level switched to', data.level, ', new playlist URL:', newPlaylistUrl)

            // 更新当前 M3U8 URL
            setCurrentM3U8Url(newPlaylistUrl)

            // 停止之前的预加载
            preloader.stop()

            // 延迟一下，确保新的播放列表已经加载
            setTimeout(async () => {
              try {
                const currentStatus = preloader.getStatus()
                const currentM3U8Url = preloader.getCurrentM3U8Url()

                // 如果当前没有预加载任务，或者 URL 不匹配，开始预加载新画质的片段
                if (currentStatus === 'idle' || currentM3U8Url !== newPlaylistUrl) {
                  // 预加载所有剩余片段（会自动跳过已缓存的）
                  await preloader.preloadAll(newPlaylistUrl, {
                    concurrency: config.preloadConcurrency,
                    onComplete: () => {
                      console.log('[HLS] Preload completed for new quality')
                    },
                    onError: (error) => {
                      console.warn('[HLS] Preload error for new quality:', error)
                      onPreloadError?.(error)
                    },
                  })
                }
              } catch (error) {
                console.warn('[HLS] Failed to preload new quality:', error)
                onPreloadError?.(error instanceof Error ? error : new Error(String(error)))
              }
            }, 500)
          }
        } catch (error) {
          console.warn('[HLS] Level switched handler error:', error)
        }
      }
      hls.on(Hls.Events.LEVEL_SWITCHED, levelSwitchedHandler)
      cleanupFunctions.push(() => {
        hls.off(Hls.Events.LEVEL_SWITCHED, levelSwitchedHandler)
      })

      // 监听 MANIFEST_PARSED 事件，记录初始 level
      const initialLevelHandler = () => {
        // 记录初始 level（可能是自动选择的）
        if (hls.levels && hls.levels.length > 0) {
          // 如果 currentLevel 为 -1，等待 LEVEL_SWITCHED 事件
          // 否则记录当前 level
          if (hls.currentLevel >= 0) {
            actualLevelIndex = hls.currentLevel
          }
        }
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
  const hlsConfig: Record<string, unknown> = {}
  if (cacheManager.isEnabled()) {
    hlsConfig.fLoader = createCachedFragmentLoader(Hls)
  }

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
  if (!cacheManager.isEnabled()) return

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
    const config = cacheManager.getConfig()
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
