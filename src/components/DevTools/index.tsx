/**
 * 开发工具入口组件
 * 仅在开发环境下可用
 */

import { useEffect, useState } from 'react'
import { PerformancePanel } from './PerformancePanel'

// 开发模式检测
const isDevelopment = import.meta.env.DEV

// 本地存储键
const DEVTOOLS_VISIBLE_KEY = 'devtools_visible'

export function DevTools() {
  const [visible, setVisible] = useState(() => {
    // 从 localStorage 读取状态
    if (!isDevelopment) return false
    const stored = localStorage.getItem(DEVTOOLS_VISIBLE_KEY)
    return stored === 'true'
  })

  // 快捷键切换 (Ctrl/Cmd + Shift + D)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        setVisible((prev) => {
          const newValue = !prev
          localStorage.setItem(DEVTOOLS_VISIBLE_KEY, String(newValue))
          return newValue
        })
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [])

  // 仅在开发环境下渲染
  if (!isDevelopment) return null

  return (
    <>
      {/* 悬浮按钮 */}
      <button
        onClick={() => {
          const newValue = !visible
          setVisible(newValue)
          localStorage.setItem(DEVTOOLS_VISIBLE_KEY, String(newValue))
        }}
        className="fixed bottom-4 right-4 z-50 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg shadow-lg text-xs font-medium"
        style={{ display: visible ? 'none' : 'block' }}
      >
        🛠️ DevTools
      </button>

      {/* 性能监控面板 */}
      <PerformancePanel visible={visible} />
    </>
  )
}
