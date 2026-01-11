import { startTransition, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import Player, { type PlayerRef } from '@/components/Player'
import HistoryList from '@/components/Player/HistoryList'
import HlsDescription from '@/components/Player/HlsDescription'
import InputForm from '@/components/Player/InputForm'
import PlayerControls from '@/components/Player/PlayerControls'
import { PLAYER_SHORTCUTS, useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useFavorites, useHistory, usePlaylist } from '@/hooks/useStorage'
import { PLAYBACK_RATES } from '@/lib/constants'
import { getUrlParams } from '@/lib/utils'
import type { PlayerType, PlayListItem } from '@/types'

const DEMO_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'

// 格式化时间显示
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 获取下一个播放速度
const getNextPlaybackRate = (current: number, increase: boolean): number => {
  const rates = PLAYBACK_RATES
  const currentIndex = rates.indexOf(current)
  if (increase) {
    return currentIndex < rates.length - 1 ? rates[currentIndex + 1] : current
  } else {
    return currentIndex > 0 ? rates[currentIndex - 1] : current
  }
}

export default function HomePage() {
  const { t } = useTranslation()
  const playerRef = useRef<PlayerRef>(null)
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [currentPlayingUrl, setCurrentPlayingUrl] = useState('')
  const [currentPlaybackRate, setCurrentPlaybackRate] = useState(1)

  const { history, addHistory, removeHistory, clearHistory } = useHistory()
  const { favorites, addFavorite, removeFavorite, clearFavorites } = useFavorites()
  const { playlist, setPlaylist, clearPlaylist } = usePlaylist()

  // 播放视频
  const handlePlay = useCallback(
    async (url: string, type?: string, player: PlayerType = 'artplayer', name?: string) => {
      const success = await playerRef.current?.play(url, type, player)
      if (success && !url.startsWith('blob:')) {
        // 更新当前播放的 URL（用于更新输入框）
        setCurrentPlayingUrl(url)

        // 使用 startTransition 延迟非紧急的状态更新，避免阻塞播放器初始化
        startTransition(() => {
          addHistory(url, name)

          // 更新当前播放索引
          const idx = playlist.findIndex((item) => item.url === url)
          setCurrentIndex(idx)
        })

        // 更新 URL 参数（同步操作，不影响渲染）
        const params = new URLSearchParams(location.search)
        if (params.get('url') !== encodeURIComponent(url)) {
          params.set('url', encodeURIComponent(url))
          params.delete('name')
          window.history.replaceState({}, '', `${location.pathname}?${params.toString()}`)
        }

        // 使用 requestAnimationFrame 延迟滚动，确保播放器已渲染
        requestAnimationFrame(() => {
          document.getElementById('player')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        })
      } else if (url.startsWith('blob:')) {
        toast.info(t('common.startPlaying'))
      }
    },
    [addHistory, playlist, t],
  )

  // 播放结束回调
  const handleEnded = useCallback(
    (url: string) => {
      if (playlist.length === 0) return

      const idx = playlist.findIndex((item) => item.url === url)
      if (idx > -1 && idx < playlist.length - 1) {
        const nextItem = playlist[idx + 1]
        handlePlay(nextItem.url, nextItem.type, 'artplayer', nextItem.name)
      }
    },
    [playlist, handlePlay],
  )

  // 播放列表项点击
  const handlePlaylistItemClick = useCallback(
    (item: PlayListItem, _index: number) => {
      handlePlay(item.url, item.type, 'artplayer', item.name)
    },
    [handlePlay],
  )

  // 处理播放列表解析
  const handlePlaylistParsed = useCallback(
    (list: PlayListItem[]) => {
      setPlaylist(list)
    },
    [setPlaylist],
  )

  // 从 URL 参数自动播放
  useEffect(() => {
    const params = getUrlParams()
    const uri = params.url ? decodeURIComponent(params.url) : ''
    const title = params.title ? decodeURIComponent(params.title) : ''

    if (uri) {
      // 检查 HTTP 协议
      if (uri.startsWith('http:') && location.protocol === 'https:') {
        if (!uri.startsWith('http://localhost')) {
          toast.warning('由于浏览器安全限制，您访问的 https 页面下无法播放 http 协议的资源，请手动修改访问 URL 改为 http:// 格式并重新访问')
        }
      }

      if (params.autoplay !== '0') {
        handlePlay(uri, undefined, 'artplayer', title)
      }
    } else if (playlist.length && params.autoplay) {
      handlePlay(DEMO_URL)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handlePlay, playlist.length])

  // 键盘快捷键处理
  const handleShortcut = useCallback(
    (shortcutName: string, _e: KeyboardEvent) => {
      const video = playerRef.current?.getVideoElement?.()
      if (!video) return

      switch (shortcutName) {
        case 'togglePlay':
          playerRef.current?.togglePlay?.()
          toast.info(video.paused ? t('player.paused', { defaultValue: '已暂停' }) : t('player.playing', { defaultValue: '播放中' }))
          break
        case 'toggleMute':
          playerRef.current?.toggleMute?.()
          toast.info(video.muted ? t('player.muted', { defaultValue: '已静音' }) : t('player.unmuted', { defaultValue: '已取消静音' }))
          break
        case 'fullscreen':
          playerRef.current?.toggleFullscreen?.()
          break
        case 'seekForward':
          playerRef.current?.seek?.(video.currentTime + 10)
          toast.info(`+10s (${formatTime(video.currentTime + 10)})`)
          break
        case 'seekBackward':
          playerRef.current?.seek?.(video.currentTime - 10)
          toast.info(`-10s (${formatTime(video.currentTime - 10)})`)
          break
        case 'volumeUp':
          playerRef.current?.setVolume?.(video.volume + 0.1)
          toast.info(`${t('player.volume', { defaultValue: '音量' })}: ${Math.round((video.volume + 0.1) * 100)}%`)
          break
        case 'volumeDown':
          playerRef.current?.setVolume?.(video.volume - 0.1)
          toast.info(`${t('player.volume', { defaultValue: '音量' })}: ${Math.round((video.volume - 0.1) * 100)}%`)
          break
        case 'speedUp': {
          const nextSpeedUp = getNextPlaybackRate(currentPlaybackRate, true)
          playerRef.current?.setPlaybackRate?.(nextSpeedUp)
          setCurrentPlaybackRate(nextSpeedUp)
          toast.info(`${t('player.playbackSpeed', { defaultValue: '播放速度' })}: ${nextSpeedUp}x`)
          break
        }
        case 'speedDown': {
          const nextSpeedDown = getNextPlaybackRate(currentPlaybackRate, false)
          playerRef.current?.setPlaybackRate?.(nextSpeedDown)
          setCurrentPlaybackRate(nextSpeedDown)
          toast.info(`${t('player.playbackSpeed', { defaultValue: '播放速度' })}: ${nextSpeedDown}x`)
          break
        }
        case 'pip':
          playerRef.current?.togglePip?.()
          break
        case 'screenshot':
          playerRef.current?.screenshot?.()
          toast.success(t('player.screenshotSuccess', { defaultValue: '截图成功' }))
          break
        case 'rotate':
          playerRef.current?.rotate()
          toast.info(t('player.rotated', { defaultValue: '画面已旋转' }))
          break
      }
    },
    [currentPlaybackRate, t],
  )

  // 启用键盘快捷键
  useKeyboardShortcuts({
    enabled: true,
    shortcuts: PLAYER_SHORTCUTS.map((shortcut) => ({
      ...shortcut,
      callback: (e) => handleShortcut(shortcut.name, e),
    })),
  })

  return (
    <div className="space-y-3 md:space-y-6">
      {/* 输入表单 */}
      <InputForm
        demoUrl={DEMO_URL}
        currentPlayingUrl={currentPlayingUrl}
        onPlay={handlePlay}
        onRotate={() => playerRef.current?.rotate()}
        onPlaylistParsed={handlePlaylistParsed}
      />

      {/* 播放器 */}
      <Player
        ref={playerRef}
        playlist={playlist}
        currentIndex={currentIndex}
        onPlaylistItemClick={handlePlaylistItemClick}
        onEnded={handleEnded}
      />

      {/* 播放器控制面板 */}
      <PlayerControls playerRef={playerRef} showScreenshot showRotate showShortcutsHelp />

      {/* 历史记录和收藏夹 */}
      <HistoryList
        history={history}
        favorites={favorites}
        onPlay={(url, name) => handlePlay(url, undefined, 'artplayer', name)}
        onRemoveHistory={removeHistory}
        onRemoveFavorite={removeFavorite}
        onClearHistory={() => {
          clearHistory()
          clearPlaylist()
        }}
        onClearFavorites={clearFavorites}
        onAddFavorite={addFavorite}
      />

      {/* HLS 说明 */}
      <HlsDescription />
    </div>
  )
}
