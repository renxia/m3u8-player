// 存储数据类型
export interface StorageData {
  url: string
  time?: number
  name?: string
}

// 播放列表项
export interface PlayListItem extends StorageData {
  type?: string
}

// 存储类型
export type StorageType = 'playlist' | 'm3u8_history' | 'm3u8_fav'

// 列表类型
export type ListType = 'history' | 'fav'

// 播放器类型
export type PlayerType = 'artplayer' | 'dplayer'

// 视频类型
export type VideoType = 'auto' | 'customHls' | 'customFlv' | 'customWebTorrent' | 'mp4' | 'm3u8' | 'hls' | 'flv' | 'torrent'

// CDN URLs 类型
export interface CDNUrls {
  m3u8Demo: string
  dplayer: string
  artplayer: string[]
}

// 播放器实例类型
export interface PlayerInstances {
  art: any
  dp: any
  hls: any
  flvPlayer: any
  wtClient: any
}

// GitHub Release 资源
export interface Asset {
  name: string
  size: number
  browser_download_url: string
}

// GitHub Release
export interface Release {
  name?: string
  tag_name: string
  published_at: string
  assets: Asset[]
}

// 操作系统类型
export type OSType = 'windows' | 'macos' | 'linux' | ''

export interface AlertOptions {
  icon?: 'success' | 'error' | 'info' | 'warn'
  showConfirmButton?: boolean
  showCancelButton?: boolean
  confirmButtonText?: string
  cancelButtonText?: string
}

export interface AlertResult {
  isConfirmed: boolean
  isDenied: boolean
  isDismissed: boolean
  dismiss: 'close' | 'confirm' | 'deny'
}

// 全局 Window 扩展
declare global {
  interface Window {
    Hls: any
    flvjs: any
    WebTorrent: any
    Artplayer: any
    DPlayer: any
    h5Utils: {
      alert: (msg: string, options?: AlertOptions) => Promise<AlertResult>
      toast: (msg: string, options?: AlertOptions) => Promise<AlertResult>
      copy: (text: string) => Promise<any>
      loadJsOrCss: (urls: string | string[], options?: { attr?: Record<string, string | boolean> } & Record<string, any>) => Promise<void>
      getUrlParams: () => Record<string, string>
      initTwikoo: (options: { path: string }, force: boolean, cdnUrl: string) => void
    }
  }
}
