/**
 * Service Worker 更新提示组件
 * 当有新的 Service Worker 可用时，显示更新提示
 */

import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useServiceWorker } from '@/lib/serviceWorker/useServiceWorker'

export function ServiceWorkerUpdate() {
  const { t } = useTranslation()
  const { isSupported, isUpdateAvailable, skipWaiting, isRegistered } = useServiceWorker()
  const [showToast, setShowToast] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    if (isUpdateAvailable && showToast) {
      toast(t('settings.sw.newVersion'), {
        description: t('settings.sw.newVersionDesc'),
        duration: Infinity,
        action: {
          label: (
            <span className="flex items-center gap-1 text-sm font-medium">
              {isUpdating ? <RefreshCw className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {isUpdating ? t('settings.sw.updating') : t('settings.sw.updateNow')}
            </span>
          ),
          onClick: async () => {
            setIsUpdating(true)
            try {
              await skipWaiting()
              window.location.reload()
            } catch (error) {
              console.error('Update failed:', error)
              toast.error(t('settings.sw.updateFailedRetry'))
              setIsUpdating(false)
            }
          },
        },
        classNames: {
          toast: 'bg-slate-900 text-white border-slate-700',
          description: 'text-slate-300',
        },
      })
    }
  }, [isUpdateAvailable, skipWaiting, showToast, isUpdating, t])

  useEffect(() => {
    // 延迟显示提示，避免影响首屏加载
    const timer = setTimeout(() => {
      if (isUpdateAvailable && isRegistered) {
        setShowToast(true)
      }
    }, 3000)

    return () => clearTimeout(timer)
  }, [isUpdateAvailable, isRegistered])

  // 如果不支持 Service Worker，不显示任何内容
  if (!isSupported || !isRegistered) {
    return null
  }

  return null
}
