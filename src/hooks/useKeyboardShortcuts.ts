/**
 * 键盘快捷键 Hook
 * 提供全局键盘快捷键功能
 */

import { useCallback, useEffect, useRef } from 'react'

export interface KeyboardShortcut {
  /** 快捷键名称 */
  name: string
  /** 按键或组合键（如 'space', 'm', 'arrowleft' 等） */
  keys: string[]
  /** 回调函数 */
  callback: (e: KeyboardEvent) => void
  /** 是否在输入框中禁用 */
  disableInInput?: boolean
  /** 快捷键描述 */
  description?: string
}

export interface UseKeyboardShortcutsOptions {
  /** 是否启用快捷键 */
  enabled?: boolean
  /** 快捷键列表 */
  shortcuts?: KeyboardShortcut[]
  /** 当快捷键触发时的回调 */
  onShortcutTriggered?: (name: string, e: KeyboardEvent) => void
}

/**
 * 键盘快捷键管理器
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const { enabled = true, shortcuts = [], onShortcutTriggered } = options
  const shortcutsRef = useRef<KeyboardShortcut[]>(shortcuts)

  // 更新快捷键引用
  useEffect(() => {
    shortcutsRef.current = shortcuts
  }, [shortcuts])

  // 检查是否在输入元素中
  const isInputActive = useCallback((target: EventTarget | null): boolean => {
    if (!target) return false
    const element = target as HTMLElement
    const tagName = element.tagName.toLowerCase()
    return tagName === 'input' || tagName === 'textarea' || element.isContentEditable || element.getAttribute('role') === 'textbox'
  }, [])

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return

      // 检查是否在输入元素中
      if (isInputActive(e.target)) {
        // 只处理特定的输入框快捷键
        const isInputShortcut = shortcutsRef.current.some(
          (shortcut) => shortcut.keys.includes(e.key.toLowerCase()) && !shortcut.disableInInput,
        )
        if (!isInputShortcut) return
      }

      const key = e.key.toLowerCase()

      // 查找匹配的快捷键
      for (const shortcut of shortcutsRef.current) {
        // 检查是否在输入框中且快捷键被禁用
        if (isInputActive(e.target) && shortcut.disableInInput) {
          continue
        }

        if (shortcut.keys.includes(key)) {
          e.preventDefault()
          onShortcutTriggered?.(shortcut.name, e)
          shortcut.callback(e)
          break
        }
      }
    },
    [enabled, isInputActive, onShortcutTriggered],
  )

  // 注册键盘事件监听器
  useEffect(() => {
    if (!enabled) return

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, handleKeyDown])

  return { shortcuts }
}

/**
 * 预定义的播放器快捷键
 */
export const PLAYER_SHORTCUTS: KeyboardShortcut[] = [
  {
    name: 'togglePlay',
    keys: [' '],
    callback: (e) => {
      e.stopPropagation()
    },
    disableInInput: true,
    description: '播放/暂停',
  },
  {
    name: 'toggleMute',
    keys: ['m'],
    callback: (e) => {
      e.stopPropagation()
    },
    disableInInput: true,
    description: '静音/取消静音',
  },
  {
    name: 'fullscreen',
    keys: ['f'],
    callback: (e) => {
      e.stopPropagation()
    },
    disableInInput: true,
    description: '全屏/退出全屏',
  },
  {
    name: 'seekForward',
    keys: ['arrowright'],
    callback: (e) => {
      e.stopPropagation()
    },
    disableInInput: true,
    description: '快进 10 秒',
  },
  {
    name: 'seekBackward',
    keys: ['arrowleft'],
    callback: (e) => {
      e.stopPropagation()
    },
    disableInInput: true,
    description: '快退 10 秒',
  },
  {
    name: 'volumeUp',
    keys: ['arrowup'],
    callback: (e) => {
      e.stopPropagation()
    },
    disableInInput: true,
    description: '音量增加 10%',
  },
  {
    name: 'volumeDown',
    keys: ['arrowdown'],
    callback: (e) => {
      e.stopPropagation()
    },
    disableInInput: true,
    description: '音量减少 10%',
  },
  {
    name: 'speedUp',
    keys: ['>'],
    callback: (e) => {
      e.stopPropagation()
    },
    disableInInput: true,
    description: '加速',
  },
  {
    name: 'speedDown',
    keys: ['<'],
    callback: (e) => {
      e.stopPropagation()
    },
    disableInInput: true,
    description: '减速',
  },
  {
    name: 'pip',
    keys: ['p'],
    callback: (e) => {
      e.stopPropagation()
    },
    disableInInput: true,
    description: '画中画',
  },
  {
    name: 'screenshot',
    keys: ['c'],
    callback: (e) => {
      e.stopPropagation()
    },
    disableInInput: true,
    description: '截图',
  },
  {
    name: 'rotate',
    keys: ['r'],
    callback: (e) => {
      e.stopPropagation()
    },
    disableInInput: true,
    description: '旋转画面',
  },
]
