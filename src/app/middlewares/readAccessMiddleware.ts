import { Request, Response, NextFunction } from 'express'

import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import errorCodes from '@core/enum/errorCodes'
import prisma from '@core/helpers/prisma'
import logger from '@core/services/LoggingService'

// Passes when the user's role can read any of the given permission modules
export default function readAccessMiddleware(module_key: string | string[]) {
    const module_keys = Array.isArray(module_key) ? module_key : [module_key]

    return async function (req: Request, res: Response, next: NextFunction) {
        try {
            const user = req.userInfo

            if (!user || !user.user_role_id) {
                return sendResponse(res, false, null, 'User has no role', statusType.UNAUTHORIZED)
            }

            const find = await prisma.module_role_map.findFirst({
                where: {
                    mrm_role_id: user.user_role_id,
                    mrm_module: {
                        module_key: { in: module_keys },
                        module_status: true
                    },
                    mrm_read: true,
                    mrm_status: true,
                    mrm_deleted: false,
                    mrm_archived: false
                }
            })

            if (!find) {
                return sendResponse(res, false, { code: errorCodes.NO_ACCESS }, 'No Read Access', statusType.FORBIDDEN)
            }

            return next()
        } catch (error) {
            logger.consoleErrorLog(req.originalUrl, 'Error in readAccessMiddleware', error)
            return sendResponse(res, false, null, 'Error in validating access', statusType.INTERNAL_SERVER_ERROR)
        }
    }
}
