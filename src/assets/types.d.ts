interface I18nData {
  [key: string]: string | I18nData
}

interface I18nLocale {
  [lang: string]: I18nData
}

interface StorageData {
  url: string
  time?: number
  name?: string
}

interface PlayListItem extends StorageData {
  type?: string
}

type StorageType = 'playlist' | 'm3u8_history' | 'm3u8_fav'

type ListType = 'history' | 'fav'

type PlayerType = 'artplayer' | 'dplayer'

type VideoType = 'auto' | 'customHls' | 'customFlv' | 'customWebTorrent' | 'mp4' | 'm3u8' | 'hls' | 'flv'

interface CDNUrls {
  m3u8Demo: string
  dplayer: string
  artplayer: string[]
}

interface PlayerInstances {
  art: any
  dp: any
  hls: any
  flvPlayer: any
  wtClient: any
}

interface PlayerData {
  playList: PlayListItem[]
}

interface PlayerElements {
  urlInput: HTMLInputElement
  m3u8Content: HTMLTextAreaElement
  vedioSelect: HTMLInputElement
  playBtn: HTMLElement
  rotateBtn: HTMLElement
  downloadBtn: HTMLElement
  inputForm: HTMLElement
  player: HTMLElement
  playList: HTMLElement
  tabFav: HTMLElement | null
  favList: HTMLElement | null
  tabHistory: HTMLElement | null
  historyList: HTMLElement | null
}

interface StorageInterface {
  save(key: string, data: StorageData[]): void
  get(key: string): StorageData[]
  remove(key: string): void
}

interface MPInterface {
  cdn: CDNUrls
  inc: PlayerInstances
  data: PlayerData
  el: PlayerElements
  getUrl(alertOnFail?: boolean): string
  init(): Promise<void>
  initEvent(): void
  renderPlayList(list?: PlayListItem[]): void
  renderList(type: ListType): void
  addHistory(url: string, updateURI?: boolean, name?: string): void
  play(url: string, type?: string, player?: PlayerType, name?: string): void
  artplayer(url: string, type?: string): Promise<void>
  dplayer(url: string, type?: string): Promise<void>
  playNext(url: string, player: PlayerType): void
  formatTime(ts: number): string
}
