/**
 * 智能预加载器
 * 基于播放行为预测和网络状况的智能预加载算法
 * 实现播放速度预测、网络带宽学习和用户行为模式学习
 */

import { logger } from '@/utils/logger'
import { getNetworkMonitor } from '@/lib/network/networkMonitor'

/**
 * 播放行为事件类型
 */
export type PlaybackEventType = 'play' | 'pause' | 'seek' | 'speed-change' | 'ended'

/**
 * 播放行为记录
 */
export interface PlaybackEvent {
  /** 事件类型 */
  type: PlaybackEventType
  /** 时间戳 */
  timestamp: number
  /** 当前播放位置(秒) */
  currentTime: number
  /** 播放速度 */
  playbackRate: number
  /** M3U8 URL */
  m3u8Url: string
  /** 片段索引 */
  segmentIndex?: number
}

/**
 * 播放行为统计
 */
export interface PlaybackBehavior {
  /** 平均播放速度 */
  avgPlaybackRate: number
  /** 暂停频率(每分钟暂停次数) */
  pauseFrequency: number
  /** 跳转频率(每分钟跳转次数) */
  seekFrequency: number
  /** 平均会话时长(秒) */
  avgSessionDuration: number
  /** 完播率 */
  completionRate: number
  /** 估算的预加载速度(倍速) */
  estimatedPreloadSpeed: number
  /** 最后更新时间 */
  lastUpdate: number
}

/**
 * 网络带宽学习记录
 */
export interface BandwidthSample {
  /** 时间戳 */
  timestamp: number
  /** 测量的带宽(Mbps) */
  bandwidth: number
  /** 样本来源 */
  source: 'download' | 'api' | 'test'
}

/**
 * 预加载策略建议
 */
export interface PreloadStrategy {
  /** 预加载片段数量 */
  preloadCount: number
  /** 并发下载数 */
  concurrency: number
  /** 预测的播放速度 */
  predictedPlaybackRate: number
  /** 置信度(0-1) */
  confidence: number
  /** 策略说明 */
  reason: string
}

/**
 * 智能预加载配置
 */
export interface SmartPreloaderConfig {
  /** 最大历史记录数 */
  maxHistorySize: number
  /** 最小样本数(用于预测) */
  minSamples: number
  /** 预测窗口大小(秒) */
  predictionWindow: number
  /** 带宽学习窗口(分钟) */
  bandwidthLearningWindow: number
  /** 默认预加载倍数 */
  defaultPreloadMultiplier: number
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: SmartPreloaderConfig = {
  maxHistorySize: 100,
  minSamples: 5,
  predictionWindow: 60, // 60秒
  bandwidthLearningWindow: 10, // 10分钟
  defaultPreloadMultiplier: 1.5,
}

/**
 * 智能预加载器类
 */
class SmartPreloader {
  private config: SmartPreloaderConfig;
  private playbackHistory: PlaybackEvent[] = [];
  private bandwidthSamples: BandwidthSample[] = [];
  private networkMonitor = getNetworkMonitor();
  private currentBehavior: PlaybackBehavior | null = null;
  private sessionStartTime = 0;
  private pauseCount = 0;
  private seekCount = 0;

  constructor(config: Partial<SmartPreloaderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromStorage();
  }

  /**
   * 记录播放事件
   */
  recordEvent(event: Omit<PlaybackEvent, "timestamp">): void {
    const playbackEvent: PlaybackEvent = {
      ...event,
      timestamp: Date.now(),
    };

    this.playbackHistory.push(playbackEvent);

    // 统计会话数据
    if (event.type === "play" && this.sessionStartTime === 0) {
      this.sessionStartTime = playbackEvent.timestamp;
    } else if (event.type === "pause") {
      this.pauseCount++;
    } else if (event.type === "seek") {
      this.seekCount++;
    } else if (event.type === "ended") {
      this.updateBehaviorOnSessionEnd(playbackEvent);
    }

    // 限制历史记录大小
    if (this.playbackHistory.length > this.config.maxHistorySize) {
      this.playbackHistory.shift();
    }

    // 定期保存到存储
    if (this.playbackHistory.length % 10 === 0) {
      this.saveToStorage();
    }

    logger.debug("[SmartPreloader] Recorded event:", event.type);
  }

  /**
   * 记录带宽样本
   */
  recordBandwidth(bandwidth: number, source: BandwidthSample["source"] = "download"): void {
    const sample: BandwidthSample = {
      timestamp: Date.now(),
      bandwidth,
      source,
    };

    this.bandwidthSamples.push(sample);

    // 只保留指定时间窗口内的样本
    const cutoffTime = Date.now() - this.config.bandwidthLearningWindow * 60 * 1000;
    this.bandwidthSamples = this.bandwidthSamples.filter((s) => s.timestamp > cutoffTime);

    logger.debug("[SmartPreloader] Recorded bandwidth:", bandwidth, "Mbps, source:", source);
  }

  /**
   * 获取智能预加载策略
   */
  getPreloadStrategy(basePreloadCount: number, baseConcurrency: number): PreloadStrategy {
    // 如果样本不足，使用基础配置
    if (this.playbackHistory.length < this.config.minSamples) {
      return {
        preloadCount: basePreloadCount,
        concurrency: baseConcurrency,
        predictedPlaybackRate: 1.0,
        confidence: 0.2,
        reason: "样本不足,使用基础配置",
      };
    }

    // 更新行为统计
    this.updateBehavior();

    if (!this.currentBehavior) {
      return {
        preloadCount: basePreloadCount,
        concurrency: baseConcurrency,
        predictedPlaybackRate: 1.0,
        confidence: 0.3,
        reason: "行为统计未就绪",
      };
    }

    // 预测播放速度
    const predictedSpeed = this.predictPlaybackRate();
    const effectiveSpeed = Math.max(0.5, Math.min(3.0, predictedSpeed)); // 限制在 0.5x - 3.0x

    // 获取学习到的网络带宽
    const learnedBandwidth = this.getLearnedBandwidth();
    const networkState = this.networkMonitor.getState();
    const effectiveBandwidth = learnedBandwidth || networkState.downlink;

    // 计算置信度
    const confidence = this.calculateConfidence();

    // 根据播放速度和带宽调整预加载策略
    let adjustedPreloadCount = basePreloadCount;
    let adjustedConcurrency = baseConcurrency;
    const reason: string[] = [];

    // 播放速度影响
    if (effectiveSpeed > 1.2) {
      // 快速播放需要更多预加载
      adjustedPreloadCount = Math.ceil(adjustedPreloadCount * effectiveSpeed * this.config.defaultPreloadMultiplier);
      reason.push(`快速播放(${effectiveSpeed.toFixed(2)}x),增加预加载`);
    } else if (effectiveSpeed < 0.8) {
      // 慢速播放减少预加载
      adjustedPreloadCount = Math.ceil(adjustedPreloadCount * effectiveSpeed);
      reason.push(`慢速播放(${effectiveSpeed.toFixed(2)}x),减少预加载`);
    }

    // 网络带宽影响
    if (effectiveBandwidth < 2) {
      // 低带宽减少并发
      adjustedConcurrency = Math.max(1, Math.floor(adjustedConcurrency * 0.5));
      reason.push(`低带宽(${effectiveBandwidth.toFixed(2)} Mbps),减少并发`);
    } else if (effectiveBandwidth > 10) {
      // 高带宽增加并发
      adjustedConcurrency = Math.min(6, Math.ceil(adjustedConcurrency * 1.5));
      reason.push(`高带宽(${effectiveBandwidth.toFixed(2)} Mbps),增加并发`);
    }

    // 用户行为影响
    if (this.currentBehavior.seekFrequency > 1) {
      // 频繁跳转减少预加载
      adjustedPreloadCount = Math.ceil(adjustedPreloadCount * 0.6);
      reason.push("频繁跳转,减少预加载");
    }

    if (this.currentBehavior.pauseFrequency > 0.5) {
      // 频繁暂停减少预加载
      adjustedPreloadCount = Math.ceil(adjustedPreloadCount * 0.8);
      reason.push("频繁暂停,减少预加载");
    }

    // 完播率高的用户可以增加预加载
    if (this.currentBehavior.completionRate > 0.8) {
      adjustedPreloadCount = Math.ceil(adjustedPreloadCount * 1.2);
      reason.push(`高完播率(${(this.currentBehavior.completionRate * 100).toFixed(0)}%),增加预加载`);
    }

    // 确保最小值
    adjustedPreloadCount = Math.max(1, adjustedPreloadCount);
    adjustedConcurrency = Math.max(1, adjustedConcurrency);

    logger.debug("[SmartPreloader] Strategy:", {
      preloadCount: adjustedPreloadCount,
      concurrency: adjustedConcurrency,
      predictedSpeed: effectiveSpeed,
      confidence,
      reason: reason.join(", "),
    });

    return {
      preloadCount: adjustedPreloadCount,
      concurrency: adjustedConcurrency,
      predictedPlaybackRate: effectiveSpeed,
      confidence,
      reason: reason.join(", ") || "使用优化配置",
    };
  }

  /**
   * 预测播放速度
   */
  private predictPlaybackRate(): number {
    if (!this.currentBehavior) {
      return 1.0;
    }

    // 基于历史平均速度
    const recentEvents = this.playbackHistory.slice(-20);
    const speedEvents = recentEvents.filter((e) => e.type === "speed-change" || e.type === "play");

    if (speedEvents.length === 0) {
      return this.currentBehavior.avgPlaybackRate;
    }

    // 加权平均:最近的权重更高
    let weightedSum = 0;
    let weightSum = 0;

    for (let i = 0; i < speedEvents.length; i++) {
      const weight = (i + 1) / speedEvents.length; // 越新的权重越高
      weightedSum += speedEvents[i].playbackRate * weight;
      weightSum += weight;
    }

    const predictedSpeed = weightedSum / weightSum;

    // 结合平均速度进行平滑
    return this.currentBehavior.avgPlaybackRate * 0.3 + predictedSpeed * 0.7;
  }

  /**
   * 获取学习到的网络带宽
   */
  private getLearnedBandwidth(): number | null {
    if (this.bandwidthSamples.length < 3) {
      return null;
    }

    // 计算加权平均带宽
    const now = Date.now();
    let weightedSum = 0;
    let weightSum = 0;

    for (const sample of this.bandwidthSamples) {
      // 越新的样本权重越高
      const age = now - sample.timestamp;
      const weight = Math.exp(-age / (5 * 60 * 1000)); // 5分钟半衰期
      weightedSum += sample.bandwidth * weight;
      weightSum += weight;
    }

    return weightedSum / weightSum;
  }

  /**
   * 计算置信度
   */
  private calculateConfidence(): number {
    const historyScore = Math.min(1, this.playbackHistory.length / 20); // 历史记录评分
    const bandwidthScore = Math.min(1, this.bandwidthSamples.length / 10); // 带宽样本评分
    const sessionScore = Math.min(1, (this.currentBehavior?.avgSessionDuration || 0) / 60 || 0); // 会话时长评分

    return historyScore * 0.4 + bandwidthScore * 0.4 + sessionScore * 0.2;
  }

  /**
   * 更新行为统计
   */
  private updateBehavior(): void {
    const events = this.playbackHistory;

    if (events.length < 2) {
      return;
    }

    // 计算平均播放速度
    const speedEvents = events.filter((e) => e.type === "play" || e.type === "speed-change");
    const avgSpeed = speedEvents.reduce((sum, e) => sum + e.playbackRate, 0) / speedEvents.length || 1.0;

    // 计算会话时长
    const sessionDurations = this.calculateSessionDurations();
    const avgSessionDuration = sessionDurations.reduce((sum, d) => sum + d, 0) / sessionDurations.length || 0;

    // 计算暂停和跳转频率
    const totalDuration = events[events.length - 1].timestamp - events[0].timestamp;
    const totalMinutes = totalDuration / (60 * 1000) || 1;

    const pauseFrequency = this.pauseCount / totalMinutes || 0;
    const seekFrequency = this.seekCount / totalMinutes || 0;

    // 计算完播率
    const endedEvents = events.filter((e) => e.type === "ended");
    const playEvents = events.filter((e) => e.type === "play");
    const completionRate = playEvents.length > 0 ? endedEvents.length / playEvents.length : 0;

    // 估算预加载速度
    const estimatedPreloadSpeed = avgSpeed * (1 + (1 - completionRate) * 0.5);

    this.currentBehavior = {
      avgPlaybackRate: avgSpeed,
      pauseFrequency,
      seekFrequency,
      avgSessionDuration,
      completionRate,
      estimatedPreloadSpeed,
      lastUpdate: Date.now(),
    };

    logger.log("[SmartPreloader] Behavior updated:", this.currentBehavior);
  }

  /**
   * 计算会话时长(实际播放的秒数)
   */
  private calculateSessionDurations(): number[] {
    const durations: number[] = [];
    let sessionStart = 0;
    let lastPosition = 0;
    let lastRate = 1.0;

    for (const event of this.playbackHistory) {
      if (event.type === "play" && sessionStart === 0) {
        sessionStart = event.timestamp;
        lastPosition = event.currentTime;
        lastRate = event.playbackRate;
      } else if (event.type === "speed-change") {
        // 速度变化时,计算已播放时长并更新记录
        if (sessionStart > 0) {
          const playbackTime = (event.currentTime - lastPosition) / lastRate;
          durations.push(playbackTime * 1000); // 转换为毫秒
          lastPosition = event.currentTime;
          lastRate = event.playbackRate;
        }
      } else if (event.type === "pause" || event.type === "ended") {
        if (sessionStart > 0) {
          const playbackTime = (event.currentTime - lastPosition) / lastRate;
          durations.push(playbackTime * 1000); // 转换为毫秒
          sessionStart = 0;
          lastPosition = 0;
          lastRate = 1.0;
        }
      }
    }

    return durations;
  }

  /**
   * 会话结束时更新行为
   */
  private updateBehaviorOnSessionEnd(endEvent: PlaybackEvent): void {
    if (this.sessionStartTime > 0) {
      const sessionDuration = (endEvent.timestamp - this.sessionStartTime) / 1000; // 秒
      logger.log("[SmartPreloader] Session duration:", sessionDuration, "s");

      // 重置会话统计
      this.sessionStartTime = 0;
      this.pauseCount = 0;
      this.seekCount = 0;

      // 立即更新行为
      this.updateBehavior();
      this.saveToStorage();
    }
  }

  /**
   * 获取当前行为统计
   */
  getBehavior(): PlaybackBehavior | null {
    return this.currentBehavior;
  }

  /**
   * 获取历史记录
   */
  getHistory(): PlaybackEvent[] {
    return [...this.playbackHistory];
  }

  /**
   * 获取带宽样本
   */
  getBandwidthSamples(): BandwidthSample[] {
    return [...this.bandwidthSamples];
  }

  /**
   * 清空历史记录
   */
  clearHistory(): void {
    this.playbackHistory = [];
    this.bandwidthSamples = [];
    this.currentBehavior = null;
    this.sessionStartTime = 0;
    this.pauseCount = 0;
    this.seekCount = 0;
    this.saveToStorage();
    logger.log("[SmartPreloader] History cleared");
  }

  private saveDelayTimer: NodeJS.Timeout | null = null;
  /**
   * 保存到本地存储
   */
  private saveToStorage(): void {
    try {
      const data = {
        playbackHistory: this.playbackHistory.slice(-50), // 只保存最近50条
        bandwidthSamples: this.bandwidthSamples.slice(-20), // 只保存最近20条
        currentBehavior: this.currentBehavior,
      };

      if (this.saveDelayTimer) clearTimeout(this.saveDelayTimer);
      this.saveDelayTimer = setTimeout(() => {
        localStorage.setItem("m3u8_smart_preloader", JSON.stringify(data));
      }, 300);
    } catch (error) {
      logger.warn("[SmartPreloader] Failed to save to storage:", error);
    }
  }

  /**
   * 从本地存储加载
   */
  private loadFromStorage(): void {
    try {
      const dataStr = localStorage.getItem("m3u8_smart_preloader");
      if (dataStr) {
        const data = JSON.parse(dataStr);
        this.playbackHistory = data.playbackHistory || [];
        this.bandwidthSamples = data.bandwidthSamples || [];

        // 过滤过期的数据
        const cutoffTime = Date.now() - this.config.bandwidthLearningWindow * 60 * 1000;
        this.bandwidthSamples = this.bandwidthSamples.filter((s) => s.timestamp > cutoffTime);

        this.currentBehavior = data.currentBehavior || null;

        logger.log("[SmartPreloader] Loaded from storage:", {
          historySize: this.playbackHistory.length,
          bandwidthSamples: this.bandwidthSamples.length,
        });
      }
    } catch (error) {
      logger.warn("[SmartPreloader] Failed to load from storage:", error);
    }
  }

  /**
   * 销毁预加载器
   */
  destroy(): void {
    this.saveToStorage();
    this.clearHistory();
    logger.log("[SmartPreloader] Destroyed");
  }
}

/**
 * 单例实例
 */
let smartPreloaderInstance: SmartPreloader | null = null

/**
 * 获取智能预加载器单例
 */
export function getSmartPreloader(): SmartPreloader {
  if (!smartPreloaderInstance) {
    smartPreloaderInstance = new SmartPreloader()
  }
  return smartPreloaderInstance
}

/**
 * 工具函数: 根据智能策略调整预加载配置
 */
export function adjustPreloadConfig(
  basePreloadCount: number,
  baseConcurrency: number
): { preloadCount: number; concurrency: number } {
  const smartPreloader = getSmartPreloader()
  const strategy = smartPreloader.getPreloadStrategy(basePreloadCount, baseConcurrency)

  return {
    preloadCount: strategy.preloadCount,
    concurrency: strategy.concurrency,
  }
}
