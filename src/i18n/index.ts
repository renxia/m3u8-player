import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { defaultLanguage, detectLangFromPath, supportedLanguages } from './languages'
import de from './locales/de.json'
import en from './locales/en.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import jaJP from './locales/ja-JP.json'
import pt from './locales/pt.json'
import zhCN from './locales/zh-CN.json'

const resources = {
  'zh-CN': { translation: zhCN },
  en: { translation: en },
  'ja-JP': { translation: jaJP },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  es: { translation: es },
}

// 检测当前语言
function detectLanguage(): string {
  // 1. 路径前缀优先
  const fromPath = detectLangFromPath(window.location.pathname)
  if (fromPath) return fromPath

  // 2. 浏览器语言
  const navLang = navigator.language || (navigator as any).userLanguage
  if (navLang.startsWith('ja')) return 'ja-JP'

  for (const lang of supportedLanguages) {
    if (navLang.startsWith(lang)) return lang
  }

  return defaultLanguage
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: defaultLanguage,
  interpolation: {
    escapeValue: false,
  },
})

// 语言清单以 src/i18n/languages.ts 为唯一来源，这里仅做透传，保持原有导入路径可用
export { supportedLanguages }

export default i18n
export { detectLanguage }
