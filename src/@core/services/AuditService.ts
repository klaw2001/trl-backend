import { Request } from 'express'

import prisma from '@core/helpers/prisma'
import logger from '@core/services/LoggingService'

// Records who did what; never blocks the request when logging fails.
// actor_id defaults to the authenticated user (pass it for unauthenticated routes like login)
export async function audit(
    req: Request,
    action: string,
    entity: string,
    entity_id?: number | null,
    meta?: object,
    actor_id?: number
) {
    try {
        await prisma.audit_logs.create({
            data: {
                al_user_id: actor_id ?? req.userInfo?.user_id ?? null,
                al_action: action,
                al_entity: entity,
                al_entity_id: entity_id || null,
                al_meta: meta ? JSON.parse(JSON.stringify(meta)) : undefined,
                al_ip: req.ip?.slice(0, 64) || null,
                al_user_agent: req.get('user-agent')?.slice(0, 255) || null
            }
        })
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in audit', error)
    }
}
