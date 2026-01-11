/**
 * 播放器控制面板组件
 * 提供播放速度控制、截图、旋转等额外控制功能
 */

import { Camera, Keyboard, RotateCw } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import KeyboardShortcutsHelp from '@/components/KeyboardShortcutsHelp'
import { PLAYBACK_RATES } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { PlayerRef } from './index'

interface PlayerControlsProps {
  /** 播放器实例引用 */
  playerRef: React.RefObject<PlayerRef | null>
  /** 是否显示截图按钮 */
  showScreenshot?: boolean
  /** 是否显示旋转按钮 */
  showRotate?: boolean
  /** 是否显示快捷键帮助 */
  showShortcutsHelp?: boolean
  /** 自定义类名 */
  className?: string
}

export default function PlayerControls({
  playerRef,
  showScreenshot = true,
  showRotate = true,
  showShortcutsHelp = true,
  className,
}: PlayerControlsProps) {
  const { t } = useTranslation()
  const [currentSpeed, setCurrentSpeed] = useState(1)
  const [showHelp, setShowHelp] = useState(false)
  const speedMenuRef = useRef<HTMLDivElement>(null)

  /**
   * 更新播放速度
   */
  const handleSpeedChange = useCallback(
    async (speed: number) => {
      setCurrentSpeed(speed)
      // 通过播放器实例控制速度
      const videoElement = playerRef.current?.containerRef?.current?.querySelector('video')
      if (videoElement) {
        videoElement.playbackRate = speed
        toast.success(`${t('player.speedChanged', { defaultValue: '播放速度' })}: ${speed}x`)
      }
    },
    [playerRef, t],
  )

  /**
   * 截图功能
   */
  const handleScreenshot = useCallback(() => {
    const videoElement = playerRef.current?.containerRef?.current?.querySelector('video')
    if (!videoElement) {
      toast.error(t('player.screenshotFailed', { defaultValue: '截图失败：未找到视频元素' }))
      return
    }

    try {
      const canvas = document.createElement('canvas')
      canvas.width = videoElement.videoWidth
      canvas.height = videoElement.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('无法获取 Canvas 上下文')

      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height)

      // 转换为图片并下载
      canvas.toBlob((blob) => {
        if (!blob) {
          toast.error(t('player.screenshotFailed', { defaultValue: '截图失败' }))
          return
        }

        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `screenshot_${Date.now()}.png`
        link.click()
        URL.revokeObjectURL(url)

        toast.success(t('player.screenshotSuccess', { defaultValue: '截图成功' }))
      }, 'image/png')
    } catch (error) {
      console.error('[PlayerControls] Screenshot error:', error)
      toast.error(`${t('player.screenshotFailed', { defaultValue: '截图失败' })}: ${(error as Error).message}`)
    }
  }, [playerRef, t])

  /**
   * 旋转画面
   */
  const handleRotate = useCallback(() => {
    playerRef.current?.rotate()
    toast.info(t('player.rotated', { defaultValue: '画面已旋转' }))
  }, [playerRef, t])

  return (
    <>
      <div className={cn('flex flex-wrap items-center gap-2 md:gap-3', className)}>
        {/* 播放速度控制 */}
        <div className="relative" ref={speedMenuRef}>
          <select
            value={currentSpeed}
            onChange={(e) => handleSpeedChange(Number(e.target.value))}
            className={cn(
              'px-3 py-2 text-sm font-medium rounded-lg',
              'bg-slate-100 dark:bg-slate-700/50',
              'border border-slate-300 dark:border-slate-600/50',
              'text-slate-900 dark:text-white',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500',
              'cursor-pointer transition-all',
            )}
            title={t('player.playbackSpeed', { defaultValue: '播放速度' })}
          >
            {PLAYBACK_RATES.map((speed) => (
              <option key={speed} value={speed}>
                {speed}x
              </option>
            ))}
          </select>
        </div>

        {/* 截图按钮 */}
        {showScreenshot && (
          <button
            type="button"
            onClick={handleScreenshot}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg',
              'bg-amber-600 hover:bg-amber-700 text-white',
              'transition-all',
            )}
            title={t('player.screenshot', { defaultValue: '截图' })}
          >
            <Camera className="w-4 h-4" />
            <span className="hidden sm:inline">{t('player.screenshot', { defaultValue: '截图' })}</span>
          </button>
        )}

        {/* 旋转按钮 */}
        {showRotate && (
          <button
            type="button"
            onClick={handleRotate}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg',
              'bg-emerald-600 hover:bg-emerald-700 text-white',
              'transition-all',
            )}
            title={t('player.rotate', { defaultValue: '旋转' })}
          >
            <RotateCw className="w-4 h-4" />
            <span className="hidden sm:inline">{t('player.rotate', { defaultValue: '旋转' })}</span>
          </button>
        )}

        {/* 快捷键帮助按钮 */}
        {showShortcutsHelp && (
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg',
              'bg-slate-600 hover:bg-slate-700 text-white',
              'transition-all',
            )}
            title={t('player.shortcuts', { defaultValue: '键盘快捷键' })}
          >
            <Keyboard className="w-4 h-4" />
            <span className="hidden sm:inline">{t('player.shortcuts', { defaultValue: '快捷键' })}</span>
          </button>
        )}
      </div>

      {/* 快捷键帮助对话框 */}
      <KeyboardShortcutsHelp show={showHelp} onClose={() => setShowHelp(false)} />
    </>
  )
}
