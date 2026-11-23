/**
 * 语言清单（唯一来源）
 * 新增语言时：本文件加一项 + 在 src/i18n/locales 下加对应 JSON 即可，
 * 路由、SEO、语言切换、预渲染都会自动跟随，避免多处清单漂移。
 */

export const supportedLanguages = ['zh-CN', 'en', 'ja-JP', 'fr', 'de', 'pt', 'es'] as const

export type SupportedLanguage = (typeof supportedLanguages)[number]

/** 默认语言：挂载在根路径 `/` */
export const defaultLanguage: SupportedLanguage = 'zh-CN'

/**
 * 语言的路径前缀（默认语言返回空串）
 * @example getLangPrefix('en') // '/en'；getLangPrefix('zh-CN') // ''
 */
export function getLangPathPrefix(lang: string): string {
  return lang === defaultLanguage ? '' : `/${lang}`
}

/**
 * 从 pathname 解析语言前缀
 * 未命中任何语言时返回 null（调用方可回退到浏览器语言探测）
 */
export function detectLangFromPath(pathname: string): SupportedLanguage | null {
  for (const lang of supportedLanguages) {
    if (lang === defaultLanguage) continue
    if (pathname === `/${lang}` || pathname.startsWith(`/${lang}/`)) return lang
  }
  return null
}

/**
 * 去掉 pathname 中的语言前缀，返回页面自身的路径
 * @example stripLangPrefix('/en/about') // '/about'
 */
export function stripLangPrefix(pathname: string): string {
  const lang = detectLangFromPath(pathname)
  if (!lang) return pathname || '/'
  const rest = pathname.slice(lang.length + 1)
  return rest.startsWith('/') ? rest : `/${rest}`
}
