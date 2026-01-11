/**
 * Service Worker 设置组件
 * 提供 Service Worker 管理选项
 */

import { CheckCircle, RefreshCw, Trash2, Wifi, XCircle } from 'lucide-react'
import { useState } from 'react'
import { useServiceWorker } from '@/lib/serviceWorker/useServiceWorker'
import { dialog } from '@/utils/toast'

export function ServiceWorkerSettings() {
  const { isSupported, isRegistered, isControlled, isUpdateAvailable, update, skipWaiting, clearCache } = useServiceWorker()
  const [isClearingCache, setIsClearingCache] = useState(false)

  const handleClearCache = async () => {
    const { isConfirmed } = await dialog.confirm('确定要清除所有缓存吗？这将导致离线内容无法访问。')
    if (!isConfirmed) {
      return
    }

    setIsClearingCache(true)
    try {
      await clearCache()
      dialog.alert('缓存已清除')
    } catch (error) {
      console.error('Clear cache failed:', error)
      dialog.alert('清除缓存失败', { icon: 'error' })
    } finally {
      setIsClearingCache(false)
    }
  }

  const handleUpdate = async () => {
    try {
      await update()
      dialog.toast('正在检查更新...')
    } catch (error) {
      console.error('Update failed:', error)
      dialog.alert('更新失败', { icon: 'error' })
    }
  }

  const handleSkipWaiting = async () => {
    try {
      await skipWaiting()
      window.location.reload()
    } catch (error) {
      console.error('Skip waiting failed:', error)
      dialog.alert('激活失败', { icon: 'error' })
    }
  }

  // 如果不支持 Service Worker，不显示设置
  if (!isSupported) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 mt-4 dark:border-red-800 dark:bg-red-950/20">
        <div className="flex items-start gap-3">
          <XCircle className="size-5 flex-shrink-0 text-red-500" />
          <div>
            <h3 className="font-medium text-red-900 dark:text-red-100">Service Worker 不可用</h3>
            <p className="mt-1 text-sm text-red-700 dark:text-red-300">您的浏览器不支持 Service Worker，无法使用离线播放功能。</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 mt-4">
      {/* 状态卡片 */}
      <div className="space-y-3">
        {/* <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">Service Worker 状态</h3> */}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="space-y-3">
            {/* 注册状态 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isRegistered ? <CheckCircle className="size-5 text-green-500" /> : <XCircle className="size-5 text-red-500" />}
                <span className="text-sm text-slate-700 dark:text-slate-300">已注册</span>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">{isRegistered ? '是' : '否'}</span>
            </div>

            {/* 控制状态 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isControlled ? <Wifi className="size-5 text-blue-500" /> : <Wifi className="size-5 text-slate-400" />}
                <span className="text-sm text-slate-700 dark:text-slate-300">已控制页面</span>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">{isControlled ? '是' : '否'}</span>
            </div>

            {/* 更新状态 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isUpdateAvailable ? <RefreshCw className="size-5 text-amber-500" /> : <CheckCircle className="size-5 text-green-500" />}
                <span className="text-sm text-slate-700 dark:text-slate-300">最新版本</span>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">{isUpdateAvailable ? '有更新' : '已是最新'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      {isRegistered && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">操作</h3>

          <div className="flex flex-wrap gap-2">
            {isUpdateAvailable && (
              <button
                type="button"
                onClick={handleSkipWaiting}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className="size-4" />
                立即更新
              </button>
            )}

            <button
              type="button"
              onClick={handleUpdate}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-500 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className="size-4" />
              检查更新
            </button>

            <button
              type="button"
              onClick={handleClearCache}
              disabled={isClearingCache}
              className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isClearingCache ? <RefreshCw className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              清除缓存
            </button>
          </div>
        </div>
      )}

      {/* 说明 */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/20">
        <p className="text-xs text-blue-900 dark:text-blue-100">
          <strong>Service Worker</strong> 提供离线播放和缓存功能。启用后，您可以离线访问已缓存的视频内容和页面。
        </p>
      </div>
    </div>
  )
}
