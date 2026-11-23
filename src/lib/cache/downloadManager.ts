/**
 * 统一的下载管理器
 * 请求去重、并发上限、优先级调度，供 HLS 播放与预加载共用
 *
 * 设计要点（重构后）：
 * - 去重：相同 URL 的并发请求共享同一个 in-flight Promise，不再有「等待任务」离开队列后无人 settle
 * - 并发上限：信号量控制，超出上限的请求按优先级排队（PLAYBACK 优先获得额度），排队期间可被 AbortSignal 取消
 * - 中止：调用方自己的 signal 只影响自己的等待，不会误伤共享同一请求的其他调用方
 * - 结果缓存：仅播放器请求（PLAYBACK）结果短期缓存，避免重复下载
 *
 * 历史缺陷：旧实现用「队列 + 等待任务」做去重，processQueue 在 URL 正在下载时
 * 直接丢弃等待任务（该 Promise 永不 settle），导致预加载任务永久挂起、预加载锁无法释放，
 * 此后点击「预加载」全部静默失败。改为共享 in-flight Promise 后不再存在悬空 Promise。
 */

import { getSmartPreloader } from './smartPreloader'

interface DownloadManagerOptions {
  maxConcurrency?: number
}

/** 下载优先级 */
export enum DownloadPriority {
  /** HLS 播放器请求（最高优先级） */
  PLAYBACK = 0,
  /** 预加载请求（较低优先级） */
  PRELOAD = 1,
}

/** 下载结果缓存 */
interface DownloadResult {
  data: ArrayBuffer
  timestamp: number
}

/** 等待并发额度的排队项 */
interface SlotWaiter {
  priority: DownloadPriority
  grant: () => void
  reject: (error: Error) => void
}

/** 进行中的共享下载任务 */
interface InflightTask {
  promise: Promise<ArrayBuffer>
  /** 内部 AbortController：只有所有调用方都放弃时才真正中止网络请求 */
  controller: AbortController
  /** 当前仍在等待该任务的调用方数量 */
  waiters: number
  /** 任务是否已 settle */
  settled: boolean
}

/** 结果缓存时间（30秒） */
const RESULT_CACHE_TIME = 30000

/** 结果缓存条目上限（避免长视频播放期间内存无上限增长） */
const MAX_RESULT_CACHE_ENTRIES = 30

/** 创建 AbortError（与 fetch 中止错误保持一致的 name） */
function createAbortError(): Error {
  return new DOMException('Download aborted', 'AbortError')
}

/**
 * 统一的下载管理器
 */
class DownloadManager {
  /** 进行中的请求（URL -> 任务），用于去重 */
  private inflight = new Map<string, InflightTask>();
  /** 下载结果缓存（URL -> 结果） */
  private resultCache = new Map<string, DownloadResult>();
  /** 当前活跃下载数 */
  private activeCount = 0;
  /** 等待并发额度的队列（按优先级排序） */
  private waiters: SlotWaiter[] = [];
  /** 清理结果缓存的定时器 */
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  /** 最大并发下载数（默认 6，可根据设备网络条件动态调整） */
  private readonly maxConcurrency: number;

  constructor(options: DownloadManagerOptions = {}) {
    const hardwareConcurrency = navigator.hardwareConcurrency || 4;
    this.maxConcurrency = options.maxConcurrency ?? Math.min(6, Math.max(2, hardwareConcurrency + 2));

    // 定期清理过期的结果缓存
    this.cleanupTimer = setInterval(() => {
      this.cleanupResultCache();
    }, 10000); // 每 10 秒清理一次
  }

  /**
   * 清理过期的结果缓存
   */
  private cleanupResultCache(): void {
    const now = Date.now();
    for (const [url, result] of this.resultCache.entries()) {
      if (now - result.timestamp > RESULT_CACHE_TIME) {
        this.resultCache.delete(url);
      }
    }

    // 兜底：仍超过上限时按时间从旧到新淘汰
    if (this.resultCache.size > MAX_RESULT_CACHE_ENTRIES) {
      const sorted = [...this.resultCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
      for (const [url] of sorted.slice(0, this.resultCache.size - MAX_RESULT_CACHE_ENTRIES)) {
        this.resultCache.delete(url);
      }
    }
  }

  /**
   * 下载资源（带优先级、去重与中止支持）
   * @param url 资源 URL
   * @param priority 优先级（PLAYBACK 优先占用并发额度）
   * @param signal 中止信号（仅取消当前调用方的等待）
   * @returns Promise<ArrayBuffer>
   */
  async download(
    url: string,
    priority: DownloadPriority = DownloadPriority.PRELOAD,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer> {
    if (signal?.aborted) throw createAbortError();

    // 检查结果缓存
    const cached = this.resultCache.get(url);
    if (cached && Date.now() - cached.timestamp < RESULT_CACHE_TIME) {
      return cached.data.slice(0); // 返回副本
    }

    // 复用进行中的同 URL 请求。
    // 关键：真实请求由内部 AbortController 控制，调用方 signal 只影响自己的等待，
    // 否则播放与预加载共享同一 URL 时，任一方取消都会打断对方的请求
    let task = this.inflight.get(url);
    if (!task) {
      const controller = new AbortController();
      const promise = this.execute(url, priority, controller.signal);
      const newTask: InflightTask = { promise, controller, waiters: 0, settled: false };
      task = newTask;

      // 请求结束（无论成功失败）都要清理去重表，避免条目永久驻留
      promise.then(
        () => {
          newTask.settled = true;
          if (this.inflight.get(url) === newTask) this.inflight.delete(url);
        },
        () => {
          newTask.settled = true;
          if (this.inflight.get(url) === newTask) this.inflight.delete(url);
        },
      );

      this.inflight.set(url, newTask);
    }

    task.waiters++;
    try {
      return await this.waitWithSignal(task.promise, signal);
    } finally {
      task.waiters--;
      // 所有调用方都放弃且请求仍未结束 → 真正中止网络请求，避免白白占用带宽
      if (task.waiters <= 0 && !task.settled) {
        if (this.inflight.get(url) === task) this.inflight.delete(url);
        task.controller.abort();
      }
    }
  }

  /**
   * 等待共享请求，同时允许调用方用自己的 signal 取消等待
   */
  private waitWithSignal(task: Promise<ArrayBuffer>, signal?: AbortSignal): Promise<ArrayBuffer> {
    if (!signal) return task;

    return new Promise<ArrayBuffer>((resolve, reject) => {
      const onAbort = () => reject(createAbortError());
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
      task.then(
        (data) => {
          signal.removeEventListener('abort', onAbort);
          resolve(data);
        },
        (error) => {
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  }

  /**
   * 执行一次真实下载（受并发额度限制）
   */
  private async execute(url: string, priority: DownloadPriority, signal?: AbortSignal): Promise<ArrayBuffer> {
    await this.acquire(priority, signal);

    try {
      const startTime = Date.now();
      const response = await fetch(url, { signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.arrayBuffer();

      // 测量并记录带宽（仅针对播放器请求）
      if (priority === DownloadPriority.PLAYBACK) {
        const duration = (Date.now() - startTime) / 1000; // 秒
        if (duration > 0) {
          const fileSizeInBits = data.byteLength * 8;
          const bandwidth = fileSizeInBits / duration / 1000000; // Mbps
          getSmartPreloader().recordBandwidth(bandwidth, 'download');
        }

        // 缓存结果（仅缓存播放器请求的结果，避免内存占用过大）
        this.resultCache.set(url, {
          data: data.slice(0), // 存储副本
          timestamp: Date.now(),
        });
      }

      return data;
    } finally {
      this.release();
    }
  }

  /**
   * 申请并发额度（按优先级排队，支持中止）
   */
  private acquire(priority: DownloadPriority, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(createAbortError());

    if (this.activeCount < this.maxConcurrency) {
      this.activeCount++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(createAbortError());
      };

      const waiter: SlotWaiter = {
        priority,
        grant: () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        },
        reject: (error) => {
          signal?.removeEventListener('abort', onAbort);
          reject(error);
        },
      };

      signal?.addEventListener('abort', onAbort, { once: true });

      // 按优先级插入：PLAYBACK (0) 排在前面
      let insertIndex = this.waiters.length;
      for (let i = 0; i < this.waiters.length; i++) {
        if (priority < this.waiters[i].priority) {
          insertIndex = i;
          break;
        }
      }
      this.waiters.splice(insertIndex, 0, waiter);
    });
  }

  /**
   * 释放并发额度（有排队者时直接移交额度）
   */
  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next.grant();
      return;
    }
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  /**
   * 获取当前活跃下载数
   */
  getActiveCount(): number {
    return this.activeCount;
  }

  /**
   * 获取等待并发额度的请求数
   */
  getQueueLength(): number {
    return this.waiters.length;
  }

  /**
   * 取消所有等待中的请求
   */
  cancelAll(): void {
    const pending = this.waiters.splice(0);
    for (const waiter of pending) {
      waiter.reject(createAbortError());
    }

    // 中止仍在进行的共享请求
    for (const task of this.inflight.values()) {
      if (!task.settled) task.controller.abort();
    }
    this.inflight.clear();
  }

  /**
   * 清理资源
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cancelAll();
    this.resultCache.clear();
    this.inflight.clear();
  }
}

/** 导出单例实例 */
export const downloadManager = new DownloadManager()
