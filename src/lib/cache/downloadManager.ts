/**
 * 统一的下载管理器
 * 实现优先级队列、去重机制，避免重复下载
 * HLS 播放器的请求优先级总是最高
 */

/** 下载优先级 */
export enum DownloadPriority {
  /** HLS 播放器请求（最高优先级） */
  PLAYBACK = 0,
  /** 预加载请求（较低优先级） */
  PRELOAD = 1,
}

/** 下载任务 */
interface DownloadTask {
  url: string
  priority: DownloadPriority
  signal?: AbortSignal
  resolve: (data: ArrayBuffer) => void
  reject: (error: Error) => void
}

/** 下载结果缓存（短时间内复用） */
interface DownloadResult {
  data: ArrayBuffer
  timestamp: number
}

/** 结果缓存时间（5秒） */
const RESULT_CACHE_TIME = 5000

/**
 * 统一的下载管理器
 */
class DownloadManager {
  /** 等待队列（按优先级排序） */
  private queue: DownloadTask[] = []
  /** 正在下载的 URL 集合 */
  private downloading = new Set<string>()
  /** 下载结果缓存（URL -> 结果） */
  private resultCache = new Map<string, DownloadResult>()
  /** 当前活跃下载数 */
  private activeDownloads = 0
  /** 最大并发下载数 */
  private readonly MAX_CONCURRENCY = 6
  /** 清理结果缓存的定时器 */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    // 定期清理过期的结果缓存
    this.cleanupTimer = setInterval(() => {
      this.cleanupResultCache()
    }, 10000) // 每 10 秒清理一次
  }

  /**
   * 清理过期的结果缓存
   */
  private cleanupResultCache(): void {
    const now = Date.now()
    for (const [url, result] of this.resultCache.entries()) {
      if (now - result.timestamp > RESULT_CACHE_TIME) {
        this.resultCache.delete(url)
      }
    }
  }

  /**
   * 下载资源（带优先级和去重）
   * @param url 资源 URL
   * @param priority 优先级（PLAYBACK 优先级最高）
   * @param signal 中止信号
   * @returns Promise<ArrayBuffer>
   */
  async download(url: string, priority: DownloadPriority = DownloadPriority.PRELOAD, signal?: AbortSignal): Promise<ArrayBuffer> {
    // 检查结果缓存
    const cached = this.resultCache.get(url)
    if (cached && Date.now() - cached.timestamp < RESULT_CACHE_TIME) {
      return cached.data.slice(0) // 返回副本
    }

    // 如果正在下载，等待该下载完成
    if (this.downloading.has(url)) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        // 创建一个等待任务
        const task: DownloadTask = {
          url,
          priority,
          signal,
          resolve,
          reject,
        }
        this.enqueue(task)
      })
    }

    // 立即开始下载
    return this.startDownload(url, priority, signal)
  }

  /**
   * 将任务加入队列（按优先级排序）
   */
  private enqueue(task: DownloadTask): void {
    // 按优先级插入：PLAYBACK (0) 优先级最高，插入到前面
    let insertIndex = this.queue.length
    for (let i = 0; i < this.queue.length; i++) {
      if (task.priority < this.queue[i].priority) {
        insertIndex = i
        break
      }
    }
    this.queue.splice(insertIndex, 0, task)
    this.processQueue()
  }

  /**
   * 处理队列
   */
  private processQueue(): void {
    while (this.activeDownloads < this.MAX_CONCURRENCY && this.queue.length > 0) {
      const task = this.queue.shift()
      if (!task) break

      // 检查是否已中止
      if (task.signal?.aborted) {
        task.reject(new DOMException('Download aborted', 'AbortError'))
        continue
      }

      // 检查是否正在下载（去重）
      if (this.downloading.has(task.url)) {
        // URL 正在下载中，等待完成（notifyWaitingTasks 会通知所有等待的任务）
        // 不需要做任何操作，等待 startDownload 完成后的 notifyWaitingTasks 通知
        continue
      }

      // 开始下载
      this.startDownload(task.url, task.priority, task.signal)
        .then(task.resolve)
        .catch(task.reject)
    }
  }

  /**
   * 开始下载
   */
  private async startDownload(url: string, priority: DownloadPriority, signal?: AbortSignal): Promise<ArrayBuffer> {
    // 标记为正在下载
    this.downloading.add(url)
    this.activeDownloads++

    try {
      const response = await fetch(url, { signal })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.arrayBuffer()

      // 缓存结果（仅缓存播放器请求的结果，避免内存占用过大）
      if (priority === DownloadPriority.PLAYBACK) {
        this.resultCache.set(url, {
          data: data.slice(0), // 存储副本
          timestamp: Date.now(),
        })
      }

      // 通知所有等待该 URL 的任务
      this.notifyWaitingTasks(url, data)

      return data
    } catch (error) {
      // 通知所有等待该 URL 的任务（失败）
      this.notifyWaitingTasksError(url, error as Error)
      throw error
    } finally {
      this.downloading.delete(url)
      this.activeDownloads--
      // 继续处理队列
      this.processQueue()
    }
  }

  /**
   * 通知所有等待该 URL 的任务
   */
  private notifyWaitingTasks(url: string, data: ArrayBuffer): void {
    const waitingTasks = this.queue.filter((task) => task.url === url)
    for (const task of waitingTasks) {
      // 从队列中移除
      const index = this.queue.indexOf(task)
      if (index >= 0) {
        this.queue.splice(index, 1)
      }
      // 返回结果
      task.resolve(data.slice(0)) // 返回副本
    }
  }

  /**
   * 通知所有等待该 URL 的任务（错误）
   */
  private notifyWaitingTasksError(url: string, error: Error): void {
    const waitingTasks = this.queue.filter((task) => task.url === url)
    for (const task of waitingTasks) {
      // 从队列中移除
      const index = this.queue.indexOf(task)
      if (index >= 0) {
        this.queue.splice(index, 1)
      }
      // 返回错误
      task.reject(error)
    }
  }

  /**
   * 获取当前活跃下载数
   */
  getActiveCount(): number {
    return this.activeDownloads
  }

  /**
   * 获取等待队列长度
   */
  getQueueLength(): number {
    return this.queue.length
  }

  /**
   * 取消所有等待中的任务
   */
  cancelAll(): void {
    for (const task of this.queue) {
      task.reject(new DOMException('Download cancelled', 'AbortError'))
    }
    this.queue = []
  }

  /**
   * 清理资源
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.cancelAll()
    this.resultCache.clear()
    this.downloading.clear()
  }
}

/** 导出单例实例 */
export const downloadManager = new DownloadManager()

