import { Request, Response } from 'express'

import { video_state } from '@/generated/prisma/enums'
import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import { getIntOrNull, getStringOrNull } from '@core/helpers/commonHelpers'
import { getVideo, mapWebhookStatus, verifyWebhookSignature } from '@core/services/BunnyService'

// Bunny Stream video status callback
export async function bunnyWebhook(req: Request, res: Response) {
    try {
        const signature = req.get('X-BunnyStream-Signature')

        if (!verifyWebhookSignature(req.rawBody, signature)) {
            return sendResponse(res, false, null, 'Invalid signature', statusType.UNAUTHORIZED)
        }

        const guid = getStringOrNull(req.body.VideoGuid)
        const status = getIntOrNull(req.body.Status)

        if (!guid || status === null) {
            return sendResponse(res, false, null, 'Invalid payload', statusType.BAD_REQUEST)
        }

        const video = await prisma.videos.findUnique({ where: { video_guid: guid } })

        if (!video) {
            return sendResponse(res, true, null, 'Unknown video ignored')
        }

        const state = mapWebhookStatus(status)
        const data: any = { video_state: state }

        if (state === video_state.ready) {
            const bunnyVideo = await getVideo(guid).catch(() => null)
            data.video_duration_seconds = bunnyVideo?.length || video.video_duration_seconds
        }

        await prisma.videos.update({ where: { video_id: video.video_id }, data })

        return sendResponse(res, true, null, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in bunnyWebhook', error)
        return sendResponse(res, false, null, 'Error processing webhook', statusType.DB_ERROR)
    }
}
