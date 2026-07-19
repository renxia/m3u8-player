/**
 * 缓存模块导出
 */

export { indexedDBStore, type CacheEntry, type CacheMetadata, type CacheStats } from './indexedDB'
export {
  idbCacheManager,
  type IDBCacheEventType,
  type IDBCacheEventListener,
} from './IDBCacheManager'
export {
  cacheConfigManager,
  type CacheConfig,
  type CacheGlobalConfig,
  type PreloadConfig,
  type IndexedDBCacheConfig,
  type ConfigEventType,
  type ConfigEventListener,
  type CacheType,
} from './cacheConfigManager'
export { parseM3U8Content, fetchAndParseM3U8, getSegmentsInRange, getSegmentIndexByTime, type TSSegment, type M3U8ParseResult } from './m3u8Parser'
export { HlsCachedFragmentLoader, setCurrentM3U8Url, getCurrentM3U8Url } from "./hlsLoader";
export {
  preloader,
  type PreloadProgress,
  type PreloadOptions,
  type PreloadStatus,
  type PreloadTaskType,
  type PreloadTaskInfo,
  type PreloadEventType,
  type PreloadEventPayload,
  type PreloadEventListener,
} from './preloader'
export { pwaCacheManager, PWACacheManager } from './pwaCache'
export type { PWACacheItem, PWACacheStats, PWACacheQueryOptions, PWACacheOperationResult } from './pwaCache.types'
export { getCurrentCacheAdapter, type UnifiedCacheAdapter } from './cacheAdapter'
export { cacheWriteQueue } from './cacheWriteQueue'
export {
  getSmartPreloader,
  type PlaybackEvent,
  type PlaybackBehavior,
  type BandwidthSample,
  type PreloadStrategy,
  type SmartPreloaderConfig,
  adjustPreloadConfig,
} from './smartPreloader'
