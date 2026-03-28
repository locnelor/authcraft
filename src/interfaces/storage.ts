import { JSONBigIntNative } from '../utils/json-bigint'

/**
 * AuthCraft 存储核心接口。
 *
 * 用户只需实现这 5 个方法，拓展方法由 {@link AuthCraftStorageAdapter} 自动提供。
 * timeout 单位统一为 **秒**，-1 表示永不过期。
 * getTimeout 返回剩余秒数：永不过期返回 -1，key 不存在返回 -2。
 */
export interface AuthCraftStorage {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string, timeout: number) => Promise<void>
  delete: (key: string) => Promise<void>
  getTimeout: (key: string) => Promise<number>
  setTimeout: (key: string, timeout: number) => Promise<void>
  /**
   * 扫描所有以 prefix 开头的 key，用于枚举在线会话等场景。
   * 仅返回未过期的 key（不含存储驱动前缀）。
   */
  scan?: (prefix: string) => Promise<string[]>
}

/**
 * AuthCraft 存储拓展基类。
 *
 * 继承此类并实现 5 个抽象方法，即可获得完整的 JSON 存取能力。
 * getJson / setJson / updateJson / delJson 均基于核心方法实现，无需手动覆写。
 */
export abstract class AuthCraftStorageAdapter implements AuthCraftStorage {
  abstract get(key: string): Promise<string | null>
  abstract set(key: string, value: string, timeout: number): Promise<void>
  abstract delete(key: string): Promise<void>
  abstract getTimeout(key: string): Promise<number>
  abstract setTimeout(key: string, timeout: number): Promise<void>

  async getJson<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.get(key)
    if (raw === null) return null
    try {
      return JSONBigIntNative.parse(raw) as T
    } catch {
      return null
    }
  }

  async setJson<T = unknown>(key: string, value: T, timeout = -1): Promise<void> {
    await this.set(key, JSONBigIntNative.stringify(value), timeout)
  }

  /**
   * 更新已有 key 的值，保持原有过期时间不变。
   * key 不存在时静默忽略。
   */
  async updateJson<T = unknown>(key: string, value: T): Promise<void> {
    const ttl = await this.getTimeout(key)
    if (ttl === -2) return
    await this.set(key, JSONBigIntNative.stringify(value), ttl)
  }

  async delJson(key: string): Promise<void> {
    await this.delete(key)
  }

  /**
   * 扫描所有以 prefix 开头的 key。
   * 子类可覆写以提供高效实现（如 Redis SCAN），默认不支持，抛出错误。
   */
  async scan(_prefix: string): Promise<string[]> {
    throw new Error('AuthCraftStorageAdapter: scan() is not implemented for this storage driver.')
  }
}
