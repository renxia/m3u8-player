import { useCallback, useRef } from 'react'
import { getCdnUrls } from '@/lib/cdn'
import type { PlayerType, VideoType } from '@/types'

interface PlayerInstances {
  art: any
  dp: any
  hls: any
  flvPlayer: any
  wtClient: any
}

// 检测视频类型
const detectVideoType = (url: string, customType?: string): VideoType => {
  if (customType) return customType as VideoType

  if (url.includes('.m3u8')) {
    if (window.Hls?.isSupported()) return 'customHls'
    return 'auto'
  }
  if (url.includes('torrent') || url.includes('magnet:')) return 'customWebTorrent'
  if (url.includes('.ts')) return 'customHls'
  if (url.includes('.mp4')) return 'mp4'
  if (url.includes('.flv')) return 'customFlv'
  return 'auto'
}

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

  // ArtPlayer 播放器
  const initArtPlayer = useCallback(
    async (url: string, type: VideoType) => {
      if (!containerRef.current) return
      console.log('initArtPlayer', url, type)

      // 如果已经在播放相同的 URL，直接返回
      if (isPlayingRef.current && currentUrlRef.current === url && instances.current.art) {
        console.log('initArtPlayer already playing', url, type)
        return
      }

      await window.h5Utils?.loadJsOrCss(getCdnUrls(['artplayer']))

      const Artplayer = window.Artplayer
      if (!Artplayer) return

      Artplayer.PLAYBACK_RATE = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8, 16]
      Artplayer.SEEK_STEP = 10
      Artplayer.FAST_FORWARD_VALUE = 3

      const artType = type === 'customHls' || type === 'hls' ? 'm3u8' : type

      const art = new Artplayer({
        container: containerRef.current,
        url,
        aspectRatio: true,
        autoplay: true,
        autoOrientation: true,
        autoPlayback: true,
        fastForward: true,
        flip: true,
        fullscreen: true,
        fullscreenWeb: true,
        lock: true,
        miniProgressBar: true,
        pip: true,
        playbackRate: true,
        playsInline: true,
        screenshot: true,
        setting: true,
        theme: '#6366f1',
        type: artType,
        plugins: [
          (window as any).artplayerPluginHlsControl?.({
            quality: {
              control: document.body.clientWidth > 768,
              setting: true,
              getName: (level: { height: number }) => `${level.height}P`,
              title: 'Quality',
              auto: 'Auto',
            },
            audio: {
              control: false,
              setting: true,
              getName: (track: { name: string }) => track.name,
              title: 'Audio',
              auto: 'Auto',
            },
          }),
          (window as any).artplayerPluginAutoThumbnail?.({
            width: 160,
            number: 100,
            scale: 1,
          }),
        ].filter(Boolean),
        customType: {
          m3u8: (video: HTMLVideoElement, url: string, art: any) => {
            const Hls = window.Hls
            if (Hls.isSupported()) {
              // 确保先销毁旧的 HLS 实例
              if (art.hls) {
                art.hls.destroy()
                art.hls = null
              }
              // 检查是否仍在播放相同的 URL，避免重复加载
              if (currentUrlRef.current !== url) return

              const hls = new Hls()
              hls.loadSource(url)
              hls.attachMedia(video)
              art.hls = hls
              art.on('destroy', () => {
                if (hls) hls.destroy()
              })
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              video.src = url
            } else {
              art.notice.show = 'Unsupported playback format: m3u8'
            }
          },
          flv: (video: HTMLVideoElement, url: string, art: any) => {
            const flvjs = window.flvjs
            if (flvjs.isSupported()) {
              if (art.flv) art.flv.destroy()
              const flv = flvjs.createPlayer({ type: 'flv', url })
              flv.attachMediaElement(video)
              flv.load()
              art.flv = flv
              art.on('destroy', () => flv.destroy())
            } else {
              art.notice.show = 'Unsupported playback format: flv'
            }
          },
          torrent: async (video: HTMLVideoElement, url: string, art: any) => {
            const WebTorrent = window.WebTorrent
            if (WebTorrent.WEBRTC_SUPPORT) {
              if (art.torrent) art.torrent.destroy()
              art.torrent = new WebTorrent()

              await navigator.serviceWorker.register('/assets/webtorrent.sw.min.js')
              art.torrent.loadWorker(navigator.serviceWorker.controller)

              art.torrent.add(url, (torrent: any) => {
                const file = torrent.files.find((file: any) => file.name.endsWith('.mp4'))
                file.streamTo(video)
              })

              art.on('destroy', () => art.torrent.destroy())
            } else {
              art.notice.show = 'Unsupported playback format: torrent'
            }
          },
        },
        contextmenu: [
          {
            index: 80,
            html: 'M3U8下载器客户端',
            click: () => window.open('https://m3u8-downloader.lzw.me/portal/', '_blank'),
          },
          {
            index: 99,
            html: 'M3U8在线下载器',
            click: () => window.open('https://m3u8-downloader.lzw.me', '_blank'),
          },
        ],
      })

      instances.current.art = art
      isPlayingRef.current = true

      art.on('video:ended', () => {
        isPlayingRef.current = false
        onEnd?.(url)
      })
      art.on('video:ratechange', () => {
        art.storage.set('playbackRate', art.playbackRate)
      })
      art.on('ready', () => {
        art.playbackRate = +art.storage.get('playbackRate') || 1
        art.contextmenu.remove('version')
      })
      art.on('error', () => {
        isPlayingRef.current = false
      })
    },
    [containerRef, onEnd],
  )

  // DPlayer 播放器
  const initDPlayer = useCallback(
    async (url: string, type: VideoType) => {
      if (!containerRef.current) return
      console.log('initDPlayer', url, type)

      // 如果已经在播放相同的 URL，直接返回
      if (isPlayingRef.current && currentUrlRef.current === url && instances.current.dp) {
        return
      }

      await window.h5Utils?.loadJsOrCss(getCdnUrls(['hls.js', 'flv.js', 'webtorrent']))
      await window.h5Utils?.loadJsOrCss(getCdnUrls(['dplayer']))

      const DPlayer = window.DPlayer
      if (!DPlayer) return

      const dp = new DPlayer({
        container: containerRef.current,
        autoplay: true,
        airplay: true,
        theme: '#6366f1',
        loop: true,
        lang: 'zh-cn',
        screenshot: true,
        hotkey: true,
        chromecast: true,
        preload: 'auto',
        volume: 0.7,
        playbackSpeed: [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4, 8],
        mutex: true,
        video: {
          url,
          type,
          customType: {
            customHls: (video: HTMLVideoElement) => {
              // 检查 URL 是否变化
              if (currentUrlRef.current !== url) return

              if (instances.current.hls) {
                instances.current.hls.destroy()
                instances.current.hls = null
              }
              const Hls = window.Hls
              instances.current.hls = new Hls()
              instances.current.hls.loadSource(video.src)
              instances.current.hls.attachMedia(video)
            },
            customFlv: (video: HTMLVideoElement) => {
              // 检查 URL 是否变化
              if (currentUrlRef.current !== url) return

              if (instances.current.flvPlayer) {
                instances.current.flvPlayer.destroy()
                instances.current.flvPlayer = null
              }
              const flvjs = window.flvjs
              instances.current.flvPlayer = flvjs.createPlayer({
                type: 'flv',
                url: video.src,
              })
              instances.current.flvPlayer.attachMediaElement(video)
              instances.current.flvPlayer.load()
            },
            customWebTorrent: (video: HTMLVideoElement, player: any) => {
              // 检查 URL 是否变化
              if (currentUrlRef.current !== url) return

              player.container.classList.add('dplayer-loading')
              if (instances.current.wtClient) {
                instances.current.wtClient.destroy()
                instances.current.wtClient = null
              }

              const tracker = {
                announce: [
                  'wss://tracker.btorrent.xyz:443',
                  'wss://tracker.webtorrent.dev:443',
                  'wss://tracker.openwebtorrent.com',
                  'wss://tracker.fastcast.nz',
                ],
                rtcConfig: {
                  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
                },
              }

              const WebTorrent = window.WebTorrent
              instances.current.wtClient = new WebTorrent({ tracker })
              instances.current.wtClient.add(video.src, { announce: tracker.announce }, (torrent: any) => {
                // 再次检查 URL 是否变化
                if (currentUrlRef.current !== url) return

                const file = torrent.files.find((f: any) => f.name.endsWith('.mp4'))
                file.renderTo(video, { autoplay: player.options.autoplay }, () => player.container.classList.remove('dplayer-loading'))
              })
            },
          },
        },
        contextmenu: [{ text: '更多工具', link: 'https://lzw.me/tools' }],
      })

      instances.current.dp = dp
      isPlayingRef.current = true

      dp.on('error', (e: { message?: string }) => {
        isPlayingRef.current = false
        if (e?.message) {
          window.h5Utils?.alert(`播放失败：${e.message || '请检查 URL 是否正确'}`, { icon: 'error' })
        }
      })

      dp.on('ended', () => {
        isPlayingRef.current = false
        onEnd?.(url)
      })
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
                await initDPlayer(url, type)
              } else {
                await initArtPlayer(url, type)
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
    [destroyAll, initArtPlayer, initDPlayer],
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
  }
}
