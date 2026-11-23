/**
 * Service Worker 设置组件
 * 提供 Service Worker 管理选项
 */

import { CheckCircle, RefreshCw, Trash2, Wifi, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useServiceWorker } from '@/lib/serviceWorker/useServiceWorker'
import { logger } from '@/utils/logger'

export function ServiceWorkerSettings() {
  const { t } = useTranslation()
  const { isSupported, isRegistered, isControlled, isUpdateAvailable, update, skipWaiting, clearCache } = useServiceWorker()
  const [isClearingCache, setIsClearingCache] = useState(false)

  const handleClearCache = async () => {
    if (!window.confirm(t('settings.sw.confirmClear'))) return

    setIsClearingCache(true)
    try {
      await clearCache()
      toast.success(t('settings.sw.cleared'))
    } catch (error) {
      logger.error('[ServiceWorkerSettings] Clear cache failed:', error)
      toast.error(t('settings.sw.clearFailed'))
    } finally {
      setIsClearingCache(false)
    }
  }

  const handleUpdate = async () => {
    try {
      await update()
      toast.info(t('settings.sw.checking'))
    } catch (error) {
      logger.error('[ServiceWorkerSettings] Update failed:', error)
      toast.error(t('settings.sw.updateFailed'))
    }
  }

  const handleSkipWaiting = async () => {
    try {
      await skipWaiting()
      window.location.reload()
    } catch (error) {
      logger.error('[ServiceWorkerSettings] Skip waiting failed:', error)
      toast.error(t('settings.sw.activateFailed'))
    }
  }

  // 如果不支持 Service Worker，不显示设置
  if (!isSupported) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 mt-4 dark:border-red-800 dark:bg-red-950/20">
        <div className="flex items-start gap-3">
          <XCircle className="size-5 flex-shrink-0 text-red-500" />
          <div>
            <h3 className="font-medium text-red-900 dark:text-red-100">{t('settings.sw.unsupportedTitle')}</h3>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">{t('settings.sw.unsupportedDesc')}</p>
          </div>
        </div>
      </div>
    )
  }

  const statusRows = [
    {
      key: 'registered',
      icon: isRegistered ? <CheckCircle className="size-5 text-green-500" /> : <XCircle className="size-5 text-red-500" />,
      label: t('settings.sw.registered'),
      value: isRegistered ? t('settings.sw.yes') : t('settings.sw.no'),
    },
    {
      key: 'controlled',
      icon: isControlled ? <Wifi className="size-5 text-blue-500" /> : <Wifi className="size-5 text-slate-400" />,
      label: t('settings.sw.controlled'),
      value: isControlled ? t('settings.sw.yes') : t('settings.sw.no'),
    },
    {
      key: 'update',
      icon: isUpdateAvailable ? <RefreshCw className="size-5 text-amber-500" /> : <CheckCircle className="size-5 text-green-500" />,
      label: t('settings.sw.latest'),
      value: isUpdateAvailable ? t('settings.sw.hasUpdate') : t('settings.sw.upToDate'),
    },
  ]

  return (
    <div className="space-y-4 mt-4">
      {/* 状态卡片 */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-3">
          {statusRows.map((row) => (
            <div key={row.key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {row.icon}
                <span className="text-sm text-slate-700 dark:text-slate-300">{row.label}</span>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      {isRegistered && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">{t('settings.sw.actions')}</h3>

          <div className="flex flex-wrap gap-2">
            {isUpdateAvailable && (
              <button
                type="button"
                onClick={handleSkipWaiting}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="size-4" />
                {t('settings.sw.updateNow')}
              </button>
            )}

            <button
              type="button"
              onClick={handleUpdate}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-500 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className="size-4" />
              {t('settings.sw.checkUpdate')}
            </button>

            <button
              type="button"
              onClick={handleClearCache}
              disabled={isClearingCache}
              className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isClearingCache ? <RefreshCw className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {t('settings.sw.clearCache')}
            </button>
          </div>
        </div>
      )}

      {/* 说明 */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
        <p className="text-xs text-blue-900 dark:text-blue-100">{t('settings.sw.note')}</p>
      </div>
    </div>
  )
}
