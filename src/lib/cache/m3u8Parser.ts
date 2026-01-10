/**
 * M3U8 解析工具
 * 用于解析 M3U8 文件并提取 TS 片段 URL
 */

/** TS 片段信息 */
export interface TSSegment {
  /** 片段 URL（绝对路径） */
  url: string;
  /** 片段时长（秒） */
  duration: number;
  /** 片段索引 */
  index: number;
}

/** M3U8 解析结果 */
export interface M3U8ParseResult {
  /** 是否为主播放列表（包含多个清晰度） */
  isMasterPlaylist: boolean;
  /** TS 片段列表 */
  segments: TSSegment[];
  /** 子播放列表 URL（如果是主播放列表） */
  variants?: string[];
  /** 总时长（秒） */
  totalDuration: number;
}

// M3U8 解析结果缓存（内存缓存，TTL 5分钟）
const M3U8_CACHE_TTL = 5 * 60 * 1000; // 5分钟
const m3u8Cache = new Map<string, { result: M3U8ParseResult; expires: number }>();
const pendingRequests = new Map<string, Promise<M3U8ParseResult>>();

/**
 * 将相对 URL 转换为绝对 URL
 */
function resolveUrl(baseUrl: string, relativeUrl: string): string {
  // 如果已经是绝对 URL，直接返回
  if (relativeUrl.startsWith("http://") || relativeUrl.startsWith("https://")) {
    return relativeUrl;
  }

  // 如果是协议相对 URL
  if (relativeUrl.startsWith("//")) {
    const protocol = baseUrl.startsWith("https") ? "https:" : "http:";
    return protocol + relativeUrl;
  }

  // 使用 URL API 解析相对路径
  try {
    const base = new URL(baseUrl);
    if (relativeUrl.startsWith("/")) {
      // 绝对路径（相对于域名）
      return `${base.protocol}//${base.host}${relativeUrl}`;
    }
    // 相对路径（相对于当前目录）
    const basePath = base.pathname.substring(0, base.pathname.lastIndexOf("/") + 1);
    return `${base.protocol}//${base.host}${basePath}${relativeUrl}`;
  } catch {
    return relativeUrl;
  }
}

/**
 * 解析 M3U8 内容
 */
export function parseM3U8Content(content: string, baseUrl: string): M3U8ParseResult {
  const lines = content.split("\n").map((line) => line.trim());
  const segments: TSSegment[] = [];
  const variants: string[] = [];
  let isMasterPlaylist = false;
  let currentDuration = 0;
  let totalDuration = 0;
  let segmentIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 跳过空行和注释
    if (!line || line.startsWith("#EXTM3U")) continue;

    // 检测主播放列表（包含多个清晰度）
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      isMasterPlaylist = true;
      // 下一行是变体 URL
      const nextLine = lines[i + 1];
      if (nextLine && !nextLine.startsWith("#")) {
        variants.push(resolveUrl(baseUrl, nextLine));
        i++;
      }
      continue;
    }

    // 解析片段时长
    if (line.startsWith("#EXTINF:")) {
      const match = line.match(/#EXTINF:([\d.]+)/);
      if (match) {
        currentDuration = Number.parseFloat(match[1]);
      }
      continue;
    }

    // 解析 TS 片段 URL（非 # 开头的行）
    if (
      !line.startsWith("#") &&
      (line.endsWith(".ts") || line.includes(".ts?") || line.includes("/ts") || /\.(ts|m4s|mp4|fmp4)(\?|$)/.test(line))
    ) {
      const url = resolveUrl(baseUrl, line);
      segments.push({
        url,
        duration: currentDuration,
        index: segmentIndex++,
      });
      totalDuration += currentDuration;
      currentDuration = 0;
    }
  }

  return {
    isMasterPlaylist,
    segments,
    variants: isMasterPlaylist ? variants : undefined,
    totalDuration,
  };
}

/**
 * 从 URL 获取并解析 M3U8 文件（带缓存）
 */
export async function fetchAndParseM3U8(m3u8Url: string): Promise<M3U8ParseResult> {
  // 检查是否有正在进行的请求
  const pending = pendingRequests.get(m3u8Url);
  if (pending) {
    return pending;
  }

  // 创建新的请求
  const request = async (m3u8Url: string): Promise<M3U8ParseResult> => {
    try {
      // 检查缓存是否有效
      const cached = m3u8Cache.get(m3u8Url);
      if (cached && cached.expires > Date.now()) {
        return cached.result;
      }

      const response = await fetch(m3u8Url);
      if (!response.ok) {
        throw new Error(`Failed to fetch M3U8: ${response.status} ${response.statusText}`);
      }

      const content = await response.text();
      const result = parseM3U8Content(content, m3u8Url);

      // 缓存结果
      m3u8Cache.set(m3u8Url, {
        result,
        expires: Date.now() + M3U8_CACHE_TTL,
      });

      return result;
    } finally {
      // 请求完成，移除 pending 状态
      pendingRequests.delete(m3u8Url);
    }
  };

  const p = request(m3u8Url);
  // 保存 pending 请求
  pendingRequests.set(m3u8Url, p);

  const result = await p;

  // 如果是主播放列表，自动解析第一个变体
  if (result.isMasterPlaylist && result.variants && result.variants.length > 0) {
    // 递归解析第一个变体（也会使用缓存）
    return fetchAndParseM3U8(result.variants[0]);
  }

  return result;
}

/**
 * 获取 M3U8 中指定范围的 TS 片段
 */
export function getSegmentsInRange(segments: TSSegment[], startIndex: number, count: number): TSSegment[] {
  return segments.slice(startIndex, startIndex + count);
}

/**
 * 根据时间获取对应的片段索引
 */
export function getSegmentIndexByTime(segments: TSSegment[], time: number): number {
  let accumulatedTime = 0;
  for (let i = 0; i < segments.length; i++) {
    accumulatedTime += segments[i].duration;
    if (accumulatedTime > time) {
      return i;
    }
  }
  return segments.length - 1;
}
