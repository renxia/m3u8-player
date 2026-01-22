/**
 * 设置页面
 * 提供完整的缓存管理功能
 */

import { AlertTriangle, Database, HardDrive, Info, PieChart, RefreshCw, Settings, Sliders, Trash2, XCircle, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import CollapsibleSection from '@/components/CollapsibleSection'
import { ServiceWorkerSettings } from '@/components/ServiceWorkerSettings'
import { useCache } from '@/hooks/useCache'
import type { CacheType } from '@/lib/cache'
import { cn } from '@/lib/utils'

/** 缓存支持情况 */
interface CacheSupport {
  indexeddb: boolean
  pwa: boolean
}

/** 检测缓存支持情况 */
function checkCacheSupport(): CacheSupport {
  return {
    indexeddb: typeof indexedDB !== 'undefined' && indexedDB !== null,
    pwa: typeof caches !== 'undefined' && 'open' in caches,
  }
}

export default function SettingsPage() {
  const { t } = useTranslation()
  const { enabled, config, stats, loading, toggleEnabled, updateConfig, clearCache, refreshStats, formatSize } = useCache()

  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [localMaxCount, setLocalMaxCount] = useState(config.maxCount)
  const [localPreloadCount, setLocalPreloadCount] = useState(config.preloadCount)
  const [localConcurrency, setLocalConcurrency] = useState(config.preloadConcurrency)
  const [localCacheType, setLocalCacheType] = useState<CacheType>(config.cacheType || 'indexeddb')
  const [cacheSupport, setCacheSupport] = useState<CacheSupport>({ indexeddb: false, pwa: false })

  // 处理清除缓存
  const handleClearCache = async () => {
    await clearCache()
    setShowClearConfirm(false)
    toast.success(t('cache.clearSuccess'))
  }

  // 保存配置
  const handleSaveConfig = () => {
    updateConfig({
      maxCount: localMaxCount,
      preloadCount: localPreloadCount,
      preloadConcurrency: localConcurrency,
      cacheType: localCacheType,
    })
    toast.success(t('cache.configSaved'))
  }

  // 重置为默认配置
  const handleResetConfig = () => {
    const defaultCacheType = cacheSupport.pwa ? 'pwa' : 'indexeddb'
    setLocalMaxCount(5000)
    setLocalPreloadCount(5)
    setLocalConcurrency(3)
    setLocalCacheType(defaultCacheType)
    updateConfig({
      maxCount: 5000,
      preloadCount: 5,
      preloadConcurrency: 3,
      cacheType: defaultCacheType,
    })
    toast.success(t('cache.configReset'))
  }

  // 切换缓存类型后立即刷新统计
  const handleCacheTypeChange = (newType: CacheType) => {
    setLocalCacheType(newType)
    updateConfig({ cacheType: newType })
    // 立即刷新统计
    setTimeout(() => {
      refreshStats()
    }, 100)
  }

  const hitRatePercent = Math.round(stats.hitRate * 100)

  // 检测缓存支持情况
  useEffect(() => {
    setCacheSupport(checkCacheSupport())
  }, [])

  // 计算是否显示缓存类型选择
  const showCacheTypeSelect = (cacheSupport.indexeddb && cacheSupport.pwa) || cacheSupport.indexeddb || cacheSupport.pwa
  const cacheNotSupported = !cacheSupport.indexeddb && !cacheSupport.pwa
  const availableCacheTypes = [
    ...(cacheSupport.pwa ? [{ value: 'pwa' as const, label: 'PWA Cache', desc: '性能更优' }] : []),
    ...(cacheSupport.indexeddb ? [{ value: 'indexeddb' as const, label: 'IndexedDB', desc: '兼容性好' }] : []),
  ]

  return (
    <div className="space-y-6 md:space-y-8">
      {/* 页面标题 */}
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-500/20 rounded-xl">
          <Settings className="w-6 h-6 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{t('settings.title')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{t('settings.description')}</p>
        </div>
      </div>

      {/* 缓存设置卡片 */}
      <div className="bg-white/80 dark:bg-slate-800/50 rounded-2xl shadow-xl backdrop-blur-sm overflow-hidden">
        {/* 卡片头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700/50">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-indigo-500" />
            <span className="font-semibold text-slate-800 dark:text-white">{t('cache.title')}</span>
          </div>
          <button
            type="button"
            onClick={refreshStats}
            disabled={loading}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
            title={t('common.refresh')}
          >
            <RefreshCw className={cn('w-4 h-4 text-slate-500', loading && 'animate-spin')} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Service Worker 设置 */}
          <div className="pb-6 border-b border-slate-200 dark:border-slate-700/50">
            <CollapsibleSection
              sectionKey="sw-settings"
              title=""
              defaultExpanded={true}
              className="!bg-transparent !shadow-none !p-0 !mt-0"
              titleClassName="text-sm font-medium text-slate-600 dark:text-slate-300 !font-medium"
              titleRender={(isExpanded, toggleExpanded) => (
                <button type="button" onClick={toggleExpanded} className="flex items-center justify-between w-full text-left">
                  <span>Service Worker 设置</span>
                  <span
                    className="flex-shrink-0 text-slate-400 transition-transform duration-200"
                    style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </button>
              )}
              hideMode="remove"
            >
              <ServiceWorkerSettings />
            </CollapsibleSection>
          </div>

          {/* 统计信息 - 仅在缓存支持时显示 */}
          {!cacheNotSupported && (
            <CollapsibleSection
              sectionKey="stats"
              title=""
              defaultExpanded={true}
              className="!bg-transparent !shadow-none !p-0 !mt-0"
              titleClassName="text-sm font-medium text-slate-600 dark:text-slate-300 !font-medium"
              titleRender={(isExpanded, toggleExpanded) => (
                <button type="button" onClick={toggleExpanded} className="flex items-center justify-between w-full text-left">
                  <div className="flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-slate-500" />
                    <span>{t('cache.statistics')}</span>
                  </div>
                  <span
                    className="flex-shrink-0 text-slate-400 transition-transform duration-200"
                    style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </button>
              )}
              hideMode="remove"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                <div className="p-4 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-xl border border-indigo-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="w-4 h-4 text-indigo-500" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t('cache.count')}</span>
                  </div>
                  <div className="text-2xl font-bold text-slate-800 dark:text-white">{stats.count.toLocaleString()}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    / {config.maxCount.toLocaleString()} {t('cache.max')}
                  </div>
                </div>

                <div className="p-4 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-xl border border-emerald-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t('cache.size')}</span>
                  </div>
                  <div className="text-2xl font-bold text-slate-800 dark:text-white">{formatSize(stats.totalSize)}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('cache.totalStorage')}</div>
                </div>

                <div className="p-4 bg-gradient-to-br from-amber-500/10 to-orange-500/10 rounded-xl border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t('cache.hitRate')}</span>
                  </div>
                  <div className="text-2xl font-bold text-slate-800 dark:text-white">{hitRatePercent}%</div>
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full mt-2 overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${hitRatePercent}%` }} />
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* 配置项 */}
          {!cacheNotSupported ? (
            <CollapsibleSection
              sectionKey="config"
              title=""
              defaultExpanded={true}
              className="!bg-transparent !shadow-none !p-0 !mt-0"
              titleClassName="text-sm font-medium text-slate-600 dark:text-slate-300 !font-medium"
              titleRender={(isExpanded, toggleExpanded) => (
                <button type="button" onClick={toggleExpanded} className="flex items-center justify-between w-full text-left">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-slate-500" />
                    <span>{t('cache.configuration')}</span>
                  </div>
                  <span
                    className="flex-shrink-0 text-slate-400 transition-transform duration-200"
                    style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </button>
              )}
              hideMode="remove"
            >
              {/* 启用开关 */}
              <div className="flex items-center justify-between p-4 mt-2 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
                <div className="flex items-center gap-3">
                  <Zap className={cn('w-5 h-5', enabled ? 'text-emerald-500' : 'text-slate-400')} />
                  <div>
                    <div className="font-medium text-slate-800 dark:text-white">{t('cache.enable')}</div>
                    <div className="text-sm text-slate-500 dark:text-slate-400">{t('cache.enableDescription')}</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleEnabled}
                  className={cn(
                    'relative w-14 h-8 rounded-full transition-colors',
                    enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform',
                      enabled ? 'translate-0' : '-translate-x-5.5',
                    )}
                  />
                </button>
              </div>

              <div className="space-y-4 mt-4">
                {/* 缓存类型选择 - 仅在有多种选择时显示 */}
                {showCacheTypeSelect && availableCacheTypes.length > 1 && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-3">{t('cache.cacheType')}</label>
                    <div className={cn('grid gap-2', availableCacheTypes.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
                      {availableCacheTypes.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => handleCacheTypeChange(option.value)}
                          className={cn(
                            'p-3 rounded-xl border-2 transition-all text-left',
                            localCacheType === option.value
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                              : 'border-transparent bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700',
                          )}
                        >
                          <div className="text-sm font-medium text-slate-800 dark:text-white">{option.label}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{option.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 最大缓存数量 */}
                <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('cache.maxCount')}</label>
                    <span className="text-sm font-mono text-indigo-500">{localMaxCount.toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="10000"
                    step="100"
                    value={localMaxCount}
                    onChange={(e) => setLocalMaxCount(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-full appearance-none cursor-pointer accent-indigo-500"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>100</span>
                    <span>10,000</span>
                  </div>
                </div>

                {/* 自动预加载片段数 */}
                <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('cache.preloadCount')}</label>
                    <span className="text-sm font-mono text-indigo-500">{localPreloadCount}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    step="1"
                    value={localPreloadCount}
                    onChange={(e) => setLocalPreloadCount(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-full appearance-none cursor-pointer accent-indigo-500"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>0 ({t('cache.disabled')})</span>
                    <span>20</span>
                  </div>
                </div>

                {/* 预加载并发数 */}
                <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{t('cache.concurrency')}</label>
                    <span className="text-sm font-mono text-indigo-500">{localConcurrency}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={localConcurrency}
                    onChange={(e) => setLocalConcurrency(Number(e.target.value))}
                    className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-full appearance-none cursor-pointer accent-indigo-500"
                  />
                  <div className="flex justify-between text-xs text-slate-400 mt-1">
                    <span>1</span>
                    <span>10</span>
                  </div>
                </div>
              </div>

              {/* 配置操作按钮 */}
              <div className="flex items-center gap-3 mt-4">
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors"
                >
                  {t('cache.saveConfig')}
                </button>
                <button
                  type="button"
                  onClick={handleResetConfig}
                  className="px-4 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors"
                >
                  {t('cache.resetConfig')}
                </button>
              </div>
            </CollapsibleSection>
          ) : (
            /* 缓存不支持提示 */
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800/50">
              <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700 dark:text-red-300/80">
                <p className="font-medium">{t('cache.notSupported')}</p>
                <p className="mt-1">{t('cache.notSupportedDescription')}</p>
              </div>
            </div>
          )}

          {/* 清除缓存 */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700/50">
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800/50">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-red-700 dark:text-red-400">{t('cache.dangerZone')}</h4>
                <p className="text-sm text-red-600 dark:text-red-300/80 mt-1">{t('cache.clearWarning')}</p>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="mt-3 flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t('cache.clearAll')}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 说明信息 */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800/50">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-700 dark:text-blue-300/80">
              <p>{t('cache.info1')}</p>
              <p className="mt-2">{t('cache.info2')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 清除确认对话框 */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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
                className="flex-1 px-4 py-2.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleClearCache}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-xl transition-colors"
              >
                {t('cache.confirmClear')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
