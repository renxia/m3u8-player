/**
 * 基于 localStorage 的持久化缓存管理工具
 * 提供类型安全、统一的存储操作接口，支持数据过期
 */

/**
 * 存储的数据结构（包含数据和过期时间）
 */
interface StoredData<T> {
  data: T
  expiresAt?: number // 过期时间戳（毫秒）
}

/**
 * 存储选项
 */
interface StorageOptions<T> {
  /** 默认值 */
  defaultValue?: T
  /** 数据验证函数 */
  validator?: (value: unknown) => value is T
  /** 是否在存储失败时静默处理（不抛出错误） */
  silent?: boolean
  /** 过期时间（秒数，从当前时间开始计算） */
  expiresIn?: number
  /** 过期时间（时间戳，绝对过期时间） */
  expiresAt?: number
}

/**
 * 存储键前缀，避免与其他应用冲突
 */
const STORAGE_PREFIX = 'mp_'

/**
 * 存储管理器类
 */
class StorageManager {
  /**
   * 获取带前缀的存储键
   */
  private getPrefixedKey(key: string): string {
    return `${STORAGE_PREFIX}${key}`
  }

  /**
   * 获取存储值
   * 自动处理 JSON 序列化和过期检查
   */
  get<T>(key: string, options: Pick<StorageOptions<T>, 'defaultValue' | 'validator' | 'silent'> = {}): T | undefined {
    try {
      const prefixedKey = this.getPrefixedKey(key)
      const stored = localStorage.getItem(prefixedKey)
      if (stored == null) {
        return options?.defaultValue
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(stored)
      } catch {
        // 如果不是 JSON，尝试作为字符串返回（兼容旧数据）
        return stored as unknown as T
      }

      // 统一使用 StoredData 格式
      if (parsed && typeof parsed === 'object' && 'data' in parsed) {
        const storedData = parsed as StoredData<T>

        // 检查是否过期
        if (storedData.expiresAt && storedData.expiresAt < Date.now()) {
          // 已过期，删除并返回默认值
          this.remove(key)
          return options?.defaultValue
        }

        parsed = storedData.data
      }

      // 如果提供了验证函数，进行验证
      if (options?.validator) {
        if (options.validator(parsed)) {
          return parsed
        }
        // 验证失败，返回默认值或 null
        return options?.defaultValue
      }

      return parsed as T
    } catch (error) {
      if (!options?.silent) {
        console.error(`Failed to get storage item "${key}":`, error)
      }
      return options?.defaultValue
    }
  }

  /**
   * 设置存储值
   * 自动处理 JSON 序列化和过期时间
   */
  set<T>(key: string, value: T, options: StorageOptions<T> = {}): boolean {
    try {
      const prefixedKey = this.getPrefixedKey(key)
      if (value == null) {
        this.remove(key)
        return true
      }

      // 如果提供了验证函数，进行验证
      if (options?.validator) {
        if (!options.validator(value)) {
          if (!options?.silent) {
            console.warn(`Value validation failed for storage item "${key}"`)
          }
          return false
        }
      }

      // 计算过期时间
      let expiresAt: number | undefined = options?.expiresAt
      if (!expiresAt && options?.expiresIn) {
        expiresAt = Date.now() + options.expiresIn * 1000
      }

      // 统一使用 StoredData 格式，避免 key 冲突
      const dataToStore: StoredData<T> = {
        data: value,
      }

      if (expiresAt) dataToStore.expiresAt = expiresAt

      localStorage.setItem(prefixedKey, JSON.stringify(dataToStore))
      return true
    } catch (error) {
      if (!options?.silent) {
        console.error(`Failed to set storage item "${key}":`, error)
      }
      return false
    }
  }

  /**
   * 删除存储项
   */
  remove(key: string): boolean {
    try {
      const prefixedKey = this.getPrefixedKey(key)
      localStorage.removeItem(prefixedKey)
      return true
    } catch (error) {
      console.error(`Failed to remove storage item "${key}":`, error)
      return false
    }
  }

  /**
   * 检查存储项是否存在且未过期
   */
  has(key: string): boolean {
    try {
      const prefixedKey = this.getPrefixedKey(key)
      const stored = localStorage.getItem(prefixedKey)
      if (stored === null) {
        return false
      }

      // 检查是否过期
      try {
        const parsed = JSON.parse(stored)
        if (parsed && typeof parsed === 'object' && 'data' in parsed) {
          const storedData = parsed as StoredData<unknown>
          if (storedData.expiresAt && storedData.expiresAt < Date.now()) {
            // 已过期，删除并返回 false
            this.remove(key)
            return false
          }
        }
      } catch {
        // 如果不是 JSON 格式，认为存在
      }

      return true
    } catch {
      return false
    }
  }

  /**
   * 清空所有存储（谨慎使用）
   */
  clear(): boolean {
    try {
      localStorage.clear()
      return true
    } catch (error) {
      console.error('Failed to clear storage:', error)
      return false
    }
  }
}

/**
 * 导出单例实例
 */
export const storage = new StorageManager()

/**
 * 类型安全的存储键定义
 * 用于统一管理所有存储键，避免硬编码字符串
 */
export const StorageKeys = {
  playlist: 'playlist',
  history: 'm3u8_history',
  fav: 'm3u8_fav',
  version: 'versionInfo',
  theme: 'theme',
} as const

/**
 * 类型辅助：从 StorageKeys 获取键的类型
 */
export type StorageKey = (typeof StorageKeys)[keyof typeof StorageKeys]
