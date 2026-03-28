/**
 * JWT payload 类型。
 */
export interface AuthCraftJwtPayload {
  /** token ID */
  tokenId: string
  /**
   * 登录类型，用于区分同一系统中不同的登录入口（如 'user' / 'admin' / 'app'）。
   * 默认为 'login'。
   */
  loginType: string
  /**
   * 随机字符串，与 jti 配合确保每个 token 全局唯一，
   * 可用于实现主动吊销（存入黑名单时做 key 前缀）。
   */
  rnStr: string
  /** 颁发时间（unix 秒） */
  iat?: number
  /** 过期时间（unix 秒） */
  exp?: number
}

/**
 * verifyToken 的返回结果
 */
export interface VerifyTokenResult {
  payload: AuthCraftJwtPayload
  alg: string
}
