/**
 * 分享弹窗组件
 * - 展示当前播放地址的分享链接
 * - 展示二维码（扫码打开）
 * - 支持一键复制链接
 * - 支持调用系统分享（含分享海报）
 * - 支持下载分享海报（含标题）
 */

import { Check, Copy, Download, QrCode, Share2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  buildShareUrl,
  canSystemShare,
  copyToClipboard,
  dataUrlToFile,
  generateShareImage,
  getQrCodeDataUrl,
  type ShareContent,
  systemShare,
} from '@/lib/share'
import { cn } from '@/lib/utils'

interface ShareDialogProps {
  /** 是否显示 */
  show: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 分享内容 */
  content: ShareContent
}

type Status = 'idle' | 'copied' | 'shared'

export default function ShareDialog({ show, onClose, content }: ShareDialogProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status>('idle')
  const [qrFailed, setQrFailed] = useState(false)
  const [qrUrl, setQrUrl] = useState('')

  const shareUrl = useMemo(() => buildShareUrl(content), [content])

  // 弹窗开关时重置状态
  useEffect(() => {
    if (show) {
      setStatus('idle')
      setQrFailed(false)
    }
  }, [show])

  // 本地生成二维码（异步，不外发分享链接），失败时展示占位
  useEffect(() => {
    if (!show) return
    let cancelled = false
    setQrUrl('')
    getQrCodeDataUrl(shareUrl)
      .then((url) => {
        if (!cancelled) setQrUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [shareUrl, show])

  // ESC 关闭
  useEffect(() => {
    if (!show) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show, onClose])

  const handleCopy = useCallback(async () => {
    const ok = await copyToClipboard(shareUrl)
    if (ok) {
      setStatus('copied')
      toast.success(t('share.linkCopied'))
      setTimeout(() => setStatus('idle'), 2000)
    } else {
      toast.error(t('share.copyFailed', { defaultValue: '复制失败' }))
    }
  }, [shareUrl, t])

  const handleSystemShare = useCallback(async () => {
    try {
      let imageFile: File | undefined
      const dataUrl = generateShareImage(content)
      if (dataUrl) imageFile = dataUrlToFile(dataUrl, 'm3u8-share.png')
      await systemShare(content, imageFile)
      setStatus('shared')
      toast.success(t('share.shareSuccess'))
      setTimeout(() => {
        setStatus('idle')
        onClose()
      }, 1200)
    } catch {
      // 用户取消或失败：回退复制
      handleCopy()
    }
  }, [content, handleCopy, onClose, t])

  const handleDownloadImage = useCallback(() => {
    const dataUrl = generateShareImage(content)
    if (!dataUrl) {
      toast.error(t('share.imageFailed'))
      return
    }
    const file = dataUrlToFile(dataUrl, `m3u8-share-${Date.now()}.png`)
    const url = URL.createObjectURL(file)
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    a.click()
    URL.revokeObjectURL(url)
    toast.success(t('share.imageSaved'))
  }, [content, t])

  if (!show) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Share2 className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
            {t('share.title')}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title={t('common.close')}
            type="button"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-5 space-y-4">
          {/* 标题（如有） */}
          {content.title && (
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-700/40 rounded-lg px-3 py-2 break-words">
              {content.title}
            </div>
          )}

          {/* 二维码 */}
          <div className="flex flex-col items-center gap-2">
            <div className="bg-white p-3 rounded-xl border border-slate-200 dark:border-slate-600">
              {qrFailed ? (
                <div className="w-[220px] h-[220px] flex flex-col items-center justify-center text-slate-400 text-xs gap-2 text-center px-4">
                  <QrCode className="w-8 h-8" />
                  {t('share.qrFailed')}
                </div>
              ) : qrUrl ? (
                <img src={qrUrl} alt={t('share.qrCode')} width={220} height={220} className="block" onError={() => setQrFailed(true)} />
              ) : (
                <div className="w-[220px] h-[220px] flex items-center justify-center text-slate-300 dark:text-slate-600">
                  <QrCode className="w-8 h-8 animate-pulse" />
                </div>
              )}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('share.qrHint')}</span>
          </div>

          {/* 链接展示 */}
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700/40 rounded-lg px-3 py-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 bg-transparent text-xs text-slate-700 dark:text-slate-300 outline-none truncate select-all"
              onFocus={(e) => e.target.select()}
            />
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="px-5 pb-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-xl transition-all',
              status === 'copied'
                ? 'bg-green-600 text-white'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600',
            )}
          >
            {status === 'copied' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {status === 'copied' ? t('common.copied') : t('share.copyLink')}
          </button>

          {canSystemShare() && (
            <button
              type="button"
              onClick={handleSystemShare}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-all"
            >
              <Share2 className="w-4 h-4" />
              {t('share.systemShare')}
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadImage}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white transition-all"
          >
            <Download className="w-4 h-4" />
            {t('share.saveImage')}
          </button>
        </div>
      </div>
    </div>
  )
}
