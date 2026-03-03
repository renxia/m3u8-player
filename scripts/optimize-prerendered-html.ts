/**
 * 优化预渲染 HTML 文件
 * 移除内联的 SVG 图标和未使用的 CSS，减少文件大小
 */

import fs, { globSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const config = {
  distDir: path.resolve(__dirname, '../dist/m3u8-player')
}

/**
 * 保护指定标签块（如 script/style），避免后续正则替换误伤其内部内容；
 * 返回保护后的 html，以及可用于还原的 restore 函数。
 */
function preserveTagBlocks(
  html: string,
  tags: readonly string[],
  options?: { placeholderPrefix?: string },
): { html: string; restore: (html: string) => string } {
  const preservedBlocks: string[] = []
  const placeholderPrefix = options?.placeholderPrefix ?? '___PRESERVE_BLOCK_'
  const placeholderSuffix = '___'

  // tags 为空时直接返回
  if (tags.length === 0) {
    return { html, restore: s => s }
  }

  const tagsPattern = tags.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const re = new RegExp(`<(${tagsPattern})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, 'gi')

  const working = html.replace(re, match => {
    const idx = preservedBlocks.length
    preservedBlocks.push(match)
    return `${placeholderPrefix}${idx}${placeholderSuffix}`
  })

  const restore = (s: string) => {
    let out = s
    for (let i = 0; i < preservedBlocks.length; i++) {
      out = out.replaceAll(`${placeholderPrefix}${i}${placeholderSuffix}`, preservedBlocks[i] ?? '')
    }
    return out
  }

  return { html: working, restore }
}

interface OptimizationStats {
  totalFiles: number
  totalSizeBefore: number
  totalSizeAfter: number
  svgRemoved: number
  inlineStylesRemoved: number
  classAttributesRemoved: number
}

/**
 * 移除内联的 SVG 图标（lucide-react 生成的）
 * 这些 SVG 通常以 <svg> 标签形式内联在 HTML 中
 */
function removeInlineSVGIcons(html: string): { html: string; count: number } {
  let count = 0
  // 移除所有 svg 图标，因为 react 动态渲染会写回 html 中
  const svgPattern = /<svg[^>]*>[\s\S]*?<\/svg>/gi
  const matches = html.match(svgPattern)
  if (matches) {
    count = matches.length
    // 移除这些内联 SVG（在实际应用中，可以替换为 <use> 标签引用外部 sprite）
    // html = html.replace(svgPattern, '<!-- SVG icon removed for optimization -->')
    html = html.replace(svgPattern, '').replaceAll('<div><div>', '')
  }
  return { html, count }
}

/**
 * 移除内联的 <style> 标签（CSS 应该提取为外部文件）
 */
function removeInlineStyles(html: string): { html: string; count: number } {
  let count = 0
  // 匹配 <style> 标签，但保留关键的内联样式（如 critical CSS）
  const stylePattern = /<style[^>]*>[\s\S]*?<\/style>/gi
  const matches = html.match(stylePattern)
  if (matches) {
    // 只移除非关键的样式（可以通过检查内容判断）
    html = html.replace(stylePattern, match => {
      // 如果样式内容很长（可能是完整的 CSS），则移除
      if (match.length > 1000) {
        count++
        // return '<!-- Inline styles removed, use external CSS file -->'
        return ''
      }
      return match; // 保留关键的小样式
    })
  }
  return { html, count }
}

/**
 * 移除所有标签的 class 属性。
 * 注意：避免误伤 <script>/<style> 标签内部的字符串内容（例如 class="xx" 出现在 JS 字符串里）。
 */
function removeAllClassAttributes(html: string): { html: string; count: number } {
  const { html: working, restore } = preserveTagBlocks(html, ['script', 'style'], { placeholderPrefix: '___PRESERVE_SS_' })

  // 移除 class="..." 或 class='...'
  let count = 0
  const stripped = working.replace(/\sclass=(?:"[^"]*"|'[^']*')/gi, () => {
    count++
    return ''
  })

  return { html: restore(stripped), count }
}

/**
 * 压缩 HTML（移除多余空白）
 */
function minifyHTML(html: string): string {
  const { html: working, restore } = preserveTagBlocks(html, ['script', 'style'], { placeholderPrefix: '___PRESERVE_MINIFY_' })

  // 移除 HTML 注释（不处理已被保护的 script/style 内容）
  const withoutComments = working.replace(/<!--[\s\S]*?-->/g, '')

  // 压缩空白
  const minified = withoutComments
    .replace(/\s+/g, ' ') // 将多个空白字符替换为单个空格
    .replace(/>\s+</g, '><') // 移除标签之间的空白
    .trim()

  return restore(minified)
}

/**
 * 添加 loading 指示器
 */
function addLoadingIndicator(html: string, replaceKeyStr = '<div id="app">'): string {
  const loadingIndicator = [
    `<style>@keyframes p{to{transform:scale(2.5);opacity:.2}}</style>`,
    `<div style="position:fixed;inset:0;z-index:999999;background:#fff;display:grid;place-items:center">`,
    `<i style="width:18px;height:18px;background:#26f;border-radius:50%;animation:p .5s infinite alternate"></i>`,
    `</div>`,
  ].join('\n')
  return html.replace(replaceKeyStr, `${replaceKeyStr}${loadingIndicator}`)
}

/**
 * 优化单个 HTML 文件
 */
function optimizeHTMLFile(filePath: string, stats: OptimizationStats, showProgress = true): void {
  try {
    const originalContent = fs.readFileSync(filePath, 'utf-8')
    const originalSize = Buffer.byteLength(originalContent, 'utf-8')

    let optimizedContent = originalContent

    // 移除内联 SVG 图标
    const svgResult = removeInlineSVGIcons(optimizedContent)
    optimizedContent = svgResult.html
    stats.svgRemoved += svgResult.count

    // 移除内联样式
    const styleResult = removeInlineStyles(optimizedContent)
    optimizedContent = styleResult.html
    stats.inlineStylesRemoved += styleResult.count

    // 移除所有 class 属性（动态渲染时会自动添加上）
    const classResult = removeAllClassAttributes(optimizedContent)
    optimizedContent = classResult.html
    stats.classAttributesRemoved += classResult.count

    // 添加 loading
    optimizedContent = addLoadingIndicator(optimizedContent)

    // 压缩 HTML
    optimizedContent = minifyHTML(optimizedContent)

    const optimizedSize = Buffer.byteLength(optimizedContent, 'utf-8')
    const saved = originalSize - optimizedSize
    const savedPercent = ((saved / originalSize) * 100).toFixed(2)

    if (saved > 0) {
      fs.writeFileSync(filePath, optimizedContent, 'utf-8')
      if (showProgress)
        console.log(
          `✓ ${path.relative(config.distDir, filePath)}: ${(originalSize / 1024).toFixed(2)}KB → ${(optimizedSize / 1024).toFixed(2)}KB (节省 ${savedPercent}%)`
        )
    }

    stats.totalSizeBefore += originalSize
    stats.totalSizeAfter += optimizedSize
  } catch (error) {
    if (showProgress) console.error(`✗ 处理文件失败: ${filePath}`, error)
  }
}

/**
 * 主函数
 */
async function optimizePrerenderedHTML(cfg: Partial<typeof config> = {}, showProgress = true): Promise<void> {
  if (showProgress) console.log('开始优化预渲染 HTML 文件...\n')

  Object.assign(config, cfg)

  if (!fs.existsSync(config.distDir)) {
    console.error(`错误: 输出目录不存在: ${config.distDir}`)
    process.exit(1)
  }

  // 查找所有 HTML 文件
  const htmlFiles: string[] = globSync('**/*.html', { cwd: config.distDir })
  // console.log('htmlFiles', htmlFiles)

  if (htmlFiles.length === 0) {
    console.log('未找到 HTML 文件')
    return
  }

  const stats: OptimizationStats = {
    totalFiles: htmlFiles.length,
    totalSizeBefore: 0,
    totalSizeAfter: 0,
    svgRemoved: 0,
    inlineStylesRemoved: 0,
    classAttributesRemoved: 0,
  }

  console.log(`找到 ${htmlFiles.length} 个 HTML 文件\n`)

  // 优化每个文件
  for (const file of htmlFiles) {
    optimizeHTMLFile(path.resolve(config.distDir, file), stats, showProgress)
  }

  // 输出统计信息
  console.log(`\n${'='.repeat(60)}`)
  console.log('优化完成！')
  console.log('='.repeat(60))
  console.log(`处理文件数: ${stats.totalFiles}`)
  console.log(`移除 SVG 图标: ${stats.svgRemoved} 个`)
  console.log(`移除内联样式: ${stats.inlineStylesRemoved} 个`)
  console.log(`移除 class 属性: ${stats.classAttributesRemoved} 个`)
  console.log(`总大小: ${(stats.totalSizeBefore / 1024 / 1024).toFixed(2)}MB → ${(stats.totalSizeAfter / 1024 / 1024).toFixed(2)}MB`)
  console.log(
    `节省: ${((stats.totalSizeBefore - stats.totalSizeAfter) / 1024 / 1024).toFixed(2)}MB (${(((stats.totalSizeBefore - stats.totalSizeAfter) / stats.totalSizeBefore) * 100).toFixed(2)}%)`
  )
  console.log('='.repeat(60))
}

// 导出函数供其他脚本使用
export { optimizePrerenderedHTML }

// 如果直接运行此脚本（通过 bun/node 直接执行），则执行优化
// 使用 fileURLToPath 获取当前文件路径，与 process.argv[1] 比较
const currentFile = fileURLToPath(import.meta.url)
const mainFile = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (currentFile === mainFile || currentFile.replace(/\\/g, '/') === mainFile.replace(/\\/g, '/')) {
  optimizePrerenderedHTML().catch(error => {
    console.error('优化过程出错:', error)
    process.exit(1)
  })
}
