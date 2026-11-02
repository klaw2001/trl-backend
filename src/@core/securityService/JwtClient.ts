import jwt, { SignOptions } from 'jsonwebtoken'

import logger from '@core/services/LoggingService'

export interface TokenPayload {
    user_id: number
    token_version: number
}

export interface ResetTokenPayload {
    user_id: number
    purpose: 'password_reset'
}

function sign(payload: object, secret: string | undefined, expiresIn: string | undefined) {
    if (!secret || !expiresIn) {
        throw new Error('JWT secret or expiry not defined in env')
    }

    return jwt.sign({ data: payload }, secret, { expiresIn } as SignOptions)
}

function verify<T>(token: string, secret: string | undefined): T | null {
    if (!secret) {
        throw new Error('JWT secret not defined in env')
    }

    const decoded = jwt.verify(token, secret)

    if (!decoded || typeof decoded !== 'object' || !decoded.data) {
        return null
    }

    return decoded.data as T
}

export function jwtRefreshTokenEncode(payload: TokenPayload) {
    try {
        return sign(payload, process.env.JWT_REFRESH_SECRET, process.env.JWT_REFRESH_TOKEN_EXPIRE)
    } catch (error) {
        logger.consoleErrorLog('core', 'Error in jwtRefreshTokenEncode', error)
        return null
    }
}

export function jwtRefreshTokenVerify(token: string) {
    try {
        return verify<TokenPayload>(token, process.env.JWT_REFRESH_SECRET)
    } catch (error) {
        return null
    }
}

export function jwtAccessTokenEncode(payload: TokenPayload) {
    try {
        return sign(payload, process.env.JWT_ACCESS_SECRET, process.env.JWT_ACCESS_TOKEN_EXPIRE)
    } catch (error) {
        logger.consoleErrorLog('core', 'Error in jwtAccessTokenEncode', error)
        return null
    }
}

export function jwtAccessTokenVerify(token: string) {
    try {
        return verify<TokenPayload>(token, process.env.JWT_ACCESS_SECRET)
    } catch (error) {
        return null
    }
}

// Short lived token issued after OTP verification, exchanged for a new password
export function jwtResetTokenEncode(payload: ResetTokenPayload) {
    try {
        return sign(payload, process.env.JWT_ACCESS_SECRET, '15m')
    } catch (error) {
        logger.consoleErrorLog('core', 'Error in jwtResetTokenEncode', error)
        return null
    }
}

export function jwtResetTokenVerify(token: string) {
    try {
        const data = verify<ResetTokenPayload>(token, process.env.JWT_ACCESS_SECRET)
        return data && data.purpose === 'password_reset' ? data : null
    } catch (error) {
        return null
    }
}

export function jwtDecode(token: string) {
    try {
        return jwt.decode(token)
    } catch (error) {
        logger.consoleErrorLog('core', 'Error in jwtDecode', error)
        return null
    }
}
