import { Code, Info, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import CollapsibleSection from '@/components/CollapsibleSection'

export default function HlsDescription() {
  const { t } = useTranslation()

  return (
    <CollapsibleSection
      sectionKey="hls-description"
      title={t('index.hlsDesc.title')}
      className="bg-white/80 dark:bg-slate-800/50 rounded-2xl shadow-xl backdrop-blur-sm p-4 md:p-6"
      titleRender={(isExpanded, toggleExpanded) => (
        <button type="button" onClick={toggleExpanded} className="flex items-center justify-between w-full text-left">
          <div className="flex items-center gap-2 md:gap-3">
            <div className="p-2 bg-indigo-600/20 rounded-lg">
              <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">{t('index.hlsDesc.title')}</h2>
          </div>
          <span
            className="ml-2 flex-shrink-0 text-slate-600 dark:text-slate-400 transition-transform duration-200"
            style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </span>
        </button>
      )}
    >
      {/* 内容 */}
      <div className="space-y-3 md:space-y-4 text-slate-700 dark:text-slate-300 text-sm md:text-base">
        <p className="leading-relaxed">{t('index.hlsDesc.content1')}</p>
        <p className="leading-relaxed">{t('index.hlsDesc.content2')}</p>
        <p className="leading-relaxed">{t('index.hlsDesc.content3')}</p>
        <p className="leading-relaxed">{t('index.hlsDesc.content4')}</p>
      </div>

      {/* 加密说明 */}
      <div className="mt-4 md:mt-6">
        <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
          <div className="p-2 bg-amber-600/20 rounded-lg">
            <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <h3 className="text-base md:text-lg font-bold text-slate-900 dark:text-white">{t('index.hlsDesc.encryptionTitle')}</h3>
        </div>
        <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{t('index.hlsDesc.encryptionContent')}</p>
      </div>

      {/* 嵌入代码 */}
      <div className="mt-4 md:mt-6">
        <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
          <div className="p-2 bg-emerald-600/20 rounded-lg">
            <Code className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-base md:text-lg font-semibold text-slate-900 dark:text-white">{t('index.hlsDesc.embedTitle')}</h3>
        </div>
        <pre className="bg-slate-100 dark:bg-slate-900/80 rounded-xl p-4 text-sm text-emerald-600 dark:text-emerald-400 overflow-x-auto font-mono">
          {`<iframe src="https://m3u8-player.lzw.me/?url=https://****.com/****/index.m3u8"></iframe>`}
        </pre>
      </div>

      {/* 功能特性 */}
      <ul className="mt-4 md:mt-6 space-y-1.5 md:space-y-2">
        {(t('index.hlsDesc.features', { returnObjects: true }) as string[]).map((feature, idx) => (
          <li key={feature} className="flex items-start gap-2 text-slate-600 dark:text-slate-400 text-sm">
            <span className="text-indigo-600 dark:text-indigo-400 mt-0.5">•</span>
            <span>
              {idx === 1 ? (
                <>
                  {feature.split('M3U8视频在线下载工具')[0]}
                  <a
                    href="https://m3u8-downloader.lzw.me"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 underline"
                  >
                    M3U8视频在线下载工具
                  </a>
                </>
              ) : idx === 2 ? (
                <>
                  {feature.split('配置M3U8标准加密改写')[0]}
                  <a
                    href="https://help.aliyun.com/document_detail/179287.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 underline"
                  >
                    配置M3U8标准加密改写
                  </a>
                </>
              ) : (
                feature
              )}
            </span>
          </li>
        ))}
      </ul>
    </CollapsibleSection>
  )
}
