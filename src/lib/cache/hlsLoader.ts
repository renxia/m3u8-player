/**
 * 自定义 HLS Fragment Loader
 * 集成 IndexedDB 缓存，实现缓存优先加载策略
 */

import { cacheManager } from './cacheManager'

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
// biome-ignore lint/suspicious/noExplicitAny: hls.js types
export function createCachedFragmentLoader(Hls: any): any {
  const DefaultLoader = Hls.DefaultConfig.loader

  return class CachedFragmentLoader {
    // biome-ignore lint/suspicious/noExplicitAny: hls.js loader
    private loader: any
    private context: LoaderContext | null = null
    private stats: LoaderStats = createLoaderStats()
    private aborted = false
    private destroyed = false

    constructor(config: LoaderConfig) {
      this.loader = new DefaultLoader(config)
    }

    /**
     * 加载资源
     */
    async load(context: LoaderContext, config: LoaderConfig, callbacks: LoaderCallbacks): Promise<void> {
      // 如果已经销毁，直接返回
      if (this.destroyed) {
        return
      }

      this.context = context
      this.stats = createLoaderStats()
      this.stats.loading.start = performance.now()
      this.aborted = false

      const url = context.url

      // 只对 TS 片段启用缓存
      const isSegment = /\.(ts|m4s|mp4|fmp4)(\?|$)/i.test(url) || context.frag !== undefined

      if (isSegment && cacheManager.isEnabled()) {
        try {
          // 尝试从缓存获取
          const cachedData = await cacheManager.get(url)

          if (cachedData && !this.aborted && !this.destroyed) {
            // 缓存命中，直接返回
            console.log('[CachedFragmentLoader] Cache HIT:', url) // url.substring(url.lastIndexOf('/') + 1))
            this.stats.loading.first = performance.now()
            this.stats.loading.end = performance.now()
            this.stats.loaded = cachedData.byteLength
            this.stats.total = cachedData.byteLength

            const response: LoaderResponse = {
              url,
              data: cachedData,
            }

            callbacks.onSuccess(response, this.stats, context)
            return
          } else if (isSegment) {
            console.log('[CachedFragmentLoader] Cache MISS:', url.substring(url.lastIndexOf('/') + 1))
          }
        } catch (error) {
          console.warn('[CachedFragmentLoader] Cache read error:', error)
        }
      }

      // 如果已经销毁或中止，不再继续加载
      if (this.destroyed || this.aborted) {
        return
      }

      // 缓存未命中或缓存禁用，使用原始加载器
      // 包装 onAbort 回调，避免在 destroy 过程中触发循环
      const wrappedCallbacks: LoaderCallbacks = {
        onSuccess: (response: LoaderResponse, stats: LoaderStats, ctx: LoaderContext, networkDetails?: unknown) => {
          if (this.destroyed) return
          // 异步写入缓存（不阻塞播放）
          if (isSegment && cacheManager.isEnabled() && response.data instanceof ArrayBuffer) {
            // 创建 ArrayBuffer 副本，避免存储已分离的 ArrayBuffer
            // 使用 slice() 创建新的 ArrayBuffer，确保可以安全存储到 IndexedDB
            const bufferCopy = response.data.slice(0)
            cacheManager.set(url, bufferCopy, currentM3U8Url).then(() => {
              console.log('[CachedFragmentLoader] Cache SAVED:', url.substring(url.lastIndexOf('/') + 1), `(${(bufferCopy.byteLength / 1024).toFixed(2)}KB)`)
            }).catch((err) => {
              console.warn('[CachedFragmentLoader] Cache write error:', err)
            })
          }
          callbacks.onSuccess(response, stats, ctx, networkDetails)
        },
        onError: (error, ctx, networkDetails) => {
          if (this.destroyed) return
          callbacks.onError(error, ctx, networkDetails)
        },
        onTimeout: (stats, ctx) => {
          if (this.destroyed) return
          callbacks.onTimeout(stats, ctx)
        },
        onProgress: callbacks.onProgress
          ? (stats, ctx, data, networkDetails) => {
              if (this.destroyed) return
              callbacks.onProgress?.(stats, ctx, data, networkDetails)
            }
          : undefined,
        onAbort: callbacks.onAbort
          ? (stats, ctx, networkDetails) => {
              // 如果已经销毁，不再触发 onAbort，避免循环
              if (this.destroyed) return
              callbacks.onAbort?.(stats, ctx, networkDetails)
            }
          : undefined,
      }

      this.loader.load(context, config, wrappedCallbacks)
    }

    /**
     * 中止加载
     */
    abort(): void {
      if (this.destroyed) {
        return
      }
      this.aborted = true
      if (this.loader) {
        try {
          this.loader.abort()
        } catch (error) {
          // 忽略 abort 时的错误，可能 loader 已经被销毁
          console.warn('[CachedFragmentLoader] Abort error:', error)
        }
      }
    }

    /**
     * 销毁加载器
     */
    destroy(): void {
      // 防止重复销毁
      if (this.destroyed) {
        return
      }
      this.destroyed = true
      this.aborted = true

      if (this.loader) {
        try {
          // 先销毁 loader，避免 abort 触发回调
          this.loader.destroy()
        } catch (error) {
          // 忽略销毁时的错误
          console.warn('[CachedFragmentLoader] Destroy error:', error)
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
}

/**
 * 获取 HLS 配置（包含自定义 Loader）
 */
// biome-ignore lint/suspicious/noExplicitAny: hls.js types
export function getHlsConfigWithCache(Hls: any): Record<string, unknown> {
  return {
    fLoader: createCachedFragmentLoader(Hls),
    // 可选：也可以缓存播放列表
    // pLoader: createCachedFragmentLoader(Hls),
  }
}
