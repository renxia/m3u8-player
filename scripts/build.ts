import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

  // 先做类型检查：vite build 自身不做类型校验，避免类型错误被打包上线
  execSync('pnpm exec tsc --noEmit', { stdio: 'inherit', env: process.env, cwd: webRoot })

  // 预渲染与 HTML 优化（optimize）由 @lzwme/prerender-kit 在 vite build 阶段一并完成
  execSync('pnpm exec vite build', { stdio: 'inherit', env: process.env, cwd: webRoot })

  if (!fs.existsSync(outDir)) {
    console.error(`Directory ${outDirName} does not exist`)
    process.exit(1)
  }

  // zip 压缩
  const zipfile = path.join(distDir, `${outDirName}.zip`)
  if (fs.existsSync(zipfile)) {
    fs.unlinkSync(zipfile)
  }
  createZip(distDir, `${outDirName}.zip`, outDirName)
  console.log(`Zip file created: ${zipfile} in ${Date.now() - startTime}ms`)
}

/**
 * 生成 zip 包
 * Windows 默认没有 zip 命令，优先用系统 zip，缺失时回退到 PowerShell Compress-Archive
 */
function createZip(cwd: string, zipName: string, dirName: string) {
  const hasZip = (() => {
    try {
      execSync(process.platform === 'win32' ? 'where zip' : 'which zip', { stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  })()

  if (hasZip) {
    execSync(`zip -q -r ${zipName} ${dirName}`, { stdio: 'inherit', cwd })
    return
  }

  if (process.platform === 'win32') {
    execSync(
      `powershell -NoProfile -NonInteractive -Command "Compress-Archive -Path '${path.join(cwd, dirName)}' -DestinationPath '${path.join(cwd, zipName)}' -Force"`,
      { stdio: 'inherit' },
    )
    return
  }

  console.warn('[build] 未找到 zip 命令，已跳过压缩（可安装 zip 后重试）')
}

build()
