import { Request, Response } from 'express'

import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import { applyIfLimit, applyIfOffset, likeIfValue, whereIfFlags, whereIfValue } from '@core/helpers/prismaHelpers'
import {
    getArrayOrNull,
    getDateOrNull,
    getIntArray,
    getIntOrNull,
    getStringOrNull,
    getTrueOrFalse
} from '@core/helpers/commonHelpers'
import dataObjectBuilder from '@core/helpers/dataObjectBuilder'
import { audit } from '@core/services/AuditService'
import { assignPathToUser } from '@/app/services/assignmentService'
import { canViewUser } from '@/app/services/scopeService'

export async function getAllPaths(req: Request, res: Response) {
    try {
        const { search, status, archived, deleted, limit, offset, role_id, brand_id } = req.query

        const options: any = {}

        whereIfFlags(options, 'tp', { status, archived, deleted })
        whereIfValue(options, 'tp_role_id', role_id, getIntOrNull)
        whereIfValue(options, 'tp_brand_id', brand_id, getIntOrNull)

        likeIfValue(options, ['tp_name'], search)

        const count = await prisma.training_paths.count(options)

        applyIfLimit(options, limit)

        applyIfOffset(options, offset)

        const paths = await prisma.training_paths.findMany({
            include: {
                tp_role: { select: { role_id: true, role_name: true } },
                tp_brand: { select: { brand_id: true, brand_name: true } },
                _count: { select: { modules: true, users: { where: { user_deleted: false } } } }
            },
            orderBy: { tp_name: 'asc' },
            ...options
        })

        const data = {
            total: count,
            rows: paths
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllPaths', error)
        return sendResponse(res, false, null, 'Error getting training paths', statusType.DB_ERROR)
    }
}

export async function getSinglePath(req: Request, res: Response) {
    try {
        const tp_id = getIntOrNull(req.params.tp_id)

        const path = tp_id
            ? await prisma.training_paths.findFirst({
                  where: { tp_id, tp_deleted: false },
                  include: {
                      modules: {
                          orderBy: { tpm_sequence: 'asc' },
                          include: {
                              tpm_module: {
                                  select: {
                                      tm_id: true,
                                      tm_code: true,
                                      tm_due_days: true,
                                      tm_archived: true,
                                      tm_current_version: { select: { mv_title: true, mv_version_no: true } },
                                      versions: {
                                          select: { mv_title: true },
                                          orderBy: { mv_version_no: 'desc' },
                                          take: 1
                                      }
                                  }
                              }
                          }
                      }
                  }
              })
            : null

        if (!path) {
            return sendResponse(res, false, null, 'Training path not found', statusType.NOT_FOUND)
        }

        return sendResponse(res, true, path, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getSinglePath', error)
        return sendResponse(res, false, null, 'Error getting training path', statusType.DB_ERROR)
    }
}

// Body: tp_* fields and modules: [{ module_id, due_days }] in order (replaces the module list)
export async function savePath(req: Request, res: Response) {
    try {
        const data: any = dataObjectBuilder(req.body)
            .addIfValueExists('tp_name', getStringOrNull)
            .addIfValueExists('tp_description', getStringOrNull)
            .addIfValueExists('tp_role_id', getIntOrNull)
            .addIfValueExists('tp_brand_id', getIntOrNull)
            .addIfValueExists('tp_status', getTrueOrFalse)
            .addIfValueExists('tp_archived', getTrueOrFalse)
            .addIfValueExists('tp_deleted', getTrueOrFalse)
            .getDataObject()

        let tp_id = getIntOrNull(req.body.tp_id)

        if (tp_id) {
            data.tp_updated_by = String(req.userInfo!.user_id)

            await prisma.training_paths.update({ where: { tp_id }, data })
        } else {
            if (!data.tp_name) {
                return sendResponse(res, false, null, 'Path name is required', statusType.BAD_REQUEST)
            }

            data.tp_created_by = String(req.userInfo!.user_id)

            const path = await prisma.training_paths.create({ data })
            tp_id = path.tp_id
        }

        const modules = getArrayOrNull(req.body.modules)

        if (modules) {
            const seen = new Set<number>()
            const rows: any[] = []

            for (const module of modules) {
                const module_id = getIntOrNull(module?.module_id)

                if (!module_id || seen.has(module_id)) {
                    continue
                }

                seen.add(module_id)
                rows.push({
                    tpm_path_id: tp_id,
                    tpm_module_id: module_id,
                    tpm_sequence: rows.length,
                    tpm_due_days: getIntOrNull(module?.due_days)
                })
            }

            await prisma.$transaction([
                prisma.training_path_modules.deleteMany({ where: { tpm_path_id: tp_id } }),
                prisma.training_path_modules.createMany({ data: rows })
            ])
        }

        await audit(req, req.body.tp_id ? 'update' : 'create', 'training_path', tp_id, {
            ...data,
            modules: modules?.length
        })

        return sendResponse(res, true, { tp_id }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in savePath', error)
        return sendResponse(res, false, null, 'Error saving training path', statusType.DB_ERROR)
    }
}

// Assigns all modules of a path to users, optionally making it their default path
export async function assignPath(req: Request, res: Response) {
    try {
        const viewer = req.userInfo!
        const tp_id = getIntOrNull(req.body.tp_id)
        const user_ids = getIntArray(req.body.user_ids)
        const deadline = getDateOrNull(req.body.deadline)
        const setDefault = getTrueOrFalse(req.body.set_default)

        if (!tp_id || !user_ids.length) {
            return sendResponse(res, false, null, 'Select a path and at least one user', statusType.BAD_REQUEST)
        }

        let created = 0
        let users = 0

        for (const user_id of user_ids) {
            if (!(await canViewUser(viewer, user_id))) {
                continue
            }

            if (setDefault) {
                await prisma.users.update({
                    where: { user_id },
                    data: { user_path_id: tp_id, user_path_deadline: deadline }
                })
            }

            created += await assignPathToUser(user_id, tp_id, deadline, viewer.user_id, String(viewer.user_id))
            users++
        }

        await audit(req, 'assign', 'training_path', tp_id, { users, created })

        return sendResponse(res, true, { users, created }, `${created} assignments created`)
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in assignPath', error)
        return sendResponse(res, false, null, 'Error assigning training path', statusType.DB_ERROR)
    }
}
