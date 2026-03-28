/**
 * 没有找到上下文
 */
export const ERROR_NO_CONTEXT = new Error('No context available')

/**
 * 没有找到session
 */
export const ERROR_NO_SESSION = new Error('No session available')

/**
 * AuthCraft: jwtSecret 未配置，无法颁发 token
 */
export const ERROR_JWT_SECRET_NOT_CONFIGURED = new Error(
  'AuthCraft: jwtSecret 未配置，无法颁发 token',
)

/**
 * 未登录
 */
export const ERROR_NOT_LOGIN = new Error('NOT_LOGIN: 未登录')

/**
 * 缺少权限
 */
export const ERROR_PERMISSION_DENIED = (permission: string | string[]) =>
  new Error(`PERMISSION_DENIED: 缺少权限 [${Array.isArray(permission) ? permission.join(', ') : permission}]`)

/**
 * 缺少角色
 */
export const ERROR_ROLE_DENIED = (role: string | string[]) =>
  new Error(`ROLE_DENIED: 缺少角色 [${Array.isArray(role) ? role.join(', ') : role}]`)

/**
 * getPermissionList 未配置
 */
export const ERROR_PERMISSION_NOT_CONFIGURED = new Error('AuthCraft: getPermissionList 未配置')

/**
 * getRoleList 未配置
 */
export const ERROR_ROLE_NOT_CONFIGURED = new Error('AuthCraft: getRoleList 未配置')

/**
 * 登录设备数量超限，拒绝登录
 */
export const ERROR_LOGIN_REFUSED = new Error('LOGIN_REFUSED: 已达到设备登录数量上限，登录被拒绝')
