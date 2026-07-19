/**
 * 嵌入（iframe）模式工具库
 * - 视图模式检测：mode=embed 时仅显示播放器
 * - 未显式指定 mode 且处于 iframe 中时，默认按 embed 处理
 * - 嵌入模式下的行为设置（历史记录、缓存下载）管理
 */

import { StorageKeys, storage } from '@/lib/storage'
import { logger } from '@/utils/logger'

/** 视图模式 */
export type ViewMode = 'full' | 'embed'

/** 嵌入模式行为设置 */
export interface EmbedSettings {
  /** embed 模式下是否自动记录历史记录（默认 false，避免嵌入播放污染主站历史） */
  recordHistory: boolean
  /** embed 模式下是否开启缓存下载（默认 true，保证嵌入播放性能） */
  enableCache: boolean
}

/** 默认嵌入设置 */
const DEFAULT_EMBED_SETTINGS: EmbedSettings = {
  recordHistory: false,
  enableCache: true,
}

/**
 * 检测当前页面是否运行在 iframe 中
 */
export function isInIframe(): boolean {
  try {
    return window.self !== window.top
  } catch {
    // 跨域访问 window.top 会抛异常，此时必然处于 iframe 中
    return true
  }
}

/**
 * 获取当前视图模式
 * 优先级：URL mode 参数 > 旧版 showHeader 参数（向后兼容）> iframe 检测默认值
 */
export function getViewMode(search: string = window.location.search): ViewMode {
  const params = new URLSearchParams(search)

  const mode = params.get('mode')
  if (mode === 'embed' || mode === 'full') return mode

  // 向后兼容旧的 showHeader 参数
  if (params.get('showHeader') === '0') return 'embed'
  if (params.get('showHeader') === '1') return 'full'

  // 在 iframe 中且未显式指定时，默认为 embed 模式
  return isInIframe() ? 'embed' : 'full'
}

/**
 * 当前是否为嵌入模式
 */
export function isEmbedMode(): boolean {
  return getViewMode() === 'embed'
}

/** 嵌入设置变化监听器 */
export type EmbedSettingsListener = (settings: EmbedSettings) => void

const embedSettingsListeners = new Set<EmbedSettingsListener>()

/**
 * 获取嵌入模式设置
 */
export function getEmbedSettings(): EmbedSettings {
  const stored = storage.get<Partial<EmbedSettings>>(StorageKeys.embedSettings, { silent: true })
  return { ...DEFAULT_EMBED_SETTINGS, ...(stored || {}) }
}

/**
 * 更新嵌入模式设置
 */
export function setEmbedSettings(updates: Partial<EmbedSettings>): EmbedSettings {
  const next = { ...getEmbedSettings(), ...updates }
  if (!storage.set(StorageKeys.embedSettings, next)) {
    logger.warn('[embed] Failed to persist embed settings')
  }
  for (const listener of embedSettingsListeners) {
    try {
      listener(next)
    } catch (error) {
      logger.error('[embed] Settings listener error:', error)
    }
  }
  return next
}

/**
 * 监听嵌入设置变化
 * @returns 取消监听的函数
 */
export function subscribeEmbedSettings(listener: EmbedSettingsListener): () => void {
  embedSettingsListeners.add(listener)
  return () => embedSettingsListeners.delete(listener)
}

/**
 * embed 模式下是否应记录历史记录
 */
export function shouldRecordHistory(mode: ViewMode = getViewMode()): boolean {
  if (mode !== 'embed') return true
  return getEmbedSettings().recordHistory
}

/**
 * embed 模式下是否允许缓存下载
 */
export function isCacheAllowed(mode: ViewMode = getViewMode()): boolean {
  if (mode !== 'embed') return true
  return getEmbedSettings().enableCache
}
