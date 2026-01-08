import { MessageSquare } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getCdnUrls } from '@/lib/cdn'

export default function FeedbackPage() {
  const { t } = useTranslation()
  const commentRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    // 加载 Twikoo 评论系统
    window.h5Utils?.initTwikoo({ path: `/x/m3u8-player${location.pathname}` }, true, getCdnUrls('twikoo')[0])

    return () => {
      // cleanup if needed
    }
  }, [])

  return (
    <div className="space-y-3 md:space-y-6">
      {/* 标题卡片 */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl shadow-xl p-4 md:p-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="p-3 bg-white/20 rounded-xl">
            <MessageSquare className="w-8 h-8 text-white" />
          </div>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">{t('feedback.title')}</h1>
        <p className="text-sm md:text-base text-emerald-100 max-w-2xl mx-auto">{t('feedback.desc')}</p>
      </div>

      {/* 评论区 */}
      <div className="bg-white/80 dark:bg-slate-800/50 rounded-2xl shadow-xl backdrop-blur-sm p-3 md:p-6">
        <div ref={commentRef} id="twikooComment" className="min-h-[400px]">
          <div className="flex items-center justify-center h-[400px] text-slate-600 dark:text-slate-400">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p>加载评论系统中...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
