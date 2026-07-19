import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { supportedLanguages } from '@/i18n'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 格式化时间
export function formatTime(ts: number | undefined, t: (key: string) => string): string {
  if (!ts) return ''

  const d = new Date(ts)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 60000)

  if (diff < 1) return t('common.justNow')
  if (diff < 60) return `${diff} ${t('common.minuteAgo')}`

  return d.toLocaleString()
}

// 格式化文件大小
export function formatSize(size: number): string {
  if (size > 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  if (size > 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${size} B`
}

// 格式化日期
export function formatDate(str: string): string {
  return str ? str.slice(0, 10) : ''
}

// 检测操作系统
export function detectOS(): 'windows' | 'macos' | 'linux' | '' {
  const ua = navigator.userAgent
  if (/windows nt/i.test(ua)) return 'windows'
  if (/macintosh|mac os x/i.test(ua)) return 'macos'
  if (/linux/i.test(ua)) return 'linux'
  return ''
}

// 获取 URL 参数
export function getUrlParams(): Record<string, string> {
  const params: Record<string, string> = {}
  const searchParams = new URLSearchParams(window.location.search)
  searchParams.forEach((value, key) => {
    params[key] = value
  })
  return params
}

// 校验是否为合法的 http(s) 链接
export function isValidHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

// 复制到剪贴板
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 降级方案
    const textArea = document.createElement('textarea')
    textArea.value = text
    textArea.style.position = 'fixed'
    textArea.style.left = '-9999px'
    document.body.appendChild(textArea)
    textArea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textArea)
    return success
  }
}

// 获取语言路由前缀
export function getLangPrefix(): string {
  const pathname = window.location.pathname
  for (const lang of supportedLanguages) {
    if (pathname.startsWith(`/${lang}/`) || pathname === `/${lang}`) return `/${lang}`
  }

  return ''
}
