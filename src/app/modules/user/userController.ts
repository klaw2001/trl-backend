import { Request, Response } from 'express'

import { notification_type, role_scope } from '@/generated/prisma/enums'
import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import {
    applyIfLimit,
    applyIfOffset,
    checkExists,
    likeIfValue,
    whereAnd,
    whereIfFlags,
    whereIfValue
} from '@core/helpers/prismaHelpers'
import {
    checkIfKeyExists,
    getDateOrNull,
    getHHmmTimeOrNull,
    getIntArray,
    getIntOrNull,
    getStringOrNull,
    getTrueOrFalse
} from '@core/helpers/commonHelpers'
import { checkEmail, checkMobile, checkPassword, normalizeMobile } from '@core/helpers/validationHelper'
import { generateOtp, hashPassword, randomToken } from '@core/securityService/CryptoClient'
import dataObjectBuilder from '@core/helpers/dataObjectBuilder'
import { audit } from '@core/services/AuditService'
import { notifyUsers } from '@core/services/NotificationService'
import { canViewOutlet, canViewUser, userScopeWhere } from '@/app/services/scopeService'
import { assignPathToUser } from '@/app/services/assignmentService'

const userInclude = {
    user_role_relation: { select: { role_id: true, role_name: true, role_key: true } },
    user_brand: { select: { brand_id: true, brand_name: true } },
    user_outlet: { select: { outlet_id: true, outlet_name: true, outlet_code: true } }
}

// Readable temporary password, e.g. "kq7mx4x2-481927"
function temporaryPassword() {
    return `${randomToken(4)}-${generateOtp(6)}`
}

async function bumpTokenVersion(user_id: number) {
    await prisma.users.update({ where: { user_id }, data: { user_token_version: { increment: 1 } } })
}

export async function getAllUsers(req: Request, res: Response) {
    try {
        const { search, status, archived, deleted, limit, offset, role_id, brand_id, outlet_id } = req.query

        const options: any = {}

        whereIfFlags(options, 'user', { status, archived, deleted })
        whereAnd(options, userScopeWhere(req.userInfo!))
        whereIfValue(options, 'user_role_id', role_id, getIntOrNull)
        whereIfValue(options, 'user_brand_id', brand_id, getIntOrNull)
        whereIfValue(options, 'user_outlet_id', outlet_id, getIntOrNull)

        likeIfValue(
            options,
            [['user_first_name', 'user_last_name'], 'user_employee_id', 'user_mobile', 'user_email'],
            search
        )

        const count = await prisma.users.count(options)

        applyIfLimit(options, limit)

        applyIfOffset(options, offset)

        const users = await prisma.users.findMany({
            omit: { user_password: true },
            include: userInclude,
            orderBy: { user_created_at: 'desc' },
            ...options
        })

        const data = {
            total: count,
            rows: users
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllUsers', error)
        return sendResponse(res, false, null, 'Error in getting all users', statusType.DB_ERROR)
    }
}

export async function getSingleUser(req: Request, res: Response) {
    try {
        const user_id = getIntOrNull(req.params.user_id)

        if (!user_id || !(await canViewUser(req.userInfo!, user_id))) {
            return sendResponse(res, false, null, 'User not found', statusType.NOT_FOUND)
        }

        const data = await prisma.users.findUnique({
            omit: { user_password: true },
            where: { user_id },
            include: {
                ...userInclude,
                user_manager: { select: { user_id: true, user_first_name: true, user_last_name: true } },
                user_path: { select: { tp_id: true, tp_name: true } },
                transfers: {
                    include: {
                        ut_from_outlet: { select: { outlet_name: true } },
                        ut_to_outlet: { select: { outlet_name: true } },
                        ut_created_by: { select: { user_first_name: true, user_last_name: true } }
                    },
                    orderBy: { ut_created_at: 'desc' }
                }
            }
        })

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getSingleUser', error)
        return sendResponse(res, false, null, 'Error getting single user', statusType.DB_ERROR)
    }
}

export async function saveUser(req: Request, res: Response) {
    try {
        const viewer = req.userInfo!
        const user_id = getIntOrNull(req.body.user_id)

        const data: any = dataObjectBuilder(req.body)
            .addIfValueExists('user_employee_id', getStringOrNull)
            .addIfValueExists('user_first_name', getStringOrNull)
            .addIfValueExists('user_last_name', getStringOrNull)
            .addIfValueExists('user_email', (val) => getStringOrNull(val)?.toLowerCase() || null)
            .addIfValueExists('user_mobile', normalizeMobile)
            .addIfValueExists('user_role_id', getIntOrNull)
            .addIfValueExists('user_outlet_id', getIntOrNull)
            .addIfValueExists('user_brand_id', getIntOrNull)
            .addIfValueExists('user_designation', getStringOrNull)
            .addIfValueExists('user_manager_id', getIntOrNull)
            .addIfValueExists('user_joining_date', getDateOrNull)
            .addIfValueExists('user_language', getStringOrNull)
            .addIfValueExists('user_path_id', getIntOrNull)
            .addIfValueExists('user_path_deadline', getDateOrNull)
            .addIfValueExists('user_shift_start', getHHmmTimeOrNull)
            .addIfValueExists('user_shift_end', getHHmmTimeOrNull)
            .addIfValueExists('user_shift_days', (val) => getIntArray(val).filter((d) => d >= 1 && d <= 7))
            .addIfValueExists('user_shift_exempt', getTrueOrFalse)
            .addIfValueExists('user_access_expires_at', getDateOrNull)
            .getDataObject()

        if (data.user_mobile !== undefined && !checkMobile(data.user_mobile)) {
            return sendResponse(res, false, null, 'Enter a valid 10 digit mobile number', statusType.BAD_REQUEST)
        }

        if (data.user_email && !checkEmail(data.user_email)) {
            return sendResponse(res, false, null, 'Enter a valid email', statusType.BAD_REQUEST)
        }

        if (Boolean(data.user_shift_start) !== Boolean(data.user_shift_end)) {
            return sendResponse(res, false, null, 'Shift needs both start and end time', statusType.BAD_REQUEST)
        }

        if (user_id && !(await canViewUser(viewer, user_id))) {
            return sendResponse(res, false, null, 'User not found', statusType.NOT_FOUND)
        }

        if (user_id === viewer.user_id && data.user_role_id && data.user_role_id !== viewer.user_role_id) {
            return sendResponse(res, false, null, 'You cannot change your own role', statusType.FORBIDDEN)
        }

        if (data.user_role_id) {
            const role = await prisma.roles.findFirst({ where: { role_id: data.user_role_id, role_deleted: false } })

            if (!role) {
                return sendResponse(res, false, null, 'Role not found', statusType.BAD_REQUEST)
            }

            // Only global admins can grant global roles
            if (role.role_scope === role_scope.all && viewer.user_role_relation.role_scope !== role_scope.all) {
                return sendResponse(res, false, null, 'You cannot assign this role', statusType.FORBIDDEN)
            }
        }

        // Brand follows the outlet
        if (data.user_outlet_id) {
            if (!(await canViewOutlet(viewer, data.user_outlet_id))) {
                return sendResponse(res, false, null, 'Outlet not found', statusType.BAD_REQUEST)
            }

            const outlet = await prisma.outlets.findUniqueOrThrow({ where: { outlet_id: data.user_outlet_id } })
            data.user_brand_id = outlet.outlet_brand_id
        }

        const exists = await checkExists(
            'users',
            'user',
            user_id,
            ['user_employee_id', 'user_mobile', 'user_email'],
            [data.user_employee_id, data.user_mobile, data.user_email]
        )

        if (exists.data) {
            return sendResponse(res, false, null, exists.message, statusType.CONFLICT)
        }

        let temp_password: string | null = null
        const password = getStringOrNull(req.body.user_password)

        if (password && !checkPassword(password)) {
            return sendResponse(
                res,
                false,
                null,
                'Password must be at least 8 characters with a letter and a number',
                statusType.BAD_REQUEST
            )
        }

        let saved_user_id: number
        let pathChanged = false

        if (user_id) {
            const previous = await prisma.users.findUniqueOrThrow({ where: { user_id } })

            data.user_updated_by = String(viewer.user_id)

            await prisma.users.update({ where: { user_id }, data })

            if (data.user_outlet_id !== undefined && data.user_outlet_id !== previous.user_outlet_id) {
                await prisma.user_transfers.create({
                    data: {
                        ut_user_id: user_id,
                        ut_from_outlet_id: previous.user_outlet_id,
                        ut_to_outlet_id: data.user_outlet_id,
                        ut_note: 'Updated from user profile',
                        ut_created_by_id: viewer.user_id
                    }
                })
            }

            pathChanged = Boolean(data.user_path_id) && data.user_path_id !== previous.user_path_id
            saved_user_id = user_id
        } else {
            if (
                !checkIfKeyExists(
                    ['user_employee_id', 'user_mobile', 'user_first_name', 'user_last_name', 'user_role_id'],
                    data
                ) ||
                !data.user_employee_id ||
                !data.user_first_name ||
                !data.user_role_id
            ) {
                return sendResponse(
                    res,
                    false,
                    null,
                    'Employee ID, first name, last name, mobile and role are required',
                    statusType.BAD_REQUEST
                )
            }

            temp_password = password ? null : temporaryPassword()

            const created = await prisma.users.create({
                data: {
                    ...data,
                    user_password: hashPassword(password || (temp_password as string)),
                    user_must_change_password: true,
                    user_created_by: String(viewer.user_id)
                }
            })

            await notifyUsers([created.user_id], {
                type: notification_type.account,
                title: 'Welcome to the training portal',
                message: 'Your account has been created. Complete your assigned training before the deadlines.',
                link: '/my-training'
            })

            pathChanged = Boolean(data.user_path_id)
            saved_user_id = created.user_id
        }

        let assigned = 0
        if (pathChanged) {
            assigned = await assignPathToUser(
                saved_user_id,
                data.user_path_id,
                data.user_path_deadline || null,
                viewer.user_id,
                String(viewer.user_id)
            )
        }

        await audit(req, user_id ? 'update' : 'create', 'user', saved_user_id, {
            fields: Object.keys(data),
            assigned_modules: assigned
        })

        return sendResponse(res, true, { user_id: saved_user_id, temp_password, assigned_modules: assigned }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in saveUser', error)
        return sendResponse(res, false, null, 'Error saving user', statusType.DB_ERROR)
    }
}

export async function transferUser(req: Request, res: Response) {
    try {
        const viewer = req.userInfo!
        const user_id = getIntOrNull(req.body.user_id)
        const outlet_id = getIntOrNull(req.body.outlet_id)

        if (!user_id || !outlet_id) {
            return sendResponse(res, false, null, 'user_id and outlet_id are required', statusType.BAD_REQUEST)
        }

        if (!(await canViewUser(viewer, user_id)) || !(await canViewOutlet(viewer, outlet_id))) {
            return sendResponse(res, false, null, 'User or outlet not found', statusType.NOT_FOUND)
        }

        const user = await prisma.users.findUniqueOrThrow({ where: { user_id } })
        const outlet = await prisma.outlets.findUniqueOrThrow({ where: { outlet_id } })

        if (user.user_outlet_id === outlet_id) {
            return sendResponse(res, false, null, 'User already belongs to this outlet', statusType.BAD_REQUEST)
        }

        const manager_id = getIntOrNull(req.body.user_manager_id)

        await prisma.$transaction([
            prisma.users.update({
                where: { user_id },
                data: {
                    user_outlet_id: outlet_id,
                    user_brand_id: outlet.outlet_brand_id,
                    ...(manager_id !== null ? { user_manager_id: manager_id } : {}),
                    user_updated_by: String(viewer.user_id)
                }
            }),
            prisma.user_transfers.create({
                data: {
                    ut_user_id: user_id,
                    ut_from_outlet_id: user.user_outlet_id,
                    ut_to_outlet_id: outlet_id,
                    ut_note: getStringOrNull(req.body.note),
                    ut_created_by_id: viewer.user_id
                }
            })
        ])

        await audit(req, 'transfer', 'user', user_id, { from: user.user_outlet_id, to: outlet_id })

        return sendResponse(res, true, null, 'User transferred')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in transferUser', error)
        return sendResponse(res, false, null, 'Error transferring user', statusType.DB_ERROR)
    }
}

// Removes access immediately: every issued token stops working on the next request
export async function deactivateUser(req: Request, res: Response) {
    try {
        const viewer = req.userInfo!
        const user_id = getIntOrNull(req.body.user_id)

        if (!user_id || !(await canViewUser(viewer, user_id))) {
            return sendResponse(res, false, null, 'User not found', statusType.NOT_FOUND)
        }

        if (user_id === viewer.user_id) {
            return sendResponse(res, false, null, 'You cannot deactivate yourself', statusType.BAD_REQUEST)
        }

        const reason = getStringOrNull(req.body.reason)

        await prisma.users.update({
            where: { user_id },
            data: {
                user_status: false,
                user_deactivated_at: new Date(),
                user_deactivation_reason: reason,
                user_token_version: { increment: 1 },
                user_updated_by: String(viewer.user_id)
            }
        })

        await audit(req, 'deactivate', 'user', user_id, { reason })

        return sendResponse(res, true, null, 'Access removed')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in deactivateUser', error)
        return sendResponse(res, false, null, 'Error deactivating user', statusType.DB_ERROR)
    }
}

export async function reactivateUser(req: Request, res: Response) {
    try {
        const viewer = req.userInfo!
        const user_id = getIntOrNull(req.body.user_id)

        if (!user_id || !(await canViewUser(viewer, user_id))) {
            return sendResponse(res, false, null, 'User not found', statusType.NOT_FOUND)
        }

        await prisma.users.update({
            where: { user_id },
            data: {
                user_status: true,
                user_deactivated_at: null,
                user_deactivation_reason: null,
                user_failed_login_count: 0,
                user_locked_until: null,
                user_updated_by: String(viewer.user_id)
            }
        })

        await audit(req, 'reactivate', 'user', user_id)

        return sendResponse(res, true, null, 'Access restored')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in reactivateUser', error)
        return sendResponse(res, false, null, 'Error reactivating user', statusType.DB_ERROR)
    }
}

export async function forceLogout(req: Request, res: Response) {
    try {
        const user_ids = getIntArray(req.body.user_ids ?? req.body.user_id)
        const allowed: number[] = []

        for (const user_id of user_ids) {
            if (await canViewUser(req.userInfo!, user_id)) {
                allowed.push(user_id)
            }
        }

        if (!allowed.length) {
            return sendResponse(res, false, null, 'User not found', statusType.NOT_FOUND)
        }

        await prisma.users.updateMany({
            where: { user_id: { in: allowed } },
            data: { user_token_version: { increment: 1 } }
        })

        for (const user_id of allowed) {
            await audit(req, 'force_logout', 'user', user_id)
        }

        return sendResponse(res, true, { count: allowed.length }, 'Sessions ended')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in forceLogout', error)
        return sendResponse(res, false, null, 'Error ending sessions', statusType.DB_ERROR)
    }
}

export async function resetUserPassword(req: Request, res: Response) {
    try {
        const user_id = getIntOrNull(req.body.user_id)

        if (!user_id || !(await canViewUser(req.userInfo!, user_id))) {
            return sendResponse(res, false, null, 'User not found', statusType.NOT_FOUND)
        }

        const password = getStringOrNull(req.body.password)

        if (password && !checkPassword(password)) {
            return sendResponse(
                res,
                false,
                null,
                'Password must be at least 8 characters with a letter and a number',
                statusType.BAD_REQUEST
            )
        }

        const temp_password = password ? null : temporaryPassword()

        await prisma.users.update({
            where: { user_id },
            data: {
                user_password: hashPassword(password || (temp_password as string)),
                user_must_change_password: true,
                user_failed_login_count: 0,
                user_locked_until: null,
                user_updated_by: String(req.userInfo!.user_id)
            }
        })
        await bumpTokenVersion(user_id)

        await audit(req, 'reset_password', 'user', user_id)

        return sendResponse(res, true, { temp_password }, 'Password reset')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in resetUserPassword', error)
        return sendResponse(res, false, null, 'Error resetting password', statusType.DB_ERROR)
    }
}
