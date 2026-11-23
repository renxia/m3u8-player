/**
 * 分享功能工具集
 * - 构造播放地址形式的分享 URL
 * - 调用系统分享 (Web Share API)
 * - 生成分享二维码（使用第三方 QR 服务，无需额外依赖）
 * - 生成包含标题的分享图 (Canvas)
 */

import QRCode from 'qrcode'
import i18n from '@/i18n'
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
 * @param color 前景/背景色（海报场景使用深色模块 + 白色底）
 * @returns PNG 格式的 dataURL
 */
export async function getQrCodeDataUrl(
  text: string,
  size = 220,
  color?: { dark?: string; light?: string },
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H' = 'M',
): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel,
    color: color ? { dark: color.dark ?? '#000000', light: color.light ?? '#FFFFFF' } : undefined,
  })
}

/* -------------------------------------------------------------------------- */
/*                          美化二维码（自绘矩阵）                              */
/* -------------------------------------------------------------------------- */

/** 美化二维码配置 */
export interface StyledQrCodeOptions {
  /** 输出像素尺寸 */
  size?: number
  /** 静区模块数（建议 ≥2） */
  margin?: number
  /** 纠错级别（含中心 logo 时必须用 H） */
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
  /** 渐变起始色 */
  colorFrom?: string
  /** 渐变结束色 */
  colorTo?: string
  /** 定位眼颜色（纯色，保证识别） */
  eyeColor?: string
  /** 背景色 */
  background?: string
  /** 模块形状 */
  shape?: 'square' | 'rounded' | 'dot'
  /** 定位眼样式 */
  eyeStyle?: 'square' | 'rounded' | 'circle'
  /** 中心 logo 图片地址（同源） */
  logo?: string
  /** logo 占码面边长百分比（建议 ≤24） */
  logoSize?: number
}

/** 绘制定位眼（7×7 模块区域） */
function drawQrEye(ctx: CanvasRenderingContext2D, x: number, y: number, cell: number, style: string) {
  const s = cell * 7
  if (style === 'circle') {
    ctx.lineWidth = cell
    ctx.beginPath()
    ctx.arc(x + s / 2, y + s / 2, s / 2 - cell / 2, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x + s / 2, y + s / 2, cell * 1.5, 0, Math.PI * 2)
    ctx.fill()
    return
  }

  const outerR = style === 'rounded' ? cell * 2.2 : cell * 0.6
  ctx.lineWidth = cell
  roundRect(ctx, x + cell / 2, y + cell / 2, s - cell, s - cell, Math.max(0, outerR - cell / 2))
  ctx.stroke()

  const innerR = style === 'rounded' ? cell * 1.1 : cell * 0.3
  roundRect(ctx, x + cell * 2, y + cell * 2, cell * 3, cell * 3, innerR)
  ctx.fill()
}

/**
 * 生成美化版二维码 DataURL
 * 基于 qrcode 的矩阵自绘：支持渐变前景、圆角/圆点模块、自定义定位眼、中心 logo
 * 默认参数已按可扫描性收敛（H 级纠错、静区 2 模块、logo ≤24%）
 */
export async function getStyledQrCodeDataUrl(text: string, options: StyledQrCodeOptions = {}): Promise<string> {
  const {
    size = 660,
    margin = 2,
    errorCorrectionLevel = 'H',
    colorFrom = '#312E81',
    colorTo = '#7C3AED',
    eyeColor = '#312E81',
    background = '#FFFFFF',
    shape = 'rounded',
    eyeStyle = 'rounded',
    logo,
    logoSize = 22,
  } = options

  const qr = QRCode.create(text, { errorCorrectionLevel })
  const n = qr.modules.size
  const data = qr.modules.data

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  // 码点取整，避免半像素抗锯齿把圆角模块糊成一片
  const cell = Math.max(2, Math.floor(size / (n + margin * 2)))
  const face = cell * n
  const off = Math.round((size - face) / 2)

  ctx.fillStyle = background
  ctx.fillRect(0, 0, size, size)

  const grad = ctx.createLinearGradient(0, 0, size, size)
  grad.addColorStop(0, colorFrom)
  grad.addColorStop(1, colorTo)
  ctx.fillStyle = grad

  const inEye = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7)

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!(data[r * n + c] & 1) || inEye(r, c)) continue
      const x = off + c * cell
      const y = off + r * cell
      if (shape === 'dot') {
        ctx.beginPath()
        ctx.arc(x + cell / 2, y + cell / 2, cell * 0.5, 0, Math.PI * 2)
        ctx.fill()
      } else if (shape === 'rounded') {
        roundRect(ctx, x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.3)
        ctx.fill()
      } else {
        ctx.fillRect(x, y, cell, cell)
      }
    }
  }

  // 定位眼使用纯色（渐变会让识别变脆）
  ctx.fillStyle = eyeColor
  ctx.strokeStyle = eyeColor
  drawQrEye(ctx, off, off, cell, eyeStyle)
  drawQrEye(ctx, off + (n - 7) * cell, off, cell, eyeStyle)
  drawQrEye(ctx, off, off + (n - 7) * cell, cell, eyeStyle)

  // 中心 logo
  if (logo) {
    try {
      const img = await loadImage(logo)
      const box = face * (logoSize / 100)
      const center = off + face / 2
      const x = center - box / 2
      const y = center - box / 2

      ctx.fillStyle = background
      roundRect(ctx, x - box * 0.06, y - box * 0.06, box * 1.12, box * 1.12, box * 0.24)
      ctx.fill()

      ctx.save()
      roundRect(ctx, x, y, box, box, box * 0.18)
      ctx.clip()
      const scale = Math.max(box / img.width, box / img.height)
      const w = img.width * scale
      const h = img.height * scale
      ctx.drawImage(img, x + (box - w) / 2, y + (box - h) / 2, w, h)
      ctx.restore()
    } catch {
      // logo 加载失败时忽略，二维码本身仍可正常扫描
    }
  }

  return canvas.toDataURL('image/png')
}

/* -------------------------------------------------------------------------- */
/*                              分享海报绘制                                   */
/* -------------------------------------------------------------------------- */

/** 海报版面参数（设计稿 1080 × 1350，4:5 竖版，适配社交平台） */
const POSTER = {
  width: 1080,
  height: 1350,
  padding: 88,
  radius: 32,
} as const

const FONT_STACK = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'

/** 圆角矩形路径 */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/** 径向柔光（叠加在整幅画布上，营造体积感） */
function paintGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  rgb: string,
  alpha: number,
  width: number,
  height: number,
) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius)
  g.addColorStop(0, `rgba(${rgb},${alpha})`)
  g.addColorStop(0.55, `rgba(${rgb},${alpha * 0.35})`)
  g.addColorStop(1, `rgba(${rgb},0)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)
}

/** 字间距文本绘制（canvas 的 letterSpacing 兼容性不足，手动逐字排布） */
function drawSpacedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number): number {
  let cursor = x
  for (const char of text) {
    ctx.fillText(char, cursor, y)
    cursor += ctx.measureText(char).width + spacing
  }
  return cursor - spacing - x
}

/** 文本分词：CJK 单字成词，拉丁文按词，避免中文无法换行 */
function tokenize(text: string): string[] {
  return text.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]|[A-Za-z0-9@._'’%+-]+|\s+|./gu) ?? []
}

/** 是否为 CJK 字符 */
const CJK_RE = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/

/**
 * 按最大宽度折行（返回每行的 token 列表）
 * 中文会在任意字之间断开，这里额外规避「行尾孤字」（把孤字挪到下一行）
 */
function wrapTokenLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[][] {
  const lines: string[][] = []
  let lineTokens: string[] = []

  const widthOf = (tokens: string[]) => ctx.measureText(tokens.join('').trim()).width

  for (const token of tokenize(text)) {
    if (!lineTokens.length) {
      lineTokens.push(token)
      continue
    }
    if (widthOf([...lineTokens, token]) <= maxWidth) {
      lineTokens.push(token)
      continue
    }

    // 需要换行：若行尾是 CJK 单字，且新行也以 CJK 开头，则把孤字带到下一行
    let carry: string[] = []
    if (CJK_RE.test(token)) {
      const last = lineTokens[lineTokens.length - 1]
      if (last && last.length === 1 && CJK_RE.test(last) && lineTokens.length > 1) {
        lineTokens.pop()
        carry = [last]
      }
    }

    lines.push(lineTokens)
    lineTokens = [...carry, token.trimStart()]
  }

  if (lineTokens.join('').trim()) lines.push(lineTokens)
  return lines
}

/** 使多行文本宽度尽量均衡（避免末行只剩几个字） */
function balanceLines(ctx: CanvasRenderingContext2D, lines: string[][], maxWidth: number): string[][] {
  const widthOf = (tokens: string[]) => ctx.measureText(tokens.join('').trim()).width

  for (let i = 0; i < lines.length - 1; i++) {
    let guard = 0
    while (guard++ < 40) {
      const cur = lines[i]
      const next = lines[i + 1]
      if (cur.length <= 1 || widthOf(next) >= widthOf(cur) - 2) break
      const moved = [cur[cur.length - 1], ...next]
      if (widthOf(moved) > maxWidth) break
      cur.pop()
      lines[i + 1] = moved
    }
  }
  return lines
}

/** 按最大宽度折行（返回字符串行） */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  return wrapTokenLines(ctx, text, maxWidth).map((tokens) => tokens.join('').trim())
}

/** 单行截断并补省略号 */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  const ellipsis = '…'
  const ellipsisWidth = ctx.measureText(ellipsis).width
  let result = text
  while (result && ctx.measureText(result).width + ellipsisWidth > maxWidth) {
    result = result.slice(0, -1)
  }
  return `${result.trimEnd()}${ellipsis}`
}

/**
 * 标题自适应：在候选字号中挑选能完整放进指定行数的最大字号
 * 行宽尽量均衡，全部超出时按最小字号截断
 */
function fitTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  sizes: number[],
): { size: number; lines: string[]; complete: boolean } {
  for (const size of sizes) {
    ctx.font = `800 ${size}px ${FONT_STACK}`
    const tokenLines = wrapTokenLines(ctx, text, maxWidth)
    if (tokenLines.length <= maxLines) {
      const balanced = balanceLines(ctx, tokenLines, maxWidth)
      return { size, lines: balanced.map((tokens) => tokens.join('').trim()), complete: true }
    }
  }

  const size = sizes[sizes.length - 1]
  ctx.font = `800 ${size}px ${FONT_STACK}`
  const lines = wrapText(ctx, text, maxWidth).slice(0, maxLines)
  const last = lines.length - 1
  if (last >= 0) lines[last] = ellipsize(ctx, lines[last], maxWidth)
  return { size, lines, complete: false }
}

/** 加载图片（用于注入二维码） */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

/**
 * 星尘颗粒：稀疏亮点，营造质感
 * （相比均匀噪点，对 PNG 压缩友好，不会让分享图体积暴涨）
 */
function paintStardust(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save()
  for (let i = 0; i < 620; i++) {
    const x = Math.random() * width
    const y = Math.random() * height
    const r = Math.random() * 1.4 + 0.4
    const golden = Math.random() > 0.7
    ctx.fillStyle = golden ? `rgba(231,196,139,${0.05 + Math.random() * 0.22})` : `rgba(255,255,255,${0.03 + Math.random() * 0.14})`
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * 生成分享海报 (PNG DataURL)
 * 深色高级质感 + 金色点缀的 3:4 竖版海报，内含可扫描二维码
 *
 * @returns PNG 格式的 dataURL
 */
export async function generateShareImage(content: ShareContent): Promise<string> {
  const { width: W, height: H, padding: PAD } = POSTER
  const shareUrl = buildShareUrl(content)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'

  /* ------------------------------- 背景层 ------------------------------- */
  const bg = ctx.createLinearGradient(0, 0, W * 0.7, H)
  bg.addColorStop(0, '#0A0A12')
  bg.addColorStop(0.5, '#0D0B18')
  bg.addColorStop(1, '#120E1F')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  paintGlow(ctx, W * 0.18, -H * 0.02, H * 0.62, '124,92,255', 0.42, W, H)
  paintGlow(ctx, W * 1.02, H * 0.6, H * 0.5, '34,211,238', 0.16, W, H)
  paintGlow(ctx, W * 0.95, H * 0.04, H * 0.32, '231,196,139', 0.14, W, H)

  // 极细网格
  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.028)'
  ctx.lineWidth = 1
  for (let x = 0; x <= W; x += 60) {
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, H)
    ctx.stroke()
  }
  for (let y = 0; y <= H; y += 60) {
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(W, y + 0.5)
    ctx.stroke()
  }
  ctx.restore()

  paintStardust(ctx, W, H)

  // 外描边
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'
  ctx.lineWidth = 2
  roundRect(ctx, 20, 20, W - 40, H - 40, 40)
  ctx.stroke()

  /* ----------------------------- 顶部品牌区 ----------------------------- */
  const logoY = 120
  const logoGradient = ctx.createLinearGradient(PAD, logoY - 30, PAD + 60, logoY + 30)
  logoGradient.addColorStop(0, '#F7E4BE')
  logoGradient.addColorStop(1, '#D8A450')
  ctx.fillStyle = logoGradient
  ctx.beginPath()
  ctx.arc(PAD + 30, logoY, 30, 0, Math.PI * 2)
  ctx.fill()

  // 播放三角
  ctx.fillStyle = '#0A0A12'
  ctx.beginPath()
  ctx.moveTo(PAD + 24, logoY - 12)
  ctx.lineTo(PAD + 40, logoY)
  ctx.lineTo(PAD + 24, logoY + 12)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = '#FFFFFF'
  ctx.font = `700 28px ${FONT_STACK}`
  drawSpacedText(ctx, 'M3U8 PLAYER', PAD + 84, logoY + 4, 2.5)

  ctx.fillStyle = 'rgba(255,255,255,0.42)'
  ctx.font = `500 17px ${FONT_STACK}`
  drawSpacedText(ctx, 'PREMIUM STREAMING', PAD + 84, logoY + 32, 3)

  // 右上装饰：同心圆环
  const ringX = W - PAD - 44
  const ringY = logoY - 6
  ctx.strokeStyle = 'rgba(231,196,139,0.5)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.arc(ringX, ringY, 26, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(231,196,139,0.22)'
  ctx.beginPath()
  ctx.arc(ringX, ringY, 44, 0, Math.PI * 2)
  ctx.stroke()

  // 顶部细分隔线
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD, 208)
  ctx.lineTo(W - PAD, 208)
  ctx.stroke()

  /* ------------------------------ 标题区域 ------------------------------ */
  const contentW = W - PAD * 2
  const cardX = PAD
  const cardW = contentW
  const cardH = 440
  const cardY = H - PAD - cardH

  const scanTitle = i18n.t('share.poster.scanTitle', { defaultValue: '扫码即刻播放' })
  const scanDesc = i18n.t('share.poster.scanDesc', { defaultValue: '免安装 · 无广告 · 高清秒开' })
  const chipParts = scanDesc
    .split(/[·•|｜]/)
    .map((s) => s.trim())
    .filter(Boolean)

  // 主标题先测量，用于纵向排布（优先 2 行，避免末行孤字）
  const rawTitle = (content.title || '').trim() || i18n.t('share.poster.defaultTitle', { defaultValue: 'M3U8 在线播放器' })
  const titleSizes = [96, 88, 80, 72, 64, 56, 48]
  let title = fitTitle(ctx, rawTitle, contentW, 2, titleSizes)
  // 3 行时降一档字号，给底部二维码卡片留出空间
  if (!title.complete) title = fitTitle(ctx, rawTitle, contentW, 3, titleSizes.slice(1))
  const lineHeight = Math.round(title.size * 1.2)

  const chipH = 56
  const hasChips = chipParts.length > 1

  // 标题块在「品牌区底边 → 卡片上方」之间垂直居中
  const regionTop = 214
  const regionBottom = cardY - 40
  const blockH = 30 + 88 + Math.max(title.lines.length - 1, 0) * lineHeight + 54 + 4
  const labelY = regionTop + 30 + Math.max(0, (regionBottom - regionTop - blockH) / 2)

  // 小标签：金色圆点 + SCAN TO PLAY
  ctx.fillStyle = '#E7C48B'
  ctx.beginPath()
  ctx.arc(PAD + 6, labelY - 7, 6, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(231,196,139,0.85)'
  ctx.font = `600 19px ${FONT_STACK}`
  drawSpacedText(ctx, 'SCAN TO PLAY', PAD + 26, labelY, 4.5)

  // 主标题
  ctx.font = `800 ${title.size}px ${FONT_STACK}`
  ctx.fillStyle = '#FFFFFF'
  const titleTop = labelY + 88
  title.lines.forEach((line, i) => {
    ctx.fillText(line, PAD, titleTop + i * lineHeight)
  })
  const titleBottom = titleTop + Math.max(title.lines.length - 1, 0) * lineHeight

  // 金色强调线
  const accentY = titleBottom + 54
  const accent = ctx.createLinearGradient(PAD, accentY, PAD + 120, accentY)
  accent.addColorStop(0, '#F7E4BE')
  accent.addColorStop(1, 'rgba(216,164,80,0)')
  ctx.fillStyle = accent
  roundRect(ctx, PAD, accentY, 96, 4, 2)
  ctx.fill()

  /* --------------------------- 卖点胶囊（标题下方） --------------------------- */
  // 与卡片保持安全距离，避免挤压二维码卡片
  const chipTop = Math.min(accentY + 72, cardY - 60 - chipH)
  if (hasChips) {
    let chipFont = 22
    let chipPadX = 28
    const chipGap = 14

    const measureChips = () => {
      ctx.font = `600 ${chipFont}px ${FONT_STACK}`
      return chipParts.map((text) => ctx.measureText(text).width + chipPadX * 2)
    }

    let widths = measureChips()
    let total = widths.reduce((a, b) => a + b, 0) + chipGap * (widths.length - 1)
    if (total > contentW) {
      chipFont = 19
      chipPadX = 20
      widths = measureChips()
      total = widths.reduce((a, b) => a + b, 0) + chipGap * (widths.length - 1)
    }

    if (total <= contentW) {
      let x = PAD
      chipParts.forEach((text, i) => {
        const w = widths[i]
        ctx.fillStyle = 'rgba(255,255,255,0.055)'
        roundRect(ctx, x, chipTop, w, chipH, chipH / 2)
        ctx.fill()
        ctx.strokeStyle = 'rgba(231,196,139,0.26)'
        ctx.lineWidth = 1
        ctx.stroke()

        ctx.fillStyle = 'rgba(255,255,255,0.82)'
        ctx.font = `600 ${chipFont}px ${FONT_STACK}`
        ctx.textAlign = 'center'
        ctx.fillText(text, x + w / 2, chipTop + chipH / 2 + chipFont * 0.36)
        ctx.textAlign = 'left'
        x += w + chipGap
      })
    }
  }

  // 卡片投影
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.5)'
  ctx.shadowBlur = 60
  ctx.shadowOffsetY = 24
  ctx.fillStyle = '#FFFFFF'
  roundRect(ctx, cardX, cardY, cardW, cardH, POSTER.radius)
  ctx.fill()
  ctx.restore()

  // 卡片质感层：白 → 微暖金渐变 + 品牌水印 + 金色角标（均避开二维码静区）
  ctx.save()
  roundRect(ctx, cardX, cardY, cardW, cardH, POSTER.radius)
  ctx.clip()

  const cardBg = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH)
  cardBg.addColorStop(0, '#FFFFFF')
  cardBg.addColorStop(1, '#FBF7EC')
  ctx.fillStyle = cardBg
  ctx.fillRect(cardX, cardY, cardW, cardH)

  // 右下角超大品牌水印（alpha 极低，仅作质感）
  ctx.fillStyle = 'rgba(216,164,80,0.05)'
  ctx.font = `900 190px ${FONT_STACK}`
  ctx.textAlign = 'right'
  ctx.fillText('M3U8', cardX + cardW + 10, cardY + cardH + 46)
  ctx.textAlign = 'left'

  // 金色角标（右上 / 右下，远离二维码）
  const cornerX = cardX + cardW - 18
  const cornerLen = 52
  ctx.strokeStyle = 'rgba(216,164,80,0.55)'
  ctx.lineWidth = 2.5
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cornerX - cornerLen, cardY + 18)
  ctx.lineTo(cornerX, cardY + 18)
  ctx.lineTo(cornerX, cardY + 18 + cornerLen)
  ctx.moveTo(cornerX - cornerLen, cardY + cardH - 18)
  ctx.lineTo(cornerX, cardY + cardH - 18)
  ctx.lineTo(cornerX, cardY + cardH - 18 - cornerLen)
  ctx.stroke()

  ctx.restore()

  // 卡片顶部发丝金色高光，提升精致度
  const hairline = ctx.createLinearGradient(cardX + 40, 0, cardX + cardW * 0.52, 0)
  hairline.addColorStop(0, 'rgba(231,196,139,0.9)')
  hairline.addColorStop(1, 'rgba(231,196,139,0)')
  ctx.fillStyle = hairline
  ctx.fillRect(cardX + 40, cardY + 1, cardW * 0.48, 2)

  // 二维码（尺寸取卡片可用高度，最大化可扫描性）
  const qrSize = 360
  const qrX = cardX + 62
  const qrY = cardY + (cardH - qrSize) / 2
  let qrImage: HTMLImageElement | null = null
  try {
    // 深色渐变前景 + 方角模块：与海报色调统一，同时保留最高识别度
    const qrDataUrl = await getStyledQrCodeDataUrl(shareUrl, {
      size: qrSize * 2,
      margin: 2,
      errorCorrectionLevel: 'M',
      colorFrom: '#0B0A12',
      colorTo: '#2E1065',
      eyeColor: '#0B0A12',
      shape: 'square',
      eyeStyle: 'square',
    })
    qrImage = await loadImage(qrDataUrl)
  } catch {
    qrImage = null
  }

  // 二维码白色底板：保证静区纯白，与暖金卡片拉开层次
  ctx.fillStyle = '#FFFFFF'
  roundRect(ctx, qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 22)
  ctx.fill()

  if (qrImage) {
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize)
  } else {
    // 二维码失败降级：灰色占位方块
    ctx.fillStyle = '#F1F5F9'
    roundRect(ctx, qrX, qrY, qrSize, qrSize, 16)
    ctx.fill()
    ctx.fillStyle = '#94A3B8'
    ctx.font = `600 20px ${FONT_STACK}`
    ctx.textAlign = 'center'
    ctx.fillText('QR', qrX + qrSize / 2, qrY + qrSize / 2 + 7)
    ctx.textAlign = 'left'
  }

  // 卡片右侧文案
  const textX = qrX + qrSize + 44
  const textW = cardX + cardW - 62 - textX

  let scanSize = 52
  ctx.font = `800 ${scanSize}px ${FONT_STACK}`
  while (scanSize > 30 && ctx.measureText(scanTitle).width > textW) {
    scanSize -= 2
    ctx.font = `800 ${scanSize}px ${FONT_STACK}`
  }
  ctx.fillStyle = '#0B1020'
  ctx.fillText(ellipsize(ctx, scanTitle, textW), textX, cardY + 198)

  // 网址胶囊
  let host = ''
  try {
    host = new URL(shareUrl).host
  } catch {
    host = ''
  }
  if (host) {
    ctx.font = `600 22px ${FONT_STACK}`
    const hostText = ellipsize(ctx, host, textW - 40)
    const hostWidth = Math.min(ctx.measureText(hostText).width + 40, textW)
    ctx.fillStyle = 'rgba(15,23,42,0.05)'
    roundRect(ctx, textX, cardY + 228, hostWidth, 50, 25)
    ctx.fill()
    ctx.fillStyle = '#475569'
    ctx.fillText(hostText, textX + 20, cardY + 261)
  }

  // 卡片内金色分隔竖线（二维码与文案之间）
  const divider = ctx.createLinearGradient(0, cardY + 96, 0, cardY + cardH - 96)
  divider.addColorStop(0, 'rgba(231,196,139,0)')
  divider.addColorStop(0.5, 'rgba(231,196,139,0.7)')
  divider.addColorStop(1, 'rgba(231,196,139,0)')
  ctx.fillStyle = divider
  ctx.fillRect(textX - 22, cardY + 96, 2, cardH - 192)

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
    const dataUrl = await generateShareImage(content)
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
