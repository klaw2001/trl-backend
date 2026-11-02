import { Request, Response, NextFunction } from 'express'

import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import errorCodes from '@core/enum/errorCodes'
import logger from '@core/services/LoggingService'
import { getShiftAccess } from '@/app/services/shiftService'

// Training and recipe content is only reachable inside the user's shift window
export default function shiftAccessMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        const user = req.userInfo

        if (!user) {
            return sendResponse(res, false, null, 'Unauthorized', statusType.UNAUTHORIZED)
        }

        const shift = getShiftAccess(user)

        if (!shift.allowed) {
            return sendResponse(
                res,
                false,
                { code: errorCodes.OUTSIDE_SHIFT, shift },
                'Content is available only during your shift hours',
                statusType.FORBIDDEN
            )
        }

        req.shiftAccess = shift

        return next()
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in shiftAccessMiddleware', error)
        return sendResponse(res, false, null, 'Error in validating shift', statusType.INTERNAL_SERVER_ERROR)
    }
}
