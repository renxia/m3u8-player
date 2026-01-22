import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 类型定义
interface TranslationObject {
  [key: string]: string | number | boolean | TranslationObject | null | undefined
}

interface AlignmentStats {
  added: number
  removed: number
  kept: number
}

interface LanguageStats {
  totalKeys: number
  missingKeys: string[]
  extraKeys: string[]
  fileLines: number
}

/**
 * 递归排序对象的 key（按字母顺序）
 */
function sortObjectKeys(obj: TranslationObject): TranslationObject {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
    return obj
  }

  const sorted: TranslationObject = {}
  const keys = Object.keys(obj).sort()

  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sorted[key] = sortObjectKeys(value as TranslationObject)
    } else {
      sorted[key] = value
    }
  }

  return sorted
}

/**
 * 递归对齐对象结构，保持与基准完全相同的顺序和结构
 */
function alignObject(
  base: TranslationObject,
  target: TranslationObject,
  path = '',
  stats: AlignmentStats = { added: 0, removed: 0, kept: 0 },
): TranslationObject {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) {
    return base
  }

  const result: TranslationObject = {}
  const targetKeys = new Set(Object.keys(target || {}))

  // 按照基准对象的 key 顺序遍历
  for (const key in base) {
    const currentPath = path ? `${path}.${key}` : key

    if (typeof base[key] === 'object' && base[key] !== null && !Array.isArray(base[key])) {
      // 如果是对象，递归处理
      if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        // 目标中也存在这个对象，递归对齐
        result[key] = alignObject(base[key] as TranslationObject, target[key] as TranslationObject, currentPath, stats)
        stats.kept++
      } else {
        // 目标中不存在或不是对象，创建新对象
        result[key] = alignObject(base[key] as TranslationObject, {}, currentPath, stats)
        stats.added++
      }
      targetKeys.delete(key)
    } else {
      // 如果是基本类型或数组
      if (target[key] !== undefined) {
        // 保留目标中的值
        result[key] = target[key]
        stats.kept++
      } else {
        // 使用基准值作为占位符
        result[key] = `zh:${base[key]}`
        stats.added++
      }
      targetKeys.delete(key)
    }
  }

  // 删除基准中不存在的 key（这些是多余的）
  for (const extraKey of targetKeys) {
    const extraPath = path ? `${path}.${extraKey}` : extraKey
    console.log(`  删除多余的 key: ${extraPath}`)
    stats.removed++
  }

  return result
}

/**
 * 获取所有叶子节点的 key（完整路径）
 */
function getAllKeys(obj: TranslationObject, prefix = ''): string[] {
  const keys: string[] = []
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys.push(...getAllKeys(obj[key] as TranslationObject, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

/**
 * 对齐翻译文件
 */
function alignTranslations(
  base: TranslationObject,
  target: TranslationObject,
  targetName: string,
): { aligned: TranslationObject; stats: AlignmentStats } {
  console.log(`\n对齐 ${targetName}...`)
  const stats: AlignmentStats = { added: 0, removed: 0, kept: 0 }
  const aligned = alignObject(base, target, '', stats)
  return { aligned, stats }
}

/**
 * 获取统计信息
 */
function getLanguageStats(base: TranslationObject, target: TranslationObject): LanguageStats {
  const baseKeys = new Set(getAllKeys(base))
  const targetKeys = new Set(getAllKeys(target))

  const missingKeys = [...baseKeys].filter((k) => !targetKeys.has(k))
  const extraKeys = [...targetKeys].filter((k) => !baseKeys.has(k))

  return {
    totalKeys: targetKeys.size,
    missingKeys,
    extraKeys,
    fileLines: 0, // 将在读取文件后更新
  }
}

/**
 * 读取 JSON 文件
 */
async function readJsonFile(filePath: string): Promise<TranslationObject> {
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content) as TranslationObject
}

/**
 * 写入 JSON 文件
 */
async function writeJsonFile(filePath: string, data: TranslationObject): Promise<void> {
  const content = `${JSON.stringify(data, null, 2)}\n`
  await writeFile(filePath, content, 'utf-8')
}

/**
 * 获取文件行数
 */
async function getFileLines(filePath: string): Promise<number> {
  const content = await readFile(filePath, 'utf-8')
  return content.split('\n').length
}

/**
 * 发现所有语言目录
 */
async function discoverLanguageDirs(localesDir: string): Promise<string[]> {
  const entries = await readdir(localesDir, { withFileTypes: true })
  const languageDirs: string[] = []

  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.json')) {
      languageDirs.push(entry.name.replace('.json', ''))
    }
  }

  return languageDirs.sort()
}

/**
 * 主函数
 */
async function main() {
  const baseLang = 'zh-CN'
  const localesDir = join(__dirname, '../src/i18n/locales')
  const baseLangPath = join(localesDir, `${baseLang}.json`)

  console.log('开始对齐翻译文件...\n')

  // 第一步：读取并规整基准语言文件（zh）
  console.log(`第一步：规整基准语言文件 (${baseLang})...`)
  let baseLangData = await readJsonFile(baseLangPath)
  baseLangData = sortObjectKeys(baseLangData)
  await writeJsonFile(baseLangPath, baseLangData)
  console.log('✓ 基准语言文件已规整并保存\n')

  // 第二步：发现所有语言目录
  console.log('第二步：发现语言目录...')
  const languageDirs = await discoverLanguageDirs(localesDir)
  console.log(`发现 ${languageDirs.length} 个语言目录: ${languageDirs.join(', ')}\n`)

  // 第三步：对齐所有语言文件
  const allStats: Record<string, { alignment: AlignmentStats; language: LanguageStats }> = {}

  for (const lang of languageDirs) {
    if (lang === baseLang) {
      // 跳过基准语言
      continue
    }

    const langPath = join(localesDir, `${lang}.json`)
    try {
      const targetData = await readJsonFile(langPath)
      const { aligned, stats } = alignTranslations(baseLangData, targetData, lang)
      await writeJsonFile(langPath, aligned)

      // 重新读取对齐后的文件以获取统计信息
      const finalData = await readJsonFile(langPath)
      const languageStats = getLanguageStats(baseLangData, finalData)
      languageStats.fileLines = await getFileLines(langPath)

      allStats[lang] = {
        alignment: stats,
        language: languageStats,
      }
    } catch (error) {
      console.error(`处理 ${lang} 时出错:`, error)
    }
  }

  // 第四步：输出统计信息
  console.log(`\n${'='.repeat(60)}`)
  console.log('统计信息')
  console.log('='.repeat(60))

  // 基准语言统计
  const baseLangKeys = getAllKeys(baseLangData)
  const baseLangLines = await getFileLines(baseLangPath)
  console.log(`\n基准语言 (${baseLang}):`)
  console.log(`  总 key 数: ${baseLangKeys.length}`)
  console.log(`  文件行数: ${baseLangLines}`)

  // 各语言统计
  for (const lang of languageDirs) {
    if (lang === baseLang) {
      continue
    }

    const stats = allStats[lang]
    if (!stats) {
      continue
    }

    console.log(`\n${lang}:`)
    console.log(`  总 key 数: ${stats.language.totalKeys}`)
    console.log(`  文件行数: ${stats.language.fileLines}`)
    console.log(`  对齐操作:`)
    console.log(`    新增: ${stats.alignment.added} 个`)
    console.log(`    删除: ${stats.alignment.removed} 个`)
    console.log(`    保留: ${stats.alignment.kept} 个`)
    console.log(`  差异:`)
    console.log(`    缺失 key: ${stats.language.missingKeys.length} 个`)
    console.log(`    多余 key: ${stats.language.extraKeys.length} 个`)

    if (stats.language.missingKeys.length > 0) {
      console.log(`    缺失 key 示例 (前10个):`)
      stats.language.missingKeys.slice(0, 10).forEach((key) => {
        console.log(`      - ${key}`)
      })
    }

    if (stats.language.extraKeys.length > 0) {
      console.log(`    多余 key 示例 (前10个):`)
      stats.language.extraKeys.slice(0, 10).forEach((key) => {
        console.log(`      - ${key}`)
      })
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log('对齐完成！所有文件已保存。')
  console.log('='.repeat(60))
}

// 执行主函数
main().catch((error) => {
  console.error('执行失败:', error)
  process.exit(1)
})
