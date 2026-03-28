import { AuthCraftOptions, defaultCookieOptions, defaultOptions } from '../interfaces'
import { MemoryStorage } from '../storage/MemoryStorage'

export const mergeDefaultOptions = (options?: Partial<AuthCraftOptions>): AuthCraftOptions => {
  return {
    ...defaultOptions,
    ...options,
    cookie: {
      ...defaultCookieOptions,
      ...options?.cookie,
    },
    // 若外部未传 storage，则默认创建 MemoryStorage
    storage: options?.storage ?? new MemoryStorage(),
  } as AuthCraftOptions
}
