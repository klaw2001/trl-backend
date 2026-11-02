import fs from 'fs'
import { Request, Response } from 'express'

import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import { getIntOrNull, getStringOrNull } from '@core/helpers/commonHelpers'
import { resolveFilePath, verifyFileSignature } from '@core/services/StorageService'

// Streams a stored file for a valid, unexpired signed URL (issued by the API to authorised users)
export async function getFile(req: Request, res: Response) {
    try {
        const file_id = getIntOrNull(req.params.file_id)
        const expires = getIntOrNull(req.query.expires)
        const signature = getStringOrNull(req.query.signature)

        if (!file_id || !expires || !signature || !verifyFileSignature(file_id, expires, signature)) {
            return sendResponse(res, false, null, 'Link expired', statusType.FORBIDDEN)
        }

        const file = await prisma.files.findFirst({ where: { file_id, file_deleted: false } })

        if (!file) {
            return sendResponse(res, false, null, 'File not found', statusType.NOT_FOUND)
        }

        const fullPath = resolveFilePath(file.file_key)

        if (!fs.existsSync(fullPath)) {
            return sendResponse(res, false, null, 'File not found', statusType.NOT_FOUND)
        }

        res.setHeader('Content-Type', file.file_mime)
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.file_name)}"`)
        res.setHeader('Cache-Control', 'private, no-store')
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')

        return fs.createReadStream(fullPath).pipe(res)
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getFile', error)
        return sendResponse(res, false, null, 'Error getting file', statusType.DB_ERROR)
    }
}
