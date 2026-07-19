/**
 * 播放器内缓存状态指示器
 * 显示缓存开关、缓存进度、命中率等信息
 */

import { AlertTriangle, Database, Download, Pause, Play, RefreshCw, Settings, Trash2, X, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useCache } from '@/hooks/useCache'
import { useViewMode } from '@/hooks/useViewMode'
import { cacheConfigManager, getCurrentCacheAdapter, idbCacheManager } from '@/lib/cache'
import { cn } from '@/lib/utils'

interface CacheIndicatorProps {
  /** 当前播放的 M3U8 URL */
  m3u8Url?: string
  /** 自定义类名 */
  className?: string
}

export function CacheIndicator({ m3u8Url: propM3U8Url, className }: CacheIndicatorProps) {
  const { t } = useTranslation()
  const isEmbed = useViewMode() === 'embed'
  const [expanded, setExpanded] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const {
    enabled,
    stats,
    preloadStatus,
    preloadProgress,
    currentM3U8Url: preloadUrl,
    toggleEnabled,
    clearCache,
    startPreload,
    stopPreload,
    pausePreload,
    resumePreload,
    formatSize,
  } = useCache()

  // 运行时缓存支持情况：
  // - effectiveCacheType：考虑 PWA 自动回退后的实际生效类型
  // - isCacheSupported：生效类型的适配器是否真的可用（极旧浏览器两者皆无时为 false）
  // PWA 自动回退为 indexeddb 时无需提示（缓存仍可用，对用户透明）
  const effectiveCacheType = cacheConfigManager.getCacheType()
  const isCacheSupported =
    effectiveCacheType === 'pwa' ? cacheConfigManager.isPWACacheSupported() : typeof indexedDB !== 'undefined'

  // 当前视频的缓存信息
  const [currentVideoStats, setCurrentVideoStats] = useState<{ count: number; size: number }>({ count: 0, size: 0 })

  // 优先使用 prop 传入的 URL；后备复用 useCache 事件推送的 preloader URL（URL 单一数据源，无需额外轮询）
  const m3u8Url = propM3U8Url || preloadUrl
  // 预加载进度/状态仅在 preloader 的任务 URL 与当前视频一致时才可信，
  // 避免把上一个（或其他）视频的进度展示给当前视频
  const isProgressMatched = !!preloadUrl && preloadUrl === m3u8Url
  const effectiveStatus = isProgressMatched ? preloadStatus : 'idle'

  // 处理清除缓存（带加载态，防止大量删除时重复点击）
  const handleClearCache = async () => {
    if (isClearing) return
    setIsClearing(true)
    try {
      await clearCache()
      setShowClearConfirm(false)
      toast.success(t('cache.clearSuccess'))
    } finally {
      setIsClearing(false)
    }
  }

  // 获取当前视频的缓存信息（兼容 IndexedDB 和 PWA 缓存模式）
  useEffect(() => {
    const updateCurrentVideoStats = async () => {
      if (m3u8Url) {
        try {
          // 使用统一缓存适配器，自动适配当前缓存类型
          const adapter = getCurrentCacheAdapter()
          const info = await adapter.getM3U8Stats(m3u8Url)
          setCurrentVideoStats(info)
        } catch (error) {
          console.error('Failed to get current video cache info:', error)
          setCurrentVideoStats({ count: 0, size: 0 })
        }
      } else {
        setCurrentVideoStats({ count: 0, size: 0 })
      }
    }

    updateCurrentVideoStats()

    // 监听 IndexedDB 缓存变化（仅当使用 IndexedDB 模式时有效）
    const unsubscribeIdb = idbCacheManager.addEventListener(async (event) => {
      if (event === 'add' || event === 'remove' || event === 'clear') {
        // 检查当前是否使用 IndexedDB 模式（PWA 不支持时自动回退为 indexeddb）
        if (cacheConfigManager.getCacheType() === 'indexeddb') {
          await updateCurrentVideoStats()
        }
      }
    })

    // 监听配置变化（当缓存类型改变时刷新统计）
    const unsubscribeConfig = cacheConfigManager.addEventListener(() => {
      updateCurrentVideoStats()
    })

    // 定期更新（每 10 秒）
    const interval = setInterval(updateCurrentVideoStats, 10000)

    return () => {
      unsubscribeIdb()
      unsubscribeConfig()
      clearInterval(interval)
    }
  }, [m3u8Url])

  // 命中率显示（使用全局命中率）
  const hitRatePercent = Math.round(stats.hitRate * 100)

  return (
    <div className={cn('relative', className)}>
      {/* 紧凑指示器按钮 */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
          !isCacheSupported
            ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
            : enabled
              ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
              : 'bg-slate-500/20 text-slate-400 hover:bg-slate-500/30',
        )}
        title={t('cache.title')}
      >
        {!isCacheSupported ? (
          <AlertTriangle className="w-3.5 h-3.5" />
        ) : enabled ? (
          <Zap className="w-3.5 h-3.5" />
        ) : (
          <Database className="w-3.5 h-3.5" />
        )}
        {isCacheSupported && <span className="hidden sm:inline">{currentVideoStats.count}</span>}
        {isCacheSupported && enabled && hitRatePercent > 0 && <span className="text-emerald-300">{hitRatePercent}%</span>}
      </button>

      {/* 展开面板 */}
      {expanded && (
        <div className="absolute right-0 top-full mt-1.5 w-60 bg-slate-800/95 backdrop-blur-sm rounded-xl shadow-2xl border border-slate-700/50 z-[100] overflow-hidden">
          {/* 头部 */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
            <div className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-sm font-medium text-white">{t('cache.title')}</span>
            </div>
            <button type="button" onClick={() => setExpanded(false)} className="p-1 hover:bg-slate-700/50 rounded-lg transition-colors">
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>

          {/* 内容 */}
          <div className="p-2.5 space-y-2">
            {/* 缓存不支持提示（紧凑单行） */}
            {!isCacheSupported && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span className="text-xs text-amber-300/90">{t('cache.notSupported')}</span>
              </div>
            )}

            {/* 启用开关 */}
            <div className={cn('flex items-center justify-between', !isCacheSupported && 'opacity-50')}>
              <span className="text-xs text-slate-300">{t('cache.enable')}</span>
              <button
                type="button"
                onClick={toggleEnabled}
                disabled={!isCacheSupported}
                className={cn(
                  'relative w-9 h-5 rounded-full transition-colors',
                  !isCacheSupported ? 'bg-slate-700 cursor-not-allowed' : enabled ? 'bg-emerald-500' : 'bg-slate-600',
                )}
              >
                <span
                  className={cn(
                    'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform',
                    enabled ? 'translate-x-1' : '-translate-x-4',
                  )}
                />
              </button>
            </div>

            {/* 统计信息 - 紧凑单行：数量 | 大小 | 命中率 */}
            {isCacheSupported && (
              <div className="flex items-center justify-between gap-1 px-2 py-1.5 bg-slate-700/30 rounded-lg">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 leading-none">{t('cache.count')}</span>
                  <span className="text-sm font-semibold text-white leading-tight">{currentVideoStats.count.toLocaleString()}</span>
                </div>
                <div className="w-px h-7 bg-slate-600/50" />
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 leading-none">{t('cache.size')}</span>
                  <span className="text-sm font-semibold text-white leading-tight">{formatSize(currentVideoStats.size)}</span>
                </div>
                <div className="w-px h-7 bg-slate-600/50" />
                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-slate-400 leading-none">{t('cache.hitRate')}</span>
                  <span className="text-sm font-semibold text-emerald-400 leading-tight">{hitRatePercent}%</span>
                </div>
              </div>
            )}

            {/* 预加载控制（缓存不支持时不展示） */}
            {isCacheSupported && enabled && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">{t('cache.preload')}</span>
                  <div className="flex items-center gap-0.5">
                    {effectiveStatus === 'idle' && m3u8Url && (
                      <button
                        type="button"
                        onClick={() => startPreload(m3u8Url)}
                        className="p-1 bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 rounded-lg transition-colors"
                        title={t('cache.startPreload')}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {effectiveStatus === 'loading' && (
                      <button
                        type="button"
                        onClick={pausePreload}
                        className="p-1 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded-lg transition-colors"
                        title={t('cache.pausePreload')}
                      >
                        <Pause className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {effectiveStatus === 'paused' && (
                      <button
                        type="button"
                        onClick={resumePreload}
                        className="p-1 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg transition-colors"
                        title={t('cache.resumePreload')}
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {(effectiveStatus === 'loading' || effectiveStatus === 'paused') && (
                      <button
                        type="button"
                        onClick={stopPreload}
                        className="p-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors"
                        title={t('cache.stopPreload')}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 预加载进度 */}
                {(effectiveStatus === 'loading' || effectiveStatus === 'paused' || effectiveStatus === 'completed') &&
                  preloadProgress.total > 0 && (
                    <div className="space-y-0.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">
                          {preloadProgress.loaded} / {preloadProgress.total}
                        </span>
                        <span className="text-indigo-400">{preloadProgress.percent}%</span>
                      </div>
                      <div className="w-full h-1 bg-slate-600 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            effectiveStatus === 'loading'
                              ? 'bg-indigo-500'
                              : effectiveStatus === 'completed'
                                ? 'bg-emerald-500'
                                : 'bg-amber-500',
                          )}
                          style={{ width: `${preloadProgress.percent}%` }}
                        />
                      </div>
                    </div>
                  )}

                {effectiveStatus === 'completed' && preloadProgress.total > 0 && (
                  <div className="flex items-center gap-1 text-xs text-emerald-400">
                    <Zap className="w-3 h-3" />
                    <span>{t('cache.preloadComplete')}</span>
                  </div>
                )}
              </div>
            )}

            {/* 操作按钮（缓存不支持时隐藏清除按钮，仅保留设置入口） */}
            <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-700/50">
              {isCacheSupported && (
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t('cache.clear')}</span>
                </button>
              )}
              <a
                href="/settings"
                {...(isEmbed ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className={cn(
                  'flex items-center justify-center gap-1 px-2 py-1.5 bg-slate-700/50 text-slate-300 hover:bg-slate-700 rounded-lg text-xs transition-colors',
                  !isCacheSupported && 'flex-1',
                )}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>{t('cache.settings')}</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 清除确认对话框 */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-xl">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white">{t('cache.clearConfirmTitle')}</h3>
            </div>
            <p className="text-slate-600 dark:text-slate-300 mb-6">{t('cache.clearConfirmMessage')}</p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                disabled={isClearing}
                className="flex-1 px-4 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleClearCache}
                disabled={isClearing}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isClearing && <RefreshCw className="w-4 h-4 animate-spin" />}
                {t('cache.confirmClear')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default CacheIndicator
