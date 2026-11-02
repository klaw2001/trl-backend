import { Request, Response } from 'express'

import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import { applyIfLimit, applyIfOffset } from '@core/helpers/prismaHelpers'
import { getIntArray } from '@core/helpers/commonHelpers'

export async function getMyNotifications(req: Request, res: Response) {
    try {
        const { user_id } = req.userInfo!
        const { limit, offset, unread } = req.query

        const options: any = { where: { ntf_user_id: user_id, ...(unread === '1' ? { ntf_read_at: null } : {}) } }

        const [count, unreadCount] = await Promise.all([
            prisma.notifications.count(options),
            prisma.notifications.count({ where: { ntf_user_id: user_id, ntf_read_at: null } })
        ])

        applyIfLimit(options, limit || 20)

        applyIfOffset(options, offset)

        const rows = await prisma.notifications.findMany({ orderBy: { ntf_created_at: 'desc' }, ...options })

        return sendResponse(res, true, { total: count, unread: unreadCount, rows }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getMyNotifications', error)
        return sendResponse(res, false, null, 'Error getting notifications', statusType.DB_ERROR)
    }
}

// Body: { ntf_ids: [] } or { all: true }
export async function markRead(req: Request, res: Response) {
    try {
        const { user_id } = req.userInfo!
        const ntf_ids = getIntArray(req.body.ntf_ids)

        await prisma.notifications.updateMany({
            where: {
                ntf_user_id: user_id,
                ntf_read_at: null,
                ...(req.body.all ? {} : { ntf_id: { in: ntf_ids } })
            },
            data: { ntf_read_at: new Date() }
        })

        return sendResponse(res, true, null, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in markRead', error)
        return sendResponse(res, false, null, 'Error updating notifications', statusType.DB_ERROR)
    }
}
