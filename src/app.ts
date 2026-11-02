import express, { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import fileUpload from 'express-fileupload'
import cookieParser from 'cookie-parser'

import appRoutes from '@/app/router'
import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import { RESPONSE_MESSAGES } from '@core/helpers/constant'
import logger from '@core/services/LoggingService'

const app = express()

const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

app.set('port', Number(process.env.PORT) || 8020)
// Correct client IPs behind a reverse proxy (audit logs, rate limits)
app.set('trust proxy', 1)
app.disable('x-powered-by')

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: corsOrigins.length ? corsOrigins : false }))
app.use(
    express.json({
        limit: '5mb',
        // Raw body is needed to verify webhook signatures
        verify: (req: Request, _res, buf) => {
            req.rawBody = buf
        }
    })
)
app.use(cookieParser())
app.use(
    fileUpload({
        limits: { fileSize: Number(process.env.UPLOAD_MAX_MB || 25) * 1024 * 1024 },
        abortOnLimit: true,
        safeFileNames: true,
        preserveExtension: true
    })
)

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
})

app.use('/api', appRoutes)

app.use((req: Request, res: Response) => {
    sendResponse(res, false, null, RESPONSE_MESSAGES.CODE_404, statusType.NOT_FOUND)
})

app.use((error: any, req: Request, res: Response, _next: NextFunction) => {
    if (error?.type === 'entity.parse.failed') {
        return sendResponse(res, false, null, 'Invalid JSON body', statusType.BAD_REQUEST)
    }

    logger.consoleErrorLog(req.originalUrl, 'Unhandled error', error)
    return sendResponse(res, false, null, RESPONSE_MESSAGES.CODE_500, statusType.INTERNAL_SERVER_ERROR)
})

export default app
