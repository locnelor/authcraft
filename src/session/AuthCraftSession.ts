import type { AuthCraftOptions } from '../interfaces'
import type { LoginId, TerminalInfo } from '../interfaces/types'

export interface AuthCraftSessionData {
  /**
   * session 类型（预留，用于区分不同场景的 session，如 'user-session'）
   */
  type?: string

  /**
   * 登录类型，用于区分同一系统中不同的登录入口（如 'user' / 'admin' / 'app'）。
   * 默认为 'login'。
   */
  loginType?: string

  /**
   * 登录 id
   */
  loginId: LoginId

  /**
   * 当前 session 的创建时间（Date.now()）
   */
  createTime: number

  /**
   * 终端序号计数器，每新增一个终端自动递增，用于为 TerminalInfo.index 赋值
   */
  terminalIndex: number

  /**
   * 终端设备列表，记录该账号在各设备上的登录信息
   */
  terminalList: TerminalInfo[]

  /**
   * 当前 session 挂载的自定义数据
   */
  dataMap: Record<string, unknown>
}

/**
 * AuthCraft Session 实体类。
 *
 * 封装读/写/删存储操作，上层调用 save() / delete() 即可，
 * 不需要关心 key 拼接和 JSON 序列化。
 */
export class AuthCraftSession implements AuthCraftSessionData {
  type?: string
  loginType?: string
  loginId: LoginId
  createTime: number
  terminalIndex: number = 0
  terminalList: TerminalInfo[] = []
  dataMap: Record<string, unknown> = {}

  /** 运行时注入，不参与序列化 */
  private _config?: AuthCraftOptions
  private _key?: string

  constructor() {
    this.createTime = Date.now()
  }

  public get<T = unknown>(key: string): T | undefined {
    return this.dataMap[key] as T
  }

  public set<T = unknown>(key: string, value: T): this {
    this.dataMap[key] = value
    return this
  }

  /**
   * 从存储中反序列化的纯对象还原为 AuthCraftSession 实例（含原型方法）
   */
  static from(data: AuthCraftSessionData): AuthCraftSession {
    const session = new AuthCraftSession()
    return Object.assign(session, data)
  }

  public setLoginId(loginId: LoginId) {
    this.loginId = loginId
    return this
  }

  /**
   * 添加终端设备信息（自动分配递增 index）
   */
  public addTerminal(terminal: TerminalInfo) {
    this.terminalIndex = (this.terminalIndex ?? 0) + 1
    terminal.index = this.terminalIndex
    this.terminalList.push(terminal)
    return this
  }

  /**
   * 根据 tokenId 移除终端设备信息
   */
  public removeTerminal(tokenId: string) {
    this.terminalList = this.terminalList.filter((t) => t.tokenId !== tokenId)
    return this
  }

  /**
   * 根据 tokenId 获取终端设备信息
   */
  public getTerminal(tokenId: string): TerminalInfo | undefined {
    return this.terminalList.find((t) => t.tokenId === tokenId)
  }

  // ─── 存储绑定与持久化操作 ──────────────────────────────────────────

  /**
   * 绑定存储配置与存储 key，使 save / delete / renew 等存储方法可用。
   * 反序列化（from）或新建后立即调用。
   */
  public hydrate(config: AuthCraftOptions, key: string): this {
    this._config = config
    this._key = key
    return this
  }

  /**
   * 将当前 session 持久化到存储（写入并设置过期时间）
   */
  public async save(expire?: number): Promise<void> {
    await this._config!.storage.setJson(this._key!, this, expire ?? this._config!.expire)
  }

  /**
   * 更新存储中的 session 值（不改变 TTL）
   */
  public async update(): Promise<void> {
    await this._config!.storage.updateJson(this._key!, this)
  }

  /**
   * 从存储中删除此 session
   */
  public async delete(): Promise<void> {
    await this._config!.storage.delJson(this._key!)
  }

  /**
   * 刷新 session 的过期时间（续期）
   */
  public async renew(expire?: number): Promise<void> {
    await this._config!.storage.setTimeout(this._key!, expire ?? this._config!.expire)
  }

  /**
   * 获取 session 剩余存活时间（秒），-1 永久，-2 不存在
   */
  public getTimeout(): Promise<number> {
    return this._config!.storage.getTimeout(this._key!)
  }

  /**
   * 序列化时排除运行时私有字段（_config / _key 不写入存储）
   */
  public toJSON(): AuthCraftSessionData {
    return {
      type: this.type,
      loginType: this.loginType,
      loginId: this.loginId,
      createTime: this.createTime,
      terminalIndex: this.terminalIndex,
      terminalList: this.terminalList,
      dataMap: this.dataMap,
    }
  }
}
