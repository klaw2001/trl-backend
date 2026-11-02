import { Request, Response } from 'express'

import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import { applyIfLimit, applyIfOffset, whereAnd, whereIfValue } from '@core/helpers/prismaHelpers'
import { getDateOrNull, getIntOrNull, getStringOrNull } from '@core/helpers/commonHelpers'

export async function getAllLogs(req: Request, res: Response) {
    try {
        const { limit, offset, entity, entity_id, user_id, action, from, to } = req.query

        const options: any = {}

        whereIfValue(options, 'al_entity', entity, getStringOrNull)
        whereIfValue(options, 'al_entity_id', entity_id, getIntOrNull)
        whereIfValue(options, 'al_user_id', user_id, getIntOrNull)
        whereIfValue(options, 'al_action', action, getStringOrNull)

        const fromDate = getDateOrNull(from)
        const toDate = getDateOrNull(to)
        if (fromDate) {
            whereAnd(options, { al_created_at: { gte: fromDate } })
        }
        if (toDate) {
            whereAnd(options, { al_created_at: { lte: toDate } })
        }

        const count = await prisma.audit_logs.count(options)

        applyIfLimit(options, limit || 50)

        applyIfOffset(options, offset)

        const rows = await prisma.audit_logs.findMany({
            include: {
                al_user: {
                    select: { user_id: true, user_employee_id: true, user_first_name: true, user_last_name: true }
                }
            },
            orderBy: { al_created_at: 'desc' },
            ...options
        })

        return sendResponse(res, true, { total: count, rows }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllLogs', error)
        return sendResponse(res, false, null, 'Error getting audit logs', statusType.DB_ERROR)
    }
}
