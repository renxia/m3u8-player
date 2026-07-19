/**
 * 视图模式 Hook
 * 解析 URL mode 参数，结合 iframe 检测，返回当前视图模式（full / embed）
 */

import { useSearchParams } from 'react-router'
import { isInIframe, type ViewMode } from '@/lib/embed'

/**
 * 获取当前视图模式
 * 优先级：URL mode 参数 > 旧版 showHeader 参数（向后兼容）> iframe 检测默认值（embed）
 */
export function useViewMode(): ViewMode {
  const [searchParams] = useSearchParams()

  const mode = searchParams.get('mode')
  if (mode === 'embed' || mode === 'full') return mode

  // 向后兼容旧的 showHeader 参数
  const showHeader = searchParams.get('showHeader')
  if (showHeader === '0') return 'embed'
  if (showHeader === '1') return 'full'

  // 在 iframe 中且未显式指定时，默认为 embed 模式
  return isInIframe() ? 'embed' : 'full'
}

/** 当前是否为嵌入模式 */
export function useIsEmbedMode(): boolean {
  return useViewMode() === 'embed'
}
