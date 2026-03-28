import { AuthCraftStorageAdapter } from '../interfaces/storage'

interface MemoryEntry {
  value: string
  /** 过期时间 unix ms；-1 表示永不过期 */
  expireAt: number
}

/**
 * 内存存储实现。
 *
 * - TTL 通过惰性检查（读时判过期）+ 定时 GC 双重保障
 * - gcInterval：GC 间隔（毫秒），默认 60 秒扫描一次全量过期 key
 * - 单实例进程重启后数据会丢失，适合开发 / 单机部署
 */
export class MemoryStorage extends AuthCraftStorageAdapter {
  private readonly store = new Map<string, MemoryEntry>()
  private readonly gcTimer: ReturnType<typeof setInterval>

  constructor(gcIntervalMs = 60_000) {
    super()
    this.gcTimer = setInterval(() => this.gc(), gcIntervalMs)
    // 不阻止进程退出
    if (typeof this.gcTimer.unref === 'function') {
      this.gcTimer.unref()
    }
  }

  /** 停止 GC 定时器（模块销毁时调用） */
  destroy() {
    clearInterval(this.gcTimer)
  }

  private isExpired(entry: MemoryEntry): boolean {
    return entry.expireAt !== -1 && Date.now() > entry.expireAt
  }

  private gc() {
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (entry.expireAt !== -1 && now > entry.expireAt) {
        this.store.delete(key)
      }
    }
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key)
    if (!entry || this.isExpired(entry)) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  async set(key: string, value: string, timeout: number): Promise<void> {
    const expireAt = timeout > 0 ? Date.now() + timeout * 1_000 : -1
    this.store.set(key, { value, expireAt })
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }

  async getTimeout(key: string): Promise<number> {
    const entry = this.store.get(key)
    if (!entry || this.isExpired(entry)) return -2
    if (entry.expireAt === -1) return -1
    return Math.max(0, Math.floor((entry.expireAt - Date.now()) / 1_000))
  }

  async setTimeout(key: string, timeout: number): Promise<void> {
    const entry = this.store.get(key)
    if (!entry || this.isExpired(entry)) return
    entry.expireAt = timeout > 0 ? Date.now() + timeout * 1_000 : -1
  }

  async scan(prefix: string): Promise<string[]> {
    const now = Date.now()
    const result: string[] = []
    for (const [key, entry] of this.store) {
      if (key.startsWith(prefix) && (entry.expireAt === -1 || entry.expireAt > now)) {
        result.push(key)
      }
    }
    return result
  }
}
