import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import jaJP from './locales/ja-JP.json'
import zhCN from './locales/zh-CN.json'

// 检测当前语言
function detectLanguage(): string {
  const pathname = window.location.pathname
  if (pathname.includes('/en')) return 'en'
  if (pathname.includes('/ja-JP') || pathname.includes('/ja')) return 'ja-JP'

  // 根据浏览器语言
  const navLang = navigator.language || (navigator as any).userLanguage
  if (navLang.startsWith('ja')) return 'ja-JP'
  if (navLang.startsWith('en')) return 'en'

  return 'zh-CN'
}

const resources = {
  'zh-CN': { translation: zhCN },
  en: { translation: en },
  'ja-JP': { translation: jaJP },
}

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
