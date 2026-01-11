/**
 * IndexedDB 存储层封装
 * 用于存储 TS 视频片段缓存
 * 使用 URL hash 作为主键以优化性能
 * 分离 metadata 和 data 以提升查询性能
 */

import { logger } from '@/utils/logger'

const DB_NAME = 'm3u8-cache'
const DB_VERSION = 3 // 升级版本以分离 metadata 和 data
const METADATA_STORE_NAME = 'metadata'
const DATA_STORE_NAME = 'data'

/** 缓存元数据 */
export interface CacheMetadata {
  /** Hash 值（主键） */
  hash: string
  /** TS 片段 URL（原始） */
  originalUrl: string
  /** 数据大小（字节） */
  size: number
  /** 最后访问时间戳 */
  accessTime: number
  /** 所属 M3U8 URL */
  m3u8Url: string
  /** 版本号（用于乐观锁，防止数据竞争） */
  version?: number
}

/** 缓存数据 */
interface CacheData {
  /** Hash 值（主键） */
  hash: string
  /** 二进制数据 */
  data: ArrayBuffer
}

/** 缓存条目结构（组合类型，用于返回） */
export interface CacheEntry {
  /** Hash 值（主键） */
  hash: string
  /** TS 片段 URL（原始） */
  originalUrl: string
  /** 二进制数据 */
  data: ArrayBuffer
  /** 数据大小（字节） */
  size: number
  /** 最后访问时间戳 */
  accessTime: number
  /** 所属 M3U8 URL */
  m3u8Url: string
  /** 版本号（用于乐观锁，防止数据竞争） */
  version?: number
}

/** 缓存统计信息 */
export interface CacheStats {
  /** 缓存条目数量 */
  count: number
  /** 总大小（字节） */
  totalSize: number
}

/**
 * 计算 URL 的 SHA-256 hash
 */
async function hashUrl(url: string): Promise<string> {
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(url)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch (error) {
    logger.error('Hash calculation error:', error)
    // 如果 crypto API 不可用，使用简单 hash
    let hash = 0
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(16, '0')
  }
}

/** URL 缓存统计 */
interface UrlHashCacheStats {
  /** 缓存命中次数 */
  hits: number
  /** 缓存未命中次数 */
  misses: number
  /** 当前缓存大小 */
  size: number
  /** 命中率 (0-1) */
  hitRate: number
}

class IndexedDBStore {
  private db: IDBDatabase | null = null
  private dbPromise: Promise<IDBDatabase> | null = null
  // URL -> Hash 的映射缓存（避免重复计算），带 LRU 淘汰
  // 使用 Map 的插入顺序作为 LRU 顺序，每次访问时重新插入以更新位置
  private urlHashCache = new Map<string, string>()
  private readonly URL_HASH_CACHE_SIZE = 2000 // 增加缓存大小到 2000
  // URL hash 缓存统计
  private urlHashCacheStats: UrlHashCacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    hitRate: 0,
  }

  /**
   * 获取数据库实例
   */
  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db

    if (this.dbPromise) return this.dbPromise

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)

      request.onerror = () => {
        logger.error('IndexedDB open error:', request.error)
        reject(request.error)
      }

      request.onsuccess = () => {
        this.db = request.result
        resolve(this.db)
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        const oldVersion = event.oldVersion || 0

        // 删除旧的对象仓库（无需兼容历史数据）
        if (oldVersion < DB_VERSION) {
          if (db.objectStoreNames.contains('ts-segments')) {
            db.deleteObjectStore('ts-segments')
          }
          if (db.objectStoreNames.contains(METADATA_STORE_NAME)) {
            db.deleteObjectStore(METADATA_STORE_NAME)
          }
          if (db.objectStoreNames.contains(DATA_STORE_NAME)) {
            db.deleteObjectStore(DATA_STORE_NAME)
          }
        }

        // 创建 metadata store
        if (!db.objectStoreNames.contains(METADATA_STORE_NAME)) {
          const metadataStore = db.createObjectStore(METADATA_STORE_NAME, { keyPath: 'hash' })
          metadataStore.createIndex('originalUrl', 'originalUrl', { unique: true })
          metadataStore.createIndex('accessTime', 'accessTime', { unique: false })
          metadataStore.createIndex('m3u8Url', 'm3u8Url', { unique: false })
        }

        // 创建 data store
        if (!db.objectStoreNames.contains(DATA_STORE_NAME)) {
          db.createObjectStore(DATA_STORE_NAME, { keyPath: 'hash' })
        }
      }
    })

    return this.dbPromise
  }

  /**
   * 获取 URL 对应的 hash（带缓存）
   */
  private async getUrlHash(url: string): Promise<string> {
    // 检查缓存
    if (this.urlHashCache.has(url)) {
      // 更新访问顺序（LRU）：删除并重新插入
      const hash = this.urlHashCache.get(url)!
      this.urlHashCache.delete(url)
      this.urlHashCache.set(url, hash)

      // 更新统计
      this.urlHashCacheStats.hits++
      this.updateCacheHitRate()

      return hash
    }

    // 缓存未命中
    this.urlHashCacheStats.misses++
    this.updateCacheHitRate()

    const hash = await hashUrl(url)
    this.addToUrlHashCache(url, hash)
    return hash
  }

  /**
   * 批量获取 URL 对应的 hash
   */
  private async getUrlHashes(urls: string[]): Promise<Map<string, string>> {
    const urlHashMap = new Map<string, string>()
    const uncachedUrls: string[] = []
    let batchHits = 0
    let batchMisses = 0

    // 先检查缓存
    for (const url of urls) {
      if (this.urlHashCache.has(url)) {
        const hash = this.urlHashCache.get(url)!
        // 更新访问顺序（LRU）：删除并重新插入
        this.urlHashCache.delete(url)
        this.urlHashCache.set(url, hash)
        urlHashMap.set(url, hash)
        batchHits++
      } else {
        uncachedUrls.push(url)
        batchMisses++
      }
    }

    // 更新统计
    this.urlHashCacheStats.hits += batchHits
    this.urlHashCacheStats.misses += batchMisses
    this.updateCacheHitRate()

    // 批量计算未缓存的 URL 的 hash
    if (uncachedUrls.length > 0) {
      const hashPromises = uncachedUrls.map(async (url) => {
        const hash = await hashUrl(url)
        this.addToUrlHashCache(url, hash)
        return { url, hash }
      })

      const results = await Promise.all(hashPromises)
      for (const { url, hash } of results) {
        urlHashMap.set(url, hash)
      }
    }

    return urlHashMap
  }

  /**
   * 添加到 URL hash 缓存（带 LRU 淘汰）
   */
  private addToUrlHashCache(url: string, hash: string): void {
    // 如果已存在，先删除旧的（这会更新位置）
    if (this.urlHashCache.has(url)) {
      this.urlHashCache.delete(url)
    }

    // 添加新的（插入到末尾）
    this.urlHashCache.set(url, hash)

    // 更新缓存大小统计
    this.urlHashCacheStats.size = this.urlHashCache.size

    // 检查是否超过缓存大小，淘汰最旧的（第一个条目）
    if (this.urlHashCache.size > this.URL_HASH_CACHE_SIZE) {
      // Map.keys() 返回迭代器，第一个键是最旧的
      const oldestKey = this.urlHashCache.keys().next().value
      if (oldestKey) {
        this.urlHashCache.delete(oldestKey)
        this.urlHashCacheStats.size = this.urlHashCache.size
      }
    }
  }

  /**
   * 更新缓存命中率
   */
  private updateCacheHitRate(): void {
    const total = this.urlHashCacheStats.hits + this.urlHashCacheStats.misses
    this.urlHashCacheStats.hitRate = total > 0 ? this.urlHashCacheStats.hits / total : 0
  }

  /**
   * 获取 URL hash 缓存统计
   */
  getUrlHashCacheStats(): UrlHashCacheStats {
    return { ...this.urlHashCacheStats }
  }

  /**
   * 重置 URL hash 缓存统计
   */
  resetUrlHashCacheStats(): void {
    this.urlHashCacheStats = {
      hits: 0,
      misses: 0,
      size: this.urlHashCache.size,
      hitRate: 0,
    }
  }



  /**
   * 带重试的辅助方法
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    operation: string,
    maxRetries = 2,
    delayMs = 100
  ): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error
        const isQuotaError = (error as DOMException)?.name === 'QuotaExceededError'
        const isRetryable = isQuotaError || (error as Error)?.name === 'TransactionInactiveError'

        if (attempt < maxRetries && isRetryable) {
          const backoffDelay = delayMs * Math.pow(2, attempt)
          logger.warn(`[IndexedDB] ${operation} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoffDelay}ms:`, error)
          await new Promise((resolve) => setTimeout(resolve, backoffDelay))
        } else {
          logger.error(`[IndexedDB] ${operation} failed after ${attempt + 1} attempts:`, error)
          throw error
        }
      }
    }
    throw lastError
  }

  /**
   * 获取缓存条目
   * 使用 readonly 事务以提升性能，避免与写入操作竞争
   * 访问时间更新改为异步批量更新，不阻塞读取
   */
  async get(url: string): Promise<CacheEntry | undefined> {
    return this.withRetry(async () => {
      const db = await this.getDB()
      const hash = await this.getUrlHash(url)

      return new Promise((resolve, reject) => {
        // 使用 readonly 事务，避免与写入操作竞争
        const transaction = db.transaction([METADATA_STORE_NAME, DATA_STORE_NAME], 'readonly')
        const metadataStore = transaction.objectStore(METADATA_STORE_NAME)
        const dataStore = transaction.objectStore(DATA_STORE_NAME)

        // 先获取 metadata
        const metadataRequest = metadataStore.get(hash)
        metadataRequest.onerror = () => reject(metadataRequest.error)
        metadataRequest.onsuccess = () => {
          const metadata = metadataRequest.result as CacheMetadata | undefined
          if (!metadata) {
            resolve(undefined)
            return
          }

          // 异步更新访问时间（不阻塞读取）
          // 使用 setTimeout 确保在读取完成后更新，避免事务冲突
          setTimeout(() => {
            this.updateAccessTime(hash).catch((err) => {
              logger.warn('[IndexedDB] Failed to update access time:', err)
            })
          }, 0)

          // 获取 data
          const dataRequest = dataStore.get(hash)
          dataRequest.onerror = () => reject(dataRequest.error)
          dataRequest.onsuccess = () => {
            const cacheData = dataRequest.result as CacheData | undefined
            if (!cacheData) {
              resolve(undefined)
              return
            }

            // 组合返回
            resolve({
              hash: metadata.hash,
              originalUrl: metadata.originalUrl,
              data: cacheData.data,
              size: metadata.size,
              accessTime: metadata.accessTime,
              m3u8Url: metadata.m3u8Url,
              version: metadata.version || 0,
            })
          }
        }
      })
    }, 'IndexedDB get')
  }

  /**
   * 更新访问时间（异步，不阻塞读取）
   */
  private async updateAccessTime(hash: string): Promise<void> {
    try {
      const db = await this.getDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(METADATA_STORE_NAME, 'readwrite')
        const store = transaction.objectStore(METADATA_STORE_NAME)
        const getRequest = store.get(hash)

        getRequest.onerror = () => reject(getRequest.error)
        getRequest.onsuccess = () => {
          const metadata = getRequest.result as CacheMetadata | undefined
          if (!metadata) {
            resolve()
            return
          }

          metadata.accessTime = Date.now()
          const updateRequest = store.put(metadata)
          updateRequest.onerror = () => reject(updateRequest.error)
          updateRequest.onsuccess = () => resolve()
        }
      })
    } catch (error) {
      logger.warn('[IndexedDB] updateAccessTime error:', error)
    }
  }

  /**
   * 存储缓存条目
   */
  async set(entry: Omit<CacheEntry, 'hash' | 'originalUrl'> & { url: string; version?: number }): Promise<boolean> {
    try {
      const db = await this.getDB()
      const hash = await this.getUrlHash(entry.url)

      // 读取现有条目的版本（如果存在）
      let currentVersion = 0
      try {
        const existingMetadata = await new Promise<CacheMetadata | undefined>((resolve) => {
          const transaction = db.transaction(METADATA_STORE_NAME, 'readonly')
          const store = transaction.objectStore(METADATA_STORE_NAME)
          const request = store.get(hash)
          request.onerror = () => resolve(undefined)
          request.onsuccess = () => resolve(request.result)
        })
        currentVersion = existingMetadata?.version || 0
      } catch (error) {
        logger.warn('[IndexedDB] Failed to read current version:', error)
      }

      // 简单版本检查：如果现有版本较新，跳过更新
      const requestedVersion = entry.version || 0
      if (requestedVersion > 0 && requestedVersion <= currentVersion) {
        logger.debug('[IndexedDB] Version check failed, skipping update', {
          url: entry.url,
          requestedVersion,
          currentVersion,
        })
        return false
      }

      // 新版本号：现有版本+1或请求的版本（取较大者）
      const newVersion = Math.max(currentVersion, requestedVersion) + 1

      const metadata: CacheMetadata = {
        hash,
        originalUrl: entry.url,
        size: entry.size,
        accessTime: Date.now(),
        m3u8Url: entry.m3u8Url,
        version: newVersion,
      }

      const cacheData: CacheData = {
        hash,
        data: entry.data,
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([METADATA_STORE_NAME, DATA_STORE_NAME], 'readwrite')
        const metadataStore = transaction.objectStore(METADATA_STORE_NAME)
        const dataStore = transaction.objectStore(DATA_STORE_NAME)

        // 存储 metadata
        const metadataRequest = metadataStore.put(metadata)
        metadataRequest.onerror = () => {
          logger.error('IndexedDB set metadata error:', metadataRequest.error)
          reject(metadataRequest.error)
        }
        metadataRequest.onsuccess = () => {
          // 存储 data
          const dataRequest = dataStore.put(cacheData)
          dataRequest.onerror = () => {
            logger.error('IndexedDB set data error:', dataRequest.error)
            reject(dataRequest.error)
          }
          dataRequest.onsuccess = () => resolve(true)
        }
      })
    } catch (error) {
      logger.error('IndexedDB set error:', error)
      return false
    }
  }

  /**
   * 删除缓存条目
   */
  async delete(url: string): Promise<boolean> {
    try {
      const db = await this.getDB()
      const hash = await this.getUrlHash(url)

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([METADATA_STORE_NAME, DATA_STORE_NAME], 'readwrite')
        const metadataStore = transaction.objectStore(METADATA_STORE_NAME)
        const dataStore = transaction.objectStore(DATA_STORE_NAME)

        let metadataDeleted = false
        let dataDeleted = false
        let hasError = false

        const checkComplete = () => {
          if (metadataDeleted && dataDeleted) {
            resolve(!hasError)
          }
        }

        // 删除 metadata
        const metadataRequest = metadataStore.delete(hash)
        metadataRequest.onerror = () => {
          hasError = true
          reject(metadataRequest.error)
        }
        metadataRequest.onsuccess = () => {
          metadataDeleted = true
          checkComplete()
        }

        // 删除 data
        const dataRequest = dataStore.delete(hash)
        dataRequest.onerror = () => {
          hasError = true
          reject(dataRequest.error)
        }
        dataRequest.onsuccess = () => {
          dataDeleted = true
          checkComplete()
        }
      })
    } catch (error) {
      logger.error('IndexedDB delete error:', error)
      return false
    }
  }

  /**
   * 批量删除缓存条目
   */
  async deleteMany(urls: string[]): Promise<boolean> {
    if (urls.length === 0) return true

    try {
      const db = await this.getDB()
      const urlHashMap = await this.getUrlHashes(urls)
      const hashesToDelete = Array.from(urlHashMap.values())

      return new Promise((resolve, reject) => {
        const transaction = db.transaction([METADATA_STORE_NAME, DATA_STORE_NAME], 'readwrite')
        const metadataStore = transaction.objectStore(METADATA_STORE_NAME)
        const dataStore = transaction.objectStore(DATA_STORE_NAME)

        let completed = 0
        let hasError = false
        const totalOps = hashesToDelete.length * 2 // metadata + data

        const checkComplete = () => {
          if (completed === totalOps) {
            resolve(!hasError)
          }
        }

        // 批量删除 metadata 和 data
        for (const hash of hashesToDelete) {
          // 删除 metadata
          const metadataRequest = metadataStore.delete(hash)
          metadataRequest.onerror = () => {
            if (!hasError) {
              hasError = true
              reject(metadataRequest.error)
            }
          }
          metadataRequest.onsuccess = () => {
            completed++
            checkComplete()
          }

          // 删除 data
          const dataRequest = dataStore.delete(hash)
          dataRequest.onerror = () => {
            if (!hasError) {
              hasError = true
              reject(dataRequest.error)
            }
          }
          dataRequest.onsuccess = () => {
            completed++
            checkComplete()
          }
        }
      })
    } catch (error) {
      logger.error('IndexedDB deleteMany error:', error)
      return false
    }
  }

  /**
   * 清空所有缓存
   */
  async clear(): Promise<boolean> {
    try {
      const db = await this.getDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([METADATA_STORE_NAME, DATA_STORE_NAME], 'readwrite')
        const metadataStore = transaction.objectStore(METADATA_STORE_NAME)
        const dataStore = transaction.objectStore(DATA_STORE_NAME)

        let metadataCleared = false
        let dataCleared = false
        let hasError = false

        const checkComplete = () => {
          if (metadataCleared && dataCleared) {
            if (!hasError) {
              this.urlHashCache.clear()
            }
            resolve(!hasError)
          }
        }

        // 清空 metadata
        const metadataRequest = metadataStore.clear()
        metadataRequest.onerror = () => {
          hasError = true
          reject(metadataRequest.error)
        }
        metadataRequest.onsuccess = () => {
          metadataCleared = true
          checkComplete()
        }

        // 清空 data
        const dataRequest = dataStore.clear()
        dataRequest.onerror = () => {
          hasError = true
          reject(dataRequest.error)
        }
        dataRequest.onsuccess = () => {
          dataCleared = true
          checkComplete()
        }
      })
    } catch (error) {
      logger.error('IndexedDB clear error:', error)
      return false
    }
  }

  /**
   * 获取所有缓存键（返回原始 URL）
   * 只查询 metadata store，不加载 data
   */
  async getAllKeys(): Promise<string[]> {
    try {
      const db = await this.getDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(METADATA_STORE_NAME, 'readonly')
        const store = transaction.objectStore(METADATA_STORE_NAME)
        const request = store.openCursor()
        const urls: string[] = []

        request.onerror = () => reject(request.error)
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
          if (cursor) {
            const metadata = cursor.value as CacheMetadata
            if (metadata.originalUrl) {
              urls.push(metadata.originalUrl)
            }
            cursor.continue()
          } else {
            resolve(urls)
          }
        }
      })
    } catch (error) {
      logger.error('IndexedDB getAllKeys error:', error)
      return []
    }
  }

  /**
   * 检查缓存是否存在
   * 只查询 metadata store
   */
  async has(url: string): Promise<boolean> {
    try {
      const db = await this.getDB()
      const hash = await this.getUrlHash(url)

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(METADATA_STORE_NAME, 'readonly')
        const store = transaction.objectStore(METADATA_STORE_NAME)
        const request = store.getKey(hash)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => resolve(request.result !== undefined)
      })
    } catch (error) {
      logger.error('IndexedDB has error:', error)
      return false
    }
  }

  /**
   * 批量检查多个 URL 是否存在（优化性能）
   * 只查询 metadata store
   */
  async hasMany(urls: string[]): Promise<Set<string>> {
    if (urls.length === 0) return new Set()

    try {
      const db = await this.getDB()
      const urlHashMap = await this.getUrlHashes(urls)

      // 如果 URL 数量较少（< 100），使用批量 getKey 查询
      if (urls.length < 100) {
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(METADATA_STORE_NAME, 'readonly')
          const store = transaction.objectStore(METADATA_STORE_NAME)
          const cachedUrls = new Set<string>()
          let completed = 0
          let hasError = false

          // 批量查询所有 hash（在同一事务中）
          for (const url of urls) {
            const hash = urlHashMap.get(url)!
            const request = store.getKey(hash)
            request.onerror = () => {
              if (!hasError) {
                hasError = true
                reject(request.error)
              }
            }
            request.onsuccess = () => {
              if (request.result !== undefined) {
                cachedUrls.add(url)
              }
              completed++
              if (completed === urls.length && !hasError) {
                resolve(cachedUrls)
              }
            }
          }
        })
      } else {
        // 对于大量 URL，获取所有键然后取交集
        const allKeys = await this.getAllKeys()
        const allKeysSet = new Set(allKeys)
        const cachedUrls = new Set<string>()

        for (const url of urls) {
          if (allKeysSet.has(url)) {
            cachedUrls.add(url)
          }
        }

        return cachedUrls
      }
    } catch (error) {
      logger.error('IndexedDB hasMany error:', error)
      return new Set()
    }
  }

  /**
   * 获取缓存统计信息
   * 只查询 metadata store，不加载 data
   */
  async getStats(): Promise<CacheStats> {
    try {
      const db = await this.getDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(METADATA_STORE_NAME, 'readonly')
        const store = transaction.objectStore(METADATA_STORE_NAME)
        const request = store.openCursor()

        let count = 0
        let totalSize = 0

        request.onerror = () => reject(request.error)
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
          if (cursor) {
            const metadata = cursor.value as CacheMetadata
            count++
            totalSize += metadata.size || 0
            cursor.continue()
          } else {
            resolve({ count, totalSize })
          }
        }
      })
    } catch (error) {
      logger.error('IndexedDB getStats error:', error)
      return { count: 0, totalSize: 0 }
    }
  }

  /**
   * 获取最久未访问的条目（用于 LRU 淘汰）
   * 只查询 metadata store，不加载 data
   */
  async getOldestEntries(limit: number): Promise<Pick<CacheMetadata, 'originalUrl' | 'accessTime'>[]> {
    try {
      const db = await this.getDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(METADATA_STORE_NAME, 'readonly')
        const store = transaction.objectStore(METADATA_STORE_NAME)
        const index = store.index('accessTime')
        const entries: Pick<CacheMetadata, 'originalUrl' | 'accessTime'>[] = []

        // 使用游标按 accessTime 升序遍历（最久未访问的在前面）
        const request = index.openCursor(null, 'next')

        request.onerror = () => reject(request.error)
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
          if (cursor && entries.length < limit) {
            const metadata = cursor.value as CacheMetadata
            // 只提取需要的字段，不保留 data
            entries.push({
              originalUrl: metadata.originalUrl,
              accessTime: metadata.accessTime,
            })
            cursor.continue()
          } else {
            resolve(entries)
          }
        }
      })
    } catch (error) {
      logger.error('IndexedDB getOldestEntries error:', error)
      return []
    }
  }

  /**
   * 获取指定 M3U8 的所有缓存条目
   * 只返回 metadata，不加载 data
   */
  async getByM3U8(m3u8Url: string): Promise<CacheMetadata[]> {
    try {
      const db = await this.getDB()
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(METADATA_STORE_NAME, 'readonly')
        const store = transaction.objectStore(METADATA_STORE_NAME)
        const index = store.index('m3u8Url')
        const request = index.getAll(m3u8Url)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const entries = request.result as CacheMetadata[]
          resolve(entries)
        }
      })
    } catch (error) {
      logger.error('IndexedDB getByM3U8 error:', error)
      return []
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
      this.dbPromise = null
    }
    this.urlHashCache.clear()
  }
}

/** 导出单例实例 */
export const indexedDBStore = new IndexedDBStore()

// 导出 URL hash 缓存统计类型（用于外部监控）
export type { UrlHashCacheStats }
