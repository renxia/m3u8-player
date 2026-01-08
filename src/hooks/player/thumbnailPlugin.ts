/**
 * ArtPlayer 带缓存支持的缩略图插件
 * 完全使用 HLS.js + 缓存加载器来生成缩略图
 */

import { cacheManager, setCurrentM3U8Url } from '@/lib/cache'
import { createThumbnailHlsInstance, preloadSegmentForTime } from './hlsInstance'

/**
 * 缩略图插件选项
 */
export interface ThumbnailPluginOptions {
  /** 缩略图宽度 */
  width?: number
  /** 缩略图数量 */
  number?: number
  /** 缩放比例 */
  scale?: number
  /** 视频 URL */
  url?: string
}

/**
 * 创建带缓存支持的缩略图插件
 */
export function createCachedThumbnailPlugin(options: ThumbnailPluginOptions) {
  return (art: any) => {
    const width = options.width || 160
    const number = options.number || 100
    const scale = options.scale || 1
    const url = options.url || art.option?.url

    // 只对 m3u8 视频启用
    if (!url || (!url.includes('.m3u8') && !url.includes('m3u8'))) {
      // 非 m3u8 视频，使用原始插件
      const originalPlugin = (window as any).artplayerPluginAutoThumbnail
      if (originalPlugin) {
        return originalPlugin(options)(art)
      }
      return
    }

    // 监听 video:loadedmetadata 事件
    art.on('video:loadedmetadata', () => {
      const Hls = window.Hls
      if (!Hls?.isSupported() || !cacheManager.isEnabled()) {
        return
      }

      // 设置当前 M3U8 URL 用于缓存关联
      setCurrentM3U8Url(url)

      // 创建隐藏的 video 元素用于生成缩略图
      const thumbnailVideo = document.createElement('video')
      thumbnailVideo.crossOrigin = 'anonymous'
      thumbnailVideo.style.display = 'none'
      document.body.appendChild(thumbnailVideo)

      // 创建 HLS 实例
      const { hls: thumbnailHls, cleanup: cleanupHls } = createThumbnailHlsInstance(url, thumbnailVideo)

      // 等待 manifest 解析完成，然后等待 video 元数据加载
      thumbnailHls.on(Hls.Events.MANIFEST_PARSED, () => {
        // 等待 video 元素加载元数据
        const handleLoadedMetadata = () => {
          const duration = thumbnailVideo.duration
          const videoWidth = thumbnailVideo.videoWidth
          const videoHeight = thumbnailVideo.videoHeight

          // 检查元数据是否有效
          if (!duration || !videoWidth || !videoHeight) {
            console.warn('[CachedThumbnail] 无法获取视频元数据')
            return
          }

          const thumbnailHeight = Math.floor((width * videoHeight) / videoWidth)

          // 创建 canvas 用于绘制缩略图
          const canvas = document.createElement('canvas')
          canvas.width = 10 * width
          canvas.height = thumbnailHeight * Math.ceil(number / 10)
          const ctx = canvas.getContext('2d')
          if (!ctx) return

          let blobUrl: string | null = null

          // 生成缩略图的函数（与原始插件逻辑保持一致）
          const seekAndDraw = (index: number) => {
            // 每次绘制后都更新缩略图（渐进式更新）
            canvas.toBlob((blob) => {
              if (blob) {
                // 释放旧的 blob URL
                if (blobUrl) {
                  URL.revokeObjectURL(blobUrl)
                }
                blobUrl = URL.createObjectURL(blob)

                // 更新缩略图配置
                art.thumbnails = {
                  url: blobUrl,
                  height: thumbnailHeight,
                  column: 10,
                  number,
                  width,
                  scale,
                }
              }
            }, 'image/jpeg')

            // 如果所有缩略图都已生成，清理资源
            if (index >= number) {
              // 延迟清理，确保最后一次更新完成
              setTimeout(() => {
                thumbnailVideo.remove()
                cleanupHls()
              }, 100)
              return
            }

            // 跳转到指定时间点
            const targetTime = (duration * index) / number

            // 触发预加载（异步，不阻塞缩略图生成）
            if (index % 10 === 0) {
              // 每 10 个缩略图预加载一次，避免过于频繁
              preloadSegmentForTime(url, targetTime, {
                onError: (err) => {
                  console.warn('[CachedThumbnail] Preload error:', err)
                },
              }).catch(() => {
                // 忽略预加载错误，不影响缩略图生成
              })
            }

            thumbnailVideo.currentTime = targetTime

            // 设置 seeked 事件处理（每次都需要重新设置，避免事件冲突）
            thumbnailVideo.onseeked = () => {
              // 等待视频帧真正加载完成（避免黑屏）
              // 使用 requestAnimationFrame 确保视频帧已渲染
              requestAnimationFrame(() => {
                // 再次检查视频是否准备好
                if (thumbnailVideo.readyState >= 2) {
                  // 绘制当前帧到 canvas
                  const col = index % 10
                  const row = Math.floor(index / 10)
                  ctx.drawImage(thumbnailVideo, col * width, row * thumbnailHeight, width, thumbnailHeight)

                  // 继续生成下一个缩略图
                  seekAndDraw(index + 1)
                } else {
                  // 如果还没准备好，等待 canplay 事件
                  thumbnailVideo.oncanplay = () => {
                    const col = index % 10
                    const row = Math.floor(index / 10)
                    ctx.drawImage(thumbnailVideo, col * width, row * thumbnailHeight, width, thumbnailHeight)
                    seekAndDraw(index + 1)
                  }
                }
              })
            }
          }

          // 开始生成缩略图
          seekAndDraw(0)
        }

        // 监听 loadedmetadata 事件
        thumbnailVideo.addEventListener('loadedmetadata', handleLoadedMetadata, { once: true })

        // 如果已经加载了元数据，直接调用
        if (thumbnailVideo.readyState >= 1) {
          handleLoadedMetadata()
        }
      })

      // 清理函数
      art.on('destroy', () => {
        thumbnailVideo.remove()
        cleanupHls()
      })
    })

    return {
      name: 'artplayerPluginCachedThumbnail',
    }
  }
}
