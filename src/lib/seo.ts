/**
 * SEO 配置和工具函数
 * 用于根据路由和语言更新页面的 SEO 信息
 */

import { useTranslation } from 'react-i18next'

/**
 * 页面 SEO 配置类型
 */
export interface PageSeoConfig {
  /** 页面路径 */
  path: string
  /** 翻译 key 前缀，例如 'index', 'about' */
  i18nKey: string
  /** 可选的自定义标题（会覆盖翻译中的标题） */
  customTitle?: string
  /** 可选的自定义描述（会覆盖翻译中的描述） */
  customDescription?: string
  /** 可选的自定义关键词（会覆盖翻译中的关键词） */
  customKeywords?: string
}

/**
 * SEO 元数据类型
 */
export interface SeoMeta {
  title: string
  description: string
  keywords: string
  author?: string
}

/**
 * 页面路由到 SEO 配置的映射
 */
export const PAGE_SEO_CONFIG: Record<string, PageSeoConfig> = {
  '/': { path: '/', i18nKey: 'meta' },
  '/en': { path: '/en', i18nKey: 'meta' },
  '/ja-JP': { path: '/ja-JP', i18nKey: 'meta' },
  '/about': { path: '/about', i18nKey: 'about' },
  '/download': { path: '/download', i18nKey: 'download' },
  '/feedback': { path: '/feedback', i18nKey: 'feedback' },
  '/settings': { path: '/settings', i18nKey: 'settings' },
}

/**
 * 根据 path 获取 SEO 配置
 */
export function getSeoConfig(path: string): PageSeoConfig | undefined {
  // 精确匹配
  if (PAGE_SEO_CONFIG[path]) {
    return PAGE_SEO_CONFIG[path]
  }

  // 尝试匹配子路径（如 /en/about -> /about 的配置）
  const [, basePath] = path.match(/^(?:\/en|\/ja-JP)?(.+)$/) || []
  if (basePath && PAGE_SEO_CONFIG[basePath]) {
    return PAGE_SEO_CONFIG[basePath]
  }

  return undefined
}

/**
 * 设置页面的 meta 标签
 */
export function setMetaTags(meta: SeoMeta): void {
  // 设置标题
  document.title = meta.title

  // 设置或更新 meta 标签
  updateMetaTag('name', 'description', meta.description)
  updateMetaTag('name', 'keywords', meta.keywords)
  if (meta.author) {
    updateMetaTag('name', 'author', meta.author)
  }

  // 设置 Open Graph 标签
  updateMetaTag('property', 'og:title', meta.title)
  updateMetaTag('property', 'og:description', meta.description)
  updateMetaTag('property', 'og:type', 'website')

  // 设置 Twitter 标签
  updateMetaTag('name', 'twitter:title', meta.title)
  updateMetaTag('name', 'twitter:description', meta.description)
  updateMetaTag('name', 'twitter:card', 'summary_large_image')
}

/**
 * 更新或创建 meta 标签
 */
function updateMetaTag(attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement | null

  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }

  element.setAttribute('content', content)
}

/**
 * 获取当前页面的 SEO 元数据
 */
export function getPageSeoMeta(i18nKey: string): SeoMeta {
  const { t } = useTranslation()

  // 默认使用 meta 作为 SEO 配置
  const seoKey = i18nKey || 'meta'

  return {
    title: t(`${seoKey}.title`),
    description: t(`${seoKey}.description`),
    keywords: t(`${seoKey}.keywords`),
    author: t(`${seoKey}.author`),
  }
}
