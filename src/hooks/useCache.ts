/**
 * 缓存状态管理 Hook
 * 提供缓存配置、统计信息、预加载控制等功能
 */

import { useCallback, useEffect, useState } from 'react'
import { type CacheConfig, type CacheStats, cacheManager, type PreloadProgress, type PreloadStatus, preloader } from '@/lib/cache'

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
}

/** 初始状态 */
const initialState: CacheState = {
  enabled: true,
  config: cacheManager.getConfig(),
  stats: { count: 0, totalSize: 0, hitRate: 0 },
  preloadStatus: 'idle',
  preloadProgress: { loaded: 0, total: 0, currentUrl: '', loadedBytes: 0, percent: 0 },
  loading: true,
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
      const stats = await cacheManager.getStats()
      const currentM3U8Url = preloader.getCurrentM3U8Url()
      const progress = currentM3U8Url
        ? await preloader.getProgress(currentM3U8Url)
        : { loaded: 0, total: 0, currentUrl: '', loadedBytes: 0, percent: 0 }
      setState((prev) => ({
        ...prev,
        stats,
        preloadProgress: progress,
        preloadStatus: preloader.getStatus(),
        loading: false,
      }))
    } catch (error) {
      console.error('Failed to refresh cache stats:', error)
      setState((prev) => ({ ...prev, loading: false }))
    }
  }, [])

  // 初始化和监听缓存事件
  useEffect(() => {
    // 加载初始配置和统计
    const config = cacheManager.getConfig()
    setState((prev) => ({
      ...prev,
      enabled: config.enabled,
      config,
    }))
    refreshStats()

    // 监听缓存事件
    const unsubscribe = cacheManager.addEventListener((event) => {
      if (event === 'config') {
        const newConfig = cacheManager.getConfig()
        setState((prev) => ({
          ...prev,
          enabled: newConfig.enabled,
          config: newConfig,
        }))
      } else {
        // 其他事件刷新统计（节流）
        refreshStats()
      }
    })

    // 定期更新预加载状态（每 500ms）
    const progressInterval = setInterval(async () => {
      const currentStatus = preloader.getStatus()
      const currentM3U8Url = preloader.getCurrentM3U8Url()

      // 如果有当前 M3U8 URL，获取进度
      if (currentM3U8Url) {
        try {
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
                preloadStatus: currentStatus,
                preloadProgress: currentProgress,
              }
            }
            return prev
          })
        } catch (error) {
          console.warn('[useCache] Failed to get preload progress:', error)
        }
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
    }, 500)

    return () => {
      unsubscribe()
      clearInterval(progressInterval)
    }
  }, [refreshStats])

  // 切换缓存启用状态
  const toggleEnabled = useCallback(() => {
    const newEnabled = !state.enabled
    cacheManager.setConfig({ enabled: newEnabled })
  }, [state.enabled])

  // 更新配置
  const updateConfig = useCallback((updates: Partial<CacheConfig>) => {
    cacheManager.setConfig(updates)
  }, [])

  // 清空缓存
  const clearCache = useCallback(async () => {
    await cacheManager.clear()
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
          console.error('Preload error:', error)
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
        console.error('Preload resume error:', error)
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
    setEnabled(cacheManager.isEnabled())
    cacheManager.getStats().then(setStats)

    // 监听变化
    const unsubscribe = cacheManager.addEventListener(async (event) => {
      if (event === 'config') {
        setEnabled(cacheManager.isEnabled())
      }
      const newStats = await cacheManager.getStats()
      setStats(newStats)
    })

    return unsubscribe
  }, [])

  return { stats, enabled }
}
