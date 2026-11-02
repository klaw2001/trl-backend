import { Request, Response, NextFunction } from 'express'

import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import errorCodes from '@core/enum/errorCodes'
import prisma from '@core/helpers/prisma'
import { jwtAccessTokenVerify } from '@core/securityService/JwtClient'
import logger from '@core/services/LoggingService'

// Routes still reachable while the user must change a temporary password
const PASSWORD_CHANGE_ALLOWED = ['/api/master/user-profile', '/api/auth/change-password', '/api/auth/logout']

export function getBearerToken(req: Request) {
    const { authorization } = req.headers

    if (!authorization || typeof authorization !== 'string') {
        return null
    }

    return authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization
}

// Loads an active user for a token payload; null when access was revoked in the meantime
export async function loadActiveUser(user_id: number, token_version: number) {
    const user = await prisma.users.findUnique({
        omit: { user_password: true },
        where: { user_id },
        include: { user_role_relation: true, user_outlet: true }
    })

    if (!user || user.user_deleted || !user.user_status || !user.user_role_relation.role_status) {
        return { user: null, code: errorCodes.ACCOUNT_DISABLED }
    }

    if (user.user_access_expires_at && user.user_access_expires_at < new Date()) {
        return { user: null, code: errorCodes.ACCOUNT_DISABLED }
    }

    if (user.user_token_version !== token_version) {
        return { user: null, code: errorCodes.SESSION_REVOKED }
    }

    return { user, code: null }
}

export default async function authMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        const token = getBearerToken(req)

        if (!token) {
            return sendResponse(
                res,
                false,
                { code: errorCodes.TOKEN_MISSING },
                'No authorization Token Provided',
                statusType.UNAUTHORIZED
            )
        }

        const decoded = jwtAccessTokenVerify(token)

        if (!decoded) {
            return sendResponse(
                res,
                false,
                { code: errorCodes.TOKEN_INVALID },
                'Token Invalid',
                statusType.UNAUTHORIZED
            )
        }

        const { user, code } = await loadActiveUser(decoded.user_id, decoded.token_version)

        if (!user) {
            const message =
                code === errorCodes.SESSION_REVOKED ? 'Session ended, please login again' : 'Access disabled'
            return sendResponse(res, false, { code }, message, statusType.UNAUTHORIZED)
        }

        if (user.user_must_change_password && !PASSWORD_CHANGE_ALLOWED.includes(req.originalUrl.split('?')[0])) {
            return sendResponse(
                res,
                false,
                { code: errorCodes.PASSWORD_CHANGE_REQUIRED },
                'Please change your password to continue',
                statusType.FORBIDDEN
            )
        }

        req.userInfo = user

        return next()
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in authMiddleware', error)
        return sendResponse(res, false, null, 'Error in validating token', statusType.INTERNAL_SERVER_ERROR)
    }
}
