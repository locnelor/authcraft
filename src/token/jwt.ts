import type { AuthCraftOptions, LoginId } from '../interfaces'
import type { AuthCraftJwtPayload, VerifyTokenResult } from './types'
import { jwtVerify, SignJWT } from 'jose'
import { JOSEError, JWTExpired, JWTInvalid } from 'jose/errors'
import { ERROR_JWT_SECRET_NOT_CONFIGURED } from '../constants/error'
import { AuthCraftContext } from '../context/AuthContext'

const ALG = 'HS256'

function encodeSecret(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

function generateRnStr(): string {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 32)
}

/**
 * 颁发 JWT
 */
export const signToken = async (
  tokenId: string,
): Promise<string> => {
  const config = AuthCraftContext.getConfig()
  const secret = config.jwtSecret
  if (!secret) throw ERROR_JWT_SECRET_NOT_CONFIGURED

  const payload: AuthCraftJwtPayload = {
    tokenId,
    loginType: 'login',
    rnStr: generateRnStr(),
  }

  const builder = new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setJti(crypto.randomUUID())

  if (config.expire > 0) {
    builder.setExpirationTime(`${config.expire}s`)
  }
  return await builder.sign(encodeSecret(secret))
}

/**
 * 验证并解析 JWT
 *
 * @param token   JWT 字符串
 * @param options 模块配置
 * @returns 解析成功返回 VerifyTokenResult，失败返回 null
 */
export const verifyToken = async <T extends Record<string, unknown> = Record<string, never>>(
  token: string,
  options: AuthCraftOptions,
): Promise<VerifyTokenResult | null> => {
  const secret = options.jwtSecret
  if (!secret) {
    return null
  }

  try {
    const { payload, protectedHeader } = await jwtVerify<AuthCraftJwtPayload>(
      token,
      encodeSecret(secret),
      { algorithms: [ALG] },
    )

    return {
      payload,
      alg: protectedHeader.alg,
    }
  } catch (err) {
    if (err instanceof JWTExpired || err instanceof JWTInvalid || err instanceof JOSEError) {
      return null
    }
    throw err
  }
}
