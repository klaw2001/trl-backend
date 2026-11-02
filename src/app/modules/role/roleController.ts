import { Request, Response } from 'express'

import { role_scope } from '@/generated/prisma/enums'
import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import { applyIfLimit, applyIfOffset, checkExists, likeIfValue, whereIfFlags } from '@core/helpers/prismaHelpers'
import prisma from '@core/helpers/prisma'
import {
    getArrayOrNull,
    getEnumOrNull,
    getIntOrNull,
    getStringOrNull,
    getTrueOrFalse
} from '@core/helpers/commonHelpers'
import dataObjectBuilder from '@core/helpers/dataObjectBuilder'
import { audit } from '@core/services/AuditService'

export async function getAllRoles(req: Request, res: Response) {
    try {
        const { search, status, archived, deleted, limit, offset } = req.query

        const options: any = {}

        whereIfFlags(options, 'role', { status, archived, deleted })

        likeIfValue(options, ['role_name', 'role_key'], search)

        const count = await prisma.roles.count(options)

        applyIfLimit(options, limit)

        applyIfOffset(options, offset)

        const roles = await prisma.roles.findMany({
            include: { _count: { select: { users: { where: { user_deleted: false } } } } },
            orderBy: { role_id: 'asc' },
            ...options
        })

        const data = {
            total: count,
            rows: roles
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllRoles', error)
        return sendResponse(res, false, null, 'Error getting all roles', statusType.DB_ERROR)
    }
}

export async function getSingleRole(req: Request, res: Response) {
    try {
        const role_id = getIntOrNull(req.params.role_id)

        if (!role_id) {
            return sendResponse(res, false, null, 'role_id not valid', statusType.BAD_REQUEST)
        }

        const role = await prisma.roles.findFirst({
            where: {
                role_id,
                role_deleted: false
            }
        })

        if (!role) {
            return sendResponse(res, false, null, 'Role not found', statusType.NOT_FOUND)
        }

        const module_role_map_arr = await prisma.sys_module.findMany({
            include: {
                module_role_map: {
                    select: {
                        mrm_module_id: true,
                        mrm_read: true,
                        mrm_write: true,
                        mrm_status: true
                    },
                    where: {
                        mrm_role_id: role_id,
                        mrm_status: true,
                        mrm_deleted: false
                    }
                }
            },
            where: {
                module_status: true,
                module_deleted: false
            },
            orderBy: { module_id: 'asc' }
        })

        const module_role_map = module_role_map_arr.map((d) => ({
            module_id: d.module_id,
            module_name: d.module_name,
            module_key: d.module_key,
            read: d.module_role_map[0]?.mrm_read || false,
            write: d.module_role_map[0]?.mrm_write || false
        }))

        const data = {
            ...role,
            module_role_map
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getSingleRole', error)
        return sendResponse(res, false, null, 'Error getting single role', statusType.DB_ERROR)
    }
}

export async function saveRole(req: Request, res: Response) {
    try {
        const data: any = dataObjectBuilder(req.body)
            .addIfValueExists('role_name', getStringOrNull)
            .addIfValueExists('role_key', (val) => getStringOrNull(val)?.toLowerCase().replace(/\s+/g, '_') || null)
            .addIfValueExists('role_description', getStringOrNull)
            .addIfValueExists('role_scope', (val) => getEnumOrNull(val, role_scope))
            .addIfValueExists('role_shift_restricted', getTrueOrFalse)
            .addIfValueExists('role_status', getTrueOrFalse)
            .addIfValueExists('role_archived', getTrueOrFalse)
            .addIfValueExists('role_deleted', getTrueOrFalse)
            .getDataObject()

        let role_id = getIntOrNull(req.body.role_id)

        if (data.role_scope === null) {
            return sendResponse(res, false, null, 'Invalid role scope', statusType.BAD_REQUEST)
        }

        const exists = await checkExists('roles', 'role', role_id, ['role_key'], [data.role_key])

        if (exists.data) {
            return sendResponse(res, false, null, exists.message, statusType.CONFLICT)
        }

        if (role_id) {
            const existing = await prisma.roles.findUniqueOrThrow({ where: { role_id } })

            // System roles keep their key and cannot be removed
            if (existing.role_is_system) {
                delete data.role_key
                delete data.role_deleted
                delete data.role_status
            }

            data.role_updated_by = String(req.userInfo!.user_id)

            await prisma.roles.update({
                where: {
                    role_id
                },
                data
            })
        } else {
            if (!data.role_name || !data.role_key) {
                return sendResponse(res, false, null, 'Role name and key are required', statusType.BAD_REQUEST)
            }

            data.role_created_by = String(req.userInfo!.user_id)

            const role = await prisma.roles.create({
                data
            })

            role_id = role.role_id
        }

        const module_map = getArrayOrNull(req.body.module_role_map)

        if (module_map && module_map.length) {
            const insertArr: any[] = []
            for (const d of module_map) {
                const module_id = getIntOrNull(d.module_id)

                if (!module_id) {
                    continue
                }

                const write = getTrueOrFalse(d.write)

                insertArr.push({
                    mrm_module_id: module_id,
                    mrm_role_id: role_id,
                    // Write implies read
                    mrm_read: write || getTrueOrFalse(d.read),
                    mrm_write: write,
                    mrm_status: true,
                    mrm_created_by: String(req.userInfo!.user_id)
                })
            }

            await prisma.$transaction([
                prisma.module_role_map.deleteMany({
                    where: {
                        mrm_role_id: role_id
                    }
                }),
                prisma.module_role_map.createMany({
                    data: insertArr
                })
            ])
        }

        await audit(req, req.body.role_id ? 'update' : 'create', 'role', role_id, { fields: Object.keys(data) })

        return sendResponse(res, true, { role_id }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in saveRole', error)
        return sendResponse(res, false, null, 'Error saving role', statusType.DB_ERROR)
    }
}
