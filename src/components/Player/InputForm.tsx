import { Download, Edit, Play, RotateCw, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { PlayerType, PlayListItem } from '@/types'

interface InputFormProps {
  demoUrl: string
  currentPlayingUrl?: string
  onPlay: (url: string, type?: string, player?: PlayerType) => void
  onRotate: () => void
  onPlaylistParsed?: (list: PlayListItem[]) => void
}

export default function InputForm({ demoUrl, currentPlayingUrl, onPlay, onRotate, onPlaylistParsed }: InputFormProps) {
  const { t } = useTranslation()
  const [urlInput, setUrlInput] = useState('')
  const [m3u8Content, setM3u8Content] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isUserEditingRef = useRef(false)

  // 当外部传入当前播放的 URL 时，更新输入框
  useEffect(() => {
    if (currentPlayingUrl) {
      // 只有当不是 blob URL 时才更新
      if (!currentPlayingUrl.startsWith('blob:')) {
        // 如果用户正在编辑（1秒内），且输入框内容与当前播放 URL 不同，则不更新
        // 这样可以避免在用户输入时被打断，但如果用户输入的内容与播放的 URL 相同，则允许更新
        if (isUserEditingRef.current && urlInput !== currentPlayingUrl) {
          return
        }
        // 更新输入框并重置编辑标记（因为这是从外部触发的播放）
        setUrlInput(currentPlayingUrl)
        isUserEditingRef.current = false
      }
    }
  }, [currentPlayingUrl, urlInput])

  // 监听用户输入，标记为正在编辑
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    isUserEditingRef.current = true
    setUrlInput(e.target.value)
    // 延迟重置编辑标记，避免频繁更新
    setTimeout(() => {
      isUserEditingRef.current = false
    }, 1000)
  }, [])

  // 获取有效的 URL
  const getValidUrl = useCallback((): string => {
    let url = urlInput.trim() || demoUrl
    if (!url.startsWith('http')) {
      if (url.includes('http')) {
        const match = url.match(/https?:\/\/[a-z0-9\-./]+/i)
        if (match) url = match[0]
      } else {
        url = ''
      }
    }
    return url
  }, [urlInput, demoUrl])

  // 处理播放
  const handlePlay = useCallback(
    (player: PlayerType = 'artplayer') => {
      let url = getValidUrl()
      let type = ''
      let content = m3u8Content.trim()

      if (content) {
        const isExtM3U = content.startsWith('#EXTM3U')

        if (isExtM3U) {
          // 处理加密 KEY
          const keyMatch = /EXT-X-KEY: *METHOD=AES-\d+,URI=['"]*\//.exec(content)
          if (keyMatch) {
            if (url.startsWith('http')) {
              content = content.replace(keyMatch[0], `EXT-X-KEY:METHOD=AES-128,URI="${new URL(url).origin}/`)
            } else {
              toast.error(t('common.tmcy'))
              return
            }
          }

          // 处理相对路径
          content = content
            .split('\n')
            .map((line) => {
              if (!line.startsWith('http') && (line.includes('.m3u8') || line.includes('.ts'))) {
                return new URL(line, url).toString()
              }
              return line
            })
            .join('\n')

          type = 'customHls'
          url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
        } else if (content.includes('.m3u8')) {
          // 解析剧集列表
          const list: PlayListItem[] = content
            .split('\n')
            .filter((d) => d.includes('.m3u8'))
            .map((d, i) => {
              const parts = d.split(/[$\s]+/)
              let itemUrl = parts[0]
              let name = `第${i + 1}集`
              if (!itemUrl.startsWith('http') && parts[1]?.startsWith('http')) {
                ;[itemUrl, name] = [parts[1], parts[0]]
              }
              return { url: itemUrl, name }
            })

          if (list.length) {
            onPlaylistParsed?.(list)
            url = list[0].url
          }
        }
      }

      onPlay(url, type, player)
    },
    [getValidUrl, m3u8Content, onPlay, onPlaylistParsed, t],
  )

  // 获取并编辑 M3U8 内容
  const handleGetAndEdit = useCallback(async () => {
    const url = getValidUrl()
    if (!url) {
      toast.error(t('common.petc'))
      return
    }

    try {
      const response = await fetch(url)
      const text = await response.text()
      setM3u8Content(text)
      toast.success(t('common.sopebap'))
    } catch (error) {
      toast.error(`获取失败：${(error as Error).message}`)
    }
  }, [getValidUrl, t])

  // 下载
  const handleDownload = useCallback(() => {
    const url = getValidUrl()
    if (!url) {
      toast.error(t('common.petc'))
      return
    }
    if (!url.includes('.m3u8')) {
      toast.error(t('common.osdv'))
      return
    }
    window.open(`https://m3u8-downloader.lzw.me?url=${encodeURIComponent(url)}`)
  }, [getValidUrl, t])

  // 处理文件选择
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      if (file.name.endsWith('.m3u8')) {
        file.text().then((text) => {
          setM3u8Content(text)
          handlePlay('artplayer')
        })
      } else {
        const url = URL.createObjectURL(file)
        onPlay(url, file.name.includes('.m3u8') ? 'customHls' : '')
      }
    },
    [handlePlay, onPlay],
  )

  // 处理拖放
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer?.files?.[0]
      if (file?.name.endsWith('.m3u8')) {
        file.text().then((text) => {
          setM3u8Content(text)
          handlePlay('artplayer')
        })
      }
    },
    [handlePlay],
  )

  return (
    <div
      className="bg-white/80 dark:bg-slate-800/50 rounded-2xl shadow-xl backdrop-blur-sm p-3 md:p-6"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <form onSubmit={(e) => e.preventDefault()} className="space-y-3 md:space-y-4">
        {/* URL 输入和播放按钮 */}
        <div className="flex flex-col lg:flex-row gap-2 md:gap-3">
          <input
            type="text"
            value={urlInput}
            onChange={handleInputChange}
            placeholder={demoUrl}
            className={cn(
              'flex-1 px-3 md:px-4 py-2 md:py-3 rounded-xl text-sm md:text-base',
              'bg-slate-100 dark:bg-slate-700/50 border border-slate-300 dark:border-slate-600/50',
              'text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent',
              'transition-all',
            )}
          />
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            <button
              type="button"
              onClick={() => handlePlay('artplayer')}
              className={cn(
                'flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-xl font-medium text-sm md:text-base',
                'bg-indigo-600 hover:bg-indigo-700 text-white',
                'transition-all btn-glow',
              )}
            >
              <Play className="w-4 h-4" />
              {t('index.play')}
            </button>
            <button
              type="button"
              onClick={() => handlePlay('dplayer')}
              className={cn(
                'flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-xl font-medium text-sm md:text-base',
                'bg-blue-600 hover:bg-blue-700 text-white',
                'transition-all',
              )}
            >
              <Play className="w-4 h-4" />
              {t('index.dplayer')}
            </button>
            <button
              type="button"
              onClick={handleGetAndEdit}
              className={cn(
                'flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-xl font-medium text-sm md:text-base',
                'bg-pink-600 hover:bg-pink-700 text-white',
                'transition-all',
              )}
            >
              <Edit className="w-4 h-4" />
              {t('index.edit')}
            </button>
            <button
              type="button"
              onClick={onRotate}
              className={cn(
                'flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-xl font-medium text-sm md:text-base',
                'bg-emerald-600 hover:bg-emerald-700 text-white',
                'transition-all',
              )}
            >
              <RotateCw className="w-4 h-4" />
              <span className="hidden sm:inline">{t('index.rotate')}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className={cn(
                'flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-xl font-medium text-sm md:text-base',
                'bg-violet-600 hover:bg-violet-700 text-white',
                'transition-all',
              )}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t('index.download')}</span>
            </button>
          </div>
        </div>

        {/* M3U8 内容编辑 */}
        <div className="flex relative">
          <button
            type="button"
            onClick={() => setM3u8Content('')}
            className={cn(
              'flex items-center px-2 text-sm py-2 rounded-l focus:outline-none',
              'bg-red-600 hover:bg-red-700 text-white',
              'transition-all',
            )}
          >
            {t('index.clear')}
          </button>
          <textarea
            value={m3u8Content}
            onChange={(e) => setM3u8Content(e.target.value)}
            placeholder={t('index.m3u8Placeholder')}
            rows={3}
            className={cn(
              'w-full rounded-r px-1 md:px-3 py-2',
              'bg-slate-100 dark:bg-slate-700/50 border border-slate-300 dark:border-slate-600/50',
              'text-slate-900 dark:text-white placeholder-slate-500 dark:placeholder-slate-400',
              'focus:outline-none focus:ring-1 focus:ring-slate-500 focus:border-transparent',
              'transition-all resize-y',
            )}
          />
        </div>

        {/* 文件选择 */}
        <div className="flex items-center gap-2 md:gap-3">
          <label
            className={cn(
              'flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 md:py-2.5 rounded-xl font-medium cursor-pointer text-sm md:text-base',
              'bg-cyan-600 hover:bg-cyan-700 text-white',
              'transition-all',
            )}
          >
            <Upload className="w-4 h-4" />
            {t('index.selectFile')}
            <input ref={fileInputRef} type="file" accept=".m3u8,.mp4,.flv,.ts" onChange={handleFileChange} className="hidden" />
          </label>
        </div>
      </form>
    </div>
  )
}
