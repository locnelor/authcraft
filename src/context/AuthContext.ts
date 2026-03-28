import { AsyncLocalStorage } from 'node:async_hooks'

import { TOKEN_STATUS, TokenStatus } from '../constants'
import { ERROR_NO_CONTEXT, ERROR_NO_SESSION } from '../constants/error'
import { AuthCraftOptions, defaultOptions, TokenStoredValue } from '../interfaces'
import { AuthCraftSession } from '../session'
import { AuthCraftJwtPayload, verifyToken } from '../token'
import { sessionKey, tokenKey } from '../utils/keys'

/**
 * 每个 HTTP 请求绑定的上下文数据。
 * 在中间件的 run() 调用后即可在任意深度通过 getContext() 取得。
 */
export interface AuthCraftRequestContext {
  req: any
  res: any
  config: AuthCraftOptions
  extraData: {
    /** 当前请求使用的 tokenId */
    tokenId?: string
    authPayload?: AuthCraftJwtPayload
    session?: AuthCraftSession
    tokenStatus?: TokenStatus
  }
}

const resolveToken = (req: any, config: AuthCraftOptions) => {
  const readTokenFromHeader = () => {
    const headerToken = req.header(config.tokenName)
    if (headerToken) {
      return headerToken
    }

    const authorization = req.header('authorization')
    if (!authorization) {
      return undefined
    }

    const [scheme, token] = authorization.split(' ')
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return undefined
    }

    return token
  }
  const readTokenFromCookie = () => {
    const maybeCookies = (req as Request & { cookies?: Record<string, string> }).cookies
    if (!maybeCookies) {
      return undefined
    }
    return maybeCookies[config.tokenName]
  }
  const headerToken = config.isReadHeader ? readTokenFromHeader() : undefined
  const cookieToken = config.isReadCookie ? readTokenFromCookie() : undefined
  const customToken = config.customReadToken?.()
  return customToken || headerToken || cookieToken
}

/**
 * AuthCraft 请求上下文。
 *
 * 纯静态类，进程级单例 AsyncLocalStorage，提供请求级隔离。
 * 在 Middleware 中调用 AuthCraftContext.run()，
 * 在任意层级通过 AuthCraftContext.getContext() 取回 req/res。
 */
export class AuthCraftContext {
  private static readonly als = new AsyncLocalStorage<AuthCraftRequestContext>()

  /** 启动请求上下文，在中间件中调用一次。 */
  static async run(req: any, res: any, config: AuthCraftOptions, next: () => void) {
    const rawToken = resolveToken(req, config)
    const context: AuthCraftRequestContext = {
      req,
      res,
      config,
      extraData: {},
    }
    if (rawToken) {
      const result = await verifyToken(rawToken, config)
      if (result) {
        const { tokenId } = result.payload
        // 查询 storage 中的 token 记录，key 为 {prefix}:token:{tokenId}
        const key = tokenKey(config, tokenId)
        const storedValue = await config.storage.getJson<TokenStoredValue>(key)
        if (storedValue && typeof storedValue === 'object' && 'status' in storedValue) {
          if (storedValue.status !== TOKEN_STATUS.NORMAL) {
            // 非正常状态：token 已失效，写入状态但不加载 session
            context.extraData.tokenStatus = storedValue.status
            await config.storage.delJson(key)
          } else {
            context.extraData.tokenId = tokenId
            context.extraData.authPayload = { ...result.payload }
            const key = sessionKey(config, storedValue.loginId)
            const session = await config.storage.getJson<AuthCraftSession>(key)
            if (session) {
              context.extraData.session = AuthCraftSession.from(session)
            }
            // 更新最近活跃时间
            await config.storage.updateJson<TokenStoredValue>(tokenKey(config, tokenId), {
              ...storedValue,
              lastActiveTime: Date.now(),
            })
            // 按配置刷新 token / session 的存活时间（活跃续期）
            if (config.isActiveRefreshToken) {
              await config.storage.setTimeout(key, config.expire)
            }
            if (config.isActiveRefreshSession && session) {
              await config.storage.setTimeout(key, config.expire)
            }
          }
        }
        // storedValue 为 null 时表示 token 已过期或不存在，不设置任何 session
      }
    }
    this.als.run(context, async () => {
      next()
    })
  }

  /**
   * 获取当前请求的上下文数据。
   * 若在请求上下文外调用则抛出错误。
   */
  static getContext(): AuthCraftRequestContext {
    const ctx = this.als.getStore()
    if (!ctx) throw ERROR_NO_CONTEXT
    return ctx
  }

  /** 获取当前请求的上下文数据，不在请求上下文中时返回 null。 */
  static getContextOrNull(): AuthCraftRequestContext | null {
    return this.als.getStore() ?? null
  }

  /**
   * 获取当前上下文全局配置信息
   */
  static getConfig(): AuthCraftOptions {
    return this.getContext().config ?? defaultOptions
  }

  /**
   * 获取当前上下文请求头
   */
  static getRequest() {
    return this.getContext().req
  }

  /**
   * 设置当前上下文session
   */
  static setSession(session: AuthCraftSession) {
    const ctx = this.getContext()
    ctx.extraData.session = session
  }

  /**
   * 获取当前上下文session
   */
  static getSession(): AuthCraftSession | null {
    const ctx = this.getContextOrNull()
    return ctx?.extraData.session ?? null
  }

  /**
   * 获取当前上下文session，不存在时抛出错误
   */
  static getSessionOrThrow(): AuthCraftSession {
    const session = this.getSession()
    if (!session) {
      throw ERROR_NO_SESSION
    }
    return session
  }

  /**
   * 获取当前请求使用的 tokenId，未登录时返回 null
   */
  static getTokenId(): string | null {
    const ctx = this.getContextOrNull()
    return ctx?.extraData.tokenId ?? null
  }

  /**
   * 获取当前上下文的鉴权载荷信息，未登录或无效 token 时返回 null
   */
  static getAuthPayload(): AuthCraftJwtPayload | null {
    const ctx = this.getContextOrNull()
    return ctx?.extraData.authPayload ?? null
  }

  /**
   * 设置当前上下文的鉴权载荷信息
   */
  static setAuthPayload(authPayload: AuthCraftJwtPayload) {
    const ctx = this.getContext()
    ctx.extraData.authPayload = authPayload
  }

  /**
   * 获取当前 token 在 storage 中的状态码。
   */
  static getTokenStatus(): TokenStatus | null {
    const ctx = this.getContextOrNull()
    return ctx?.extraData.tokenStatus ?? null
  }
}
