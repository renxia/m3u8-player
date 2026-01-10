import { useCallback, useRef } from 'react'
import { preloader } from '@/lib/cache'
import type { PlayerInstances, PlayerType, VideoType } from '@/types'
import { logger } from '@/utils/logger'
import { initArtPlayer } from './player/artplayerConfig'
import { initDPlayer } from './player/dplayerConfig'
import { detectVideoType } from './player/playerUtils'

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

  // 统一的播放器销毁函数
  const destroyAll = useCallback(() => {
    // 取消待执行的动画帧
    if (pendingAnimationFrameRef.current !== null) {
      cancelAnimationFrame(pendingAnimationFrameRef.current)
      pendingAnimationFrameRef.current = null
    }

    // 停止预加载
    preloader.stop()

    if (instances.current.dp) {
      instances.current.dp.destroy()
      instances.current.dp = null
    }
    if (instances.current.art) {
      instances.current.art.destroy()
      instances.current.art = null
    }
    if (instances.current.hls) {
      instances.current.hls.destroy()
      instances.current.hls = null
    }
    if (instances.current.flvPlayer) {
      instances.current.flvPlayer.destroy()
      instances.current.flvPlayer = null
    }
    if (instances.current.wtClient) {
      instances.current.wtClient.destroy()
      instances.current.wtClient = null
    }

    // 重置状态
    isPlayingRef.current = false
    isInitializingRef.current = false
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

        instances.current.art?.destroy()
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
    async (url: string, customType?: string, playerType: PlayerType = 'artplayer') => {
      if (!url) {
        window.h5Utils?.alert('请输入 m3u8 地址或内容')
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
              if (actualPlayer === 'dplayer') {
                success = await initDPlayerInstance(url, type)
              } else {
                success = await initArtPlayerInstance(url, type)
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
