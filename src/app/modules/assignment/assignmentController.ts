import { Request, Response } from 'express'

import { assignment_source, assignment_state } from '@/generated/prisma/enums'
import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import { applyIfLimit, applyIfOffset } from '@core/helpers/prismaHelpers'
import { getDateOrNull, getIntArray, getIntOrNull, getStringOrNull } from '@core/helpers/commonHelpers'
import { audit } from '@core/services/AuditService'
import { OPEN_STATES, createAssignments, retrainAssignment } from '@/app/services/assignmentService'
import { assignmentListInclude, assignmentWhere, isOverdue } from '@/app/services/assignmentQuery'
import { userScopeWhere } from '@/app/services/scopeService'

// Assignment ids from the body that belong to users the viewer manages
async function scopedAssignmentIds(req: Request) {
    const asg_ids = getIntArray(req.body.asg_ids ?? req.body.asg_id)

    const rows = await prisma.assignments.findMany({
        select: { asg_id: true },
        where: { asg_id: { in: asg_ids }, asg_deleted: false, asg_user: userScopeWhere(req.userInfo!) }
    })

    return rows.map((r) => r.asg_id)
}

export async function getAllAssignments(req: Request, res: Response) {
    try {
        const { limit, offset } = req.query

        const options: any = { where: assignmentWhere(req.userInfo!, req.query) }

        const count = await prisma.assignments.count(options)

        applyIfLimit(options, limit)

        applyIfOffset(options, offset)

        const assignments = await prisma.assignments.findMany({
            include: assignmentListInclude,
            orderBy: [{ asg_due_at: { sort: 'asc', nulls: 'last' } }, { asg_id: 'desc' }],
            ...options
        })

        const data = {
            total: count,
            rows: assignments.map((a) => ({ ...a, is_overdue: isOverdue(a) }))
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllAssignments', error)
        return sendResponse(res, false, null, 'Error getting assignments', statusType.DB_ERROR)
    }
}

// Assign modules to selected users, or to a group (brand / outlet / role) when no users are given
export async function assignModules(req: Request, res: Response) {
    try {
        const viewer = req.userInfo!
        const module_ids = getIntArray(req.body.module_ids)
        const user_ids = getIntArray(req.body.user_ids)
        const due_at = req.body.due_at ? getDateOrNull(req.body.due_at) : undefined
        const brand_id = getIntOrNull(req.body.brand_id)
        const outlet_id = getIntOrNull(req.body.outlet_id)
        const role_id = getIntOrNull(req.body.role_id)
        const isGroup = !user_ids.length

        if (!module_ids.length) {
            return sendResponse(res, false, null, 'Select at least one module', statusType.BAD_REQUEST)
        }

        if (isGroup && !brand_id && !outlet_id && !role_id) {
            return sendResponse(
                res,
                false,
                null,
                'Select users or a brand / outlet / role group',
                statusType.BAD_REQUEST
            )
        }

        const targets = await prisma.users.findMany({
            select: { user_id: true },
            where: {
                AND: [
                    userScopeWhere(viewer),
                    { user_status: true, user_deleted: false },
                    isGroup
                        ? {
                              ...(brand_id ? { user_brand_id: brand_id } : {}),
                              ...(outlet_id ? { user_outlet_id: outlet_id } : {}),
                              ...(role_id ? { user_role_id: role_id } : {})
                          }
                        : { user_id: { in: user_ids } }
                ]
            }
        })

        if (!targets.length) {
            return sendResponse(res, false, null, 'No active users match the selection', statusType.BAD_REQUEST)
        }

        const results = []
        for (const module_id of module_ids) {
            const result = await createAssignments({
                module_id,
                user_ids: targets.map((t) => t.user_id),
                source: isGroup ? assignment_source.group : assignment_source.manual,
                assigned_by_id: viewer.user_id,
                due_at,
                created_by: String(viewer.user_id)
            })
            results.push({ module_id, ...result })
        }

        const created = results.reduce((sum, r) => sum + r.created, 0)

        await audit(req, 'assign', 'assignment', null, {
            module_ids,
            users: targets.length,
            group: isGroup ? { brand_id, outlet_id, role_id } : null,
            created
        })

        return sendResponse(res, true, { users: targets.length, created, results }, `${created} assignments created`)
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in assignModules', error)
        return sendResponse(res, false, null, 'Error assigning modules', statusType.DB_ERROR)
    }
}

export async function revokeAssignments(req: Request, res: Response) {
    try {
        const asg_ids = await scopedAssignmentIds(req)

        if (!asg_ids.length) {
            return sendResponse(res, false, null, 'No assignments selected', statusType.BAD_REQUEST)
        }

        const reason = getStringOrNull(req.body.reason)

        const result = await prisma.assignments.updateMany({
            where: { asg_id: { in: asg_ids }, asg_state: { not: assignment_state.completed } },
            data: {
                asg_state: assignment_state.revoked,
                asg_revoked_at: new Date(),
                asg_revoke_reason: reason,
                asg_updated_by: String(req.userInfo!.user_id)
            }
        })

        await audit(req, 'revoke', 'assignment', null, { asg_ids, reason })

        return sendResponse(res, true, { count: result.count }, `${result.count} assignments revoked`)
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in revokeAssignments', error)
        return sendResponse(res, false, null, 'Error revoking assignments', statusType.DB_ERROR)
    }
}

export async function updateDueDate(req: Request, res: Response) {
    try {
        const asg_ids = await scopedAssignmentIds(req)
        const due_at = getDateOrNull(req.body.due_at)

        if (!asg_ids.length) {
            return sendResponse(res, false, null, 'No assignments selected', statusType.BAD_REQUEST)
        }

        const result = await prisma.assignments.updateMany({
            where: { asg_id: { in: asg_ids }, asg_state: { in: OPEN_STATES } },
            data: {
                asg_due_at: due_at,
                asg_overdue_notified_at: null,
                asg_last_reminder_at: null,
                asg_updated_by: String(req.userInfo!.user_id)
            }
        })

        await audit(req, 'update_due', 'assignment', null, { asg_ids, due_at })

        return sendResponse(res, true, { count: result.count }, 'Deadline updated')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in updateDueDate', error)
        return sendResponse(res, false, null, 'Error updating deadline', statusType.DB_ERROR)
    }
}

// Retraining for failed (or completed) assignments: a fresh assignment on the current version
export async function retrainAssignments(req: Request, res: Response) {
    try {
        const viewer = req.userInfo!
        const asg_ids = await scopedAssignmentIds(req)

        if (!asg_ids.length) {
            return sendResponse(res, false, null, 'No assignments selected', statusType.BAD_REQUEST)
        }

        let created = 0
        for (const asg_id of asg_ids) {
            const result = await retrainAssignment(asg_id, viewer.user_id, String(viewer.user_id))
            created += result.created
        }

        await audit(req, 'retrain', 'assignment', null, { asg_ids, created })

        return sendResponse(res, true, { created }, `${created} retraining assignments created`)
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in retrainAssignments', error)
        return sendResponse(res, false, null, 'Error assigning retraining', statusType.DB_ERROR)
    }
}
