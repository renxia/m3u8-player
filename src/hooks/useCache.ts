/**
 * 缓存状态管理 Hook
 * 提供缓存配置、统计信息、预加载控制等功能
 *
 * 设计要点：预加载状态/进度通过 preloader 事件订阅实时推送（事件负载携带任务 URL），
 * 不再使用轮询，避免空闲时的全量 IndexedDB 查询与状态不同步问题
 */

import { useCallback, useEffect, useState } from 'react'
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

/** 获取当前适配器的运行时命中率（口径与统计数据一致） */
function getAdapterHitRate(): number {
  const adapter = getCurrentCacheAdapter()
  const runtimeStats = adapter.getRuntimeStats?.() ?? idbCacheManager.getRuntimeStats()
  return runtimeStats.hitRate
}

/**
 * 缓存管理 Hook
 */
export function useCache() {
  const [state, setState] = useState<CacheState>(initialState)

  // 刷新统计信息
  const refreshStats = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }))
    try {
      // 根据缓存类型从正确的适配器获取统计
      const adapter = getCurrentCacheAdapter()
      const dbStats = await adapter.getStats()
      const hitRate = getAdapterHitRate()

      const taskInfo = preloader.getTaskInfo()
      const progress = taskInfo.url
        ? await preloader.getProgress(taskInfo.url)
        : { loaded: 0, total: 0, currentUrl: '', loadedBytes: 0, percent: 0 }
      setState((prev) => ({
        ...prev,
        stats: { ...dbStats, hitRate },
        preloadProgress: progress,
        preloadStatus: taskInfo.status,
        currentM3U8Url: taskInfo.url,
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

    // 订阅预加载事件（事件驱动，替代轮询）
    const unsubscribePreload = preloader.addEventListener((event, payload) => {
      if (event === 'status') {
        setState((prev) => ({
          ...prev,
          preloadStatus: payload.status,
          currentM3U8Url: payload.url || prev.currentM3U8Url,
        }))
      } else if (event === 'progress' && payload.progress) {
        setState((prev) => ({
          ...prev,
          currentM3U8Url: payload.url,
          preloadProgress: payload.progress as PreloadProgress,
        }))
      } else if (event === 'urlchange') {
        setState((prev) => ({ ...prev, currentM3U8Url: payload.url }))
      }
    })

    return () => {
      unsubscribeConfig()
      unsubscribeCache()
      unsubscribePreload()
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
      const started = await preloader.preloadAll(m3u8Url, {
        concurrency: state.config.preloadConcurrency,
        onComplete: () => {
          refreshStats()
        },
        onError: (error) => {
          logger.error('Preload error:', error)
        },
      })

      // preloadAll 在缓存关闭或锁竞争失败时返回 false（状态/进度由事件推送），
      // 此时同步一次真实状态，避免 UI 停留在过期的 loading 状态
      if (!started) {
        const taskInfo = preloader.getTaskInfo()
        setState((prev) => ({ ...prev, preloadStatus: taskInfo.status, currentM3U8Url: taskInfo.url || prev.currentM3U8Url }))
      }
    },
    [state.config.preloadConcurrency, refreshStats],
  )

  // 停止预加载
  const stopPreload = useCallback(() => {
    preloader.stop()
  }, [])

  // 暂停预加载
  const pausePreload = useCallback(() => {
    preloader.pause()
  }, [])

  // 恢复预加载
  const resumePreload = useCallback(async () => {
    const started = await preloader.resume({
      onComplete: () => {
        refreshStats()
      },
      onError: (error) => {
        logger.error('Preload resume error:', error)
      },
    })

    if (!started) {
      const taskInfo = preloader.getTaskInfo()
      setState((prev) => ({ ...prev, preloadStatus: taskInfo.status }))
    }
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
      setStats({ ...dbStats, hitRate: getAdapterHitRate() })
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
