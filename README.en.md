# AuthCraft

English | [中文](README.md)

A complete **authentication and authorization system** for Node.js. Built on JWT + pluggable Storage, AuthCraft provides enterprise-grade session management, multi-device login control, and fine-grained permission/role checks — with zero framework lock-in.

## Roadmap

| Feature | Status |
|---------|--------|
| Login authentication | ✅ Done |
| Permission & role authorization | ✅ Done |
| Kick / replace tokens | ✅ Done |
| Token status verification | ✅ Done |
| JWT integration | ✅ Done |
| Pluggable storage layer | ✅ Done |
| Single Sign-On (SSO) | ✅ Done |
| Session management | 🔧 In progress |
| Session query | 🔧 In progress |
| Route-level auth interceptor | ⬜ Planned |
| Token style customization | ⬜ Planned |
| Mutual exclusion login (same device type) | ⬜ Planned |
| Remember me mode | ⬜ Planned |
| Secondary authentication | ⬜ Planned |
| Account banning | ⬜ Planned |
| Session event listeners | ⬜ Planned |
| Impersonate another account | ⬜ Planned |
| Temporary identity switch | ⬜ Planned |
| Multi-account system login | ⬜ Planned |
| Single Sign-Out | ⬜ Planned |
| OAuth2.0 authentication | ⬜ Planned |
| Temporary token authentication | ⬜ Planned |

## Requirements

- Node.js >= 18

## Installation

```bash
npm install authcraft
# or
pnpm add authcraft
```

## Quick Start

```typescript
import express from 'express'
import { AuthCraft, MemoryStorage, AuthCraftContext } from 'authcraft'

const auth = new AuthCraft({
  jwtSecret: 'your-secret-key',
  storage: new MemoryStorage(),
  getPermissionList: async (session, loginId, loginType) => {
    // return permissions from your database
    return ['user:read', 'user:write']
  },
  getRoleList: async (session, loginId, loginType) => {
    // return roles from your database
    return ['user']
  },
})

const app = express()
app.use(express.json())

// Middleware: initialize request context
app.use((req, res, next) => {
  AuthCraftContext.run(req, res, auth.config, next)
})

// Login
app.post('/login', async (req, res) => {
  const { userId } = req.body
  const token = await auth.login(userId, 'web', 'device-001')
  res.json({ token })
})

// Protected route
app.get('/profile', async (req, res) => {
  if (!auth.checkLogin()) return res.status(401).json({ error: 'Unauthorized' })
  const loginId = auth.getLoginId()
  res.json({ loginId })
})
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `jwtSecret` | `string` | `'authcraft-secret'` | Secret key for JWT signing |
| `tokenName` | `string` | `'auth-token'` | Header / Cookie key name |
| `prefixName` | `string` | `'authcraft'` | Storage key prefix |
| `expire` | `number` | `2592000` (30 days) | Token/Session TTL in seconds; `-1` = never expire |
| `storage` | `AuthCraftStorageAdapter` | `MemoryStorage` | Storage backend |
| `isReadHeader` | `boolean` | `true` | Read token from request header |
| `isReadCookie` | `boolean` | `true` | Read token from cookie |
| `isWriteHeader` | `boolean` | `false` | Write token to response header on login |
| `isWriteCookie` | `boolean` | `false` | Write token to cookie on login |
| `allowConcurrent` | `boolean` | `true` | Allow concurrent logins from multiple devices |
| `maxLoginCount` | `number` | `-1` | Max total active sessions per user; `-1` = unlimited |
| `maxLoginCountPerType` | `number` | `-1` | Max sessions per device type; `-1` = unlimited |
| `overflowAction` | `'replace' \| 'kick' \| 'refuse'` | `'replace'` | Action when login count exceeds limit |
| `shareToken` | `boolean` | `true` | Reuse existing token when same device re-logs in |
| `isActiveRefreshToken` | `boolean` | `false` | Refresh token TTL on every request |
| `isActiveRefreshSession` | `boolean` | `true` | Refresh session TTL on every request |
| `getPermissionList` | `function` | `async () => []` | Callback to load user permissions |
| `getRoleList` | `function` | `async () => []` | Callback to load user roles |
| `cookie` | `CookieOptions` | defaults | Cookie configuration |

## Storage Backends

### MemoryStorage

Single-process in-memory store. Suitable for development or single-node deployments. Data is lost on restart.

```typescript
import { MemoryStorage } from 'authcraft'

const auth = new AuthCraft({
  storage: new MemoryStorage(60_000), // GC interval in ms (default: 60s)
})
```

### RedisStorage

Distributed, persistent store. Compatible with any Redis client that implements the required interface (e.g., `ioredis`, `node-redis`).

```typescript
import Redis from 'ioredis'
import { RedisStorage } from 'authcraft'

const redis = new Redis({ host: 'localhost', port: 6379 })

const auth = new AuthCraft({
  storage: new RedisStorage(redis, 'myapp:auth:'), // optional key prefix
})
```

### Custom Storage

Implement the `AuthCraftStorage` interface:

```typescript
interface AuthCraftStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string, timeout: number): Promise<void>
  delete(key: string): Promise<void>
  getTimeout(key: string): Promise<number> // remaining seconds; -1 = no expiry; -2 = not found
  setTimeout(key: string, timeout: number): Promise<void>
  scan?(prefix: string): Promise<string[]>  // optional, needed for getAllSessions()
}
```

## Core API

### Login Authentication ✅

```typescript
// Login — returns a signed JWT string
// loginId: unique user identifier (string | number | bigint)
// deviceType: e.g. 'web' | 'mobile' | 'pc' (optional)
// deviceId: unique device identifier (optional)
// extra: additional info like IP, browser (optional)
const token = await auth.login(loginId, deviceType?, deviceId?, extra?)

// Check if current request is authenticated
const isLoggedIn = auth.checkLogin() // boolean

// Get the current user's loginId
const loginId = auth.getLoginId()   // LoginId | null

// Logout current token
await auth.logout()

// Logout all tokens for a user (all devices)
await auth.logoutAll(loginId)
```

### Permission & Role Authorization ✅

Provide permission and role data via callbacks at initialization:

```typescript
const auth = new AuthCraft({
  getPermissionList: async (session, loginId, loginType) => {
    const perms = await db.getPermissions(loginId)
    return perms // string[]
  },
  getRoleList: async (session, loginId, loginType) => {
    const roles = await db.getRoles(loginId)
    return roles // string[]
  },
})
```

**Permission checks:**

```typescript
const allowed = await auth.hasPermission('user:read')       // boolean, no throw
await auth.checkPermission('user:read')                      // throws if denied
await auth.checkPermissionAnd(['user:read', 'user:write'])   // require ALL
await auth.checkPermissionOr(['admin', 'moderator'])         // require ANY
```

**Role checks:**

```typescript
const isAdmin = await auth.hasRole('admin')        // boolean
await auth.checkRole('admin')                      // throws if denied
await auth.checkRoleAnd(['admin', 'manager'])      // require ALL
await auth.checkRoleOr(['admin', 'user'])          // require ANY
```

### Kick / Replace Tokens ✅

```typescript
// Kick a specific token (marks as KICKED)
await auth.kickToken(tokenId)

// Replace a specific token (marks as REPLACED)
await auth.replaceToken(tokenId)

// Query token storage state
const tokenValue = await auth.getTokenValue(tokenId)
// { loginId, status, lastActiveTime }
```

### Token Status

| Constant | Value | Description |
|----------|-------|-------------|
| `NORMAL` | `1` | Active and valid |
| `INVALID` | `-1` | Invalidated via `logout` |
| `KICKED` | `-2` | Kicked off |
| `REPLACED` | `-3` | Replaced by a new login on the same account |

### Session Management 🔧

Each logged-in user has one Session. A Session holds multiple Terminal entries (one per device/token).

```typescript
// Get session for the current request
const session = auth.getSession()

// Get session by loginId (pass true to create if missing)
const session = await auth.getSessionByLoginId(loginId, true)

// Store and retrieve arbitrary data across requests
session.set('lastPage', '/dashboard')
const lastPage = session.get<string>('lastPage')
await session.save()

// Refresh session TTL
await session.renew()

// Get remaining TTL in seconds
const ttl = await session.getTimeout()

// Delete session (equivalent to logging out all devices)
await session.delete()
```

**Session data model:**

| Field | Type | Description |
|-------|------|-------------|
| `loginId` | `string \| number \| bigint` | User identifier |
| `loginType` | `string` | Login type (default `'login'`) |
| `createTime` | `number` | Creation time (Unix ms) |
| `terminalList` | `TerminalInfo[]` | All device/token entries for this account |
| `dataMap` | `Record<string, unknown>` | Custom data storage |

### Multi-Device Login

AuthCraft maps one user → one Session → multiple Terminals (one per device/token):

```
User (loginId)
  └── Session
        ├── Terminal { tokenId: "t1", deviceType: "web",    deviceId: "browser-a" }
        ├── Terminal { tokenId: "t2", deviceType: "mobile", deviceId: "phone-x"   }
        └── Terminal { tokenId: "t3", deviceType: "web",    deviceId: "browser-b" }
```

Configure limits:

```typescript
const auth = new AuthCraft({
  maxLoginCountPerType: 2,    // max 2 concurrent sessions per device type
  overflowAction: 'replace',  // replace oldest when exceeded (replace | kick | refuse)
})
```

### Session Query 🔧

```typescript
// List all active sessions (requires scan support in storage, e.g. Redis)
const sessions = await auth.getAllSessions()

// Query all terminals for a given loginId
const session = await auth.getSessionByLoginId(loginId)
const terminals = session?.terminalList ?? []
```

### Single Sign-On (SSO) ✅

Restrict each account to a single active session:

```typescript
const auth = new AuthCraft({
  maxLoginCount: 1,
  overflowAction: 'replace', // new login automatically replaces the old one
})
```

### Request Context

AuthCraft uses `AsyncLocalStorage` to isolate per-request state. Initialize once in middleware, then access anywhere in the request chain without passing parameters:

```typescript
import { AuthCraftContext } from 'authcraft'

app.use((req, res, next) => {
  AuthCraftContext.run(req, res, auth.config, next)
})

// Access from any route handler or service layer
const session = AuthCraftContext.getSession()
const tokenId = AuthCraftContext.getTokenId()
const payload = AuthCraftContext.getAuthPayload()
const status  = AuthCraftContext.getTokenStatus()
```

## Planned Features

The following features are on the roadmap. API design may evolve before release.

### Route-Level Auth Interceptor ⬜

Declaratively configure auth rules per route pattern, without inline checks in every handler:

```typescript
// Proposed API — not yet implemented
auth.protect('/api/admin/**', { roles: ['admin'] })
auth.protect('/api/user/**', { permissions: ['user:read'] })
app.use(auth.interceptor())
```

### Token Style Customization ⬜

Support multiple token generation styles:

- `uuid` (default): random UUID
- `random32`: 32-character random string
- `custom`: user-provided generator function

### Mutual Exclusion Login (Same Device Type) ⬜

Allow only one active session per `deviceType` (e.g., only one `'web'` session at a time). A new login on the same device type automatically kicks all prior sessions of that type.

### Remember Me Mode ⬜

Pass `rememberMe: true` at login to issue a token with a significantly longer TTL (e.g., 30 days vs default 2 hours).

### Secondary Authentication ⬜

Require users to complete a second verification step (password re-entry, SMS code, etc.) before performing sensitive operations. Successful verification issues a short-lived secondary token.

### Account Banning ⬜

Ban a `loginId` to immediately invalidate all its tokens and block future logins until unbanned.

### Session Event Listeners ⬜

Register hook functions that fire at key session lifecycle events:

```typescript
// Proposed API — not yet implemented
auth.on('login',   (loginId, terminal) => { /* user logged in  */ })
auth.on('logout',  (loginId, tokenId)  => { /* user logged out */ })
auth.on('kicked',  (loginId, tokenId)  => { /* token kicked    */ })
auth.on('expired', (loginId, tokenId)  => { /* token expired   */ })
```

### Impersonate Another Account ⬜

Allow administrators to act as a specific user without modifying that user's actual session, useful for support and operational debugging.

### Temporary Identity Switch ⬜

Temporarily switch the `loginId` in the current request context, reverting automatically after the request completes.

### Multi-Account System Login ⬜

Support multiple independent login systems within the same application (e.g., `user` vs `admin`), with fully isolated sessions, tokens, and permissions per system.

### Single Sign-Out ⬜

In SSO scenarios, logging out from any client automatically invalidates the user's session across all connected systems.

### OAuth2.0 Authentication ⬜

Built-in support for standard OAuth2.0 flows: Authorization Code, Client Credentials, and more.

### Temporary Token Authentication ⬜

Generate short-lived, single-use or limited-use tokens for scenarios like file download links and email verification.

## License

MIT
