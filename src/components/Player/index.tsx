import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { usePlayer } from '@/hooks/usePlayer'
import { cn } from '@/lib/utils'
import type { PlayerType, PlayListItem } from '@/types'

interface PlayerProps {
  className?: string
  playlist?: PlayListItem[]
  currentIndex?: number
  onPlaylistItemClick?: (item: PlayListItem, index: number) => void
  onEnded?: (url: string) => void
}

export interface PlayerRef {
  play: (url: string, type?: string, player?: PlayerType) => Promise<boolean>
  rotate: () => void
  destroy: () => void
}

const Player = forwardRef<PlayerRef, PlayerProps>(({ className, playlist = [], currentIndex = -1, onPlaylistItemClick, onEnded }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [showPlaceholder, setShowPlaceholder] = useState(true)
  const pendingPlayRef = useRef<{ url: string; type?: string; player?: PlayerType } | null>(null)
  const playFnRef = useRef<((url: string, type?: string, player?: PlayerType) => Promise<boolean>) | null>(null)
  const isPlayingRef = useRef(false)
  const pendingFrameRef = useRef<number | null>(null)

  const { play, rotate, destroyAll, demoUrl } = usePlayer(containerRef, onEnded)

  // 保存 play 函数引用
  playFnRef.current = play

  // 当占位符隐藏后执行待播放任务
  useLayoutEffect(() => {
    if (!showPlaceholder && pendingPlayRef.current && playFnRef.current && !isPlayingRef.current) {
      const { url, type, player } = pendingPlayRef.current
      const playFn = playFnRef.current
      pendingPlayRef.current = null
      isPlayingRef.current = true

      // 取消之前的待执行动画帧
      if (pendingFrameRef.current !== null) {
        cancelAnimationFrame(pendingFrameRef.current)
      }

      // 使用 requestAnimationFrame 确保 DOM 完全更新，比 setTimeout 更高效
      const frameId = requestAnimationFrame(() => {
        const frameId2 = requestAnimationFrame(() => {
          playFn(url, type, player).finally(() => {
            isPlayingRef.current = false
            pendingFrameRef.current = null
          })
        })
        pendingFrameRef.current = frameId2
      })
      pendingFrameRef.current = frameId
    }
  }, [showPlaceholder])

  // 包装播放函数，隐藏占位符后播放
  const handlePlay = async (url: string, type?: string, player?: PlayerType): Promise<boolean> => {
    // 如果正在播放，直接返回
    if (isPlayingRef.current) {
      return false
    }

    if (showPlaceholder) {
      pendingPlayRef.current = { url, type, player }
      setShowPlaceholder(false)
      return true
    }

    isPlayingRef.current = true
    try {
      return await play(url, type, player)
    } finally {
      isPlayingRef.current = false
    }
  }

  useImperativeHandle(ref, () => ({
    play: handlePlay,
    rotate,
    destroy: () => {
      destroyAll()
      setShowPlaceholder(true)
    },
  }))

  return (
    <div className={cn('bg-white/80 dark:bg-slate-800/50 rounded-2xl shadow-xl backdrop-blur-sm overflow-hidden', className)}>
      {/* 播放器容器 */}
      <div className="relative min-h-[200px]">
        {/* 占位符 - 绝对定位覆盖 */}
        {showPlaceholder && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-600 dark:text-slate-400 py-4 md:py-8 bg-white/80 dark:bg-slate-800/50 z-10">
            <div className="text-4xl md:text-6xl mb-3 md:mb-4">🎬</div>
            <p className="text-base md:text-lg">输入 M3U8 地址开始播放</p>
            <button
              onClick={() => handlePlay(demoUrl)}
              className="mt-3 md:mt-4 px-4 md:px-6 py-1.5 md:py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors text-sm md:text-base"
            >
              播放示例视频
            </button>
          </div>
        )}

        {/* 播放器实际容器 - 始终存在且可见 */}
        <div ref={containerRef} id="player" className="w-full min-h-[300px] md:min-h-[450px]" />
      </div>

      {/* 播放列表 */}
      {playlist.length > 0 && (
        <div className="p-3 md:p-4 border-t border-slate-200 dark:border-slate-700/50">
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            {playlist.map((item, idx) => (
              <button
                key={item.url}
                onClick={() => onPlaylistItemClick?.(item, idx)}
                className={cn(
                  'px-2.5 md:px-3 py-1 md:py-1.5 text-xs md:text-sm rounded-lg transition-all',
                  idx === currentIndex ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-indigo-600 text-white hover:bg-indigo-700',
                )}
              >
                {item.name || `第${idx + 1}集`}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

Player.displayName = 'Player'

export default Player
