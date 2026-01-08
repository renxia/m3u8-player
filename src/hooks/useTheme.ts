import { useEffect, useState } from 'react'
import { StorageKeys, storage } from '@/lib/storage'

export type Theme = 'light' | 'dark' | 'system'

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  return (storage.get<Theme>(StorageKeys.theme) || 'system') as Theme
}

function applyTheme(theme: 'light' | 'dark') {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => {
    const stored = getStoredTheme()
    return stored === 'system' ? getSystemTheme() : stored
  })

  // 初始化主题
  useEffect(() => {
    const stored = getStoredTheme()
    const initialTheme = stored === 'system' ? getSystemTheme() : stored
    applyTheme(initialTheme)
    setResolvedTheme(initialTheme)
  }, [])

  // 监听系统主题变化
  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? 'dark' : 'light'
      applyTheme(newTheme)
      setResolvedTheme(newTheme)
    }

    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  // 切换主题
  const toggleTheme = (newTheme?: Theme) => {
    const targetTheme = newTheme || (theme === 'dark' ? 'light' : 'dark')
    setTheme(targetTheme)

    if (targetTheme === 'system') {
      const systemTheme = getSystemTheme()
      applyTheme(systemTheme)
      setResolvedTheme(systemTheme)
    } else {
      applyTheme(targetTheme)
      setResolvedTheme(targetTheme)
    }

    storage.set(StorageKeys.theme, targetTheme)
  }

  return {
    theme,
    resolvedTheme,
    toggleTheme,
    setTheme: toggleTheme,
  }
}
