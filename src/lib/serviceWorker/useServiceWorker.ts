/**
 * useServiceWorker Hook
 * 提供 Service Worker 注册、更新和状态管理
 */

import { useEffect, useState } from 'react'
import { cacheUrl, isServiceWorkerSupported, registerServiceWorker, type ServiceWorkerController } from './serviceWorkerRegistration'

interface ServiceWorkerState {
  isSupported: boolean
  isRegistered: boolean
  isControlled: boolean
  isUpdateAvailable: boolean
  controller?: ServiceWorkerController
  error?: Error
}

export function useServiceWorker(scriptUrl: string = '/sw.js') {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: isServiceWorkerSupported(),
    isRegistered: false,
    isControlled: false,
    isUpdateAvailable: false,
  })

  useEffect(() => {
    if (!state.isSupported) {
      return
    }

    const register = async () => {
      try {
        const controller = await registerServiceWorker(scriptUrl, {
          onSuccess: () => {
            setState((prev) => ({
              ...prev,
              isRegistered: true,
              isControlled: !!navigator.serviceWorker.controller,
              controller,
            }))
          },
          onUpdate: () => {
            setState((prev) => ({
              ...prev,
              isUpdateAvailable: true,
            }))
          },
          onError: (error) => {
            setState((prev) => ({
              ...prev,
              error,
            }))
          },
        })
      } catch (error) {
        console.error('[useServiceWorker] Registration failed:', error)
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error : new Error(String(error)),
        }))
      }
    }

    register()

    // 监听 Service Worker 控制状态变化
    const handleControllerChange = () => {
      setState((prev) => ({
        ...prev,
        isControlled: !!navigator.serviceWorker.controller,
        isUpdateAvailable: false,
      }))
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
  }, [scriptUrl, state.isSupported])

  return {
    ...state,
    update: async () => {
      if (!state.isRegistered) {
        throw new Error('Service Worker is not registered')
      }
      await state.controller?.update()
    },
    skipWaiting: async () => {
      if (!state.isRegistered) {
        throw new Error('Service Worker is not registered')
      }
      await state.controller?.skipWaiting()
    },
    clearCache: async (cacheName?: string) => {
      if (!state.isRegistered) {
        throw new Error('Service Worker is not registered')
      }
      await state.controller?.clearCache(cacheName)
    },
    cacheUrl: async (url: string) => {
      if (!state.isRegistered) {
        throw new Error('Service Worker is not registered')
      }
      await cacheUrl(url, state.controller?.getRegistration())
    },
  }
}
