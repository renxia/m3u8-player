/**
 * PWA 缓存类型定义
 */

/** 缓存项元数据 */
export interface PWACacheItem {
  /** 资源 URL */
  url: string
  /** 缓存时间戳 */
  cachedAt: number
  /** 资源大小（字节） */
  size: number
  /** 资源类型（Content-Type） */
  contentType?: string
  /** 关联的 M3U8 URL（可选，用于分组统计） */
  m3u8Url?: string
}

/** 缓存统计信息 */
export interface PWACacheStats {
  /** 缓存项总数 */
  count: number
  /** 总大小（字节） */
  totalSize: number
  /** 按 M3U8 URL 分组的统计 */
  byM3U8: Record<string, { count: number; size: number }>
}

/** 缓存查询选项 */
export interface PWACacheQueryOptions {
  /** 按 M3U8 URL 过滤 */
  m3u8Url?: string
  /** 限制返回数量 */
  limit?: number
  /** 偏移量（用于分页） */
  offset?: number
}

/** 缓存操作结果 */
export interface PWACacheOperationResult {
  /** 是否成功 */
  success: boolean
  /** 错误信息（如果失败） */
  error?: string
  /** 影响的数量 */
  affected?: number
}
