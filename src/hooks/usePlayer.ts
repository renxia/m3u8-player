import { useCallback, useRef } from 'react'
import { preloader } from '@/lib/cache'
import type { PlayerInstances, PlayerType, VideoType } from '@/types'
import { logger } from '@/utils/logger'
import { dialog } from '@/utils/toast'
import { initArtPlayer } from './player/artplayerConfig'
import { initDPlayer } from './player/dplayerConfig'
import { detectVideoType } from './player/playerUtils'
import { createResilientPlayer, ErrorClassifier } from './player/resilientPlayer'

export function usePlayer(containerRef: React.RefObject<HTMLDivElement | null>, onEnd?: (url: string) => void) {
  const instances = useRef<PlayerInstances>({
    art: null,
    dp: null,
    hls: null,
    flvPlayer: null,
    wtClient: null,
  })
  const currentUrlRef = useRef('')
  const isPlayingRef = useRef(false)
  const pendingAnimationFrameRef = useRef<number | null>(null)
  const isInitializingRef = useRef(false) // 新增：标记是否正在初始化

  // 创建降级播放器管理器
  const resilientPlayerRef = useRef(
    createResilientPlayer({
      enabled: true,
      allowFormatFallback: true,
      allowPlayerFallback: true,
      useFallbackUrls: true,
      fallbackDelay: 1000,
    }),
  )

  // 统一的播放器销毁函数
  const destroyAll = useCallback(() => {
    // 取消待执行的动画帧
    if (pendingAnimationFrameRef.current !== null) {
      cancelAnimationFrame(pendingAnimationFrameRef.current)
      pendingAnimationFrameRef.current = null
    }

    // 停止预加载
    preloader.stop()

    // 彻底清理所有播放器实例和事件监听器
    if (instances.current.dp) {
      try {
        instances.current.dp.destroy()
        // 移除所有事件监听器
        instances.current.dp.off?.()
      } catch (error) {
        logger.warn('[usePlayer] Error destroying DPlayer instance:', error)
      } finally {
        instances.current.dp = null
      }
    }

    if (instances.current.art) {
      try {
        // ArtPlayer 可能有自定义的清理逻辑
        instances.current.art.destroy()
        // 显式触发销毁事件，确保所有监听器被清理
        instances.current.art.emit?.('destroy')
        // 移除所有事件监听器
        instances.current.art.off?.()
      } catch (error) {
        logger.warn('[usePlayer] Error destroying ArtPlayer instance:', error)
      } finally {
        instances.current.art = null
      }
    }

    if (instances.current.hls) {
      try {
        instances.current.hls.destroy()
        // HLS.js 可能需要额外的清理
        instances.current.hls.detachMedia?.()
      } catch (error) {
        logger.warn('[usePlayer] Error destroying HLS instance:', error)
      } finally {
        instances.current.hls = null
      }
    }

    if (instances.current.flvPlayer) {
      try {
        instances.current.flvPlayer.destroy()
        instances.current.flvPlayer.detachMediaElement?.()
        instances.current.flvPlayer.unload?.()
      } catch (error) {
        logger.warn('[usePlayer] Error destroying FLV player instance:', error)
      } finally {
        instances.current.flvPlayer = null
      }
    }

    if (instances.current.wtClient) {
      try {
        instances.current.wtClient.destroy()
        // WebTorrent 可能有额外的清理需求
        instances.current.wtClient.removeAllListeners?.()
      } catch (error) {
        logger.warn('[usePlayer] Error destroying WebTorrent client:', error)
      } finally {
        instances.current.wtClient = null
      }
    }

    // 重置所有状态引用，帮助垃圾回收
    currentUrlRef.current = ''
    isPlayingRef.current = false
    isInitializingRef.current = false

    // 强制垃圾回收提示（仅开发环境）
    if (import.meta.env.DEV) {
      logger.debug('[usePlayer] Player instances destroyed, ready for GC')
    }
  }, [])

  // ArtPlayer 播放器初始化（简化，移除冗余检查）
  const initArtPlayerInstance = useCallback(
    async (url: string, type: VideoType) => {
      if (!containerRef.current) {
        logger.warn('[initArtPlayer] Container not ready')
        return false
      }

      try {
        logger.log('[initArtPlayer] Starting initialization', url, type)

        const art = await initArtPlayer({
          container: containerRef.current,
          url,
          type,
          onEnd: (endedUrl: string) => {
            isPlayingRef.current = false
            onEnd?.(endedUrl)
          },
          currentUrlRef,
        })

        // 直接赋值，无需再次销毁（play() 函数已调用 destroyAll()）
        instances.current.art = art
        isPlayingRef.current = true
        logger.log('[initArtPlayer] Success', url)
        return true
      } catch (error) {
        logger.error('[initArtPlayer] Failed:', error)
        isPlayingRef.current = false
        return false
      }
    },
    [containerRef, onEnd],
  )

  // DPlayer 播放器初始化（简化，移除冗余检查）
  const initDPlayerInstance = useCallback(
    async (url: string, type: VideoType) => {
      if (!containerRef.current) {
        logger.warn('[initDPlayer] Container not ready')
        return false
      }

      try {
        logger.log('[initDPlayer] Starting initialization', url, type)

        const dp = await initDPlayer({
          container: containerRef.current,
          url,
          type,
          onEnd: (endedUrl: string) => {
            isPlayingRef.current = false
            onEnd?.(endedUrl)
          },
          currentUrlRef,
        })

        // 先销毁旧实例（如果有），再赋值新实例
        if (instances.current.dp && instances.current.dp !== dp) {
          try {
            instances.current.dp.destroy()
          } catch (e) {
            logger.warn('[initDPlayer] Old instance destroy error:', e)
          }
        }

        instances.current.dp = dp
        isPlayingRef.current = true
        logger.log('[initDPlayer] Success', url)
        return true
      } catch (error) {
        logger.error('[initDPlayer] Failed:', error)
        isPlayingRef.current = false
        return false
      }
    },
    [containerRef, onEnd],
  )

  // 主播放函数 - 统一管理播放器生命周期
  const play = useCallback(
    async (url: string, customType?: string, playerType: PlayerType = 'artplayer', fallbackUrls?: string[]) => {
      if (!url) {
        // 尝试使用 toast，回退到 alert
        const message = '请输入视频地址（M3U8、MP4、FLV 或磁力链）'
        dialog.alert(message, { icon: 'info' })
        return false
      }

      // 如果正在播放相同的 URL，直接返回成功
      if (isPlayingRef.current && currentUrlRef.current === url && !isInitializingRef.current) {
        logger.log('[play] Already playing', url)
        return true
      }

      // 如果正在初始化中，避免重复初始化
      if (isInitializingRef.current) {
        logger.log('[play] Initialization in progress, ignoring request')
        return false
      }

      // 取消之前的待执行动画帧
      if (pendingAnimationFrameRef.current !== null) {
        cancelAnimationFrame(pendingAnimationFrameRef.current)
        pendingAnimationFrameRef.current = null
      }

      // 使用 Promise 包装播放流程
      return new Promise<boolean>((resolve) => {
        isInitializingRef.current = true

        // 使用 requestAnimationFrame 优化销毁和初始化的时机，减少重绘
        const frameId1 = requestAnimationFrame(() => {
          // 第一步：销毁旧实例并重置状态
          destroyAll()
          currentUrlRef.current = url

          const type = detectVideoType(url, customType)
          const actualPlayer = url.includes('torrent') || url.includes('magnet:') ? 'dplayer' : playerType

          // 在下一个帧初始化播放器，确保 DOM 已准备好
          const frameId2 = requestAnimationFrame(async () => {
            try {
              // 确保容器存在
              if (!containerRef.current) {
                logger.warn('[play] Container not ready')
                resolve(false)
                return
              }

              // 再次检查 URL 是否变化（如果用户快速切换 URL）
              if (currentUrlRef.current !== url) {
                logger.log('[play] URL changed during initialization', {
                  current: currentUrlRef.current,
                  requested: url,
                })
                resolve(false)
                return
              }

              // 初始化播放器
              let success = false
              try {
                if (actualPlayer === 'dplayer') {
                  success = await initDPlayerInstance(url, type)
                } else {
                  success = await initArtPlayerInstance(url, type)
                }
              } catch (error) {
                success = false
                logger.error('[play] Initialization error:', error)

                // 处理降级逻辑
                const errorObj = error instanceof Error ? error : new Error(String(error))

                // 检查是否可降级
                if (ErrorClassifier.isRetriable(errorObj)) {
                  logger.log('[play] Attempting fallback due to error:', errorObj.message)

                  // 尝试降级播放
                  const fallbackOptions = await resilientPlayerRef.current.handlePlaybackError(
                    {
                      url,
                      customType,
                      playerType,
                      fallbackUrls,
                      maxRetries: 3,
                      onFallback: (attempt) => {
                        // 显示降级提示
                        const msg = `播放方式降级 (${attempt.strategy})，正在重试...`
                        dialog.toast(msg, { icon: 'info' })
                      },
                    },
                    type,
                    errorObj,
                  )

                  if (fallbackOptions) {
                    logger.log('[play] Using fallback options:', fallbackOptions)
                    // 使用降级选项重新播放
                    const fallbackType = detectVideoType(fallbackOptions.url, customType)
                    const fallbackPlayer = fallbackOptions.playerType

                    if (fallbackPlayer === 'dplayer') {
                      success = await initDPlayerInstance(fallbackOptions.url, fallbackType)
                    } else {
                      success = await initArtPlayerInstance(fallbackOptions.url, fallbackType)
                    }
                  }
                }

                // 最终确认 URL 未变化
                if (currentUrlRef.current === url) {
                  if (success) {
                    logger.log('[play] Success after fallback', url)
                  } else {
                    logger.error('[play] Failed after fallback', url)
                  }
                  resolve(success)
                } else {
                  logger.log('[play] URL changed after fallback, discarding result')
                  resolve(false)
                }
                return
              }

              // 最终确认 URL 未变化
              if (currentUrlRef.current === url) {
                if (success) {
                  logger.log('[play] Success', url)
                } else {
                  logger.error('[play] Failed', url)
                }
                resolve(success)
              } else {
                logger.log('[play] URL changed after initialization, discarding result')
                resolve(false)
              }
            } catch (error) {
              logger.error('[play] Initialization error:', error)
              isPlayingRef.current = false

              // 向用户显示友好的错误信息
              try {
                // const errorMsg = (error as Error).message || '播放失败，请检查网络连接和视频地址'
                const errorObj = error instanceof Error ? error : new Error(String(error))

                // 获取用户友好的错误信息
                const userMessage = ErrorClassifier.getUserFriendlyMessage(errorObj)
                dialog.toast(userMessage, { icon: 'error' })
              } catch (uiError) {
                logger.warn('[play] Failed to show error message:', uiError)
              }

              resolve(false)
            } finally {
              isInitializingRef.current = false
              pendingAnimationFrameRef.current = null
            }
          })

          pendingAnimationFrameRef.current = frameId2
        })

        pendingAnimationFrameRef.current = frameId1
      })
    },
    [destroyAll, initArtPlayerInstance, initDPlayerInstance, containerRef],
  )

  // 旋转播放器
  const rotate = useCallback(() => {
    if (!containerRef.current) return
    const current = parseInt(containerRef.current.style.transform?.replace(/[^0-9]/g, '') || '0', 10)
    const next = (current + 90) % 360
    containerRef.current.style.transform = `rotate(${next}deg)`
  }, [containerRef])

  return {
    play,
    rotate,
    destroyAll,
    demoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    getCurrentUrl: () => currentUrlRef.current,
  }
}
