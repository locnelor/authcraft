import type { AuthCraftOptions } from '../interfaces'
import type { LoginId } from '../interfaces/types'

/**
 * 生成 session 存储 key
 */
export function sessionKey(config: Pick<AuthCraftOptions, 'prefixName'>, loginId: LoginId): string {
  return `${config.prefixName}:session:${loginId}`
}

/**
 * 生成 token 存储 key
 */
export function tokenKey(config: Pick<AuthCraftOptions, 'prefixName'>, tokenId: string): string {
  return `${config.prefixName}:token:${tokenId}`
}
