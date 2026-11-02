import { Request, Response } from 'express'

import { category_type } from '@/generated/prisma/enums'
import { sendResponse } from '@core/services/ResponseService'
import prisma from '@core/helpers/prisma'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import { getEnumOrNull, getIntOrNull } from '@core/helpers/commonHelpers'
import { likeIfValue, whereAnd, whereIfValue } from '@core/helpers/prismaHelpers'
import { getShiftAccess } from '@/app/services/shiftService'
import { outletScopeWhere, userScopeWhere } from '@/app/services/scopeService'

export async function getUserProfile(req: Request, res: Response) {
    try {
        const { user_id } = req.userInfo!

        const user = await prisma.users.findUniqueOrThrow({
            omit: { user_password: true },
            where: { user_id },
            include: {
                user_role_relation: {
                    select: { role_id: true, role_key: true, role_name: true, role_scope: true }
                },
                user_brand: { select: { brand_id: true, brand_name: true } },
                user_outlet: { select: { outlet_id: true, outlet_name: true, outlet_timezone: true } },
                user_manager: { select: { user_id: true, user_first_name: true, user_last_name: true } }
            }
        })

        const modules = await prisma.sys_module.findMany({
            select: {
                module_key: true,
                module_name: true,
                module_role_map: {
                    select: { mrm_read: true, mrm_write: true },
                    where: { mrm_role_id: user.user_role_id, mrm_status: true, mrm_deleted: false, mrm_archived: false }
                }
            },
            where: { module_status: true, module_deleted: false }
        })

        const access_map = modules.map((m) => ({
            module_key: m.module_key,
            module_name: m.module_name,
            read: m.module_role_map.some((r) => r.mrm_read),
            write: m.module_role_map.some((r) => r.mrm_write)
        }))

        const unread_notifications = await prisma.notifications.count({
            where: { ntf_user_id: user_id, ntf_read_at: null }
        })

        const data = {
            user,
            access_map,
            shift: getShiftAccess(req.userInfo!),
            unread_notifications
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getUserProfile', error)
        return sendResponse(res, false, null, 'Error ', statusType.DB_ERROR)
    }
}

// Active users the viewer may see, for pickers (manager, franchisee, assignment targets)
export async function getAllUsers(req: Request, res: Response) {
    try {
        const { search, role_id, outlet_id, brand_id } = req.query

        const options: any = { where: { user_status: true, user_deleted: false } }

        whereAnd(options, userScopeWhere(req.userInfo!))
        likeIfValue(options, [['user_first_name', 'user_last_name'], 'user_employee_id', 'user_mobile'], search)

        whereIfValue(options, 'user_role_id', role_id, getIntOrNull)
        whereIfValue(options, 'user_outlet_id', outlet_id, getIntOrNull)
        whereIfValue(options, 'user_brand_id', brand_id, getIntOrNull)

        const data = await prisma.users.findMany({
            select: {
                user_id: true,
                user_employee_id: true,
                user_first_name: true,
                user_last_name: true,
                user_role_id: true,
                user_outlet_id: true,
                user_brand_id: true
            },
            ...options,
            orderBy: { user_first_name: 'asc' },
            take: 200
        })

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllUsers', error)
        return sendResponse(res, false, null, 'Error in getting users', statusType.DB_ERROR)
    }
}

export async function getAllActiveRoles(req: Request, res: Response) {
    try {
        const data = await prisma.roles.findMany({
            select: {
                role_id: true,
                role_key: true,
                role_name: true,
                role_scope: true
            },
            where: {
                role_status: true,
                role_deleted: false,
                role_archived: false
            },
            orderBy: { role_id: 'asc' }
        })

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllActiveRoles', error)
        return sendResponse(res, false, null, 'Error ', statusType.DB_ERROR)
    }
}

export async function getAllModules(req: Request, res: Response) {
    try {
        const data = await prisma.sys_module.findMany({
            where: {
                module_status: true,
                module_archived: false,
                module_deleted: false
            },
            orderBy: { module_id: 'asc' }
        })

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllModules', error)
        return sendResponse(res, false, null, 'Error ', statusType.DB_ERROR)
    }
}

export async function getAllActiveBrands(req: Request, res: Response) {
    try {
        const data = await prisma.brands.findMany({
            select: { brand_id: true, brand_name: true, brand_code: true },
            where: { brand_status: true, brand_archived: false, brand_deleted: false },
            orderBy: { brand_name: 'asc' }
        })

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllActiveBrands', error)
        return sendResponse(res, false, null, 'Error ', statusType.DB_ERROR)
    }
}

export async function getAllActiveOutlets(req: Request, res: Response) {
    try {
        const brand_id = getIntOrNull(req.query.brand_id)

        const data = await prisma.outlets.findMany({
            select: { outlet_id: true, outlet_name: true, outlet_code: true, outlet_brand_id: true },
            where: {
                AND: [
                    outletScopeWhere(req.userInfo!),
                    { outlet_status: true, outlet_archived: false, outlet_deleted: false },
                    brand_id ? { outlet_brand_id: brand_id } : {}
                ]
            },
            orderBy: { outlet_name: 'asc' }
        })

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllActiveOutlets', error)
        return sendResponse(res, false, null, 'Error ', statusType.DB_ERROR)
    }
}

export async function getAllActiveCategories(req: Request, res: Response) {
    try {
        const cat_type = getEnumOrNull(req.query.type, category_type)

        const data = await prisma.categories.findMany({
            select: { cat_id: true, cat_name: true, cat_type: true },
            where: {
                cat_status: true,
                cat_archived: false,
                cat_deleted: false,
                ...(cat_type ? { cat_type } : {})
            },
            orderBy: [{ cat_sequence: 'asc' }, { cat_name: 'asc' }]
        })

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllActiveCategories', error)
        return sendResponse(res, false, null, 'Error ', statusType.DB_ERROR)
    }
}

export async function getAllActivePaths(req: Request, res: Response) {
    try {
        const data = await prisma.training_paths.findMany({
            select: { tp_id: true, tp_name: true, tp_role_id: true, tp_brand_id: true },
            where: { tp_status: true, tp_archived: false, tp_deleted: false },
            orderBy: { tp_name: 'asc' }
        })

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllActivePaths', error)
        return sendResponse(res, false, null, 'Error ', statusType.DB_ERROR)
    }
}

// Published modules for pickers (paths, assignments, prerequisites)
export async function getAllPublishedModules(req: Request, res: Response) {
    try {
        const modules = await prisma.training_modules.findMany({
            select: {
                tm_id: true,
                tm_code: true,
                tm_is_mandatory: true,
                tm_due_days: true,
                tm_current_version: { select: { mv_title: true, mv_version_no: true } }
            },
            where: {
                tm_status: true,
                tm_archived: false,
                tm_deleted: false,
                tm_current_version_id: { not: null }
            },
            orderBy: [{ tm_sequence: 'asc' }, { tm_id: 'asc' }]
        })

        const data = modules.map((m) => ({
            tm_id: m.tm_id,
            tm_code: m.tm_code,
            tm_is_mandatory: m.tm_is_mandatory,
            tm_due_days: m.tm_due_days,
            title: m.tm_current_version?.mv_title,
            version_no: m.tm_current_version?.mv_version_no
        }))

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllPublishedModules', error)
        return sendResponse(res, false, null, 'Error ', statusType.DB_ERROR)
    }
}
