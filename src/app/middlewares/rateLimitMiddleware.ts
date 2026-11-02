import { Request } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

import statusType from '@core/enum/statusTypes'
import { RESPONSE_MESSAGES } from '@core/helpers/constant'

const limitResponse = {
    status: false,
    data: null,
    message: RESPONSE_MESSAGES.CODE_429,
    apiVersion: 'No Version'
}

// Staff of an outlet usually share one public IP, so limits apply per IP + account identifier
function identifierKey(req: Request) {
    const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim().toLowerCase() : ''

    return `${ipKeyGenerator(req.ip || '')}:${identifier}`
}

export const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: identifierKey,
    statusCode: statusType.TOO_MANY_REQUESTS,
    message: limitResponse
})

export const otpRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: identifierKey,
    statusCode: statusType.TOO_MANY_REQUESTS,
    message: limitResponse
})
