/**
 * 性能监控面板组件
 * 仅在开发环境下显示
 */

import { useEffect, useState } from 'react'
import { getPerformanceMonitor, type PerformanceMetrics } from '@/lib/monitor/performanceMonitor'

interface PerformancePanelProps {
  visible: boolean
}

export function PerformancePanel({ visible }: PerformancePanelProps) {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!visible) return

    const monitor = getPerformanceMonitor()

    // 初始化时获取一次指标
    setMetrics(monitor.getMetrics())

    // 添加事件监听器
    const updateMetrics = (newMetrics: PerformanceMetrics) => {
      setMetrics(newMetrics)
    }

    monitor.addEventListener(updateMetrics)

    return () => {
      monitor.removeEventListener(updateMetrics)
    }
  }, [visible])

  if (!visible || !metrics) return null

  const formatNumber = (num: number, decimals = 2): string => num.toFixed(decimals)
  const formatPercent = (num: number): string => `${(num * 100).toFixed(2)}%`

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-black/90 backdrop-blur-sm text-white p-4 rounded-lg shadow-2xl max-w-md">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between text-left">
        <span className="font-semibold">性能监控</span>
        <span>{expanded ? '▼' : '▶'}</span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 text-xs">
          {/* 播放性能 */}
          <div>
            <h3 className="font-bold text-yellow-400 mb-2">播放性能</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>总时长: {formatNumber(metrics.playback.duration)}s</div>
              <div>播放时长: {formatNumber(metrics.playback.totalPlayTime)}s</div>
              <div>缓冲时长: {formatNumber(metrics.playback.totalBufferTime)}ms</div>
              <div>缓冲次数: {metrics.playback.bufferCount}</div>
              <div>平均缓冲: {formatNumber(metrics.playback.avgBufferTime)}ms</div>
              <div>缓冲率: {formatPercent(metrics.playback.bufferRate)}</div>
              <div>错误次数: {metrics.playback.errorCount}</div>
              <div className="col-span-2">
                错误类型:{' '}
                {Array.from(metrics.playback.errorTypes.entries())
                  .map(([type, count]) => `${type}(${count})`)
                  .join(', ') || '无'}
              </div>
            </div>
          </div>

          {/* 缓存性能 */}
          <div>
            <h3 className="font-bold text-blue-400 mb-2">缓存性能</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>总请求数: {metrics.cache.totalRequests}</div>
              <div>命中数: {metrics.cache.hits}</div>
              <div>未命中数: {metrics.cache.misses}</div>
              <div>
                命中率:{' '}
                <span className={metrics.cache.hitRate > 0.8 ? 'text-green-400' : 'text-red-400'}>
                  {formatPercent(metrics.cache.hitRate)}
                </span>
              </div>
              <div>平均响应: {formatNumber(metrics.cache.avgResponseTime)}ms</div>
              <div>写入次数: {metrics.cache.writeCount}</div>
              <div>删除次数: {metrics.cache.deleteCount}</div>
              <div>
                Hash 命中率:{' '}
                <span className={metrics.cache.urlHashHitRate > 0.8 ? 'text-green-400' : 'text-red-400'}>
                  {formatPercent(metrics.cache.urlHashHitRate)}
                </span>
              </div>
            </div>
          </div>

          {/* 网络性能 */}
          <div>
            <h3 className="font-bold text-green-400 mb-2">网络性能</h3>
            <div className="grid grid-cols-2 gap-2">
              <div>平均带宽: {formatNumber(metrics.network.avgBandwidth)} Mbps</div>
              <div>最小带宽: {formatNumber(metrics.network.minBandwidth)} Mbps</div>
              <div>最大带宽: {formatNumber(metrics.network.maxBandwidth)} Mbps</div>
              <div>带宽波动: {formatNumber(metrics.network.bandwidthStdDev)} Mbps</div>
              <div>断开次数: {metrics.network.disconnectCount}</div>
              <div>重连次数: {metrics.network.reconnectCount}</div>
              <div className="col-span-2">离线时长: {formatNumber(metrics.network.totalOfflineTime)}s</div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                console.log(getPerformanceMonitor().exportReport())
              }}
              className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded"
            >
              导出报告
            </button>
            <button onClick={() => getPerformanceMonitor().reset()} className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded">
              重置指标
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
