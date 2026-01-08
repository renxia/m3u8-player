/**
 * 播放器工具函数
 * 无状态依赖的工具函数
 */

import { getCdnUrls } from '@/lib/cdn'
import type { VideoType } from '@/types'

let isCdnInitialized = false

/**
 * 检测视频类型
 */
export function detectVideoType(url: string, customType?: string): VideoType {
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

/**
 * 加载播放器依赖（HLS.js, FLV.js, WebTorrent）
 */
export async function loadDependencies(): Promise<void> {
  if (navigator.webdriver || isCdnInitialized) return

  const options = {
    attr: { crossOrigin: 'anonymous', referrerpolicy: 'no-referrer' },
  }
  await window.h5Utils?.loadJsOrCss(getCdnUrls(['hls.js', 'flv.js', 'webtorrent']), options)
  isCdnInitialized = true
}

/**
 * 加载 ArtPlayer 依赖
 */
export async function loadArtPlayerDependencies(): Promise<void> {
  await loadDependencies()
  await window.h5Utils?.loadJsOrCss(getCdnUrls(['artplayer']))
}

/**
 * 加载 DPlayer 依赖
 */
export async function loadDPlayerDependencies(): Promise<void> {
  await loadDependencies()
  await window.h5Utils?.loadJsOrCss(getCdnUrls(['dplayer']))
}
