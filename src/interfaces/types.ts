import type { TokenStatus } from '../constants'
import type { AuthCraftStorageAdapter } from './storage'
import { AuthCraftSession } from '../session'
import { MemoryStorage } from '../storage'

/**
 * Token 在 storage 中存储的值
 */
export interface TokenStoredValue {
  /** 登录 ID */
  loginId: LoginId
  /** token 状态：1 正常，-1 失效，-2 踢下线，-3 顶下线 */
  status: TokenStatus
  /** 最近活跃时间（unix ms），每次请求时由 AuthContext 自动更新 */
  lastActiveTime?: number
}

/**
 * 终端设备信息，存储在 session 的 terminalList 中
 */
export interface TerminalInfo {
  /** 对应的 token ID */
  tokenId: string
  /** 该终端在登录历史中的递增序号（从 1 开始，由 AuthCraftSession 统一分配） */
  index: number
  /** 设备类型，如 'pc' / 'mobile' / 'tablet' */
  deviceType: string
  /** 设备唯一标识 */
  deviceId: string
  /** 终端登录时间 */
  createTime: number
  /** 终端当前状态，与 token 存储中的 status 保持同步 */
  status: TokenStatus
  /** 登录时的客户端 IP */
  ip?: string
  /** 登录时的浏览器信息，如 "Chrome 146.0" */
  browser?: string
  /** 登录时的操作系统信息，如 "Windows" / "macOS" */
  os?: string
  /** 登录地点，如 "中国 浙江 杭州" */
  address?: string
}

export type LoginId = string | number | bigint

/**
 * 存储驱动类型
 * - memory：内存存储，适用于单实例部署，重启后数据会丢失
 * - redis：Redis 存储，适用于分布式部署，重启后数据持久化（需配置 Redis 连接）
 */
export type StorageDriver = 'memory' | 'redis'

/**
 * 超出设备登录数量限制时的处理行为
 * - 'replace'：顶下线最旧的设备（token 状态标记为 REPLACED）
 * - 'kick'  ：踢下线最旧的设备（token 状态标记为 KICKED）
 * - 'refuse'：拒绝新设备登录，抛出错误
 */
export type OverflowAction = 'replace' | 'kick' | 'refuse'

export type CookieSameSite = 'Lax' | 'Strict' | 'None'
/**
 * Cookie配置选项
 */
export interface CookieOptions {
  domain: string | null
  path: string
  secure: boolean
  httpOnly: boolean
  sameSite: CookieSameSite
}
/**
 * 基础认证令牌模块选项
 */
export interface AuthcraftBaseOptions {
  /**
   * token、cookie名称
   */
  tokenName: string

  /**
   * token前缀
   */
  prefixName: string

  /**
   * token有效期（单位：秒），默认30天，-1表示永不过期
   */
  expire: number

  /**
   * 是否尝试从 header 里读取token
   */
  isReadHeader: boolean

  /**
   * 是否尝试从 cookie 里读取token
   */
  isReadCookie: boolean

  /**
   * 自定义获取token方法
   * @todo 待实现
   */
  customReadToken?: () => string

  /**
   * 是否在登录后将token写入header
   */
  isWriteHeader: boolean

  /**
   * 是否在登录后将token写入cookie
   */
  isWriteCookie: boolean

  /**
   * token最低活跃频率（单位：秒），如果token超过此时间没有访问系统就会被冻结，默认-1，表示不限制
   * @todo 待实现
   */
  activeExpire: number

  /**
   * 是否允许同一账号多地同时登录（默认 true）
   * 为 false 时等效于 maxLoginCount = 1
   */
  allowConcurrent: boolean

  /**
   * token风格（默认uuid）
   * @todo 待实现
   */
  tokenStyle: string

  /**
   * 同一账号同时登录的最大 token 数量，-1 表示不限制。
   * allowConcurrent 为 false 时此配置失效（固定为 1）。
   */
  maxLoginCount: number

  /**
   * 每种设备类型最大同时在线数量，-1 表示不限制
   */
  maxLoginCountPerType: number

  /**
   * 超出登录数量限制时的行为（默认 'replace'）
   */
  overflowAction: OverflowAction

  /**
   * 同一设备（deviceType + deviceId 相同）再次登录时，是否复用现有 token。
   * - true（默认）：直接返回现有 token，不新增终端记录
   * - false：新发一个 token（旧 token 保持原状态不变）
   */
  shareToken: boolean

  /**
   * 每次请求时是否刷新 token 的存活时间（活跃续期），默认 false
   */
  isActiveRefreshToken: boolean

  /**
   * 每次请求时是否刷新 session 的存活时间（活跃续期），默认 true
   */
  isActiveRefreshSession: boolean

  /**
   * jwt密钥
   */
  jwtSecret: string | null

  /**
   * 自定义存储适配器实例。
   * 传入后 storageDriver 配置将被忽略。
   * 不传时默认使用内存存储（MemoryStorage）。
   */
  storage: AuthCraftStorageAdapter

  /**
   * 获取指定账号的权限列表。
   * 每次调用权限校验时触发，参数为 loginId 和 loginType。
   */
  getPermissionList: (session: AuthCraftSession, loginId: LoginId, loginType: string) => Promise<string[]> | string[]

  /**
   * 获取指定账号的角色列表。
   * 每次调用角色校验时触发，参数为 loginId 和 loginType。
   */
  getRoleList: (session: AuthCraftSession, loginId: LoginId, loginType: string) => Promise<string[]> | string[]
}
export interface AuthCraftOptions extends AuthcraftBaseOptions {
  /**
   * cookie配置
   * @todo 待实现
   */
  cookie: CookieOptions
}
/**
 * cookie配置
 */
export const defaultCookieOptions: CookieOptions = {
  /**
   * 作用域：指定 cookie 生效的域名，null 表示当前域名
   */
  domain: null,
  /**
   * 路径：指定 cookie 生效的路径，/ 表示整站有效
   */
  path: '/',
  /**
   * 安全标志：true 时仅 HTTPS 生效，false 时 HTTP 也生效
   */
  secure: false,
  /**
   * 禁止脚本访问：true 时前端 JS 无法读取，提升 XSS 防护
   */
  httpOnly: false,
  /**
   * 跨站策略：Lax 允许部分第三方请求携带，Strict 完全禁止，None 不限制（需配合 secure:true）
   */
  sameSite: 'Lax',
}
/**
 * 默认认证令牌模块选项
 */
export const defaultOptions: AuthCraftOptions = {
  tokenName: 'auth-token',
  prefixName: 'authcraft',
  expire: 30 * 24 * 60 * 60,
  isReadHeader: true,
  isReadCookie: true,
  isWriteCookie: false,
  isWriteHeader: false,
  activeExpire: -1,
  allowConcurrent: true,
  shareToken: true,
  tokenStyle: 'uuid',
  maxLoginCount: -1,
  maxLoginCountPerType: -1,
  overflowAction: 'replace',
  isActiveRefreshToken: false,
  isActiveRefreshSession: true,
  jwtSecret: 'authcraft-secret',
  storage: new MemoryStorage(),
  cookie: defaultCookieOptions,
  getRoleList: async () => [],
  getPermissionList: async () => [],
}
