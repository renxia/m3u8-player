import { Box, Download, ExternalLink, Globe, Star, Terminal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { StorageKeys, storage } from '@/lib/storage'
import { cn, detectOS, formatDate, formatSize } from '@/lib/utils'
import type { Asset, OSType, Release } from '@/types'

const ghproxy = navigator.language === 'zh-CN' ? 'https://gh-proxy.org/' : ''

function getOSAsset(assets: Asset[], os: OSType): Asset | null {
  if (os === 'windows') {
    return assets.find((a) => /\.exe$/i.test(a.name)) || assets.find((a) => /\.zip$/i.test(a.name)) || null
  }
  if (os === 'macos') {
    return (
      assets.find((a) => /\.dmg$/i.test(a.name)) ||
      assets.find((a) => /\.pkg$/i.test(a.name)) ||
      assets.find((a) => /\.zip$/i.test(a.name)) ||
      null
    )
  }
  if (os === 'linux') {
    return assets.find((a) => /\.AppImage$/i.test(a.name)) || assets.find((a) => /\.tar\.gz$/i.test(a.name)) || null
  }
  return null
}

function getAssetIcon(name: string): string {
  if (/\.exe$/i.test(name)) return '🪟'
  if (/\.dmg$/i.test(name)) return '🍎'
  if (/\.pkg$/i.test(name)) return '📦'
  if (/\.AppImage$/i.test(name)) return '🐧'
  if (/\.tar\.gz$/i.test(name)) return '🗜️'
  if (/\.zip$/i.test(name)) return '🗜️'
  return '📄'
}
async function fetchRelease() {
  try {
    // 先检查缓存
    const cached = storage.get<Release>(StorageKeys.version)
    if (cached) return cached

    const response = await fetch('https://api.github.com/repos/lzwme/m3u8-dl/releases/latest')
    const data = await response.json()
    storage.set<Release>(StorageKeys.version, data, { expiresIn: 60 * 60 * 24 })
    return data as Release
  } catch (_error) {
    // 使用本地 fallback
    try {
      const response = await fetch('/data/version.json')
      const data = await response.json()
      return data as Release
    } catch {
      console.error('Failed to fetch release info')
    }
  }
}

export default function DownloadPage() {
  const { t } = useTranslation()
  const [release, setRelease] = useState<Release | null>(null)
  const [loading, setLoading] = useState(true)
  const os = detectOS()

  useEffect(() => {
    fetchRelease().then((data) => {
      setLoading(false)
      if (data) {
        // 过滤 yml、blockmap 文件
        data.assets = data.assets.filter((asset) => !asset.name.includes('yml') && !asset.name.includes('blockmap'))
        setRelease(data)
      }
    })
  }, [])

  const recommendedAsset = release ? getOSAsset(release.assets, os) : null

  return (
    <div className="space-y-3 md:space-y-6">
      {/* 推荐下载 */}
      {loading ? (
        <div className="bg-white/80 dark:bg-slate-900/80 rounded-2xl shadow-xl p-4 md:p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-slate-600 dark:text-slate-300 mt-4">加载中...</p>
        </div>
      ) : recommendedAsset ? (
        <div className="highlight-download rounded-2xl p-4 md:p-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4 text-indigo-700 dark:text-indigo-200">
            <Star className="w-5 h-5" />
            <span className="font-medium">{t('common.recdl')}</span>
          </div>
          <a
            href={`${ghproxy}${recommendedAsset.browser_download_url}`}
            className="inline-flex items-center gap-3 text-2xl font-bold text-indigo-700 dark:text-indigo-100 hover:text-indigo-900 dark:hover:text-white transition-colors"
          >
            <span className="text-2xl md:text-3xl">{getAssetIcon(recommendedAsset.name)}</span>
            <span className="text-lg md:text-2xl">{recommendedAsset.name}</span>
          </a>
          <div className="mt-2 md:mt-3 text-slate-600 dark:text-slate-300 text-xs md:text-sm">
            {t('common.version')}: {release?.name || release?.tag_name} | {t('common.releaseDate')}:{' '}
            {formatDate(release?.published_at || '')} | {t('common.size')}: {formatSize(recommendedAsset.size)}
          </div>
        </div>
      ) : (
        <div className="bg-white/80 dark:bg-slate-900/80 rounded-2xl shadow-xl p-4 md:p-8 text-center text-slate-600 dark:text-slate-300">
          {t('common.noVersions')}
        </div>
      )}

      {/* 下载列表 */}
      {release?.assets && (
        <div className="bg-white/80 dark:bg-slate-900/80 rounded-2xl shadow-xl backdrop-blur-sm p-1 md:p-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-600/20 rounded-lg">
              <Download className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">{t('download.title')}</h2>
          </div>

          <div className="mb-3 md:mb-4 text-slate-600 dark:text-slate-400 text-sm md:text-base">
            <span className="font-bold text-slate-900 dark:text-white">{release.name || release.tag_name}</span>
            <span className="text-xs md:text-sm ml-2">({formatDate(release.published_at)})</span>
          </div>

          <div className="flex flex-col gap-2 md:gap-3 mt-2">
            {release.assets.map((asset) => (
              <a
                key={asset.browser_download_url}
                href={`${ghproxy}${asset.browser_download_url}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-2 md:gap-3 p-2.5 md:p-3 rounded-xl',
                  'bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700',
                  'border border-slate-200 dark:border-slate-600',
                  'transition-all group',
                )}
              >
                <span className="text-xl md:text-2xl">{getAssetIcon(asset.name)}</span>
                <span className="flex-1 text-slate-800 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white text-sm md:text-base">
                  {asset.name}
                </span>
                <span className="text-slate-500 dark:text-slate-500 text-xs md:text-sm">{formatSize(asset.size)}</span>
                <ExternalLink className="w-3.5 h-3.5 md:w-4 md:h-4 text-slate-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* 使用说明 */}
      <div className="bg-white/80 dark:bg-slate-900/80 rounded-2xl shadow-xl backdrop-blur-sm p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-emerald-600/20 rounded-lg">
            <Star className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">{t('download.clientTitle')}</h2>
        </div>
        <p className="text-slate-700 dark:text-slate-300 mb-4 md:mb-6 text-sm md:text-base">{t('download.clientDesc')}</p>

        {/* 特性列表 */}
        <div className="mb-4 md:mb-6">
          <h3 className="text-base md:text-lg font-bold text-emerald-600 dark:text-emerald-400 mb-2 md:mb-3">
            {t('download.featuresTitle')}
          </h3>
          <ul className="space-y-1.5 md:space-y-2">
            {(t('download.features', { returnObjects: true }) as string[]).map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-slate-700 dark:text-slate-300 text-sm md:text-base">
                <span className="text-emerald-600 dark:text-emerald-400 mt-1">•</span>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 方法一：PC 客户端 */}
      <div className="bg-white/80 dark:bg-slate-900/80 rounded-2xl shadow-xl backdrop-blur-sm p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-600/20 rounded-lg">
            <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white">{t('download.method1Title')}</h3>
        </div>
        <p className="text-slate-700 dark:text-slate-300 text-sm md:text-base">{t('download.method1Desc')}</p>
      </div>

      {/* 方法二：CLI */}
      <div className="bg-white/80 dark:bg-slate-900/80 rounded-2xl shadow-xl backdrop-blur-sm p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-600/20 rounded-lg">
            <Terminal className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white">{t('download.method2Title')}</h3>
        </div>
        <div className="space-y-3 md:space-y-4">
          <div>
            <p className="text-slate-600 dark:text-slate-400 mb-2 text-sm md:text-base">{t('download.globalInstall')}</p>
            <pre className="bg-slate-100 dark:bg-slate-900/80 rounded-xl p-3 md:p-4 text-xs md:text-sm text-emerald-600 dark:text-emerald-400 overflow-x-auto font-mono">
              npm i -g @lzwme/m3u8-dl{'\n'}m3u8dl -h
            </pre>
          </div>
          <div>
            <p className="text-slate-600 dark:text-slate-400 mb-2 text-sm md:text-base">{t('download.useNpx')}</p>
            <pre className="bg-slate-100 dark:bg-slate-900/80 rounded-xl p-3 md:p-4 text-xs md:text-sm text-emerald-600 dark:text-emerald-400 overflow-x-auto font-mono">
              npx @lzwme/m3u8-dl -h
            </pre>
          </div>
        </div>
      </div>

      {/* 方法三：Docker */}
      <div className="bg-white/80 dark:bg-slate-900/80 rounded-2xl shadow-xl backdrop-blur-sm p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-cyan-600/20 rounded-lg">
            <Box className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white">{t('download.method3Title')}</h3>
        </div>
        <div className="space-y-3 md:space-y-4">
          <div>
            <p className="text-slate-600 dark:text-slate-400 mb-2 text-sm md:text-base">{t('download.dockerRun')}</p>
            <pre className="bg-slate-100 dark:bg-slate-900/80 rounded-xl p-3 md:p-4 text-xs md:text-sm text-emerald-600 dark:text-emerald-400 overflow-x-auto font-mono">
              docker run -d --name m3u8-dl -p 6600:6600 -v ./downloads:/app/downloads -v ./cache:/app/cache lzwme/m3u8-dl
            </pre>
          </div>
          <div>
            <p className="text-slate-600 dark:text-slate-400 mb-2 text-sm md:text-base">{t('download.dockerCompose')}</p>
            <pre className="bg-slate-100 dark:bg-slate-900/80 rounded-xl p-3 md:p-4 text-xs md:text-sm text-emerald-600 dark:text-emerald-400 overflow-x-auto font-mono whitespace-pre">
              {`version: '3'
services:
  m3u8-dl:
    image: lzwme/m3u8-dl
    container_name: m3u8-dl
    ports:
      - "6600:6600"
    volumes:
      - ./downloads:/app/downloads
      - ./cache:/app/cache
    restart: unless-stopped`}
            </pre>
          </div>
          <p className="text-slate-700 dark:text-slate-300 text-sm md:text-base">
            {t('download.dockerComplete')} <span className="text-cyan-600 dark:text-cyan-400">http://localhost:6600</span>{' '}
            {t('download.dockerWebUI')}
          </p>
        </div>
      </div>

      {/* 方法四：在线工具 */}
      <div className="bg-white/80 dark:bg-slate-900/80 rounded-2xl shadow-xl backdrop-blur-sm p-4 md:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-amber-600/20 rounded-lg">
            <Globe className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white">{t('download.method4Title')}</h3>
        </div>
        <p className="text-slate-700 dark:text-slate-300 mb-3 md:mb-4 text-sm md:text-base">{t('download.method4Desc')}</p>
        <ul className="space-y-1.5 md:space-y-2">
          <li>
            <a
              href="https://m3u8-downloader.lzw.me"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 flex items-center gap-1.5 md:gap-2 text-sm md:text-base"
            >
              <ExternalLink className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {(t('download.onlineTools', { returnObjects: true }) as string[])[0]}
            </a>
          </li>
          <li>
            <a
              href="https://lzw.me/x/m3u8-downloader-online"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 flex items-center gap-1.5 md:gap-2 text-sm md:text-base"
            >
              <ExternalLink className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {(t('download.onlineTools', { returnObjects: true }) as string[])[1]}
            </a>
          </li>
          <li>
            <a
              href="https://m3u8-player.lzw.me"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 flex items-center gap-1.5 md:gap-2 text-sm md:text-base"
            >
              <ExternalLink className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {(t('download.onlineTools', { returnObjects: true }) as string[])[2]}
            </a>
          </li>
        </ul>
      </div>
    </div>
  )
}
