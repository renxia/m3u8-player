import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { loadArtPlayerDependencies, loadDPlayerDependencies } from '@/hooks/player/playerUtils'
import { usePlayer } from '@/hooks/usePlayer'
import { type CacheConfig, cacheConfigManager } from '@/lib/cache'
import { cn } from '@/lib/utils'
import type { PlayerType, PlayListItem } from '@/types'
import { logger } from '@/utils/logger'
import { CacheIndicator } from './CacheIndicator'

interface PlayerProps {
  className?: string
  playlist?: PlayListItem[]
  currentIndex?: number
  onPlaylistItemClick?: (item: PlayListItem, index: number) => void
  onEnded?: (url: string) => void
}

export interface PlayerRef {
  play: (url: string, type?: string, player?: PlayerType) => Promise<boolean>
  rotate: () => void
  destroy: () => void
  /** 播放器容器引用 */
  containerRef?: React.RefObject<HTMLDivElement | null>
  /** 获取视频元素 */
  getVideoElement?: () => HTMLVideoElement | null
  /** 切换播放/暂停 */
  togglePlay?: () => void
  /** 跳转到指定时间 */
  seek?: (time: number) => void
  /** 设置音量 */
  setVolume?: (volume: number) => void
  /** 切换静音 */
  toggleMute?: () => void
  /** 设置播放速度 */
  setPlaybackRate?: (rate: number) => void
  /** 切换全屏 */
  toggleFullscreen?: () => void
  /** 开启/关闭画中画 */
  togglePip?: () => void
  /** 截图 */
  screenshot?: () => void
}

const Player = forwardRef<PlayerRef, PlayerProps>(({ className, playlist = [], currentIndex = -1, onPlaylistItemClick, onEnded }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [showPlaceholder, setShowPlaceholder] = useState(true)
  const [isDependenciesLoaded, setIsDependenciesLoaded] = useState(false)
  const pendingPlayRef = useRef<{ url: string; type?: string; player?: PlayerType } | null>(null)
  const playFnRef = useRef<((url: string, type?: string, player?: PlayerType) => Promise<boolean>) | null>(null)
  const isPlayingRef = useRef(false)
  const pendingFrameRef = useRef<number | null>(null)

  const { play, rotate, destroyAll, demoUrl, getCurrentUrl } = usePlayer(containerRef, onEnded)
  const [currentM3U8Url, setCurrentM3U8Url] = useState('')
  const previousEnabledRef = useRef<boolean | null>(null)
  const currentM3U8UrlRef = useRef('')

  // 保存 play 函数引用
  playFnRef.current = play

  // 辅助函数：根据播放器类型加载对应的依赖
  const loadPlayerDependencies = useCallback(async (playerType: PlayerType = 'artplayer') => {
    logger.log(`[Player] Loading dependencies for ${playerType}`)
    try {
      if (playerType === 'dplayer') {
        await loadDPlayerDependencies()
      } else {
        await loadArtPlayerDependencies()
      }
      logger.log(`[Player] Dependencies loaded for ${playerType}`)
      return true
    } catch (error) {
      logger.error(`[Player] Failed to load dependencies for ${playerType}:`, error)
      return false
    }
  }, [])

  // 预加载默认播放器依赖，确保在播放前资源已就绪
  useLayoutEffect(() => {
    let isMounted = true

    const loadDependencies = async () => {
      try {
        // 预加载 ArtPlayer 依赖（默认播放器）
        const success = await loadPlayerDependencies('artplayer')
        if (isMounted && success) {
          setIsDependenciesLoaded(true)
          logger.log('[Player] Dependencies loaded successfully')
        }
      } catch (error) {
        logger.error('[Player] Failed to load dependencies:', error)
      }
    }

    loadDependencies()

    return () => {
      isMounted = false
    }
  }, [loadPlayerDependencies])

  // 定期更新当前 M3U8 URL（从 usePlayer hook 获取）
  useLayoutEffect(() => {
    const updateUrl = () => {
      const url = getCurrentUrl()
      if (url && (url.includes('.m3u8') || url.includes('m3u8'))) {
        setCurrentM3U8Url(url)
        currentM3U8UrlRef.current = url
      } else {
        currentM3U8UrlRef.current = ''
      }
    }

    // 立即更新一次
    updateUrl()

    // 定期更新（每 500ms）
    const interval = setInterval(updateUrl, 500)

    return () => {
      clearInterval(interval)
    }
  }, [getCurrentUrl])

  // 监听缓存配置变化，当缓存开关切换时重新初始化 HLS 播放器
  useLayoutEffect(() => {
    // 初始化当前缓存状态
    const config = cacheConfigManager.getConfig()
    previousEnabledRef.current = config.enabled

    // 监听缓存配置变化
    const unsubscribe = cacheConfigManager.addEventListener((event, data) => {
      if (event === 'config') {
        const newConfig = data as CacheConfig
        const wasEnabled = previousEnabledRef.current
        const nowEnabled = newConfig.enabled

        // 如果缓存开关状态发生变化，且当前正在播放 M3U8 视频，重新播放
        if (wasEnabled !== null && wasEnabled !== nowEnabled) {
          const url = currentM3U8UrlRef.current || getCurrentUrl()
          if (url && (url.includes('.m3u8') || url.includes('m3u8')) && playFnRef.current && !isPlayingRef.current) {
            logger.log(`[Player] Cache enabled changed from ${wasEnabled} to ${nowEnabled}, reloading HLS player`)
            // 延迟一下，确保状态更新完成
            setTimeout(async () => {
              const currentUrl = getCurrentUrl()
              if (playFnRef.current && currentUrl === url) {
                // 确保依赖已加载
                if (!isDependenciesLoaded) {
                  await loadPlayerDependencies('artplayer')
                  setIsDependenciesLoaded(true)
                }
                playFnRef.current(url).catch((error) => {
                  logger.error('[Player] Failed to reload after cache toggle:', error)
                })
              }
            }, 100)
          }
        }

        previousEnabledRef.current = nowEnabled
      }
    })

    return () => {
      unsubscribe()
    }
  }, [getCurrentUrl, isDependenciesLoaded, loadPlayerDependencies])

  // 当占位符隐藏后执行待播放任务
  useLayoutEffect(() => {
    if (!showPlaceholder && pendingPlayRef.current && playFnRef.current && !isPlayingRef.current) {
      const { url, type, player } = pendingPlayRef.current
      const playFn = playFnRef.current
      const playerType = player || 'artplayer'
      pendingPlayRef.current = null
      isPlayingRef.current = true

      // 取消之前的待执行动画帧
      if (pendingFrameRef.current !== null) {
        cancelAnimationFrame(pendingFrameRef.current)
      }

      // 使用 requestAnimationFrame 确保 DOM 完全更新，比 setTimeout 更高效
      const frameId = requestAnimationFrame(async () => {
        const frameId2 = requestAnimationFrame(async () => {
          try {
            // 确保依赖已加载
            if (!isDependenciesLoaded) {
              logger.log('[Player] Waiting for dependencies to load...')
              await loadPlayerDependencies(playerType)
              setIsDependenciesLoaded(true)
            }

            await playFn(url, type, player)
          } catch (error) {
            logger.error('[Player] Playback failed:', error)
          } finally {
            isPlayingRef.current = false
            pendingFrameRef.current = null
          }
        })
        pendingFrameRef.current = frameId2
      })
      pendingFrameRef.current = frameId
    }
  }, [showPlaceholder, isDependenciesLoaded, loadPlayerDependencies])

  // 包装播放函数，隐藏占位符后播放
  const handlePlay = async (url: string, type?: string, player?: PlayerType): Promise<boolean> => {
    const playerType = player || 'artplayer'

    // 如果正在播放，直接返回
    if (isPlayingRef.current) {
      logger.log('[Player] Already playing, ignoring request')
      return false
    }

    // 如果占位符还在显示，隐藏占位符并延迟播放
    if (showPlaceholder) {
      logger.log('[Player] Hiding placeholder and scheduling playback')
      pendingPlayRef.current = { url, type, player }
      setShowPlaceholder(false)
      return true
    }

    // 确保依赖已加载
    if (!isDependenciesLoaded) {
      logger.log(`[Player] Dependencies not loaded, loading ${playerType} dependencies...`)
      const success = await loadPlayerDependencies(playerType)
      if (!success) {
        logger.error('[Player] Failed to load dependencies')
        return false
      }
      setIsDependenciesLoaded(true)
    }

    // 直接播放
    isPlayingRef.current = true
    try {
      const result = await play(url, type, player)
      if (result && url.includes('.m3u8')) {
        setCurrentM3U8Url(url)
      }
      return result
    } finally {
      isPlayingRef.current = false
    }
  }

  useImperativeHandle(ref, () => ({
    play: handlePlay,
    rotate,
    destroy: () => {
      destroyAll()
      setShowPlaceholder(true)
      // 重置依赖加载状态，确保下次播放时重新检查
      setIsDependenciesLoaded(false)
    },
    containerRef,
    getVideoElement: () => containerRef.current?.querySelector('video') || null,
    togglePlay: () => {
      const video = containerRef.current?.querySelector('video')
      if (video) {
        if (video.paused) {
          video.play()
        } else {
          video.pause()
        }
      }
    },
    seek: (time: number) => {
      const video = containerRef.current?.querySelector('video')
      if (video) {
        video.currentTime = time
      }
    },
    setVolume: (volume: number) => {
      const video = containerRef.current?.querySelector('video')
      if (video) {
        video.volume = Math.max(0, Math.min(1, volume))
      }
    },
    toggleMute: () => {
      const video = containerRef.current?.querySelector('video')
      if (video) {
        video.muted = !video.muted
      }
    },
    setPlaybackRate: (rate: number) => {
      const video = containerRef.current?.querySelector('video')
      if (video) {
        video.playbackRate = rate
      }
    },
    toggleFullscreen: () => {
      if (!document.fullscreenElement) {
        containerRef.current?.requestFullscreen()
      } else {
        document.exitFullscreen()
      }
    },
    togglePip: async () => {
      const video = containerRef.current?.querySelector('video')
      if (video) {
        try {
          if (document.pictureInPictureElement) {
            await document.exitPictureInPicture()
          } else {
            await video.requestPictureInPicture()
          }
        } catch (error) {
          console.error('[Player] PiP error:', error)
        }
      }
    },
    screenshot: () => {
      const video = containerRef.current?.querySelector('video')
      if (!video) return

      try {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => {
          if (!blob) return
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = `screenshot_${Date.now()}.png`
          link.click()
          URL.revokeObjectURL(url)
        }, 'image/png')
      } catch (error) {
        console.error('[Player] Screenshot error:', error)
      }
    },
  }))

  return (
    <div className={cn('bg-white/80 dark:bg-slate-800/50 rounded-2xl shadow-xl backdrop-blur-sm overflow-hidden', className)}>
      {/* 播放器容器 */}
      <div className="relative min-h-[200px]">
        {/* 占位符 - 绝对定位覆盖 */}
        {showPlaceholder && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 dark:text-slate-400 py-4 md:py-8 bg-white/80 dark:bg-slate-800/50 z-10">
            <div className="text-4xl md:text-6xl mb-3 md:mb-4">🎬</div>
            <p className="text-base md:text-lg">输入 M3U8 地址开始播放</p>
            <button
              onClick={() => handlePlay(demoUrl)}
              className="mt-3 md:mt-4 px-4 md:px-6 py-1.5 md:py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm md:text-base"
            >
              播放示例视频
            </button>
          </div>
        )}

        {/* 缓存状态指示器 */}
        {!showPlaceholder && <CacheIndicator m3u8Url={currentM3U8Url} className="absolute top-2 right-2 z-20" />}

        {/* 播放器实际容器 - 始终存在且可见 */}
        <div ref={containerRef} id="player" className="w-full min-h-[300px] md:min-h-[450px]" />
      </div>

      {/* 播放列表 */}
      {playlist.length > 0 && (
        <div className="p-3 md:p-4 border-t border-slate-200 dark:border-slate-700/50">
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {playlist.map((item, idx) => (
              <button
                key={item.url}
                onClick={() => onPlaylistItemClick?.(item, idx)}
                className={cn(
                  'px-2.5 md:px-3 py-1 md:py-1.5 text-xs md:text-sm rounded-lg transition-all',
                  idx === currentIndex ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-indigo-600 text-white hover:bg-indigo-700',
                )}
              >
                {item.name || `第${idx + 1}集`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

Player.displayName = 'Player'

export default Player
