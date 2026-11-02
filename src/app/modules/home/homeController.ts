import { Request, Response } from 'express'

import { assignment_state } from '@/generated/prisma/enums'
import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import { getShiftAccess } from '@/app/services/shiftService'
import { OPEN_STATES } from '@/app/services/assignmentService'
import { overdueWhere } from '@/app/services/assignmentQuery'

// Learner summary for the home screen
export async function getHome(req: Request, res: Response) {
    try {
        const user = req.userInfo!
        const base = { asg_user_id: user.user_id, asg_deleted: false, asg_module: { tm_archived: false } }

        const [pending, inProgress, overdue, failed, completed, upcoming, unread] = await Promise.all([
            prisma.assignments.count({ where: { ...base, asg_state: assignment_state.assigned } }),
            prisma.assignments.count({ where: { ...base, asg_state: assignment_state.in_progress } }),
            prisma.assignments.count({ where: { ...base, ...overdueWhere() } }),
            prisma.assignments.count({ where: { ...base, asg_state: assignment_state.failed } }),
            prisma.assignments.count({
                where: { asg_user_id: user.user_id, asg_deleted: false, asg_state: assignment_state.completed }
            }),
            prisma.assignments.findMany({
                select: {
                    asg_id: true,
                    asg_state: true,
                    asg_due_at: true,
                    asg_ack_only: true,
                    asg_version: { select: { mv_title: true } }
                },
                where: { ...base, asg_state: { in: OPEN_STATES } },
                orderBy: [{ asg_due_at: { sort: 'asc', nulls: 'last' } }, { asg_id: 'asc' }],
                take: 5
            }),
            prisma.notifications.count({ where: { ntf_user_id: user.user_id, ntf_read_at: null } })
        ])

        const data = {
            counts: { pending, in_progress: inProgress, overdue, failed, completed },
            upcoming,
            unread_notifications: unread,
            shift: getShiftAccess(user)
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getHome', error)
        return sendResponse(res, false, null, 'Error getting home', statusType.DB_ERROR)
    }
}
