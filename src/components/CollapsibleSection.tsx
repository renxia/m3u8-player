import { ChevronDown } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { StorageKeys, storage } from '@/lib/storage'

export interface CollapsibleSectionProps {
  /** 唯一标识符，用于区分不同的部分（如 'instructions', 'features', 'faq'） */
  sectionKey: string
  /** 标题文本或自定义标题内容 */
  title?: string | React.ReactNode
  /** 子内容 */
  children: React.ReactNode
  /** 默认是否展开，默认为 true */
  defaultExpanded?: boolean
  /** 自定义 className */
  className?: string
  /** 标题的 className */
  titleClassName?: string
  /** 自定义标题渲染函数，接收 isExpanded 和 toggleExpanded 参数 */
  titleRender?: (isExpanded: boolean, toggleExpanded: () => void) => React.ReactNode
  /** 收起时的隐藏模式：'hidden' 使用 CSS 隐藏（默认），'remove' 从 DOM 中移除 */
  hideMode?: 'hidden' | 'remove'
  /** 是否使用紧凑模式，默认为 false */
  compact?: boolean
}

/**
 * 可折叠区域组件
 * 支持折叠展开功能，并自动将状态保存到 localStorage
 */
const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  sectionKey,
  title,
  children,
  defaultExpanded = true,
  className = '',
  titleClassName = '',
  titleRender,
  hideMode = 'hidden',
  compact = false,
}) => {
  const storageKey = `${StorageKeys.COLLAPSIBLE_SECTION}:${sectionKey}`

  // 从 storage 读取保存的状态，如果没有则使用默认值
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return defaultExpanded
    }
    const saved = storage.get<boolean>(storageKey, {
      defaultValue: defaultExpanded,
      validator: (value): value is boolean => typeof value === 'boolean',
      silent: true,
    })
    return saved ?? defaultExpanded
  })

  // 当状态改变时，保存到 storage
  useEffect(() => {
    storage.set(storageKey, isExpanded, { silent: true })
  }, [isExpanded, storageKey])

  const toggleExpanded = () => {
    setIsExpanded((prev) => !prev)
  }

  // 如果提供了自定义标题渲染函数，使用它
  if (titleRender) {
    return (
      <div className={className}>
        {titleRender(isExpanded, toggleExpanded)}
        <div
          id={`collapsible-content-${sectionKey}`}
          className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}
        >
          {hideMode === 'remove' ? isExpanded && <div>{children}</div> : <div className={isExpanded ? 'block' : 'hidden'}>{children}</div>}
        </div>
      </div>
    )
  }

  // 根据 compact 模式决定默认样式
  const hasPadding = className.includes(' p-') || className.startsWith('p-')
  const defaultContainerClass = compact
    ? `bg-white rounded-lg shadow-md mt-2 ${hasPadding ? '' : 'p-3'}`
    : `bg-white rounded-lg shadow-md mt-6 ${hasPadding ? '' : 'p-6'}`
  const defaultTitleClass = compact ? 'text-sm text-gray-700' : 'text-xl text-gray-800'
  const iconSize = compact ? 'w-4 h-4' : 'w-5 h-5'

  return (
    <div className={`${defaultContainerClass} ${className}`}>
      <button
        type="button"
        onClick={toggleExpanded}
        className={`flex items-center justify-between w-full text-left font-semibold ${titleClassName || defaultTitleClass}`}
        aria-expanded={isExpanded}
        aria-controls={`collapsible-content-${sectionKey}`}
      >
        <span>{title}</span>
        <span
          className="ml-2 flex-shrink-0 text-gray-600 transition-transform duration-200"
          style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        >
          <ChevronDown className={iconSize} />
        </span>
      </button>
      <div
        id={`collapsible-content-${sectionKey}`}
        className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[5000px] opacity-100 mt-2' : 'max-h-0 opacity-0'}`}
      >
        {hideMode === 'remove' ? isExpanded && <div>{children}</div> : <div className={isExpanded ? 'block' : 'hidden'}>{children}</div>}
      </div>
    </div>
  )
}

export default CollapsibleSection
