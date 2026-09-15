/**
 * 分享功能工具集
 * - 构造播放地址形式的分享 URL
 * - 调用系统分享 (Web Share API)
 * - 生成分享二维码（使用第三方 QR 服务，无需额外依赖）
 * - 生成包含标题的分享图 (Canvas)
 */

import QRCode from 'qrcode'
import { copyToClipboard } from './utils'

export { copyToClipboard } from './utils'

/** 分享内容参数 */
export interface ShareContent {
  /** 视频地址 */
  url: string
  /** 视频标题（可选） */
  title?: string
}

/** 构造播放地址形式的分享 URL */
export function buildShareUrl({ url, title }: ShareContent): string {
  const params = new URLSearchParams()
  params.set('url', url)
  if (title) params.set('name', title)

  const base = `${location.origin}${location.pathname}`
  return `${base}?${params.toString()}`
}

/** 当前环境是否支持 Web Share API */
export function canSystemShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function'
}

/** 是否支持分享文件（图片） */
export function canShareFiles(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && typeof navigator.share === 'function'
}

/**
 * 调用系统分享
 * 若支持文件分享且提供了图片 File，则连带分享图片
 */
export async function systemShare(content: ShareContent, imageFile?: File): Promise<boolean> {
  const shareUrl = buildShareUrl(content)
  const shareData: ShareData = {
    title: content.title || 'M3U8 在线播放器',
    text: content.title ? `${content.title}\n${shareUrl}` : shareUrl,
    url: shareUrl,
  }

  // 尝试附带分享图片
  if (imageFile && canShareFiles()) {
    try {
      const canShare = navigator.canShare({ files: [imageFile] })
      if (canShare) {
        shareData.files = [imageFile]
      }
    } catch {
      // 检测失败时回退为纯文本分享
    }
  }

  try {
    await navigator.share(shareData)
    return true
  } catch (error) {
    // 用户取消分享：抛出 AbortError，由调用方回退到复制链接
    throw error
  }
}

/**
 * 本地生成二维码 DataURL
 * 使用 qrcode 在客户端生成，避免将分享链接外发到第三方服务
 * @param text 需要编码的内容
 * @param size 二维码像素尺寸
 * @returns PNG 格式的 dataURL
 */
export async function getQrCodeDataUrl(text: string, size = 220): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
  })
}

/** 截断文本，超出长度加省略号 */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

/**
 * 生成包含标题的分享图 (PNG DataURL)
 * 用于系统分享附带图片，或用户保存分享海报
 *
 * @returns PNG 格式的 dataURL
 */
export function generateShareImage({ url, title }: ShareContent): string {
  const W = 600
  const H = title ? 420 : 360
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  // 背景渐变
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#4f46e5')
  bg.addColorStop(1, '#06b6d4')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // 装饰圆
  ctx.globalAlpha = 0.12
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(W * 0.85, H * 0.18, 120, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(W * 0.12, H * 0.88, 90, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = 1

  const padding = 40

  // 标题（如有）
  let nextY = padding + 10
  if (title) {
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 32px system-ui, -apple-system, "Segoe UI", sans-serif'
    const displayTitle = truncate(title, 28)
    // 标题最多两行
    const words = displayTitle
    const line1 = truncate(words, 18)
    ctx.fillText(line1, padding, nextY + 32, W - padding * 2)
    if (words.length > 18) {
      const line2 = truncate(words.slice(18), 22)
      ctx.fillText(line2, padding, nextY + 72, W - padding * 2)
      nextY += 100
    } else {
      nextY += 60
    }

    // 分隔线
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(padding, nextY)
    ctx.lineTo(W - padding, nextY)
    ctx.stroke()
  }

  nextY += 24

  // 分享链接
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = '18px system-ui, -apple-system, "Segoe UI", sans-serif'
  const shareUrl = buildShareUrl({ url, title })
  ctx.fillText(truncate(shareUrl, 56), padding, nextY + 18, W - padding * 2)

  nextY += 56

  // 底部品牌
  ctx.fillStyle = 'rgba(255,255,255,0.65)'
  ctx.font = '14px system-ui, -apple-system, "Segoe UI", sans-serif'
  ctx.fillText('M3U8 在线播放器', padding, H - padding)

  return canvas.toDataURL('image/png')
}

/** 将 dataURL 转为 File 对象（用于系统分享图片） */
export function dataUrlToFile(dataUrl: string, fileName = 'share.png'): File {
  const [header, base64] = dataUrl.split(',')
  const mime = /data:(.*?);/.exec(header)?.[1] || 'image/png'
  const binary = atob(base64)
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i)
  return new File([array], fileName, { type: mime })
}

/**
 * 一键分享入口
 * 优先调用系统分享；失败时回退为复制链接并返回分享 URL
 *
 * @returns 'shared' | 'copied' | 'failed'
 */
export async function shareContent(content: ShareContent): Promise<'shared' | 'copied' | 'failed'> {
  const shareUrl = buildShareUrl(content)

  // 不支持系统分享：直接复制链接
  if (!canSystemShare()) {
    const ok = await copyToClipboard(shareUrl)
    return ok ? 'copied' : 'failed'
  }

  // 尝试生成分享图附带分享
  let imageFile: File | undefined
  try {
    const dataUrl = generateShareImage(content)
    if (dataUrl) imageFile = dataUrlToFile(dataUrl, 'm3u8-share.png')
  } catch {
    // 图片生成失败时回退为纯文本分享
  }

  try {
    await systemShare(content, imageFile)
    return 'shared'
  } catch {
    // 系统分享失败/取消时回退复制链接
    const ok = await copyToClipboard(shareUrl)
    return ok ? 'copied' : 'failed'
  }
}
