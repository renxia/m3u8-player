/**
 * 缓存状态管理 Hook
 * 提供缓存配置、统计信息、预加载控制等功能
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type CacheConfig,
  type CacheStats,
  cacheConfigManager,
  getCurrentCacheAdapter,
  idbCacheManager,
  type PreloadProgress,
  type PreloadStatus,
  preloader,
} from '@/lib/cache'
import { logger } from '@/utils/logger'

/** 缓存状态 */
export interface CacheState {
  /** 缓存是否启用 */
  enabled: boolean
  /** 缓存配置 */
  config: CacheConfig
  /** 缓存统计 */
  stats: CacheStats & { hitRate: number }
  /** 预加载状态 */
  preloadStatus: PreloadStatus
  /** 预加载进度 */
  preloadProgress: PreloadProgress
  /** 是否正在加载统计信息 */
  loading: boolean
  currentM3U8Url: string
}

/** 初始状态 */
const initialState: CacheState = {
  enabled: true,
  config: cacheConfigManager.getConfig(),
  stats: { count: 0, totalSize: 0, hitRate: 0 },
  preloadStatus: 'idle',
  preloadProgress: { loaded: 0, total: 0, currentUrl: '', loadedBytes: 0, percent: 0 },
  loading: true,
  currentM3U8Url: '',
}

/**
 * 缓存管理 Hook
 */
export function useCache() {
  const [state, setState] = useState<CacheState>(initialState)
  const isUpdatingProgressRef = useRef(false)

  // 刷新统计信息
  const refreshStats = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }))
    try {
      // 根据缓存类型从正确的适配器获取统计
      const adapter = getCurrentCacheAdapter()
      const dbStats = await adapter.getStats()

      const totalRequests = idbCacheManager.getRuntimeStats().hits + idbCacheManager.getRuntimeStats().misses
      const hitRate = totalRequests > 0 ? idbCacheManager.getRuntimeStats().hits / totalRequests : 0

      const currentM3U8Url = preloader.getCurrentM3U8Url()
      const progress = currentM3U8Url
        ? await preloader.getProgress(currentM3U8Url)
        : { loaded: 0, total: 0, currentUrl: '', loadedBytes: 0, percent: 0 }
      setState((prev) => ({
        ...prev,
        stats: { ...dbStats, hitRate },
        preloadProgress: progress,
        preloadStatus: preloader.getStatus(),
        currentM3U8Url,
        loading: false,
      }))
    } catch (error) {
      logger.error('Failed to refresh cache stats:', error)
      setState((prev) => ({ ...prev, loading: false }))
    }
  }, [])

  // 初始化和监听缓存事件
  useEffect(() => {
    // 加载初始配置和统计
    const config = cacheConfigManager.getConfig()
    setState((prev) => ({
      ...prev,
      enabled: config.enabled,
      config,
    }))
    refreshStats()

    // 监听配置事件
    const unsubscribeConfig = cacheConfigManager.addEventListener(() => {
      const newConfig = cacheConfigManager.getConfig()
      setState((prev) => ({
        ...prev,
        enabled: newConfig.enabled,
        config: newConfig,
      }))
    })

    // 监听 IndexedDB 缓存事件
    const unsubscribeCache = idbCacheManager.addEventListener(() => {
      // 其他事件刷新统计（节流）
      refreshStats()
    })

    // 定期更新预加载状态（每 3000ms）
    const progressInterval = setInterval(async () => {
      // 防止并发执行，避免异步操作积压
      if (isUpdatingProgressRef.current) {
        return
      }

      isUpdatingProgressRef.current = true

      try {
        const currentStatus = preloader.getStatus()
        const currentM3U8Url = preloader.getCurrentM3U8Url()

        // 如果有当前 M3U8 URL，获取进度
        if (currentM3U8Url) {
          if (currentStatus !== 'loading' && state.currentM3U8Url === currentM3U8Url) return

          const currentProgress = await preloader.getProgress(currentM3U8Url)

          setState((prev) => {
            // 如果状态或进度发生变化，更新状态
            if (
              prev.preloadStatus !== currentStatus ||
              prev.preloadProgress.loaded !== currentProgress.loaded ||
              prev.preloadProgress.total !== currentProgress.total
            ) {
              return {
                ...prev,
                currentM3U8Url,
                preloadStatus: currentStatus,
                preloadProgress: currentProgress,
              }
            }
            return prev
          })
        } else {
          // 如果没有当前 M3U8 URL，但状态不是 idle，重置状态
          setState((prev) => {
            if (prev.preloadStatus !== 'idle') {
              return {
                ...prev,
                preloadStatus: 'idle',
                preloadProgress: { loaded: 0, total: 0, currentUrl: '', loadedBytes: 0, percent: 0 },
              }
            }
            return prev
          })
        }
      } catch (error) {
        logger.warn('[useCache] Failed to get preload progress:', error)
      } finally {
        isUpdatingProgressRef.current = false
      }
    }, 3000)

    return () => {
      unsubscribeConfig()
      unsubscribeCache()
      clearInterval(progressInterval)
    }
  }, [refreshStats])

  // 切换缓存启用状态
  const toggleEnabled = useCallback(() => {
    const newEnabled = !state.enabled
    cacheConfigManager.setConfig({ enabled: newEnabled })
  }, [state.enabled])

  // 更新配置
  const updateConfig = useCallback((updates: Partial<CacheConfig>) => {
    cacheConfigManager.setConfig(updates)
  }, [])

  // 清空缓存
  const clearCache = useCallback(async () => {
    const adapter = getCurrentCacheAdapter()
    await adapter.clear()
    await refreshStats()
  }, [refreshStats])

  // 开始预加载
  const startPreload = useCallback(
    async (m3u8Url: string) => {
      setState((prev) => ({ ...prev, preloadStatus: 'loading' }))

      await preloader.preloadAll(m3u8Url, {
        concurrency: state.config.preloadConcurrency,
        onProgress: (progress) => {
          setState((prev) => ({ ...prev, preloadProgress: progress }))
        },
        onComplete: () => {
          setState((prev) => ({ ...prev, preloadStatus: 'completed' }))
          refreshStats()
        },
        onError: (error) => {
          logger.error('Preload error:', error)
          setState((prev) => ({ ...prev, preloadStatus: 'error' }))
        },
      })
    },
    [state.config.preloadConcurrency, refreshStats],
  )

  // 停止预加载
  const stopPreload = useCallback(() => {
    preloader.stop()
    setState((prev) => ({ ...prev, preloadStatus: 'idle' }))
  }, [])

  // 暂停预加载
  const pausePreload = useCallback(() => {
    preloader.pause()
    setState((prev) => ({ ...prev, preloadStatus: 'paused' }))
  }, [])

  // 恢复预加载
  const resumePreload = useCallback(async () => {
    setState((prev) => ({ ...prev, preloadStatus: 'loading' }))

    await preloader.resume({
      onProgress: (progress) => {
        setState((prev) => ({ ...prev, preloadProgress: progress }))
      },
      onComplete: () => {
        setState((prev) => ({ ...prev, preloadStatus: 'completed' }))
        refreshStats()
      },
      onError: (error) => {
        logger.error('Preload resume error:', error)
        setState((prev) => ({ ...prev, preloadStatus: 'error' }))
      },
    })
  }, [refreshStats])

  // 格式化文件大小
  const formatSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
  }, [])

  return {
    ...state,
    toggleEnabled,
    updateConfig,
    clearCache,
    refreshStats,
    startPreload,
    stopPreload,
    pausePreload,
    resumePreload,
    formatSize,
  }
}

/**
 * 简化版缓存状态 Hook（仅用于显示状态）
 */
export function useCacheStatus() {
  const [stats, setStats] = useState<CacheStats & { hitRate: number }>({ count: 0, totalSize: 0, hitRate: 0 })
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    // 初始加载
    const config = cacheConfigManager.getConfig()
    setEnabled(config.enabled)

    const loadStats = async () => {
      const adapter = getCurrentCacheAdapter()
      const dbStats = await adapter.getStats()
      const totalRequests = idbCacheManager.getRuntimeStats().hits + idbCacheManager.getRuntimeStats().misses
      const hitRate = totalRequests > 0 ? idbCacheManager.getRuntimeStats().hits / totalRequests : 0
      setStats({ ...dbStats, hitRate })
    }

    loadStats()

    // 监听配置变化
    const unsubscribeConfig = cacheConfigManager.addEventListener(() => {
      const newConfig = cacheConfigManager.getConfig()
      setEnabled(newConfig.enabled)
    })

    // 监听缓存变化
    const unsubscribeCache = idbCacheManager.addEventListener(async () => {
      // 重新获取统计
      await loadStats()
    })

    return () => {
      unsubscribeConfig()
      unsubscribeCache()
    }
  }, [])

  return { stats, enabled }
}
