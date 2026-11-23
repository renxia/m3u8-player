/**
 * 对话框基座
 * 统一处理：遮罩层、role=dialog / aria-modal、Esc 关闭、背景滚动锁定、焦点陷阱与焦点归还
 */

import { type ReactNode, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export interface DialogProps {
  /** 是否显示 */
  show: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 标题元素 id（用于 aria-labelledby） */
  labelledBy?: string
  /** 面板额外类名（如自定义最大宽度） */
  panelClassName?: string
  children: ReactNode
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Dialog({ show, onClose, labelledBy, panelClassName, children }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!show) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const getFocusable = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])

    // 打开后把焦点移入面板
    getFocusable()[0]?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      // 焦点陷阱：Tab / Shift+Tab 在面板内循环
      const focusable = getFocusable()
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    // 捕获阶段监听，避免被页面级快捷键拦截
    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [show, onClose])

  if (!show) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          'flex flex-col w-full max-w-2xl max-h-[85vh] overflow-hidden bg-white dark:bg-slate-800 rounded-2xl shadow-2xl',
          panelClassName,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
