/**
 * Service Worker 更新提示组件
 * 当有新的 Service Worker 可用时，显示更新提示
 */

import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useServiceWorker } from '@/lib/serviceWorker/useServiceWorker'

export function ServiceWorkerUpdate() {
  const { isSupported, isUpdateAvailable, skipWaiting, isRegistered } = useServiceWorker()
  const [showToast, setShowToast] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    if (isUpdateAvailable && showToast) {
      toast('发现新版本可用', {
        description: '点击刷新按钮即可更新到最新版本',
        duration: Infinity,
        action: {
          label: (
            <span className="flex items-center gap-1 text-sm font-medium">
              {isUpdating ? <RefreshCw className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {isUpdating ? '更新中...' : '立即更新'}
            </span>
          ),
          onClick: async () => {
            setIsUpdating(true)
            try {
              await skipWaiting()
              window.location.reload()
            } catch (error) {
              console.error('Update failed:', error)
              toast.error('更新失败，请刷新页面重试')
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
  }, [isUpdateAvailable, skipWaiting, showToast, isUpdating])

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
