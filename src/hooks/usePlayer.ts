import { useCallback, useRef } from 'react'
import { preloader } from '@/lib/cache'
import type { PlayerInstances, PlayerType, VideoType } from '@/types'
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

  // 销毁所有播放器实例
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

    isPlayingRef.current = false
  }, [])

  // ArtPlayer 播放器初始化
  const initArtPlayerInstance = useCallback(
    async (url: string, type: VideoType) => {
      if (!containerRef.current) return
      console.log('initArtPlayer', url, type)

      // 如果已经在播放相同的 URL，直接返回
      if (isPlayingRef.current && currentUrlRef.current === url && instances.current.art) {
        console.log('initArtPlayer already playing', url, type)
        return
      }

      try {
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

        art.on('error', () => {
          isPlayingRef.current = false
        })
      } catch (error) {
        console.error('ArtPlayer initialization failed:', error)
        isPlayingRef.current = false
      }
    },
    [containerRef, onEnd],
  )

  // DPlayer 播放器初始化
  const initDPlayerInstance = useCallback(
    async (url: string, type: VideoType) => {
      if (!containerRef.current) return

      // 如果已经在播放相同的 URL，直接返回
      if (isPlayingRef.current && currentUrlRef.current === url && instances.current.dp) {
        return
      }

      try {
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

        instances.current.dp = dp
        isPlayingRef.current = true
      } catch (error) {
        console.error('DPlayer initialization failed:', error)
        isPlayingRef.current = false
      }
    },
    [containerRef, onEnd],
  )

  // 主播放函数
  const play = useCallback(
    async (url: string, customType?: string, playerType: PlayerType = 'artplayer') => {
      if (!url) {
        window.h5Utils?.alert('请输入 m3u8 地址或内容')
        return false
      }

      // 如果正在播放相同的 URL，直接返回
      // if (isPlayingRef.current && currentUrlRef.current === url) {
      //   console.log('play already playing', url)
      //   return true
      // }

      // 取消之前的待执行动画帧
      if (pendingAnimationFrameRef.current !== null) {
        cancelAnimationFrame(pendingAnimationFrameRef.current)
        pendingAnimationFrameRef.current = null
      }

      // 使用 requestAnimationFrame 优化销毁和初始化的时机，减少重绘
      return new Promise<boolean>((resolve) => {
        const frameId1 = requestAnimationFrame(() => {
          destroyAll()
          currentUrlRef.current = url

          const type = detectVideoType(url, customType)

          // BT 资源使用 dplayer
          const actualPlayer = url.includes('torrent') || url.includes('magnet:') ? 'dplayer' : playerType

          // 在下一个帧初始化播放器，确保 DOM 已准备好
          const frameId2 = requestAnimationFrame(async () => {
            // 再次检查 URL 是否变化，避免重复初始化
            if (currentUrlRef.current !== url) {
              resolve(false)
              return
            }

            try {
              if (actualPlayer === 'dplayer') {
                await initDPlayerInstance(url, type)
              } else {
                await initArtPlayerInstance(url, type)
              }
              // 再次确认 URL 未变化
              if (currentUrlRef.current === url) {
                resolve(true)
              } else {
                resolve(false)
              }
            } catch (error) {
              console.error('播放器初始化失败:', error)
              isPlayingRef.current = false
              resolve(false)
            } finally {
              pendingAnimationFrameRef.current = null
            }
          })
          pendingAnimationFrameRef.current = frameId2
        })
        pendingAnimationFrameRef.current = frameId1
      })
    },
    [destroyAll, initArtPlayerInstance, initDPlayerInstance],
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
