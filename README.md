# AuthCraft

[English](README.en.md) | 中文

适用于 Node.js 的完整**认证与授权系统库**。基于 JWT + 可插拔存储构建，提供企业级会话管理、多设备登录控制以及细粒度的权限/角色校验，不绑定任何特定框架。

## 功能路线图

| 功能 | 状态 |
|------|------|
| 登录认证 | ✅ 已完成 |
| 权限认证（Permission / Role） | ✅ 已完成 |
| 踢人下线 / 顶替下线 | ✅ 已完成 |
| 鉴权（Token 状态校验） | ✅ 已完成 |
| JWT 集成 | ✅ 已完成 |
| 持久层拓展（自定义 Storage） | ✅ 已完成 |
| 单点登录（SSO） | ✅ 已完成 |
| Session 会话 | 🔧 进行中 |
| 会话查询 | 🔧 进行中 |
| 路由式拦截鉴权 | ⬜ 计划中 |
| Token 风格定制 | ⬜ 计划中 |
| 同端互斥登录 | ⬜ 计划中 |
| 记住我模式 | ⬜ 计划中 |
| 二级认证 | ⬜ 计划中 |
| 账号封禁 | ⬜ 计划中 |
| 会话监听器 | ⬜ 计划中 |
| 模拟他人账号 | ⬜ 计划中 |
| 临时身份切换 | ⬜ 计划中 |
| 多账号体系登录 | ⬜ 计划中 |
| 单点注销 | ⬜ 计划中 |
| OAuth2.0 认证 | ⬜ 计划中 |
| 临时 Token 认证 | ⬜ 计划中 |

## 运行环境

- Node.js >= 18

## 安装

```bash
npm install authcraft
# 或
pnpm add authcraft
```

## 快速开始

```typescript
import express from 'express'
import { AuthCraft, MemoryStorage, AuthCraftContext } from 'authcraft'

const auth = new AuthCraft({
  jwtSecret: 'your-secret-key',
  storage: new MemoryStorage(),
  getPermissionList: async (session, loginId, loginType) => {
    // 从数据库查询该用户的权限列表
    return ['user:read', 'user:write']
  },
  getRoleList: async (session, loginId, loginType) => {
    // 从数据库查询该用户的角色列表
    return ['user']
  },
})

const app = express()
app.use(express.json())

// 中间件：初始化请求上下文
app.use((req, res, next) => {
  AuthCraftContext.run(req, res, auth.config, next)
})

// 登录
app.post('/login', async (req, res) => {
  const { userId } = req.body
  const token = await auth.login(userId, 'web', 'device-001')
  res.json({ token })
})

// 受保护路由
app.get('/profile', async (req, res) => {
  if (!auth.checkLogin()) return res.status(401).json({ error: '未登录' })
  const loginId = auth.getLoginId()
  res.json({ loginId })
})
```

## 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `jwtSecret` | `string` | `'authcraft-secret'` | JWT 签名密钥 |
| `tokenName` | `string` | `'auth-token'` | Header / Cookie 键名 |
| `prefixName` | `string` | `'authcraft'` | 存储 Key 前缀 |
| `expire` | `number` | `2592000`（30天） | Token/Session 有效期（秒）；`-1` 永不过期 |
| `storage` | `AuthCraftStorageAdapter` | `MemoryStorage` | 存储后端 |
| `isReadHeader` | `boolean` | `true` | 从请求 Header 读取 Token |
| `isReadCookie` | `boolean` | `true` | 从 Cookie 读取 Token |
| `isWriteHeader` | `boolean` | `false` | 登录后将 Token 写入响应 Header |
| `isWriteCookie` | `boolean` | `false` | 登录后将 Token 写入 Cookie |
| `allowConcurrent` | `boolean` | `true` | 允许多设备并发登录 |
| `maxLoginCount` | `number` | `-1` | 单用户最大活跃会话数；`-1` 不限制 |
| `maxLoginCountPerType` | `number` | `-1` | 每种设备类型最大会话数；`-1` 不限制 |
| `overflowAction` | `'replace' \| 'kick' \| 'refuse'` | `'replace'` | 超出限制时的处理方式 |
| `shareToken` | `boolean` | `true` | 同设备重复登录时复用现有 Token |
| `isActiveRefreshToken` | `boolean` | `false` | 每次请求刷新 Token 的 TTL |
| `isActiveRefreshSession` | `boolean` | `true` | 每次请求刷新 Session 的 TTL |
| `getPermissionList` | `function` | `async () => []` | 权限列表查询回调 |
| `getRoleList` | `function` | `async () => []` | 角色列表查询回调 |
| `cookie` | `CookieOptions` | 默认值 | Cookie 相关配置 |

## 存储后端

### MemoryStorage（内存存储）

单进程内存存储，适用于开发环境或单节点部署。重启后数据丢失。

```typescript
import { MemoryStorage } from 'authcraft'

const auth = new AuthCraft({
  storage: new MemoryStorage(60_000), // GC 间隔，单位毫秒（默认 60 秒）
})
```

### RedisStorage（Redis 存储）

分布式、持久化存储。与任何实现了必要接口的 Redis 客户端兼容（如 `ioredis`、`node-redis`）。

```typescript
import Redis from 'ioredis'
import { RedisStorage } from 'authcraft'

const redis = new Redis({ host: 'localhost', port: 6379 })

const auth = new AuthCraft({
  storage: new RedisStorage(redis, 'myapp:auth:'), // 可选 Key 前缀
})
```

### 自定义存储

实现 `AuthCraftStorage` 接口即可接入任意存储：

```typescript
interface AuthCraftStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string, timeout: number): Promise<void>
  delete(key: string): Promise<void>
  getTimeout(key: string): Promise<number> // 剩余秒数；-1 永不过期；-2 不存在
  setTimeout(key: string, timeout: number): Promise<void>
  scan?(prefix: string): Promise<string[]>  // 可选，getAllSessions() 依赖此方法
}
```

## 核心 API

### 登录认证 ✅

```typescript
// 登录 — 返回签名后的 JWT 字符串
// loginId: 用户唯一标识（string | number | bigint）
// deviceType: 设备类型，如 'web' | 'mobile' | 'pc'（可选）
// deviceId: 设备唯一标识（可选）
// extra: 附加信息，如 IP、浏览器（可选）
const token = await auth.login(loginId, deviceType?, deviceId?, extra?)

// 检查当前请求是否已登录
const isLoggedIn = auth.checkLogin() // boolean

// 获取当前登录用户的 loginId
const loginId = auth.getLoginId()   // LoginId | null

// 登出当前 Token
await auth.logout()

// 登出指定用户的所有 Token（踢出所有设备）
await auth.logoutAll(loginId)
```

### 权限认证 ✅

在 AuthCraft 初始化时，通过回调函数向库提供权限与角色数据：

```typescript
const auth = new AuthCraft({
  getPermissionList: async (session, loginId, loginType) => {
    // 从数据库动态查询
    const perms = await db.getPermissions(loginId)
    return perms // string[]
  },
  getRoleList: async (session, loginId, loginType) => {
    const roles = await db.getRoles(loginId)
    return roles // string[]
  },
})
```

**权限校验：**

```typescript
const allowed = await auth.hasPermission('user:read')       // boolean，不抛出异常
await auth.checkPermission('user:read')                      // 无权限时抛出异常
await auth.checkPermissionAnd(['user:read', 'user:write'])   // 要求同时满足所有权限
await auth.checkPermissionOr(['admin', 'moderator'])         // 要求满足其中任意一个
```

**角色校验：**

```typescript
const isAdmin = await auth.hasRole('admin')        // boolean
await auth.checkRole('admin')                      // 无角色时抛出异常
await auth.checkRoleAnd(['admin', 'manager'])      // 全部满足
await auth.checkRoleOr(['admin', 'user'])          // 任意满足
```

### 踢人下线 ✅

```typescript
// 踢下线指定 Token（状态变更为 KICKED）
await auth.kickToken(tokenId)

// 顶替指定 Token（状态变更为 REPLACED，通常用于同账号新设备登录挤掉旧设备）
await auth.replaceToken(tokenId)

// 查询 Token 的存储状态
const tokenValue = await auth.getTokenValue(tokenId)
// { loginId, status, lastActiveTime }
```

### Token 状态

| 状态常量 | 值 | 说明 |
|----------|----|------|
| `NORMAL` | `1` | 正常可用 |
| `INVALID` | `-1` | 已通过 `logout` 主动失效 |
| `KICKED` | `-2` | 被踢下线 |
| `REPLACED` | `-3` | 被同账号新登录顶替 |

### Session 会话 🔧

每个登录用户拥有一个 Session，Session 下可挂载多个终端设备（Terminal）。

```typescript
// 获取当前请求的 Session
const session = auth.getSession()

// 按 loginId 查询 Session（第二参数为 true 时，不存在则自动创建）
const session = await auth.getSessionByLoginId(loginId, true)

// 在 Session 中存储任意自定义数据（跨请求持久化）
session.set('lastPage', '/dashboard')
const lastPage = session.get<string>('lastPage')
await session.save()

// 刷新 Session 过期时间
await session.renew()

// 查询 Session 剩余 TTL（秒）
const ttl = await session.getTimeout()

// 删除 Session（等效于该用户全部下线）
await session.delete()
```

**Session 数据模型：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `loginId` | `string \| number \| bigint` | 用户唯一标识 |
| `loginType` | `string` | 登录类型（默认 `'login'`） |
| `createTime` | `number` | 创建时间（Unix ms） |
| `terminalList` | `TerminalInfo[]` | 该账号下所有设备登录信息 |
| `dataMap` | `Record<string, unknown>` | 自定义数据存储区 |

### 多设备登录

AuthCraft 的数据模型：一个用户 → 一个 Session → 多个 Terminal（每个设备/Token 一条记录）：

```
用户（loginId）
  └── Session
        ├── Terminal { tokenId: "t1", deviceType: "web",    deviceId: "浏览器A" }
        ├── Terminal { tokenId: "t2", deviceType: "mobile", deviceId: "手机X"   }
        └── Terminal { tokenId: "t3", deviceType: "web",    deviceId: "浏览器B" }
```

配置登录限制：

```typescript
const auth = new AuthCraft({
  maxLoginCountPerType: 2,    // 每种设备类型最多 2 个并发会话
  overflowAction: 'replace',  // 超出时顶替最早登录的会话（replace | kick | refuse）
})
```

### 会话查询 🔧

```typescript
// 获取系统中所有活跃 Session（需存储后端支持 scan，如 Redis）
const sessions = await auth.getAllSessions()

// 查询指定 loginId 的所有终端设备
const session = await auth.getSessionByLoginId(loginId)
const terminals = session?.terminalList ?? []
```

### 单点登录（SSO）✅

通过限制每个账号只允许一个活跃会话实现 SSO：

```typescript
const auth = new AuthCraft({
  maxLoginCount: 1,
  overflowAction: 'replace', // 新登录自动顶替旧登录
})
```

### 请求上下文

AuthCraft 使用 `AsyncLocalStorage` 隔离每个请求的状态，在中间件中初始化后，整个请求链中都可无参访问：

```typescript
import { AuthCraftContext } from 'authcraft'

app.use((req, res, next) => {
  AuthCraftContext.run(req, res, auth.config, next)
})

// 在任意路由 / 服务层中直接访问，无需传参
const session = AuthCraftContext.getSession()
const tokenId = AuthCraftContext.getTokenId()
const payload = AuthCraftContext.getAuthPayload()
const status  = AuthCraftContext.getTokenStatus()
```

## 计划功能说明

以下功能正在规划或开发中，API 设计可能随版本更新调整。

### 路由式拦截鉴权 ⬜

计划支持通过路由规则声明式地配置鉴权逻辑，无需在每个路由中手动调用校验方法：

```typescript
// 以下为预期 API 设计，尚未实现
auth.protect('/api/admin/**', { roles: ['admin'] })
auth.protect('/api/user/**', { permissions: ['user:read'] })
app.use(auth.interceptor())
```

### Token 风格定制 ⬜

计划支持多种 Token 生成风格：

- `uuid`（默认）：随机 UUID
- `random32`：32 位随机字符串
- `custom`：自定义生成函数

### 同端互斥登录 ⬜

计划在同一 `deviceType`（如 `'web'`）下只允许保留一个活跃会话，新登录自动踢出该类型的所有旧会话。

### 记住我模式 ⬜

计划支持登录时传入 `rememberMe: true`，为该 Token 设置更长的过期时间（如 30 天 vs 默认 2 小时）。

### 二级认证 ⬜

计划支持在敏感操作前要求用户进行二次身份验证（如输入密码、短信验证码），通过后颁发一个短时效的二级 Token。

### 账号封禁 ⬜

计划支持封禁指定 `loginId`，被封禁账号的所有 Token 将立即失效，且无法重新登录，直到解封。

### 会话监听器 ⬜

计划支持注册钩子函数，在会话生命周期的关键节点触发回调：

```typescript
// 以下为预期 API 设计，尚未实现
auth.on('login',   (loginId, terminal) => { /* 用户登录 */ })
auth.on('logout',  (loginId, tokenId)  => { /* 用户登出 */ })
auth.on('kicked',  (loginId, tokenId)  => { /* 被踢下线 */ })
auth.on('expired', (loginId, tokenId)  => { /* Token 过期 */ })
```

### 模拟他人账号 ⬜

计划支持管理员以指定用户身份发起请求（不修改被模拟用户的 Session），便于排查问题或运营干预。

### 临时身份切换 ⬜

计划支持在当前请求上下文中临时切换为另一个 `loginId`，请求结束后自动恢复原身份。

### 多账号体系登录 ⬜

计划支持在同一应用中维护多套独立的登录体系（如 `user` 和 `admin`），各体系的 Session、Token、权限互相隔离。

### 单点注销 ⬜

计划在 SSO 场景下，用户在任一端注销后，同步注销其在所有接入系统中的 Session。

### OAuth2.0 认证 ⬜

计划提供标准 OAuth2.0 授权码、客户端凭证等流程的集成支持。

### 临时 Token 认证 ⬜

计划支持生成短时效、一次性或有限次使用的临时 Token，用于文件下载链接、邮件验证等场景。

## 许可证

MIT
