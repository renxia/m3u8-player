import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { rmrf } from '@lzwme/fe-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(__dirname, '..')
const distDir = path.resolve(webRoot, './dist')

async function build(env = 'production', outDirName = 'm3u8-player') {
  const startTime = Date.now()
  const outDir = path.join(distDir, outDirName)
  process.env.NODE_OPTIONS = '--max_old_space_size=16384'
  process.env.VITE_VERCEL_ENV = env || 'production'

  let puppeteerExecutablePath = process.env.PUPPETEER_EXECUTABLE_PATH || ''

  if (!puppeteerExecutablePath) {
    if (process.platform === 'win32') {
      puppeteerExecutablePath =
        [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'D:\\scoop\\user-apps\\apps\\googlechrome\\current\\chrome.exe',
        ].find((p) => fs.existsSync(p)) || ''
    } else {
      puppeteerExecutablePath =
        [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/google-chrome-beta',
          '/usr/bin/google-chrome-dev',
          '/usr/bin/google-chrome-unstable',
          '/usr/bin/google-chrome-canary',
        ].find((p) => fs.existsSync(p)) || ''
    }

    if (puppeteerExecutablePath) {
      process.env.PUPPETEER_EXECUTABLE_PATH = puppeteerExecutablePath
    }
  }

  if (puppeteerExecutablePath) process.env.SEO_PRERENDER = '1'

  execSync('pnpm vite build', { stdio: 'inherit', env: process.env, cwd: webRoot })

  // 优化预渲染的 HTML 文件（移除内联 SVG 和 CSS）
  console.log('\n优化预渲染 HTML 文件...')
  try {
    const { optimizePrerenderedHTML } = await import('./optimize-prerendered-html.js')
    await optimizePrerenderedHTML(false)
  } catch (error) {
    console.warn('HTML 优化失败，继续构建:', error)
  }

  // 生成 sitemap.xml
  // await generateSitemap(outDir)

  if (fs.existsSync(outDir)) {
    // static 目录太大了，不压缩，在服务器上缓存并手动维护
    rmrf(path.resolve(outDir, 'web/static'))

    // zip 压缩
    const zipfile = path.join(distDir, `${outDirName}.zip`)
    if (fs.existsSync(zipfile)) {
      fs.unlinkSync(zipfile)
    }
    execSync(`zip -q -r ${outDirName}.zip ${outDirName}`, { stdio: 'inherit', cwd: distDir })
    console.log(`Zip file created: ${zipfile} in ${Date.now() - startTime}ms`)
  } else {
    console.error(`Directory ${outDirName} does not exist`)
    process.exit(1)
  }
}

build()
