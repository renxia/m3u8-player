/**
 * 播放器模块导出
 */

export type { ArtPlayerInitOptions } from './artplayerConfig'
export { initArtPlayer } from './artplayerConfig'
export type { DPlayerInitOptions } from './dplayerConfig'
export { initDPlayer } from './dplayerConfig'
export type { HlsInstanceOptions, HlsInstanceResult } from './hlsInstance'
export { createHlsInstance, createThumbnailHlsInstance, preloadSegmentForTime } from './hlsInstance'
export { detectVideoType, loadArtPlayerDependencies, loadDependencies, loadDPlayerDependencies } from './playerUtils'
export type { ThumbnailPluginOptions } from './thumbnailPlugin'
export { createCachedThumbnailPlugin } from './thumbnailPlugin'
