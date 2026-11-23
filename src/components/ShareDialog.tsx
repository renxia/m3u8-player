/**
 * 分享弹窗组件
 * - 双模式：海报预览（适合分享）/ 扫码（大图二维码，适合手机扫码）
 * - 海报：打开弹窗即生成并缓存，下载/系统分享复用同一图片
 * - 二维码：本地生成（H 级容错 + 中心品牌标），扫码打开播放链接
 * - 支持一键复制链接
 */

import { Check, Copy, Download, Image as ImageIcon, Loader2, QrCode, Share2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  buildShareUrl,
  canSystemShare,
  copyToClipboard,
  dataUrlToFile,
  generateShareImage,
  getStyledQrCodeDataUrl,
  type ShareContent,
  systemShare,
} from '@/lib/share'
import { cn } from '@/lib/utils'
import { logger } from '@/utils/logger'
import Dialog from './ui/Dialog'

interface ShareDialogProps {
  /** 是否显示 */
  show: boolean
  /** 关闭回调 */
  onClose: () => void
  /** 分享内容 */
  content: ShareContent
}

type Status = 'idle' | 'copied' | 'shared'
type Mode = 'poster' | 'scan'

export default function ShareDialog({ show, onClose, content }: ShareDialogProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status>('idle')
  const [mode, setMode] = useState<Mode>('poster')
  const [qrFailed, setQrFailed] = useState(false)
  const [qrUrl, setQrUrl] = useState('')
  const [posterUrl, setPosterUrl] = useState('')
  const [posterLoading, setPosterLoading] = useState(false)

  const shareUrl = useMemo(() => buildShareUrl(content), [content])

  // 弹窗开关时重置状态
  useEffect(() => {
    if (show) {
      setStatus('idle')
      setMode('poster')
      setQrFailed(false)
    }
  }, [show])

  // 打开弹窗即生成海报（缓存复用，下载/分享时不再重复生成）
  useEffect(() => {
    if (!show) return
    let cancelled = false
    setPosterUrl('')
    setPosterLoading(true)
    generateShareImage(content)
      .then((url) => {
        if (!cancelled && url) setPosterUrl(url)
      })
      .catch(() => {
        // 生成失败时下载/分享按钮会重试并提示
      })
      .finally(() => {
        if (!cancelled) setPosterLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [show, content])

  // 本地生成美化二维码（渐变紫 + 圆角模块 + 中心站点图标）
  // 纠错级别与 logo 占比按链接长度自适应：链接越长，模块越密，越需要给模块让位
  useEffect(() => {
    if (!show) return
    let cancelled = false
    setQrUrl('')
    setQrFailed(false)
    const len = shareUrl.length
    const errorCorrectionLevel = len > 700 ? 'L' : len > 400 ? 'Q' : 'H'
    const logoSize = len > 700 ? 16 : 20
    getStyledQrCodeDataUrl(shareUrl, {
      size: 760,
      margin: 2,
      errorCorrectionLevel,
      colorFrom: '#312E81',
      colorTo: '#7C3AED',
      eyeColor: '#312E81',
      shape: 'rounded',
      eyeStyle: 'rounded',
      logo: '/assets/favicon.png',
      logoSize,
    })
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
      const dataUrl = posterUrl || (await generateShareImage(content))
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
  }, [content, posterUrl, handleCopy, onClose, t])

  const handleDownloadImage = useCallback(async () => {
    const dataUrl = posterUrl || (await generateShareImage(content))
    if (!dataUrl) {
      toast.error(t('share.imageFailed'))
      return
    }
    const file = dataUrlToFile(dataUrl, `m3u8-share-${Date.now()}.png`)
    const url = URL.createObjectURL(file)
    try {
      const a = document.createElement('a')
      a.href = url
      a.download = file.name
      document.body.appendChild(a)
      a.click()
      a.remove()
      // 立即 revoke 会让部分浏览器（Safari）下载失败，延迟释放
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      toast.success(t('share.imageSaved'))
    } catch (error) {
      URL.revokeObjectURL(url)
      logger.warn('[ShareDialog] Download image failed:', error)
      toast.error(t('share.imageFailed'))
    }
  }, [content, posterUrl, t])

  return (
    <Dialog show={show} onClose={onClose} labelledBy="share-dialog-title" panelClassName="max-w-lg max-h-[92vh] overflow-y-auto">
      {/* 头部：标题优先用资源名，为空回退为「分享」 */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700">
        <h2 id="share-dialog-title" className="flex items-center gap-2 min-w-0 text-base font-semibold text-slate-900 dark:text-white">
          <Share2 className="w-4.5 h-4.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <span className="truncate" title={content.title || t('share.title')}>
            {content.title || t('share.title')}
          </span>
        </h2>
        <button
          onClick={onClose}
          className="shrink-0 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          aria-label={t('common.close')}
          title={t('common.close')}
          type="button"
        >
          <X className="w-5 h-5 text-slate-500" />
        </button>
      </div>

      {/* 内容 */}
      <div className="p-5 space-y-4">
        {/* 模式切换：海报预览 / 扫码 */}
        <div className="grid grid-cols-2 gap-1 bg-slate-100 dark:bg-slate-700/40 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setMode('poster')}
            className={cn(
              'flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all',
              mode === 'poster'
                ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            <ImageIcon className="w-4 h-4" />
            {t('share.tabPoster')}
          </button>
          <button
            type="button"
            onClick={() => setMode('scan')}
            className={cn(
              'flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all',
              mode === 'scan'
                ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            <QrCode className="w-4 h-4" />
            {t('share.tabScan')}
          </button>
        </div>

        {/* 海报预览：深色展台衬托，避免深色海报与白色弹窗直接硬碰 */}
        {mode === 'poster' && (
          <div className="rounded-2xl bg-gradient-to-br from-slate-800 via-slate-800 to-indigo-900 p-4 shadow-inner">
            {posterLoading ? (
              <div className="h-[46vh] max-h-[460px] min-h-[240px] flex flex-col items-center justify-center gap-2 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-xs">{t('share.posterLoading')}</span>
              </div>
            ) : posterUrl ? (
              <img
                src={posterUrl}
                alt={t('share.posterAlt')}
                className="mx-auto block max-h-[46vh] w-auto rounded-xl shadow-2xl ring-1 ring-white/10"
              />
            ) : (
              <div className="h-[46vh] max-h-[460px] min-h-[240px] flex flex-col items-center justify-center gap-2 text-slate-500 text-xs">
                <ImageIcon className="w-8 h-8" />
                {t('share.imageFailed')}
              </div>
            )}
          </div>
        )}

        {/* 扫码模式：大二维码（渐变紫 + 中心站点图标） */}
        {mode === 'scan' && (
          <div className="flex flex-col items-center gap-2">
            <div className="bg-white p-3 rounded-2xl border border-indigo-200/70 dark:border-indigo-400/30 shadow-sm">
              {qrFailed ? (
                <div className="w-[260px] h-[260px] flex flex-col items-center justify-center text-slate-400 text-xs gap-2 text-center px-4">
                  <QrCode className="w-8 h-8" />
                  {t('share.qrFailed')}
                </div>
              ) : qrUrl ? (
                <img
                  src={qrUrl}
                  alt={t('share.qrCode')}
                  width={260}
                  height={260}
                  className="block w-[260px] h-[260px] rounded-lg"
                  onError={() => setQrFailed(true)}
                />
              ) : (
                <div className="w-[260px] h-[260px] flex items-center justify-center text-slate-300 dark:text-slate-600">
                  <QrCode className="w-8 h-8 animate-pulse" />
                </div>
              )}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">{t('share.qrHint')}</span>
          </div>
        )}

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

      {/* 操作按钮：一行三等分，压缩弹窗高度 */}
      <div className="px-5 pb-5 flex gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-sm font-medium rounded-xl whitespace-nowrap transition-all',
            status === 'copied'
              ? 'bg-green-600 text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600',
          )}
        >
          {status === 'copied' ? <Check className="w-4 h-4 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
          {status === 'copied' ? t('common.copied') : t('share.copyLink')}
        </button>

        {canSystemShare() && (
          <button
            type="button"
            onClick={handleSystemShare}
            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-sm font-medium rounded-xl whitespace-nowrap bg-indigo-600 hover:bg-indigo-700 text-white transition-all"
          >
            <Share2 className="w-4 h-4 shrink-0" />
            {t('share.systemShare')}
          </button>
        )}

        <button
          type="button"
          onClick={handleDownloadImage}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-sm font-medium rounded-xl whitespace-nowrap bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white transition-all"
        >
          <Download className="w-4 h-4 shrink-0" />
          {t('share.saveImage')}
        </button>
      </div>
    </Dialog>
  )
}
