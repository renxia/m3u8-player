import { CheckCircle, Download, ExternalLink, Github, Target } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { getLangPrefix } from '@/lib/utils'

export default function AboutPage() {
  const { t } = useTranslation()
  const langPrefix = getLangPrefix()

  return (
    <div className="space-y-3 md:space-y-6">
      {/* 标题卡片 */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-xl p-4 md:p-8 text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">{t('about.title')}</h1>
        <p className="text-sm md:text-base text-indigo-100 max-w-2xl mx-auto">{t('about.intro')}</p>
      </div>

      {/* 主要功能 */}
      <div className="bg-white/80 dark:bg-slate-800/50 rounded-2xl shadow-xl backdrop-blur-sm p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-emerald-600/20 rounded-lg">
            <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">{t('about.featuresTitle')}</h2>
        </div>
        <ul className="grid md:grid-cols-2 gap-2 md:gap-3">
          {(t('about.features', { returnObjects: true }) as string[]).map((feature, idx) => (
            <li key={feature} className="flex items-start gap-2 md:gap-3 text-slate-700 dark:text-slate-300 text-sm md:text-base">
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 rounded-full text-sm font-medium">
                {idx + 1}
              </span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 适用场景 */}
      <div className="bg-white/80 dark:bg-slate-800/50 rounded-2xl shadow-xl backdrop-blur-sm p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-amber-600/20 rounded-lg">
            <Target className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">{t('about.scenariosTitle')}</h2>
        </div>
        <ul className="space-y-2 md:space-y-3">
          {(t('about.scenarios', { returnObjects: true }) as string[]).map((scenario) => (
            <li key={scenario} className="flex items-center gap-2 md:gap-3 text-slate-700 dark:text-slate-300 text-sm md:text-base">
              <span className="w-2 h-2 bg-amber-600 dark:bg-amber-400 rounded-full"></span>
              <span>{scenario}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 开源与反馈 */}
      <div className="bg-white/80 dark:bg-slate-800/50 rounded-2xl shadow-xl backdrop-blur-sm p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-600/20 rounded-lg">
            <Github className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">{t('about.openSourceTitle')}</h2>
        </div>
        <div className="space-y-3 md:space-y-4 text-slate-700 dark:text-slate-300 text-sm md:text-base">
          <p>{t('about.openSourceDesc')}</p>
          <div className="flex flex-wrap gap-2 md:gap-4">
            <a
              href="https://github.com/lzwme/m3u8-player"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg transition-colors text-sm md:text-base"
            >
              <Github className="w-4 h-4" />
              {t('about.githubUrl')}
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://lzw.me"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors text-sm md:text-base"
            >
              {t('about.contactLink')}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>

      {/* 工具推荐 */}
      <div className="bg-white/80 dark:bg-slate-800/50 rounded-2xl shadow-xl backdrop-blur-sm p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-cyan-600/20 rounded-lg">
            <Download className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white">{t('about.toolsTitle')}</h2>
        </div>
        <div className="space-y-3 md:space-y-4 text-slate-700 dark:text-slate-300 text-sm md:text-base">
          <p>
            {t('about.toolsDesc1')}
            <a
              href="https://m3u8-downloader.lzw.me"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 underline ml-1"
            >
              {t('about.toolsLink1')}
            </a>
          </p>
          <p>
            {t('about.toolsDesc2')}
            <Link
              to={`${langPrefix}/download`}
              className="text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 underline mx-1"
            >
              {t('about.toolsLink2')}
            </Link>
            {t('about.toolsDesc3')}
          </p>
        </div>
      </div>
    </div>
  )
}
