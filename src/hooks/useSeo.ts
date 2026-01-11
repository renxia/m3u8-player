/**
 * SEO Hook
 * 用于根据路由和语言类型变化更新 title、description 等 meta 信息
 */

import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { getSeoConfig, type SeoMeta, setMetaTags } from '@/lib/seo'
import { logger } from '@/utils/logger'

export interface UseSeoOptions {
  /** 自定义标题（会覆盖默认值） */
  customTitle?: string
  /** 自定义描述（会覆盖默认值） */
  customDescription?: string
  /** 自定义关键词（会覆盖默认值） */
  customKeywords?: string
  /** 是否启用（默认 true） */
  enabled?: boolean
}

/**
 * SEO Hook
 *
 * @example 基本用法
 * ```tsx
 * useSeo()
 * ```
 *
 * @example 自定义 SEO 信息
 * ```tsx
 * useSeo({
 *   customTitle: '我的自定义标题',
 *   customDescription: '我的自定义描述'
 * })
 * ```
 */
export function useSeo(options: UseSeoOptions = {}) {
  const { customTitle, customDescription, customKeywords, enabled = true } = options
  const location = useLocation()
  const { t, i18n } = useTranslation()
  const previousPathRef = useRef<string>('')
  const previousLangRef = useRef<string>('')

  useEffect(() => {
    if (!enabled) return

    const currentPath = location.pathname
    const currentLang = i18n.language

    // 如果路径和语言都没有变化，则跳过更新
    if (previousPathRef.current === currentPath && previousLangRef.current === currentLang) {
      return
    }

    // 更新引用
    previousPathRef.current = currentPath
    previousLangRef.current = currentLang

    // 获取 SEO 配置
    const seoConfig = getSeoConfig(currentPath)

    if (!seoConfig) {
      logger.warn('[useSeo] No SEO config found for path:', currentPath)
      return
    }

    try {
      // 获取默认的 SEO 元数据
      const defaultMeta: SeoMeta = {
        title: t(`${seoConfig.i18nKey}.title`),
        description: t(`${seoConfig.i18nKey}.description`),
        keywords: t(`${seoConfig.i18nKey}.keywords`),
        author: t(`${seoConfig.i18nKey}.author`),
      }

      // 合并自定义配置
      const finalMeta: SeoMeta = {
        title: customTitle || defaultMeta.title,
        description: customDescription || defaultMeta.description,
        keywords: customKeywords || defaultMeta.keywords,
        author: defaultMeta.author,
      }

      // 设置 meta 标签
      setMetaTags(finalMeta)

      logger.debug('[useSeo] Updated SEO meta:', {
        path: currentPath,
        lang: currentLang,
        title: finalMeta.title,
      })
    } catch (error) {
      logger.error('[useSeo] Failed to update SEO meta:', error)
    }
  }, [location.pathname, i18n.language, customTitle, customDescription, customKeywords, enabled, t])

  // 返回一个手动更新 SEO 的函数，供特殊情况使用
  const updateSeo = (newOptions: Partial<UseSeoOptions>) => {
    const currentPath = location.pathname
    const seoConfig = getSeoConfig(currentPath)

    if (!seoConfig) {
      logger.warn('[useSeo] No SEO config found for path:', currentPath)
      return
    }

    try {
      const meta: SeoMeta = {
        title: newOptions.customTitle || t(`${seoConfig.i18nKey}.title`),
        description: newOptions.customDescription || t(`${seoConfig.i18nKey}.description`),
        keywords: newOptions.customKeywords || t(`${seoConfig.i18nKey}.keywords`),
        author: t(`${seoConfig.i18nKey}.author`),
      }

      setMetaTags(meta)
      logger.debug('[useSeo] Manual SEO update:', meta)
    } catch (error) {
      logger.error('[useSeo] Failed to manually update SEO meta:', error)
    }
  }

  return { updateSeo }
}

/**
 * 用于页面组件的简化 hook
 * 可以在页面组件中直接调用，传入自定义的 SEO 信息
 */
export function usePageSeo(options: UseSeoOptions = {}) {
  return useSeo(options)
}
