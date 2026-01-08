/**
 * DPlayer 配置和初始化
 */

import type React from 'react'
import type { VideoType } from '@/types'
import { createHlsInstance } from './hlsInstance'
import { loadDPlayerDependencies } from './playerUtils'

/**
 * DPlayer 初始化选项
 */
export interface DPlayerInitOptions {
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
 * 初始化 DPlayer
 */
export async function initDPlayer(options: DPlayerInitOptions): Promise<any> {
  const { container, url, type, onEnd, currentUrlRef } = options

  await loadDPlayerDependencies()

  const DPlayer = window.DPlayer
  if (!DPlayer) {
    throw new Error('DPlayer is not loaded')
  }

  // 创建 DPlayer 实例
  const dp = new DPlayer({
    container,
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

          const Hls = window.Hls
          if (!Hls?.isSupported()) {
            return
          }

          // 创建 HLS 实例
          const { cleanup } = createHlsInstance({
            url: video.src,
            video,
            enableAutoPreload: true,
            onPreloadError: (error) => {
              console.warn('[DPlayer] Auto preload error:', error)
            },
          })

          // 存储 HLS 实例（如果需要外部访问）
          // 注意：DPlayer 没有 art.hls 这样的属性，所以这里不存储

          // 监听播放器销毁事件
          dp.on('destroy', () => {
            cleanup()
          })
        },
        customFlv: (video: HTMLVideoElement) => {
          // 检查 URL 是否变化
          if (currentUrlRef.current !== url) return

          const flvjs = window.flvjs
          if (!flvjs?.isSupported()) {
            return
          }

          const flv = flvjs.createPlayer({
            type: 'flv',
            url: video.src,
          })
          flv.attachMediaElement(video)
          flv.load()

          // 监听播放器销毁事件
          dp.on('destroy', () => {
            flv.destroy()
          })
        },
        customWebTorrent: (video: HTMLVideoElement, player: any) => {
          // 检查 URL 是否变化
          if (currentUrlRef.current !== url) return

          player.container.classList.add('dplayer-loading')

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
          const wtClient = new WebTorrent({ tracker })
          wtClient.add(video.src, { announce: tracker.announce }, (torrent: any) => {
            // 再次检查 URL 是否变化
            if (currentUrlRef.current !== url) return

            const file = torrent.files.find((f: any) => f.name.endsWith('.mp4'))
            file.renderTo(video, { autoplay: player.options.autoplay }, () => {
              player.container.classList.remove('dplayer-loading')
            })
          })

          // 监听播放器销毁事件
          dp.on('destroy', () => {
            wtClient.destroy()
          })
        },
      },
    },
    contextmenu: [{ text: '更多工具', link: 'https://lzw.me/tools' }],
  })

  // 错误事件
  dp.on('error', (e: { message?: string }) => {
    if (e?.message) {
      window.h5Utils?.alert(`播放失败：${e.message || '请检查 URL 是否正确'}`, { icon: 'error' })
    }
  })

  // 播放结束事件
  dp.on('ended', () => {
    onEnd?.(url)
  })

  return dp
}
