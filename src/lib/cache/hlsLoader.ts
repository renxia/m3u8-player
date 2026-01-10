/**
 * 自定义 HLS Fragment Loader
 * 集成统一缓存适配器，支持 IndexedDB 和 PWA Cache API
 */

import { logger } from '@/utils/logger'
import { sleep } from '@/utils/common'
import { getCurrentCacheAdapter, type UnifiedCacheAdapter } from './cacheAdapter'
import { cacheWriteQueue } from './cacheWriteQueue'
import { downloadManager, DownloadPriority } from './downloadManager'
import { cacheConfigManager } from './cacheConfigManager'

/** Loader 上下文类型 */
interface LoaderContext {
  url: string
  frag?: {
    sn: number
    start: number
    level: number
  }
  rangeStart?: number
  rangeEnd?: number
  responseType: string
  progressData?: boolean
}

/** Loader 配置 */
interface LoaderConfig {
  maxRetry: number
  retryDelay: number
  maxRetryDelay: number
  timeout: number
  highWaterMark?: number
}

/** Loader 回调 */
interface LoaderCallbacks {
  onSuccess: (response: LoaderResponse, stats: LoaderStats, context: LoaderContext, networkDetails?: unknown) => void
  onError: (error: { code: number; text: string }, context: LoaderContext, networkDetails?: unknown) => void
  onTimeout: (stats: LoaderStats, context: LoaderContext) => void
  onProgress?: (stats: LoaderStats, context: LoaderContext, data: string | ArrayBuffer, networkDetails?: unknown) => void
  onAbort?: (stats: LoaderStats, context: LoaderContext, networkDetails?: unknown) => void
}

/** Loader 响应 */
interface LoaderResponse {
  url: string
  data: ArrayBuffer | string
}

/** Loader 统计 */
interface LoaderStats {
  aborted: boolean
  loaded: number
  retry: number
  total: number
  chunkCount: number
  bwEstimate: number
  loading: { start: number; first: number; end: number }
  parsing: { start: number; end: number }
  buffering: { start: number; first: number; end: number }
}

/** 创建空的统计对象 */
function createLoaderStats(): LoaderStats {
  return {
    aborted: false,
    loaded: 0,
    retry: 0,
    total: 0,
    chunkCount: 0,
    bwEstimate: 0,
    loading: { start: 0, first: 0, end: 0 },
    parsing: { start: 0, end: 0 },
    buffering: { start: 0, first: 0, end: 0 },
  }
}

/** 当前 M3U8 URL（用于关联缓存） */
let currentM3U8Url = ''

/**
 * 设置当前 M3U8 URL
 */
export function setCurrentM3U8Url(url: string): void {
  currentM3U8Url = url
}

/**
 * 获取当前 M3U8 URL
 */
export function getCurrentM3U8Url(): string {
  return currentM3U8Url
}

/**
 * 创建缓存感知的 Fragment Loader 类
 */
export class HlsCachedFragmentLoader {
 // biome-ignore lint/suspicious/noExplicitAny: hls.js loader
 private loader: any
 private abortController: AbortController | null = null
 private context: LoaderContext | null = null
 private stats: LoaderStats = createLoaderStats()
 private aborted = false
 private destroyed = false

 /**
  * 调度缓存写入（统一入口）
  */
 private scheduleCacheWrite(url: string, data: ArrayBuffer, adapter: UnifiedCacheAdapter, m3u8Url: string): void {
   const bufferCopy = data.slice(0);
   const segmentUrl = url;

   const writeCache = () => {
     cacheWriteQueue
       .enqueue(() => adapter.set(segmentUrl, bufferCopy, m3u8Url))
       .then(() => {
         logger.debug(
           "[CachedFragmentLoader] Cache SAVED:",
           segmentUrl.substring(segmentUrl.lastIndexOf("/") + 1),
           `(${(bufferCopy.byteLength / 1024).toFixed(2)}KB)`,
         );
       })
       .catch((err: unknown) => {
         logger.warn("[CachedFragmentLoader] Cache write error:", err);
       });
   };

   // 优先使用 requestIdleCallback，否则使用 setTimeout
   if (typeof requestIdleCallback !== "undefined") {
     requestIdleCallback(writeCache, { timeout: 1000 });
   } else {
     setTimeout(writeCache, 0);
   }
 }

 constructor(config: LoaderConfig) {
   const Hls = window.Hls
// 支持不同 hls.js 构建，优先使用 FetchLoader，回退到默认的 loader
const DefaultLoader = Hls.DefaultConfig.FetchLoader || Hls.DefaultConfig.loader
   this.loader = new DefaultLoader(config)
 }

 /**
  * 加载资源
  */
 async load(context: LoaderContext, config: LoaderConfig, callbacks: LoaderCallbacks): Promise<void> {
   // 如果已经销毁，直接返回
   if (this.destroyed) {
     logger.warn('loader has been destroyed')
     return
   }

   this.context = context
   this.stats = createLoaderStats()
   this.stats.loading.start = performance.now()
   this.aborted = false

   const url = context.url

   // 只对 TS 片段启用缓存
   const isSegment = /\.(ts|m4s|mp4|fmp4)(\?|$)/i.test(url) || context.frag !== undefined
   const adapter = getCurrentCacheAdapter()
   const cacheEnabled = cacheConfigManager.isEnabled()

   if (isSegment && cacheEnabled && adapter.isEnabled()) {
     try {
       // 添加超时机制，避免缓存读取阻塞播放
       // 如果缓存读取超过 3s，直接使用网络请求
       const cacheStartTime = performance.now()
       const cachePromise = adapter.get(url)

       const timeoutMS = 3000
       const cachedData = await Promise.race([cachePromise, sleep(timeoutMS)]);
       const cacheDuration = performance.now() - cacheStartTime

       if (cachedData && !this.aborted && !this.destroyed) {
         // 缓存命中，直接返回
         logger.debug('[CachedFragmentLoader] Cache HIT:', url.substring(url.lastIndexOf('/') + 1), `(${(cachedData.byteLength / 1024).toFixed(2)}KB, ${cacheDuration.toFixed(2)}ms)`)
         this.stats.loading.first = performance.now()
         this.stats.loading.end = performance.now()
         this.stats.loaded = cachedData.byteLength
         this.stats.total = cachedData.byteLength

         const response: LoaderResponse = {
           url,
           data: cachedData,
         }

         // 异步调用回调，避免同步回调导致播放器内部状态问题
         if (typeof queueMicrotask === 'function') {
           queueMicrotask(() => callbacks.onSuccess(response, this.stats, context))
         } else {
           setTimeout(() => callbacks.onSuccess(response, this.stats, context), 0)
         }
         return
       } else if (isSegment) {
         // 如果超时，记录但不阻塞
         if (!cachedData) {
           if (cacheDuration >= timeoutMS) {
             logger.warn(`[CachedFragmentLoader] Cache TIMEOUT (>${timeoutMS}ms):`, cacheDuration, url.substring(url.lastIndexOf('/') + 1))
           } else {
             logger.debug('[CachedFragmentLoader] Cache MISS:', url.substring(url.lastIndexOf('/') + 1))
           }
         } else {
           logger.debug('[CachedFragmentLoader] Cache check skipped (aborted/destroyed):', url.substring(url.lastIndexOf('/') + 1))
         }
       }
     } catch (error) {
       logger.warn('[CachedFragmentLoader] Cache read error:', error, url.substring(url.lastIndexOf('/') + 1))
       // 缓存读取失败，继续使用网络请求
     }
   }

   // 如果已经销毁或中止，不再继续加载
   if (this.destroyed || this.aborted) {
     logger.warn('[CachedFragmentLoader] Aborted or destroyed:', url.substring(url.lastIndexOf('/') + 1))
     return
   }

   // 如果是 TS 片段且缓存启用，使用统一的下载管理器
   if (isSegment && cacheEnabled && adapter.isEnabled()) {
     // 创建新的 AbortController
     this.abortController = new AbortController();
     const signal = this.abortController.signal;

     // 设置超时（如果配置了 timeout）
     let timeoutId: ReturnType<typeof setTimeout> | undefined;
     if (config.timeout > 0) {
       timeoutId = setTimeout(() => {
         this.abortController?.abort();
         callbacks.onTimeout(this.stats, context);
       }, config.timeout);
     }

     try {
       // 使用下载管理器下载（最高优先级）
       const data = await downloadManager.download(url, DownloadPriority.PLAYBACK, signal);

       // 清除超时定时器
       if (timeoutId) clearTimeout(timeoutId);

      // 更新统计信息
      this.stats.loading.first = performance.now();
      this.stats.loading.end = performance.now();
      this.stats.loaded = data.byteLength;
      this.stats.total = data.byteLength;

      // 构建响应对象
      const response: LoaderResponse = {
        url,
        data,
      };

      // 异步写入缓存（不阻塞播放）
      this.scheduleCacheWrite(url, data, adapter, getCurrentM3U8Url())

      // 调用成功回调
      callbacks.onSuccess(response, this.stats, context);
     } catch (error) {
       // 清除超时定时器
       if (timeoutId) clearTimeout(timeoutId);

       if ((error as Error).name === "AbortError") {
         // 中止事件，由 abort() 方法或超时触发
         if (this.aborted) {
           // 用户主动中止
           callbacks.onAbort?.(this.stats, context);
         } else {
           // 超时中止
           callbacks.onTimeout(this.stats, context);
         }
       } else {
         // 其他错误
         callbacks.onError(
           {
             code: (error as any).code || -1,
             text: (error as Error).message || "Unknown error",
           },
           context,
         );
       }
     } finally {
       this.abortController = null;
     }
   } else {
     // 非片段或缓存禁用，使用原始加载器
     // 包装 onAbort 回调，避免在 destroy 过程中触发循环
     const wrappedCallbacks: LoaderCallbacks = {
      onSuccess: (response: LoaderResponse, stats: LoaderStats, ctx: LoaderContext, networkDetails?: unknown) => {
        if (this.destroyed) return;
        // 异步写入缓存（不阻塞播放）
        // 使用请求队列控制并发写入数，避免 IndexedDB 压力过大
        if (isSegment && cacheEnabled && adapter.isEnabled() && response.data instanceof ArrayBuffer) {
          this.scheduleCacheWrite(url, response.data as ArrayBuffer, adapter, getCurrentM3U8Url())
        }
        callbacks.onSuccess(response, stats, ctx, networkDetails);
      },
       onError: (error, ctx, networkDetails) => {
         if (this.destroyed) return;
         callbacks.onError(error, ctx, networkDetails);
       },
       onTimeout: (stats, ctx) => {
         if (this.destroyed) return;
         callbacks.onTimeout(stats, ctx);
       },
       onProgress: callbacks.onProgress
         ? (stats, ctx, data, networkDetails) => {
             if (this.destroyed) return;
             callbacks.onProgress?.(stats, ctx, data, networkDetails);
           }
         : undefined,
       onAbort: callbacks.onAbort
         ? (stats, ctx, networkDetails) => {
             // 如果已经销毁，不再触发 onAbort，避免循环
             if (this.destroyed) return;
             callbacks.onAbort?.(stats, ctx, networkDetails);
           }
         : undefined,
     };

     this.loader.load(context, config, wrappedCallbacks);
   }
 }

 /**
  * 中止加载
  */
 abort(): void {
   if (this.destroyed) {
     logger.warn('[CachedFragmentLoader] Already destroyed')
     return
   }
   this.aborted = true
   // 中止当前的下载控制器（如果存在）
   if (this.abortController) {
     this.abortController.abort()
   }
   // 中止原始的 loader（如果存在）
   if (this.loader) {
     try {
       this.loader.abort()
     } catch (error) {
       // 忽略 abort 时的错误，可能 loader 已经被销毁
       logger.warn('[CachedFragmentLoader] Abort error:', error)
     }
   }
 }

 /**
  * 销毁加载器
  */
 destroy(): void {
   // 防止重复销毁
   if (this.destroyed) {
     logger.warn('[CachedFragmentLoader] Destroy', this.destroyed)
     return
   }
   this.destroyed = true
   this.aborted = true
   // 中止当前的下载控制器（如果存在）
   if (this.abortController) {
     this.abortController.abort()
   }

   if (this.loader) {
     try {
       // 先销毁 loader，避免 abort 触发回调
       this.loader.destroy()
     } catch (error) {
       // 忽略销毁时的错误
       logger.warn('[CachedFragmentLoader] Destroy error:', error)
     }
     this.loader = null
   }
   this.context = null
 }

 /**
  * 获取加载统计
  */
 getStats(): LoaderStats {
   return this.stats
 }

 /**
  * 获取上下文
  */
 getContext(): LoaderContext | null {
   return this.context
 }
}
