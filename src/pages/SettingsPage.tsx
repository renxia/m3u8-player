/**
 * 设置页面
 * 提供完整的缓存管理功能
 *
 * 设计要点：
 * - 配置项统一为「本地暂存 + 保存/重置」编辑模型（含缓存类型），通过 dirty 检测
 *   禁用无变更保存并提示未保存更改，避免「即时生效/手动保存」混用造成的困惑
 * - 滑块与数字输入联动，支持精确设置
 * - 统计区展示浏览器存储配额占用，帮助用户判断缓存空间
 */

import {
  AlertTriangle,
  Database,
  HardDrive,
  History,
  Info,
  MonitorPlay,
  PieChart,
  RefreshCw,
  Settings,
  Sliders,
  Trash2,
  XCircle,
  Zap,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import CollapsibleSection from '@/components/CollapsibleSection'
import { ServiceWorkerSettings } from '@/components/ServiceWorkerSettings'
import { useCache } from '@/hooks/useCache'
import type { CacheType } from '@/lib/cache'
import { type EmbedSettings, getEmbedSettings, setEmbedSettings, subscribeEmbedSettings } from '@/lib/embed'
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

/** 配置滑块（滑块 + 数字输入联动） */
function ConfigSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  minHint,
  maxHint,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  minHint?: React.ReactNode
  maxHint?: React.ReactNode
}) {
  const handleNumberChange = (raw: string) => {
    const num = Number(raw)
    if (Number.isFinite(num)) {
      onChange(Math.min(max, Math.max(min, Math.round(num))))
    }
  }

  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => handleNumberChange(e.target.value)}
          className="w-24 px-2 py-1 text-sm font-mono text-right text-indigo-500 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:border-indigo-500 transition-colors"
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 bg-slate-200 dark:bg-slate-600 rounded-full appearance-none cursor-pointer accent-indigo-500"
      />
      <div className="flex justify-between text-xs text-slate-400 mt-1">
        <span>{minHint ?? min.toLocaleString()}</span>
        <span>{maxHint ?? max.toLocaleString()}</span>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const { t } = useTranslation()
  const { enabled, config, stats, loading, toggleEnabled, updateConfig, clearCache, refreshStats, formatSize } = useCache()

  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [localMaxCount, setLocalMaxCount] = useState(config.maxCount)
  const [localPreloadCount, setLocalPreloadCount] = useState(config.preloadCount)
  const [localConcurrency, setLocalConcurrency] = useState(config.preloadConcurrency)
  const [localCacheType, setLocalCacheType] = useState<CacheType>(config.cacheType || 'indexeddb')
  // 惰性初始化，避免首帧闪烁「不支持缓存」提示
  const [cacheSupport] = useState<CacheSupport>(() => checkCacheSupport())
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null)
  const [embedSettings, setEmbedSettingsState] = useState<EmbedSettings>(() => getEmbedSettings())

  // 是否有未保存的配置修改
  const isDirty =
    localMaxCount !== config.maxCount ||
    localPreloadCount !== config.preloadCount ||
    localConcurrency !== config.preloadConcurrency ||
    localCacheType !== (config.cacheType || 'indexeddb')

  // 全局配置变化时同步本地编辑值（仅在无未保存修改时，避免覆盖用户输入）
  useEffect(() => {
    if (!isDirty) {
      setLocalMaxCount(config.maxCount)
      setLocalPreloadCount(config.preloadCount)
      setLocalConcurrency(config.preloadConcurrency)
      setLocalCacheType(config.cacheType || 'indexeddb')
    }
  }, [config, isDirty])

  // 订阅嵌入设置变化（如其他页面修改）
  useEffect(() => subscribeEmbedSettings(setEmbedSettingsState), [])

  // 获取浏览器存储配额估算（缓存统计变化时重新估算，间接反映缓存写入）
  // biome-ignore lint/correctness/useExhaustiveDependencies: stats.totalSize 仅用作缓存写入后重新估算配额的触发时机
  useEffect(() => {
    let mounted = true
    if (!navigator.storage?.estimate) return

    navigator.storage
      .estimate()
      .then((est) => {
        if (mounted && est.quota) {
          setStorageEstimate({ usage: est.usage ?? 0, quota: est.quota })
        }
      })
      .catch(() => {})

    return () => {
      mounted = false
    }
  }, [stats.totalSize])

  // 切换嵌入模式设置项
  const toggleEmbedSetting = (key: keyof EmbedSettings) => {
    setEmbedSettings({ [key]: !embedSettings[key] })
  }

  // 处理清除缓存
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

  // 保存配置（含缓存类型，统一本地暂存后保存）
  const handleSaveConfig = () => {
    if (!isDirty) return
    updateConfig({
      maxCount: localMaxCount,
      preloadCount: localPreloadCount,
      preloadConcurrency: localConcurrency,
      cacheType: localCacheType,
    })
    // 缓存类型变更后统计口径变化，立即刷新统计
    refreshStats()
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

  const hitRatePercent = Math.round(stats.hitRate * 100)
  const quotaPercent =
    storageEstimate && storageEstimate.quota > 0 ? Math.min(100, Math.round((storageEstimate.usage / storageEstimate.quota) * 100)) : 0

  // 计算是否显示缓存类型选择
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

              {/* 浏览器存储配额占用（支持时显示） */}
              {storageEstimate && (
                <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
                  <div className="flex items-center justify-between mb-2 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">{t('cache.storageQuota')}</span>
                    <span className="font-mono text-slate-600 dark:text-slate-300">
                      {formatSize(storageEstimate.usage)} / {formatSize(storageEstimate.quota)} ({quotaPercent}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', quotaPercent > 90 ? 'bg-red-500' : 'bg-emerald-500')}
                      style={{ width: `${quotaPercent}%` }}
                    />
                  </div>
                </div>
              )}
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
                    {isDirty && <span className="w-2 h-2 rounded-full bg-amber-400" title={t('cache.unsavedChanges')} />}
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

              {/* 缓存关闭时禁用配置编辑，避免「修改不生效」的误解 */}
              <div className={cn('space-y-4 mt-4 transition-opacity', !enabled && 'opacity-50 pointer-events-none select-none')}>
                {/* 缓存类型选择 - 仅在有多种选择时显示（本地暂存，随保存生效） */}
                {availableCacheTypes.length > 1 && (
                  <div className="p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300 block mb-3">{t('cache.cacheType')}</label>
                    <div className={cn('grid gap-2', availableCacheTypes.length === 2 ? 'grid-cols-2' : 'grid-cols-1')}>
                      {availableCacheTypes.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setLocalCacheType(option.value)}
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
                <ConfigSlider
                  label={t('cache.maxCount')}
                  value={localMaxCount}
                  min={100}
                  max={10000}
                  step={100}
                  onChange={setLocalMaxCount}
                />

                {/* 自动预加载片段数 */}
                <ConfigSlider
                  label={t('cache.preloadCount')}
                  value={localPreloadCount}
                  min={0}
                  max={20}
                  step={1}
                  onChange={setLocalPreloadCount}
                  minHint={`0 (${t('cache.disabled')})`}
                />

                {/* 预加载并发数 */}
                <ConfigSlider
                  label={t('cache.concurrency')}
                  value={localConcurrency}
                  min={1}
                  max={10}
                  step={1}
                  onChange={setLocalConcurrency}
                />

                {/* 配置操作按钮 */}
                <div className="pt-1">
                  {isDirty && <p className="text-xs text-amber-500 mb-2">{t('cache.unsavedChanges')}</p>}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleSaveConfig}
                      disabled={!isDirty}
                      className={cn(
                        'flex-1 px-4 py-2.5 font-medium rounded-xl transition-colors',
                        isDirty
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed',
                      )}
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
                </div>
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

      {/* 嵌入模式设置卡片 */}
      <div className="bg-white/80 dark:bg-slate-800/50 rounded-2xl shadow-xl backdrop-blur-sm overflow-hidden">
        {/* 卡片头部 */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-700/50">
          <MonitorPlay className="w-5 h-5 text-indigo-500" />
          <div>
            <span className="font-semibold text-slate-800 dark:text-white">{t('settings.embed.title')}</span>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('settings.embed.description')}</p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* embed 模式下是否自动记录历史记录 */}
          <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
            <div className="flex items-center gap-3">
              <History className={cn('w-5 h-5 flex-shrink-0', embedSettings.recordHistory ? 'text-emerald-500' : 'text-slate-400')} />
              <div>
                <div className="font-medium text-slate-800 dark:text-white">{t('settings.embed.recordHistory')}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">{t('settings.embed.recordHistoryDesc')}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggleEmbedSetting('recordHistory')}
              className={cn(
                'relative w-14 h-8 rounded-full transition-colors flex-shrink-0',
                embedSettings.recordHistory ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
              )}
            >
              <span
                className={cn(
                  'absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform',
                  embedSettings.recordHistory ? 'translate-0' : '-translate-x-5.5',
                )}
              />
            </button>
          </div>

          {/* embed 模式下是否开启缓存下载 */}
          <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-700/30 rounded-xl">
            <div className="flex items-center gap-3">
              <Database className={cn('w-5 h-5 flex-shrink-0', embedSettings.enableCache ? 'text-emerald-500' : 'text-slate-400')} />
              <div>
                <div className="font-medium text-slate-800 dark:text-white">{t('settings.embed.enableCache')}</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">{t('settings.embed.enableCacheDesc')}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => toggleEmbedSetting('enableCache')}
              className={cn(
                'relative w-14 h-8 rounded-full transition-colors flex-shrink-0',
                embedSettings.enableCache ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
              )}
            >
              <span
                className={cn(
                  'absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform',
                  embedSettings.enableCache ? 'translate-0' : '-translate-x-5.5',
                )}
              />
            </button>
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
