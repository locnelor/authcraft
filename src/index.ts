import { randomUUID } from 'node:crypto'
import { TOKEN_STATUS, TokenStatus } from './constants'
import {
  ERROR_LOGIN_REFUSED,
  ERROR_PERMISSION_DENIED,
  ERROR_ROLE_DENIED,
} from './constants/error'
import { AuthCraftContext } from './context/AuthContext'
import { AuthCraftOptions, LoginId, TerminalInfo, TokenStoredValue } from './interfaces'
import { AuthCraftSession } from './session'
import { signToken } from './token'
import { mergeDefaultOptions, sessionKey, tokenKey } from './utils'

export * from './constants'
export * from './context/AuthContext'
export * from './interfaces'
export * from './session'
export * from './storage'
export * from './token'
export * from './utils'

export class AuthCraft {
  public readonly config: AuthCraftOptions

  constructor(config?: Partial<AuthCraftOptions>) {
    this.config = mergeDefaultOptions(config)
  }

  // ─── 登录 / 注销 ──────────────────────────────────────────────────────────

  /**
   * 当前会话登录
   * @param loginId 登录id
   * @param deviceType 设备类型
   * @param deviceId 设备唯一标识
   * @param extra 额外终端信息（ip / browser / os），在登录时记录，用于在线用户统计
   */
  public async login(
    loginId: LoginId,
    deviceType = 'default',
    deviceId = 'default',
    extra?: Pick<TerminalInfo, 'ip' | 'browser' | 'os' | 'address'>,
  ) {
    const session = await this.getSessionByLoginId(loginId, true)
    const token = await this.setTokenValue(session, deviceType, deviceId, extra)
    AuthCraftContext.setSession(session)
    return token
  }

  /**
   * 当前账号退出登录（仅当前 token 失效，其他设备不受影响）
   */
  public logout(): Promise<void>

  /**
   * 退出指定 token 的登录
   */
  public logout(tokenId: string): Promise<void>
  public async logout(tokenId?: string) {
    const id = tokenId ?? AuthCraftContext.getTokenId()
    if (id) {
      await this.updateTokenStatus(id, TOKEN_STATUS.INVALID)
    }
  }

  /**
   * 强制下线指定账号的所有设备，并删除 session
   */
  public async logoutAll(loginId: LoginId): Promise<void> {
    const session = await this.getSessionByLoginId(loginId)
    if (session) {
      for (const terminal of session.terminalList) {
        await this.config.storage.delJson(this.splicingKeyToken(terminal.tokenId))
      }
      await session.delete()
    }
  }

  // ─── Session 管理 ─────────────────────────────────────────────────────────

  /**
   * 在当前会话写入指定token值
   * @param session
   * @param deviceType 设备类型
   * @param deviceId 设备唯一标识
   * @param extra 额外终端信息（ip / browser / os）
   */
  public async setTokenValue(
    session: AuthCraftSession,
    deviceType = 'default',
    deviceId = 'default',
    extra?: Pick<TerminalInfo, 'ip' | 'browser' | 'os' | 'address'>,
  ) {
    // 同一设备复用逻辑：在活跃终端中找到相同 deviceType+deviceId 的正常 token
    if (this.config.shareToken) {
      const actives = await this.getActiveTerminals(session)
      const existing = actives.find((t) => t.deviceType === deviceType && t.deviceId === deviceId)
      if (existing) {
        const sign = await signToken(existing.tokenId)
        if (this.config.isWriteCookie) {
          const { res } = AuthCraftContext.getContext()
          res.cookie(this.config.tokenName, sign, this.config.cookie)
        }
        if (this.config.isWriteHeader) {
          const { res } = AuthCraftContext.getContext()
          res.setHeader(this.config.tokenName, sign)
        }
        return sign
      }
    }

    const allowed = await this.enforceDeviceLimits(session, deviceType)
    if (!allowed) {
      throw ERROR_LOGIN_REFUSED
    }
    const tokenId = this.createTokenId()
    const sign = await signToken(tokenId)

    const tokenValue: TokenStoredValue = {
      loginId: session.loginId,
      status: TOKEN_STATUS.NORMAL,
    }
    await this.config.storage.setJson(this.splicingKeyToken(tokenId), tokenValue, this.config.expire)

    // 清理失效 token：遍历 terminalList，删除存储中已不存在或状态非 NORMAL 的终端
    const invalidTokenIds: string[] = []
    for (const t of session.terminalList) {
      const stored = await this.config.storage.getJson<TokenStoredValue>(this.splicingKeyToken(t.tokenId))
      if (!stored || stored.status !== TOKEN_STATUS.NORMAL) {
        invalidTokenIds.push(t.tokenId)
        if (stored) {
          await this.config.storage.delJson(this.splicingKeyToken(t.tokenId))
        }
      }
    }
    for (const id of invalidTokenIds) {
      session.removeTerminal(id)
    }

    // 在 session 的 terminalList 中添加终端信息
    const terminal: TerminalInfo = {
      tokenId,
      index: 0, // 由 addTerminal 自动覆盖
      status: TOKEN_STATUS.NORMAL,
      deviceType,
      deviceId,
      createTime: Date.now(),
      ...extra,
    }
    session.addTerminal(terminal)
    await session.save()

    if (this.config.isWriteCookie) {
      const { res } = AuthCraftContext.getContext()
      res.cookie(this.config.tokenName, sign, this.config.cookie)
    }
    if (this.config.isWriteHeader) {
      const { res } = AuthCraftContext.getContext()
      res.setHeader(this.config.tokenName, sign)
    }
    return sign
  }

  /**
   * 根据登录id创建session
   * @param loginId 登录id
   */
  public async createLoginSession(loginId: LoginId) {
    const session = new AuthCraftSession().setLoginId(loginId).hydrate(this.config, this.splicingKeySession(loginId))
    await session.save()
    return session
  }

  /**
   * 获取当前请求上下文的 session
   */
  public getSession() {
    return AuthCraftContext.getSession() ?? null
  }

  /**
   * 根据 id 从存储中读取 session，不存在或已过期返回 null
   * @param loginId 登录id
   */
  public async getSessionByLoginId(loginId: LoginId): Promise<AuthCraftSession | null>
  public async getSessionByLoginId(loginId: LoginId, create: boolean): Promise<AuthCraftSession>
  public async getSessionByLoginId(loginId: LoginId, create = false): Promise<AuthCraftSession | null> {
    const key = this.splicingKeySession(loginId)
    const findSession = await this.config.storage.getJson<AuthCraftSession>(key)
    if (findSession) {
      const session = AuthCraftSession.from(findSession).hydrate(this.config, key)
      await session.renew()
      return session
    }
    if (!create) return null
    return await this.createLoginSession(loginId)
  }

  // ─── 账号状态 ─────────────────────────────────────────────────────────────

  /**
   * 获取当前账号id，未登录返回 null
   */
  public getLoginId() {
    return AuthCraftContext.getSession()?.loginId ?? null
  }

  /**
   * 检查当前账号是否已登录，返回布尔值
   */
  public checkLogin() {
    return this.getLoginId() !== null
  }

  // ─── 权限管理 ─────────────────────────────────────────────────────────────

  /**
   * 获取当前账号的权限集合
   * 优先调用 config.getPermissionList 回调，未配置时抛出异常
   */
  public async getPermissionList(): Promise<string[]> {
    const session = AuthCraftContext.getSession()
    const loginId = session?.loginId ?? this.getLoginId()
    const loginType = session?.loginType ?? 'login'
    return this.config.getPermissionList(session!, loginId!, loginType)
  }

  /**
   * 判断当前账号是否含有指定权限
   */
  public async hasPermission(permission: string): Promise<boolean> {
    const list = await this.getPermissionList()
    return list.includes(permission)
  }

  /**
   * 检查当前账号是否拥有指定权限，没有则抛出异常
   */
  public async checkPermission(permission: string): Promise<void> {
    if (!(await this.hasPermission(permission))) {
      throw ERROR_PERMISSION_DENIED(permission)
    }
  }

  /**
   * 检查当前账号是否含有多个权限，必须满足全部
   */
  public async checkPermissionAnd(permissions: string[]): Promise<void> {
    const permissionList = await this.getPermissionList()
    if (!permissions.every((p) => permissionList.includes(p))) {
      throw ERROR_PERMISSION_DENIED(permissions)
    }
  }

  /**
   * 检查当前账号是否含有多个权限，满足一个即可
   */
  public async checkPermissionOr(permissions: string[]): Promise<void> {
    const list = await this.getPermissionList()
    if (!permissions.some((p) => list.includes(p))) {
      throw ERROR_PERMISSION_DENIED(permissions)
    }
  }

  // ─── 角色管理 ─────────────────────────────────────────────────────────────

  /**
   * 获取当前账号的角色集合
   * 优先调用 config.getRoleList 回调，未配置时抛出异常
   */
  public async getRoleList(): Promise<string[]> {
    const session = AuthCraftContext.getSession()
    const loginId = session?.loginId ?? this.getLoginId()
    const loginType = session?.loginType ?? 'login'
    return this.config.getRoleList(session!, loginId!, loginType)
  }

  /**
   * 判断当前账号是否拥有指定角色
   */
  public async hasRole(roleCode: string): Promise<boolean> {
    const list = await this.getRoleList()
    return list.includes(roleCode)
  }

  /**
   * 检查当前账号是否拥有指定角色，没有则抛出异常
   */
  public async checkRole(roleCode: string): Promise<void> {
    if (!(await this.hasRole(roleCode))) {
      throw ERROR_ROLE_DENIED(roleCode)
    }
  }

  /**
   * 检查当前账号是否拥有多个角色，必须满足全部
   */
  public async checkRoleAnd(roleCodes: string[]): Promise<void> {
    for (const r of roleCodes) {
      await this.checkRole(r)
    }
  }

  /**
   * 检查当前账号是否拥有多个角色，满足一个即可
   */
  public async checkRoleOr(roleCodes: string[]): Promise<void> {
    const list = await this.getRoleList()
    if (!roleCodes.some((r) => list.includes(r))) {
      throw ERROR_ROLE_DENIED(roleCodes)
    }
  }

  // ─── 设备限制与踢顶管理 ───────────────────────────────────────────────────

  /**
   * 踢下线指定 token（token 状态标记为 KICKED）
   */
  public async kickToken(tokenId: string): Promise<void> {
    await this.updateTokenStatus(tokenId, TOKEN_STATUS.KICKED)
  }

  /**
   * 顶下线指定 token（token 状态标记为 REPLACED）
   */
  public async replaceToken(tokenId: string): Promise<void> {
    await this.updateTokenStatus(tokenId, TOKEN_STATUS.REPLACED)
  }

  /**
   * 更新 token 状态，并同步更新 session 中对应终端的状态
   */
  private async updateTokenStatus(tokenId: string, status: TokenStatus): Promise<void> {
    const tokenKey = this.splicingKeyToken(tokenId)
    const stored = await this.config.storage.getJson<TokenStoredValue>(tokenKey)
    if (!stored) return
    await this.config.storage.updateJson(tokenKey, { ...stored, status })

    // 同步更新 session 中该终端的状态
    const session = await this.getSessionByLoginId(stored.loginId)
    if (!session) return
    const terminal = session.terminalList.find((t) => t.tokenId === tokenId)
    if (terminal) {
      terminal.status = status
      await session.update()
    }
  }

  /**
   * 获取 session 中所有状态正常（NORMAL）的活跃终端列表
   */
  private async getActiveTerminals(session: AuthCraftSession): Promise<TerminalInfo[]> {
    const active: TerminalInfo[] = []
    for (const terminal of session.terminalList) {
      const stored = await this.config.storage.getJson<TokenStoredValue>(this.splicingKeyToken(terminal.tokenId))
      if (stored?.status === TOKEN_STATUS.NORMAL) {
        active.push(terminal)
      }
    }
    return active
  }

  /**
   * 根据配置检查并处理设备数量限制。
   * 返回 false 表示 overflowAction 为 'refuse' 且已超出限制，应拒绝本次登录。
   */
  private async enforceDeviceLimits(session: AuthCraftSession, deviceType: string): Promise<boolean> {
    const { allowConcurrent, maxLoginCount, maxLoginCountPerType, overflowAction } = this.config

    // allowConcurrent=false 等效于 maxLoginCount=1
    const effectiveMax = !allowConcurrent ? 1 : maxLoginCount

    if (effectiveMax === -1 && maxLoginCountPerType === -1) return true

    const evict = async (tokenId: string) => {
      if (overflowAction === 'replace') {
        await this.replaceToken(tokenId)
      } else {
        await this.kickToken(tokenId)
      }
    }

    // 检查每种设备类型的上限
    if (maxLoginCountPerType !== -1) {
      const typeActives = (await this.getActiveTerminals(session))
        .filter((t) => t.deviceType === deviceType)
      if (typeActives.length >= maxLoginCountPerType) {
        if (overflowAction === 'refuse') return false
        await evict(typeActives[0].tokenId)
      }
    }

    // 检查总登录数上限（重新查询以反映上面可能的踢出）
    if (effectiveMax !== -1) {
      const actives = await this.getActiveTerminals(session)
      if (actives.length >= effectiveMax) {
        if (overflowAction === 'refuse') return false
        await evict(actives[0].tokenId)
      }
    }

    return true
  }

  // ─── 工具方法 ─────────────────────────────────────────────────────────────

  /**
   * 生成 token ID（TODO: 根据 tokenStyle 配置支持 UUID / Opaque 等多种风格）
   */
  public createTokenId() {
    return randomUUID()
  }

  /**
   * 拼接 session 存储 key
   */
  public splicingKeySession(loginId: LoginId) {
    return sessionKey(this.config, loginId)
  }

  /**
   * 拼接 token 存储 key
   */
  public splicingKeyToken(tokenId: string) {
    return tokenKey(this.config, tokenId)
  }

  /**
   * 扫描存储中所有有效的 session，用于在线用户统计。
   * 依赖 storage 的 scan 能力（MemoryStorage / RedisStorage 均已实现）。
   */
  public async getAllSessions(): Promise<AuthCraftSession[]> {
    const sessionPrefix = this.splicingKeySession('')
    const keys = await this.config.storage.scan(sessionPrefix)
    const sessions: AuthCraftSession[] = []
    for (const key of keys) {
      const raw = await this.config.storage.getJson<AuthCraftSession>(key)
      if (raw) {
        sessions.push(AuthCraftSession.from(raw))
      }
    }
    return sessions
  }

  /**
   * 根据 tokenId 从存储中读取 token 存储值，不存在或已过期返回 null
   */
  public async getTokenValue(tokenId: string): Promise<TokenStoredValue | null> {
    return this.config.storage.getJson<TokenStoredValue>(this.splicingKeyToken(tokenId))
  }
}
const authCraft = new AuthCraft()
export default authCraft
