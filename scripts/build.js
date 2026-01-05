import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 生成时间戳
function getTimestamp() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  return `${year}${month}${day}-${hours}${minutes}`
}

// 创建 ZIP 压缩包
function createZipArchive(sourceDir, _zipPath) {
  const zip = new AdmZip()

  // 递归添加目录内容
  const addDirectory = (dir, prefix = '') => {
    const files = fs.readdirSync(dir)
    files.forEach((file) => {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)

      if (stat.isDirectory()) {
        addDirectory(filePath, `${prefix}${file}/`)
      } else {
        const content = fs.readFileSync(filePath)
        zip.addFile(`${prefix}${file}`, content)
      }
    })
  }

  addDirectory(sourceDir)

  return zip
}

// 主构建流程
async function main() {
  console.log('🚀 Starting build with Bun...\n')

  // 1. 运行 Vite 构建
  console.log('📦 Building with Vite...')
  try {
    execSync('npx vite build', {
      stdio: 'inherit',
      cwd: path.resolve(rootDir),
    })
    console.log('✅ Vite build completed\n')
  } catch (error) {
    console.error('❌ Vite build failed:', error.message)
    process.exit(1)
  }

  // 2. 创建 ZIP 压缩包
  const outputDir = path.resolve(rootDir, 'dist/m3u8-player')
  const timestamp = getTimestamp()
  const zipFileName = `m3u8-player-${timestamp}.zip`
  const zipPath = path.resolve(rootDir, 'dist', zipFileName)

  console.log('📦 Creating zip archive...')

  try {
    const zip = createZipArchive(outputDir)
    zip.writeZip(zipPath)

    const stats = fs.statSync(zipPath)
    const sizeKB = (stats.size / 1024).toFixed(2)
    console.log(`✅ Zip created: ${zipFileName} (${sizeKB} KB)\n`)

    // 列出生成的文件
    console.log('📁 Generated files:')
    console.log(`   - dist/m3u8-player/`)
    console.log(`   - dist/${zipFileName}\n`)

    console.log('✨ Build completed successfully!\n')
  } catch (error) {
    console.error('❌ Error creating zip:', error.message)
    process.exit(1)
  }
}

main()
