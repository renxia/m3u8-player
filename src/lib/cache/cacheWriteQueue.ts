/**
 * 缓存写入队列管理器
 * 控制并发写入数，避免 IndexedDB/Cache API 压力过大
 */

interface CacheWriteQueueOptions {
  maxConcurrency?: number
}

type WriteTask = () => Promise<unknown>

class CacheWriteQueue {
  /** 等待队列 */
  private queue: Array<() => void> = []
  /** 当前活跃写入数 */
  private activeWrites = 0
  /** 最大并发写入数（默认 3，可根据设备硬件并发数动态调整） */
  private readonly MAX_CONCURRENCY: number

  constructor(options: CacheWriteQueueOptions = {}) {
    // 默认为 3，但允许通过配置覆盖
    // 也可以根据 navigator.hardwareConcurrency 自动调整
    const hardwareConcurrency = navigator.hardwareConcurrency || 4
    this.MAX_CONCURRENCY = options.maxConcurrency ?? Math.min(3, Math.max(1, Math.floor(hardwareConcurrency / 2)))
  }

  /**
   * 将写入任务加入队列
   * @param fn 写入函数
   */
  async enqueue(fn: WriteTask): Promise<void> {
    // 如果活跃写入数已达上限，等待
    if (this.activeWrites >= this.MAX_CONCURRENCY) {
      await new Promise<void>((resolve) => {
        this.queue.push(resolve)
      })
    }

    this.activeWrites++
    try {
      await fn()
    } finally {
      this.activeWrites--
      // 处理下一个等待的任务
      const next = this.queue.shift()
      if (next) {
        next()
      }
    }
  }

  /**
   * 获取当前活跃写入数
   */
  getActiveCount(): number {
    return this.activeWrites
  }

  /**
   * 获取等待队列长度
   */
  getQueueLength(): number {
    return this.queue.length
  }

  /**
   * 清空等待队列（不取消活跃写入）
   */
  clearQueue(): void {
    this.queue = []
  }
}

/** 导出单例实例 */
export const cacheWriteQueue = new CacheWriteQueue()
