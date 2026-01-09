/**
 * 缓存模块导出
 */

export { indexedDBStore, type CacheEntry, type CacheMetadata, type CacheStats } from './indexedDB'
export { cacheManager, type CacheConfig, type CacheEventType, type CacheEventListener } from './cacheManager'
export { parseM3U8Content, fetchAndParseM3U8, getSegmentsInRange, getSegmentIndexByTime, type TSSegment, type M3U8ParseResult } from './m3u8Parser'
export { createCachedFragmentLoader, getHlsConfigWithCache, setCurrentM3U8Url, getCurrentM3U8Url } from './hlsLoader'
export { preloader, type PreloadProgress, type PreloadOptions, type PreloadStatus } from './preloader'
export { pwaCacheManager, PWACacheManager } from './pwaCache'
export type { PWACacheItem, PWACacheStats, PWACacheQueryOptions, PWACacheOperationResult } from './pwaCache.types'
export { getCurrentCacheAdapter, type UnifiedCacheAdapter, type CacheType } from './cacheAdapter'
export { cacheWriteQueue } from './cacheWriteQueue'
