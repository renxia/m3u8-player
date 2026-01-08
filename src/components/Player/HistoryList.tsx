import { Copy, History, Play, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn, copyToClipboard, formatTime } from '@/lib/utils'
import type { StorageData } from '@/types'

interface HistoryListProps {
  history: StorageData[]
  favorites: StorageData[]
  onPlay: (url: string, name?: string) => void
  onRemoveHistory: (index: number) => void
  onRemoveFavorite: (index: number) => void
  onClearHistory: () => void
  onClearFavorites: () => void
  onAddFavorite: (url: string, name?: string) => boolean
}

export default function HistoryList({
  history,
  favorites,
  onPlay,
  onRemoveHistory,
  onRemoveFavorite,
  onClearHistory,
  onClearFavorites,
  onAddFavorite,
}: HistoryListProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'history' | 'fav'>('history')

  const handleCopy = async (url: string) => {
    const success = await copyToClipboard(url)
    toast.success(success ? t('common.copied') : '复制失败')
  }

  const handleAddFavorite = (url: string, name?: string) => {
    const success = onAddFavorite(url, name)
    toast.success(success ? t('common.favSuccess') : t('common.collected'))
  }

  const currentList = activeTab === 'history' ? history : favorites
  const currentRemove = activeTab === 'history' ? onRemoveHistory : onRemoveFavorite
  const currentClear = activeTab === 'history' ? onClearHistory : onClearFavorites

  return (
    <div className="bg-white/80 dark:bg-slate-800/50 rounded-2xl shadow-xl backdrop-blur-sm overflow-hidden">
      {/* Tab 切换 */}
      <div className="flex border-b border-slate-200 dark:border-slate-700/50">
        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            'flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-3 font-medium transition-all text-sm md:text-base',
            activeTab === 'history'
              ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300',
          )}
        >
          <History className="w-4 h-4" />
          {t('index.history')}
        </button>
        <button
          onClick={() => setActiveTab('fav')}
          className={cn(
            'flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-3 font-medium transition-all text-sm md:text-base',
            activeTab === 'fav'
              ? 'text-amber-600 dark:text-amber-400 border-b-2 border-amber-600 dark:border-amber-400'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300',
          )}
        >
          <Star className="w-4 h-4" />
          {t('index.favorites')}
        </button>
      </div>

      {/* 列表内容 */}
      <div className="p-3 md:p-4 max-h-96 overflow-y-auto">
        {currentList.length === 0 ? (
          <div className="text-center text-slate-600 dark:text-slate-400 py-8">
            {activeTab === 'history' ? t('common.noHistory') : t('common.noFav')}
          </div>
        ) : (
          <div className="space-y-2 md:space-y-3">
            {currentList.map((item, idx) => (
              <div
                key={`${item.url}-${item.time}`}
                className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-2.5 md:p-3 hover:bg-slate-100 dark:hover:bg-slate-900/70 transition-all group"
              >
                <div className="flex flex-col gap-2">
                  {item.name && <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{item.name}</div>}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      onPlay(item.url, item.name)
                    }}
                    className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 text-sm break-all transition-colors"
                  >
                    {item.url}
                  </a>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-500">{formatTime(item.time, t)}</span>
                    <div className="flex gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => currentRemove(idx)}
                        className="p-1.5 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-600 dark:text-red-400 hover:text-white transition-all"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onPlay(item.url, item.name)}
                        className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-600 dark:text-indigo-400 hover:text-white transition-all"
                        title={t('common.play')}
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleCopy(item.url)}
                        className="p-1.5 rounded-lg bg-slate-600/20 hover:bg-slate-600 text-slate-600 dark:text-slate-400 hover:text-white transition-all"
                        title={t('common.copy')}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {activeTab === 'history' && (
                        <button
                          onClick={() => handleAddFavorite(item.url, item.name)}
                          className="p-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600 text-amber-600 dark:text-amber-400 hover:text-white transition-all"
                          title={t('common.fav')}
                        >
                          <Star className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 清空按钮 */}
      {currentList.length > 0 && (
        <div className="p-3 md:p-4 border-t border-slate-200 dark:border-slate-700/50 flex justify-end">
          <button
            onClick={currentClear}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm transition-all"
          >
            <Trash2 className="w-4 h-4" />
            {t('index.clearHistory')}
          </button>
        </div>
      )}
    </div>
  )
}
