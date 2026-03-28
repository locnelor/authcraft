import { AuthCraftStorageAdapter } from '../interfaces/storage'

/**
 * Redis 客户端最小接口——只依赖实际用到的方法，
 * 兼容 ioredis / node-redis 等任意客户端，无需硬依赖。
 */
export interface RedisClient {
  get: (key: string) => Promise<string | null>
  set: ((key: string, value: string) => Promise<unknown>)
    & ((key: string, value: string, exMode: 'EX', seconds: number) => Promise<unknown>)
  del: (key: string) => Promise<unknown>
  ttl: (key: string) => Promise<number>
  expire: (key: string, seconds: number) => Promise<unknown>
  persist: (key: string) => Promise<unknown>
  /** 按 glob 模式扫描所有匹配的 key（生产环境建议使用 SCAN 替代 KEYS，此处保持接口简洁） */
  keys: (pattern: string) => Promise<string[]>
}

/**
 * Redis 存储实现。
 *
 * 传入任意实现了 {@link RedisClient} 接口的客户端（ioredis、node-redis 等均可）。
 * key 前缀默认为 `authcraft:`，可通过构造函数第二个参数覆盖。
 *
 * @example
 * import Redis from 'ioredis'
 * const redis = new Redis({ host: 'localhost', port: 6379 })
 * const storage = new RedisStorage(redis)
 */
export class RedisStorage extends AuthCraftStorageAdapter {
  constructor(
    private readonly client: RedisClient,
    private readonly prefix = 'authcraft:',
  ) {
    super()
  }

  private k(key: string): string {
    return `${this.prefix}${key}`
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(this.k(key))
  }

  async set(key: string, value: string, timeout: number): Promise<void> {
    if (timeout > 0) {
      await this.client.set(this.k(key), value, 'EX', timeout)
    } else {
      await this.client.set(this.k(key), value)
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.k(key))
  }

  async getTimeout(key: string): Promise<number> {
    return this.client.ttl(this.k(key))
  }

  async setTimeout(key: string, timeout: number): Promise<void> {
    if (timeout > 0) {
      await this.client.expire(this.k(key), timeout)
    } else {
      await this.client.persist(this.k(key))
    }
  }

  async scan(prefix: string): Promise<string[]> {
    // Redis 中 key 带有驱动前缀，扫描时需拼接，返回时去掉前缀
    const pattern = `${this.prefix}${prefix}*`
    const keys = await this.client.keys(pattern)
    const driverPrefix = this.prefix
    return keys.map((k) => k.slice(driverPrefix.length))
  }
}
