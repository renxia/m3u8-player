import { ChevronDown, Download, Globe, Home, Info, MessageSquare, Moon, Settings, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { useTheme } from '@/hooks/useTheme'
import { cn, getLangPrefix } from '@/lib/utils'

const languages = [
  { code: 'zh-CN', label: '🇨🇳 中文', path: '' },
  { code: 'en', label: '🇺🇸 English', path: '/en' },
  { code: 'ja-JP', label: '🇯🇵 日本語', path: '/ja-JP' },
]

export default function Header() {
  const { t, i18n } = useTranslation()
  const location = useLocation()
  const [isLangOpen, setIsLangOpen] = useState(false)
  const [isThemeOpen, setIsThemeOpen] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)
  const themeRef = useRef<HTMLDivElement>(null)
  const langPrefix = getLangPrefix()
  const { theme, resolvedTheme, setTheme } = useTheme()

  // 点击外部关闭语言菜单和主题菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setIsLangOpen(false)
      }
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setIsThemeOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const navItems = [
    { path: `${langPrefix}/download`, icon: Download, label: t('nav.downloads') },
    { path: `${langPrefix}/feedback`, icon: MessageSquare, label: t('nav.feedback') },
    { path: `${langPrefix}/about`, icon: Info, label: t('nav.about') },
    { path: `${langPrefix}/settings`, icon: Settings, label: t('nav.settings') },
  ]

  const handleLanguageChange = (langPath: string, langCode: string) => {
    // 获取当前页面路径（不含语言前缀）
    let currentPath = location.pathname
    currentPath = currentPath.replace(/^\/(en|ja-JP)/, '')
    if (!currentPath || currentPath === '/') currentPath = ''

    // 构建新的路径
    const newPath = langPath + currentPath || '/'

    // 切换语言
    i18n.changeLanguage(langCode)

    // 导航到新路径
    window.location.href = newPath
  }

  return (
    <header className="bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 text-white shadow-lg">
      <div className="container mx-auto px-2 md:px-4 py-2 md:py-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Logo */}
          <Link
            to={langPrefix || '/'}
            className="flex items-center gap-1.5 md:gap-2 text-white font-bold text-lg md:text-xl hover:text-cyan-200 transition-colors group"
          >
            <div className="p-1.5 md:p-2 bg-white/10 rounded-lg group-hover:bg-white/20 transition-colors">
              <Home className="w-4 h-4 md:w-5 md:h-5" />
            </div>
            <span className="tracking-wide">{t('nav.home')}</span>
          </Link>

          {/* 导航 */}
          <div className="flex items-center gap-0.5 md:gap-2">
            {navItems.map(({ path, icon: Icon, label }) => (
              <Link
                key={path}
                to={path}
                className={cn(
                  'flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-lg transition-all',
                  'hover:bg-white/20 text-xs md:text-base',
                  location.pathname === path && 'bg-white/20',
                )}
              >
                <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}

            {/* 主题切换 */}
            <div className="relative" ref={themeRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setIsThemeOpen(!isThemeOpen)
                }}
                className={cn(
                  'flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-lg transition-all',
                  'hover:bg-white/20 text-xs md:text-base',
                )}
                title={t('nav.theme')}
              >
                {resolvedTheme === 'dark' ? <Moon className="w-3.5 h-3.5 md:w-4 md:h-4" /> : <Sun className="w-3.5 h-3.5 md:w-4 md:h-4" />}
                <span className="hidden sm:inline">{t('nav.theme')}</span>
                <ChevronDown className={cn('w-3 h-3 transition-transform', isThemeOpen && 'rotate-180')} />
              </button>

              {/* 主题下拉菜单 */}
              {isThemeOpen && (
                <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden z-50 border border-gray-100 dark:border-gray-700">
                  {(['light', 'dark', 'system'] as const).map((themeOption) => (
                    <button
                      key={themeOption}
                      onClick={() => {
                        setTheme(themeOption)
                        setIsThemeOpen(false)
                      }}
                      className={cn(
                        'w-full px-4 py-2.5 text-left text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors text-sm',
                        theme === themeOption && 'bg-indigo-50 dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 font-medium',
                      )}
                    >
                      {t(`nav.theme${themeOption.charAt(0).toUpperCase() + themeOption.slice(1)}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 语言切换 */}
            <div className="relative" ref={langRef}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setIsLangOpen(!isLangOpen)
                }}
                className={cn(
                  'flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1.5 md:py-2 rounded-lg transition-all',
                  'hover:bg-white/20 text-xs md:text-base',
                )}
              >
                <Globe className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden sm:inline">{t('nav.language')}</span>
                <ChevronDown className={cn('w-3 h-3 transition-transform', isLangOpen && 'rotate-180')} />
              </button>

              {/* 语言下拉菜单 */}
              {isLangOpen && (
                <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden z-50 border border-gray-100 dark:border-gray-700">
                  {languages.map(({ code, label, path }) => (
                    <button
                      key={code}
                      onClick={() => handleLanguageChange(path, code)}
                      className={cn(
                        'w-full px-4 py-2.5 text-left text-gray-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-gray-700 transition-colors text-sm',
                        i18n.language === code && 'bg-indigo-50 dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 font-medium',
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
