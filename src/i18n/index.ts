import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import de from './locales/de.json'
import en from './locales/en.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import jaJP from './locales/ja-JP.json'
import pt from './locales/pt.json'
import zhCN from './locales/zh-CN.json'

// 检测当前语言
function detectLanguage(): string {
  const pathname = window.location.pathname
  for (const lang of supportedLanguages) {
    if (pathname.startsWith(`/${lang}/`) || pathname === `/${lang}`) return lang
  }

  // 根据浏览器语言
  const navLang = navigator.language || (navigator as any).userLanguage
  if (navLang.startsWith('ja')) return 'ja-JP'

  for (const lang of supportedLanguages) {
    if (navLang.startsWith(lang)) return lang
  }

  return 'zh-CN'
}

const resources = {
  'zh-CN': { translation: zhCN },
  en: { translation: en },
  'ja-JP': { translation: jaJP },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  es: { translation: es },
}

export const supportedLanguages = Object.keys(resources) as (keyof typeof resources)[]

i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: 'zh-CN',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
export { detectLanguage }
