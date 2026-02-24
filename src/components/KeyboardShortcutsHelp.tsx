/**
 * 键盘快捷键帮助组件
 * 显示可用的键盘快捷键列表
 */

import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PLAYER_SHORTCUTS } from '@/hooks/useKeyboardShortcuts'
import { cn } from '@/lib/utils'

interface KeyboardShortcutsHelpProps {
  /** 是否显示 */
  show: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 自定义快捷键列表 */
  shortcuts?: typeof PLAYER_SHORTCUTS
}

/**
 * 快捷键分组（标题通过 i18n shortcuts.groups.* 获取）
 */
const SHORTCUT_GROUPS = [
  { name: 'basic', shortcuts: ['togglePlay', 'toggleMute', 'fullscreen', 'pip'] },
  { name: 'seek', shortcuts: ['seekForward', 'seekBackward'] },
  { name: 'volume', shortcuts: ['volumeUp', 'volumeDown'] },
  { name: 'speed', shortcuts: ['speedUp', 'speedDown'] },
  { name: 'other', shortcuts: ['screenshot', 'rotate'] },
]

/**
 * 格式化按键显示
 */
function formatKey(key: string): string {
  const keyMap: Record<string, string> = {
    ' ': 'Space',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    '>': '>',
    '<': '<',
  }
  return keyMap[key] || key.toUpperCase()
}

export default function KeyboardShortcutsHelp({ show, onClose, shortcuts = PLAYER_SHORTCUTS }: KeyboardShortcutsHelpProps) {
  const { t } = useTranslation()

  if (!show) return null

  // 创建快捷键映射
  const shortcutMap = new Map(shortcuts.map((s) => [s.name, s]))

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">⌨️ {t('shortcuts.title', { defaultValue: '键盘快捷键' })}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title={t('common.close', { defaultValue: '关闭' })}
          >
            <X className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          </button>
        </div>

        {/* 快捷键列表 */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.name} className="mb-6 last:mb-0">
              <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-3">{t(`shortcuts.groups.${group.name}`)}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {group.shortcuts.map((name) => {
                  const shortcut = shortcutMap.get(name)
                  if (!shortcut) return null

                  return (
                    <div key={name} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        {t(`shortcuts.${name}`, { defaultValue: shortcut.description || name })}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {shortcut.keys.map((key) => (
                          <kbd
                            key={key}
                            className={cn(
                              'px-2.5 py-1.5 text-sm font-medium rounded-lg',
                              'bg-white dark:bg-slate-600',
                              'border border-slate-200 dark:border-slate-500',
                              'text-slate-700 dark:text-white',
                              'shadow-sm',
                            )}
                          >
                            {formatKey(key)}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* 提示信息 */}
          <div className="mt-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800">
            <p className="text-sm text-indigo-700 dark:text-indigo-300">
              💡 {t('shortcuts.tip', { defaultValue: '提示：在输入框中，大部分快捷键会被禁用，避免干扰输入。' })}
            </p>
          </div>
        </div>

        {/* 底部 */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl transition-colors"
          >
            {t('common.close', { defaultValue: '关闭' })}
          </button>
        </div>
      </div>
    </div>
  )
}
