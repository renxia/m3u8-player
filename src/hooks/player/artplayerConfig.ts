/**
 * ArtPlayer 配置和初始化
 */

import type React from 'react'
import { cacheConfigManager, preloader } from '@/lib/cache'
import { PLAYBACK_RATES } from '@/lib/constants'
import type { VideoType } from '@/types'
import { createHlsInstance, preloadSegmentForTime } from './hlsInstance'
import { loadArtPlayerDependencies } from './playerUtils'
import { createCachedThumbnailPlugin } from './thumbnailPlugin'

/**
 * ArtPlayer 初始化选项
 */
export interface ArtPlayerInitOptions {
  /** 容器元素 */
  container: HTMLElement
  /** 视频 URL */
  url: string
  /** 视频类型 */
  type: VideoType
  /** 播放结束回调 */
  onEnd?: (url: string) => void
  /** 当前 URL 引用（用于检查 URL 是否变化） */
  currentUrlRef: React.MutableRefObject<string>
}

/**
 * 初始化 ArtPlayer
 */
export async function initArtPlayer(options: ArtPlayerInitOptions): Promise<any> {
  const { container, url, type, onEnd, currentUrlRef } = options

  await loadArtPlayerDependencies()

  const Artplayer = window.Artplayer
  if (!Artplayer) {
    throw new Error('ArtPlayer is not loaded')
  }

  // 配置 ArtPlayer 全局设置
  Artplayer.PLAYBACK_RATE = PLAYBACK_RATES
  Artplayer.SEEK_STEP = 10
  Artplayer.FAST_FORWARD_VALUE = 3

  const artType = type === 'customHls' || type === 'hls' ? 'm3u8' : type

  // HLS 控制插件
  const hlsControlPlugin = (window as any).artplayerPluginHlsControl?.({
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
  })

  // 创建 ArtPlayer 实例
  const art = new Artplayer({
    container,
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
      // 使用带缓存的缩略图插件
      createCachedThumbnailPlugin({
        width: 160,
        number: 100,
        scale: 1,
        url,
      }),
    ].filter(Boolean),
    customType: {
      m3u8: (video: HTMLVideoElement, m3u8Url: string, artInstance: any) => {
        const Hls = window.Hls
        if (Hls.isSupported()) {
          // 检查是否仍在播放相同的 URL，避免重复加载
          if (currentUrlRef.current !== m3u8Url) return

          // 如果已存在 HLS 实例，先销毁它（可能没有缓存配置）
          if (artInstance.hls) {
            artInstance.hls.destroy()
            artInstance.hls = null
          }

          // 创建 HLS 实例
          const { hls, cleanup } = createHlsInstance({
            url: m3u8Url,
            video,
            enableAutoPreload: true,
            onPreloadError: (error) => {
              console.warn('[ArtPlayer] Auto preload error:', error)
            },
          })

          artInstance.hls = hls

          // 监听销毁事件，清理 HLS 实例
          artInstance.on('destroy', () => {
            cleanup()
          })

          // 添加 HLS 控制插件
          artInstance.plugins.add(hlsControlPlugin)
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = m3u8Url
        } else {
          artInstance.notice.show = 'Unsupported playback format: m3u8'
        }
      },
      flv: (video: HTMLVideoElement, flvUrl: string, artInstance: any) => {
        const flvjs = window.flvjs
        if (flvjs.isSupported()) {
          if (artInstance.flv) artInstance.flv.destroy()
          const flv = flvjs.createPlayer({ type: 'flv', url: flvUrl })
          flv.attachMediaElement(video)
          flv.load()
          artInstance.flv = flv
          artInstance.on('destroy', () => flv.destroy())
        } else {
          artInstance.notice.show = 'Unsupported playback format: flv'
        }
      },
      torrent: async (video: HTMLVideoElement, torrentUrl: string, artInstance: any) => {
        const WebTorrent = window.WebTorrent
        if (WebTorrent.WEBRTC_SUPPORT) {
          if (artInstance.torrent) artInstance.torrent.destroy()
          artInstance.torrent = new WebTorrent()

          await navigator.serviceWorker.register('/assets/webtorrent.sw.min.js')
          artInstance.torrent.loadWorker(navigator.serviceWorker.controller)

          artInstance.torrent.add(torrentUrl, (torrent: any) => {
            const file = torrent.files.find((file: any) => file.name.endsWith('.mp4'))
            file.streamTo(video)
          })

          artInstance.on('destroy', () => artInstance.torrent.destroy())
        } else {
          artInstance.notice.show = 'Unsupported playback format: torrent'
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

  // 播放结束事件
  art.on('video:ended', () => {
    onEnd?.(url)
  })

  // 播放速度变化事件
  art.on('video:ratechange', () => {
    art.storage.set('playbackRate', art.playbackRate)
  })

  // 播放器就绪事件
  art.on('ready', () => {
    art.playbackRate = +art.storage.get('playbackRate') || 1
    art.contextmenu?.remove('version')

    // 监听时间轴悬停事件，触发预加载
    if (type === 'customHls' || type === 'hls' || url.includes('.m3u8')) {
      setupHoverPreload(art, url)
    }
  })

  // 错误事件
  art.on('error', () => {
    // 错误处理
  })

  // 销毁事件
  art.on('destroy', () => {
    if (art.hls) {
      art.hls.destroy()
    }
    preloader.stop()
  })

  return art
}

/**
 * 设置悬停预加载
 */
function setupHoverPreload(art: any, url: string): void {
  const progressElement = art.template?.$progress
  if (!progressElement) return

  let hoverTimer: ReturnType<typeof setTimeout> | null = null

  progressElement.addEventListener('mousemove', (e: MouseEvent) => {
    if (!cacheConfigManager.isEnabled()) return

    // 清除之前的定时器
    if (hoverTimer) {
      clearTimeout(hoverTimer)
    }

    // 延迟 200ms 后触发预加载，避免过于频繁
    hoverTimer = setTimeout(async () => {
      try {
        const rect = progressElement.getBoundingClientRect()
        const percent = (e.clientX - rect.left) / rect.width
        const video = art.video
        if (video?.duration) {
          const hoverTime = video.duration * percent

          // 预加载指定时间点的片段
          await preloadSegmentForTime(url, hoverTime, {
            onError: (err) => {
              console.warn('[ArtPlayer] Hover preload error:', err)
            },
          })
        }
      } catch (error) {
        console.warn('[ArtPlayer] Failed to preload on hover:', error)
      }
    }, 200)
  })

  // 清理定时器
  art.on('destroy', () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer)
    }
  })
}
