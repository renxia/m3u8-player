/**
 * 网络状态指示器组件
 */

import { useEffect, useState } from 'react'
import { getNetworkMonitor, type NetworkState } from '@/lib/network/networkMonitor'

/**
 * 网络指示器图标颜色
 */
const getNetworkColor = (state: NetworkState): string => {
  if (!state.online) return 'text-red-500'
  if (state.saveData) return 'text-yellow-500'
  if (state.downlink < 2) return 'text-orange-500'
  if (state.downlink < 5) return 'text-yellow-400'
  return 'text-green-500'
}

/**
 * 网络指示器图标
 */
const NetworkIcon = ({ state }: { state: NetworkState }) => {
  if (!state.online) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
        />
      </svg>
    )
  }

  if (state.downlink < 2) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
      </svg>
    )
  }

  if (state.downlink < 5) {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 18h14" />
      </svg>
    )
  }

  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 18h14M5 6h14" />
    </svg>
  )
}

/**
 * 网络指示器组件
 */
export function NetworkIndicator() {
  const [state, setState] = useState<NetworkState>(() => getNetworkMonitor().getState())
  const [showTooltip, setShowTooltip] = useState(false)

  useEffect(() => {
    const monitor = getNetworkMonitor()

    // 监听网络变化
    const handleUpdate = (newState: NetworkState) => {
      setState(newState)
    }

    monitor.addEventListener('change', handleUpdate)
    monitor.addEventListener('online', handleUpdate)
    monitor.addEventListener('offline', handleUpdate)
    monitor.addEventListener('quality-up', handleUpdate)
    monitor.addEventListener('quality-down', handleUpdate)

    return () => {
      monitor.removeEventListener('change', handleUpdate)
      monitor.removeEventListener('online', handleUpdate)
      monitor.removeEventListener('offline', handleUpdate)
      monitor.removeEventListener('quality-up', handleUpdate)
      monitor.removeEventListener('quality-down', handleUpdate)
    }
  }, [])

  const color = getNetworkColor(state)
  const description = monitor.getStateDescription()

  return (
    <div
      className="relative inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors cursor-help"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <NetworkIcon state={state} />
      <span className={color}>{description}</span>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded shadow-lg whitespace-nowrap z-50">
          <div>在线状态: {state.online ? '在线' : '离线'}</div>
          <div>网络类型: {state.effectiveType}</div>
          <div>带宽: {state.downlink} Mbps</div>
          <div>延迟: {state.rtt} ms</div>
          <div>省电模式: {state.saveData ? '开启' : '关闭'}</div>
        </div>
      )}
    </div>
  )
}

const monitor = getNetworkMonitor()
