/**
 * SEO 配置和工具函数
 * 用于根据路由和语言更新页面的 SEO 信息
 */

import { defaultLanguage, getLangPathPrefix, stripLangPrefix, supportedLanguages } from '@/i18n/languages'

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
 * 页面路由到 SEO 配置的映射（按「去掉语言前缀」后的页面路径登记，
 * 因此新增语言无需在此重复配置）
 */
export const PAGE_SEO_CONFIG: Record<string, PageSeoConfig> = {
  '/': { path: '/', i18nKey: 'meta' },
  '/about': { path: '/about', i18nKey: 'about' },
  '/download': { path: '/download', i18nKey: 'download' },
  '/feedback': { path: '/feedback', i18nKey: 'feedback' },
  '/settings': { path: '/settings', i18nKey: 'settings' },
}

/**
 * 把页面命名空间映射到 SEO 文案的 key 前缀
 * 首页的文案直接挂在 meta.* 下，其余页面的文案挂在 <page>.meta.* 下
 */
export function getSeoI18nPrefix(i18nKey: string): string {
  return i18nKey === 'meta' ? 'meta' : `${i18nKey}.meta`
}

/**
 * 根据 path 获取 SEO 配置（自动忽略语言前缀）
 */
export function getSeoConfig(path: string): PageSeoConfig | undefined {
  const basePath = stripLangPrefix(path)
  return PAGE_SEO_CONFIG[basePath]
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
 * 设置 canonical 与 hreflang（含 x-default），并同步 <html lang>
 * 单页应用切换路由时 meta 会残留，因此每次都要重建 alternate 链接
 */
export function setLanguageLinks(pathname: string, currentLang?: string): void {
  const basePath = stripLangPrefix(pathname)
  const origin = window.location.origin
  const langOf = (lang: string) => `${origin}${getLangPathPrefix(lang)}${basePath === '/' ? '' : basePath}` || `${origin}/`
  const activeLang = currentLang || (pathname === basePath ? defaultLanguage : pathname.split('/')[1])

  // canonical 指向当前语言版本
  updateLinkTag('canonical', '', langOf(activeLang))

  // 清理旧的 alternate，避免切换路由后残留
  for (const el of document.querySelectorAll('link[rel="alternate"][hreflang]')) {
    el.remove()
  }

  for (const lang of supportedLanguages) {
    const link = document.createElement('link')
    link.rel = 'alternate'
    link.hreflang = lang
    link.href = langOf(lang)
    document.head.appendChild(link)
  }

  // x-default 指向默认语言版本
  const xDefault = document.createElement('link')
  xDefault.rel = 'alternate'
  xDefault.hreflang = 'x-default'
  xDefault.href = langOf(defaultLanguage)
  document.head.appendChild(xDefault)

  document.documentElement.lang = currentLang || defaultLanguage
}

/**
 * 更新或创建 link 标签
 */
function updateLinkTag(rel: string, hreflang: string, href: string): void {
  const selector = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]`
  let element = document.querySelector(selector) as HTMLLinkElement | null

  if (!element) {
    element = document.createElement('link')
    element.rel = rel
    if (hreflang) element.hreflang = hreflang
    document.head.appendChild(element)
  }

  element.href = href
}
