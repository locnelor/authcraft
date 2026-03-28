/**
 * Token 状态常量
 */
export const TOKEN_STATUS = {
  /** 正常 */
  NORMAL: 1,
  /** 失效 */
  INVALID: -1,
  /** 踢下线 */
  KICKED: -2,
  /** 顶下线 */
  REPLACED: -3,
} as const

export type TokenStatus = (typeof TOKEN_STATUS)[keyof typeof TOKEN_STATUS]
