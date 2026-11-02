import { Request, Response } from 'express'

import { otp_purpose } from '@/generated/prisma/enums'
import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import errorCodes from '@core/enum/errorCodes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import { checkPassword, normalizeMobile, validateLogin } from '@core/helpers/validationHelper'
import { getStringOrNull } from '@core/helpers/commonHelpers'
import { generateOtp, hash, hashPassword, verifyPassword } from '@core/securityService/CryptoClient'
import {
    jwtAccessTokenEncode,
    jwtRefreshTokenEncode,
    jwtRefreshTokenVerify,
    jwtResetTokenEncode,
    jwtResetTokenVerify
} from '@core/securityService/JwtClient'
import { sendSms } from '@core/services/SmsService'
import { sendMail } from '@core/helpers/mailHelpers'
import { audit } from '@core/services/AuditService'
import { loadActiveUser } from '@/app/middlewares/authMiddleware'

const MAX_OTP_ATTEMPTS = 5

// Finds a user by employee id, mobile or email
function findUserByIdentifier(identifier: string) {
    const value = identifier.trim()
    const mobile = normalizeMobile(value)

    return prisma.users.findFirst({
        where: {
            user_deleted: false,
            OR: [
                { user_employee_id: { equals: value, mode: 'insensitive' } },
                { user_email: { equals: value, mode: 'insensitive' } },
                ...(mobile ? [{ user_mobile: mobile }] : [])
            ]
        }
    })
}

function issueTokens(user_id: number, token_version: number) {
    const payload = { user_id, token_version }

    return {
        access_token: jwtAccessTokenEncode(payload),
        refresh_token: jwtRefreshTokenEncode(payload)
    }
}

function maskMobile(mobile: string) {
    return mobile.length > 4 ? `${'*'.repeat(mobile.length - 4)}${mobile.slice(-4)}` : mobile
}

export async function login(req: Request, res: Response) {
    try {
        const body = {
            identifier: req.body.identifier,
            password: req.body.password
        }

        if (!validateLogin(body)) {
            return sendResponse(res, false, null, 'Fields validation failed!', statusType.BAD_REQUEST)
        }

        const user = await findUserByIdentifier(body.identifier)

        if (!user) {
            return sendResponse(res, false, null, 'Invalid credentials', statusType.UNAUTHORIZED)
        }

        if (!user.user_status || (user.user_access_expires_at && user.user_access_expires_at < new Date())) {
            return sendResponse(
                res,
                false,
                { code: errorCodes.ACCOUNT_DISABLED },
                'Your access has been disabled. Please contact your manager.',
                statusType.UNAUTHORIZED
            )
        }

        if (user.user_locked_until && user.user_locked_until > new Date()) {
            return sendResponse(
                res,
                false,
                { code: errorCodes.ACCOUNT_LOCKED, locked_until: user.user_locked_until },
                'Too many failed attempts. Try again later or reset your password.',
                statusType.UNAUTHORIZED
            )
        }

        if (!verifyPassword(body.password, user.user_password)) {
            const maxAttempts = Number(process.env.LOGIN_MAX_ATTEMPTS || 5)
            const failed = user.user_failed_login_count + 1
            const lock = failed >= maxAttempts

            await prisma.users.update({
                where: { user_id: user.user_id },
                data: {
                    user_failed_login_count: lock ? 0 : failed,
                    user_locked_until: lock
                        ? new Date(Date.now() + Number(process.env.LOGIN_LOCK_MINUTES || 15) * 60 * 1000)
                        : undefined
                }
            })

            return sendResponse(res, false, null, 'Invalid credentials', statusType.UNAUTHORIZED)
        }

        await prisma.users.update({
            where: { user_id: user.user_id },
            data: { user_failed_login_count: 0, user_locked_until: null, user_last_login_at: new Date() }
        })

        await audit(req, 'login', 'user', user.user_id, undefined, user.user_id)

        const data = {
            ...issueTokens(user.user_id, user.user_token_version),
            must_change_password: user.user_must_change_password
        }

        return sendResponse(res, true, data, 'Login Successful')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in login', error)
        return sendResponse(res, false, null, 'Error in login', statusType.DB_ERROR)
    }
}

export async function getAccessToken(req: Request, res: Response) {
    try {
        const refreshToken = req.body.refresh_token

        if (!refreshToken || typeof refreshToken !== 'string') {
            return sendResponse(res, false, null, 'refresh token not provided', statusType.BAD_REQUEST)
        }

        const decoded = jwtRefreshTokenVerify(refreshToken)

        if (!decoded) {
            return sendResponse(
                res,
                false,
                { code: errorCodes.TOKEN_INVALID },
                'Session expired, please login again',
                statusType.UNAUTHORIZED
            )
        }

        const { user, code } = await loadActiveUser(decoded.user_id, decoded.token_version)

        if (!user) {
            return sendResponse(res, false, { code }, 'Session ended, please login again', statusType.UNAUTHORIZED)
        }

        const accessToken = jwtAccessTokenEncode({ user_id: user.user_id, token_version: user.user_token_version })

        return sendResponse(res, true, { access_token: accessToken }, 'Access Token')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAccessToken', error)
        return sendResponse(res, false, null, 'Error in getting access token', statusType.DB_ERROR)
    }
}

// Invalidates every token of the user
export async function logout(req: Request, res: Response) {
    try {
        const { user_id } = req.userInfo!

        await prisma.users.update({
            where: { user_id },
            data: { user_token_version: { increment: 1 } }
        })

        await audit(req, 'logout', 'user', user_id)

        return sendResponse(res, true, null, 'Logged out')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in logout', error)
        return sendResponse(res, false, null, 'Error in logout', statusType.DB_ERROR)
    }
}

export async function requestOtp(req: Request, res: Response) {
    try {
        const identifier = getStringOrNull(req.body.identifier)

        if (!identifier) {
            return sendResponse(res, false, null, 'Employee ID, mobile or email is required', statusType.BAD_REQUEST)
        }

        const user = await findUserByIdentifier(identifier)

        // Same response whether or not the account exists
        const genericMessage = 'If the account exists, an OTP has been sent to the registered mobile and email'

        if (!user || !user.user_status) {
            return sendResponse(res, true, null, genericMessage)
        }

        const otp = generateOtp()
        const expiresMinutes = Number(process.env.OTP_EXPIRE_MINUTES || 10)

        await prisma.otp_codes.updateMany({
            where: { otp_user_id: user.user_id, otp_purpose: otp_purpose.password_reset, otp_consumed_at: null },
            data: { otp_consumed_at: new Date() }
        })

        await prisma.otp_codes.create({
            data: {
                otp_user_id: user.user_id,
                otp_purpose: otp_purpose.password_reset,
                otp_code_hash: hash(`${user.user_id}:${otp}`),
                otp_expires_at: new Date(Date.now() + expiresMinutes * 60 * 1000)
            }
        })

        const message = `${otp} is your OTP to reset your training portal password. Valid for ${expiresMinutes} minutes.`

        await sendSms(user.user_mobile, message)

        if (user.user_email) {
            await sendMail({ to: user.user_email, subject: 'Password reset OTP', body: `<p>${message}</p>` })
        }

        return sendResponse(res, true, { sent_to: maskMobile(user.user_mobile) }, genericMessage)
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in requestOtp', error)
        return sendResponse(res, false, null, 'Error in sending OTP', statusType.DB_ERROR)
    }
}

export async function verifyOtp(req: Request, res: Response) {
    try {
        const identifier = getStringOrNull(req.body.identifier)
        const otp = getStringOrNull(req.body.otp)

        if (!identifier || !otp) {
            return sendResponse(res, false, null, 'Identifier and OTP are required', statusType.BAD_REQUEST)
        }

        const user = await findUserByIdentifier(identifier)

        const otpRow = user
            ? await prisma.otp_codes.findFirst({
                  where: {
                      otp_user_id: user.user_id,
                      otp_purpose: otp_purpose.password_reset,
                      otp_consumed_at: null,
                      otp_expires_at: { gt: new Date() }
                  },
                  orderBy: { otp_id: 'desc' }
              })
            : null

        if (!user || !otpRow || otpRow.otp_attempts >= MAX_OTP_ATTEMPTS) {
            return sendResponse(res, false, null, 'OTP expired or invalid, please request a new one')
        }

        if (otpRow.otp_code_hash !== hash(`${user.user_id}:${otp}`)) {
            await prisma.otp_codes.update({
                where: { otp_id: otpRow.otp_id },
                data: { otp_attempts: { increment: 1 } }
            })
            return sendResponse(res, false, null, 'Incorrect OTP')
        }

        await prisma.otp_codes.update({ where: { otp_id: otpRow.otp_id }, data: { otp_consumed_at: new Date() } })

        const resetToken = jwtResetTokenEncode({ user_id: user.user_id, purpose: 'password_reset' })

        return sendResponse(res, true, { reset_token: resetToken }, 'OTP verified')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in verifyOtp', error)
        return sendResponse(res, false, null, 'Error in verifying OTP', statusType.DB_ERROR)
    }
}

export async function resetPassword(req: Request, res: Response) {
    try {
        const decoded = jwtResetTokenVerify(req.body.reset_token || '')

        if (!decoded) {
            return sendResponse(
                res,
                false,
                null,
                'Reset link expired, please verify OTP again',
                statusType.UNAUTHORIZED
            )
        }

        if (!checkPassword(req.body.password)) {
            return sendResponse(
                res,
                false,
                null,
                'Password must be at least 8 characters with a letter and a number',
                statusType.BAD_REQUEST
            )
        }

        await prisma.users.update({
            where: { user_id: decoded.user_id },
            data: {
                user_password: hashPassword(req.body.password),
                user_must_change_password: false,
                user_failed_login_count: 0,
                user_locked_until: null,
                user_token_version: { increment: 1 }
            }
        })

        await audit(req, 'password_reset', 'user', decoded.user_id, undefined, decoded.user_id)

        return sendResponse(res, true, null, 'Password updated, please login')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in resetPassword', error)
        return sendResponse(res, false, null, 'Error in resetting password', statusType.DB_ERROR)
    }
}

export async function changePassword(req: Request, res: Response) {
    try {
        const { user_id } = req.userInfo!
        const { current_password, new_password } = req.body

        if (!checkPassword(new_password)) {
            return sendResponse(
                res,
                false,
                null,
                'Password must be at least 8 characters with a letter and a number',
                statusType.BAD_REQUEST
            )
        }

        const user = await prisma.users.findUniqueOrThrow({ where: { user_id } })

        if (!verifyPassword(current_password || '', user.user_password)) {
            return sendResponse(res, false, null, 'Current password is incorrect', statusType.BAD_REQUEST)
        }

        if (verifyPassword(new_password, user.user_password)) {
            return sendResponse(res, false, null, 'New password must be different', statusType.BAD_REQUEST)
        }

        const updated = await prisma.users.update({
            where: { user_id },
            data: {
                user_password: hashPassword(new_password),
                user_must_change_password: false,
                user_token_version: { increment: 1 }
            }
        })

        await audit(req, 'password_change', 'user', user_id)

        return sendResponse(res, true, issueTokens(user_id, updated.user_token_version), 'Password changed')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in changePassword', error)
        return sendResponse(res, false, null, 'Error in changing password', statusType.DB_ERROR)
    }
}
