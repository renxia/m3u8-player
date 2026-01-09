# PWA 缓存管理器使用文档

## 概述

`pwaCacheManager` 是基于浏览器原生 Cache API 实现的资源缓存方案，提供简单、解耦的缓存管理能力。

## 特性

- ✅ 基于浏览器原生 Cache API，无需额外依赖
- ✅ 与应用逻辑解耦，仅提供基础缓存能力
- ✅ 支持查询、删除、统计等操作
- ✅ 支持按 M3U8 URL 分组统计
- ✅ 自动管理元数据，便于统计展示

## API 文档

### 基础方法

#### `isSupported(): boolean`

检查浏览器是否支持 Cache API。

```typescript
import { pwaCacheManager } from '@/lib/cache'

if (PWACacheManager.isSupported()) {
  // 可以使用缓存功能
}
```

#### `add(url: string, response: Response | Request, m3u8Url?: string): Promise<PWACacheOperationResult>`

缓存资源。

```typescript
// 缓存 Response
const response = await fetch('https://example.com/video.ts')
await pwaCacheManager.add('https://example.com/video.ts', response, 'https://example.com/playlist.m3u8')

// 缓存 Request
const request = new Request('https://example.com/video.ts')
await pwaCacheManager.add('https://example.com/video.ts', request, 'https://example.com/playlist.m3u8')
```

#### `get(url: string): Promise<Response | undefined>`

获取缓存的资源。

```typescript
const response = await pwaCacheManager.get('https://example.com/video.ts')
if (response) {
  const blob = await response.blob()
  // 使用 blob
}
```

#### `has(url: string): Promise<boolean>`

检查资源是否已缓存。

```typescript
const isCached = await pwaCacheManager.has('https://example.com/video.ts')
```

#### `hasMany(urls: string[]): Promise<Set<string>>`

批量检查资源是否已缓存，返回已缓存的 URL 集合。

```typescript
const urls = ['https://example.com/video1.ts', 'https://example.com/video2.ts']
const cachedUrls = await pwaCacheManager.hasMany(urls)
// cachedUrls 是一个 Set，包含已缓存的 URL
```

#### `delete(url: string): Promise<PWACacheOperationResult>`

删除单个缓存项。

```typescript
const result = await pwaCacheManager.delete('https://example.com/video.ts')
if (result.success) {
  console.log('删除成功')
}
```

#### `deleteMany(urls: string[]): Promise<PWACacheOperationResult>`

批量删除缓存项。

```typescript
const urls = ['https://example.com/video1.ts', 'https://example.com/video2.ts']
const result = await pwaCacheManager.deleteMany(urls)
console.log(`删除了 ${result.affected} 项`)
```

#### `clear(): Promise<PWACacheOperationResult>`

清空所有缓存。

```typescript
const result = await pwaCacheManager.clear()
if (result.success) {
  console.log('缓存已清空')
}
```

### 查询和统计

#### `query(options?: PWACacheQueryOptions): Promise<PWACacheItem[]>`

查询缓存项。

```typescript
// 查询所有缓存项
const allItems = await pwaCacheManager.query()

// 按 M3U8 URL 过滤
const items = await pwaCacheManager.query({
  m3u8Url: 'https://example.com/playlist.m3u8',
})

// 分页查询
const items = await pwaCacheManager.query({
  limit: 10,
  offset: 0,
})
```

#### `getStats(): Promise<PWACacheStats>`

获取缓存统计信息。

```typescript
const stats = await pwaCacheManager.getStats()
console.log(`总缓存数: ${stats.count}`)
console.log(`总大小: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`)

// 按 M3U8 URL 分组的统计
Object.entries(stats.byM3U8).forEach(([m3u8Url, stat]) => {
  console.log(`${m3u8Url}: ${stat.count} 项, ${(stat.size / 1024).toFixed(2)} KB`)
})
```

#### `getM3U8Stats(m3u8Url: string): Promise<{ count: number; size: number }>`

获取指定 M3U8 URL 的缓存统计。

```typescript
const stats = await pwaCacheManager.getM3U8Stats('https://example.com/playlist.m3u8')
console.log(`缓存项数: ${stats.count}`)
console.log(`总大小: ${(stats.size / 1024).toFixed(2)} KB`)
```

#### `deleteByM3U8(m3u8Url: string): Promise<PWACacheOperationResult>`

删除指定 M3U8 URL 的所有缓存。

```typescript
const result = await pwaCacheManager.deleteByM3U8('https://example.com/playlist.m3u8')
if (result.success) {
  console.log(`删除了 ${result.affected} 项缓存`)
}
```

## 使用示例

### 示例 1: 在播放器中缓存视频片段

```typescript
import { pwaCacheManager } from '@/lib/cache'

// 在加载视频片段时缓存
async function loadVideoSegment(url: string, m3u8Url: string) {
  let response = await pwaCacheManager.get(url)
  // 使用缓存的资源
  if (response) return response

  // 未缓存，从网络加载
  response = await fetch(url)
  
  // 异步缓存（不阻塞播放）
  pwaCacheManager.add(url, response.clone(), m3u8Url).catch(console.error)
  
  return response
}
```

### 示例 2: 在界面中显示缓存统计

```typescript
import { pwaCacheManager } from '@/lib/cache'
import { useEffect, useState } from 'react'

function CacheStats() {
  const [stats, setStats] = useState<PWACacheStats | null>(null)

  useEffect(() => {
    async function loadStats() {
      const data = await pwaCacheManager.getStats()
      setStats(data)
    }
    loadStats()
  }, [])

  if (!stats) return <div>加载中...</div>

  return (
    <div>
      <h3>缓存统计</h3>
      <p>总缓存数: {stats.count}</p>
      <p>总大小: {(stats.totalSize / 1024 / 1024).toFixed(2)} MB</p>
      
      <h4>按视频分组</h4>
      {Object.entries(stats.byM3U8).map(([m3u8Url, stat]) => (
        <div key={m3u8Url}>
          <p>{m3u8Url}</p>
          <p>缓存项: {stat.count}, 大小: {(stat.size / 1024).toFixed(2)} KB</p>
        </div>
      ))}
    </div>
  )
}
```

### 示例 3: 清理缓存

```typescript
import { pwaCacheManager } from '@/lib/cache'

// 清理所有缓存
async function clearAllCache() {
  const result = await pwaCacheManager.clear()
  if (result.success) {
    console.log('缓存已清空')
  }
}

// 清理指定视频的缓存
async function clearVideoCache(m3u8Url: string) {
  const result = await pwaCacheManager.deleteByM3U8(m3u8Url)
  if (result.success) {
    console.log(`已删除 ${result.affected} 项缓存`)
  }
}
```

## 类型定义

### `PWACacheItem`

```typescript
interface PWACacheItem {
  url: string              // 资源 URL
  cachedAt: number         // 缓存时间戳
  size: number            // 资源大小（字节）
  contentType?: string     // 资源类型（Content-Type）
  m3u8Url?: string        // 关联的 M3U8 URL
}
```

### `PWACacheStats`

```typescript
interface PWACacheStats {
  count: number                                    // 缓存项总数
  totalSize: number                                // 总大小（字节）
  byM3U8: Record<string, { count: number; size: number }>  // 按 M3U8 URL 分组的统计
}
```

### `PWACacheQueryOptions`

```typescript
interface PWACacheQueryOptions {
  m3u8Url?: string    // 按 M3U8 URL 过滤
  limit?: number      // 限制返回数量
  offset?: number     // 偏移量（用于分页）
}
```

### `PWACacheOperationResult`

```typescript
interface PWACacheOperationResult {
  success: boolean      // 是否成功
  error?: string        // 错误信息（如果失败）
  affected?: number     // 影响的数量
}
```

## 注意事项

1. **浏览器支持**: 需要浏览器支持 Cache API（现代浏览器均支持）
2. **缓存限制**: 浏览器对 Cache API 的存储空间有限制，通常为可用磁盘空间的 50%
3. **元数据管理**: 元数据存储在 Cache 中，使用特殊前缀 `__metadata__` 区分
4. **异步操作**: 所有操作都是异步的，需要使用 `await` 或 `.then()`
5. **错误处理**: 建议对所有操作进行错误处理，避免缓存失败影响主流程

## 与现有 HLS 缓存方案的区别

| 特性 | HLS 缓存（IndexedDB） | PWA 缓存（Cache API） |
|------|---------------------|---------------------|
| 存储方式 | IndexedDB | Cache API |
| 实现复杂度 | 较高（需要管理元数据、LRU 等） | 较低（浏览器原生支持） |
| 适用场景 | HLS 视频片段缓存 | 通用资源缓存 |
| 查询性能 | 需要遍历数据库 | 直接匹配 URL |
| 统计功能 | 需要额外查询 | 内置元数据支持 |
| 与应用耦合 | 与 HLS 播放器耦合 | 完全解耦 |

## 最佳实践

1. **缓存策略**: 建议在资源加载成功后异步缓存，避免阻塞主流程
2. **错误处理**: 缓存失败不应影响正常播放，使用 `catch` 捕获错误
3. **定期清理**: 根据业务需求定期清理过期或不需要的缓存
4. **统计展示**: 使用 `getStats()` 和 `getM3U8Stats()` 在界面展示缓存信息
