import { notification_type } from '@/generated/prisma/enums'
import prisma from '@core/helpers/prisma'
import { sendMail } from '@core/helpers/mailHelpers'
import { APP_NAME } from '@core/helpers/constant'
import logger from '@core/services/LoggingService'

interface NotificationPayload {
    type: notification_type
    title: string
    message: string
    link?: string | null
    assignment_id?: number | null
    email?: boolean
}

function mailTemplate(title: string, message: string, link?: string | null) {
    const url = link ? `${process.env.FRONTEND_BASEURL}${link}` : process.env.FRONTEND_BASEURL

    return `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: auto; color: #2f2b3d">
            <h2 style="margin-bottom: 8px">${title}</h2>
            <p style="line-height: 1.5">${message}</p>
            <p><a href="${url}" style="display: inline-block; padding: 10px 18px; background: #7367f0; color: #fff; border-radius: 6px; text-decoration: none">Open ${APP_NAME}</a></p>
        </div>
    `
}

// In-app notification for each user, plus an email when requested and the user has an address
export async function notifyUsers(user_ids: number[], payload: NotificationPayload) {
    try {
        if (!user_ids.length) {
            return
        }

        await prisma.notifications.createMany({
            data: user_ids.map((user_id) => ({
                ntf_user_id: user_id,
                ntf_type: payload.type,
                ntf_title: payload.title,
                ntf_message: payload.message,
                ntf_link: payload.link || null,
                ntf_assignment_id: payload.assignment_id || null,
                ntf_emailed_at: payload.email ? new Date() : null
            }))
        })

        if (!payload.email) {
            return
        }

        const users = await prisma.users.findMany({
            select: { user_email: true },
            where: { user_id: { in: user_ids }, user_email: { not: null }, user_status: true }
        })

        for (const user of users) {
            await sendMail({
                to: user.user_email as string,
                subject: payload.title,
                body: mailTemplate(payload.title, payload.message, payload.link)
            })
        }
    } catch (error) {
        logger.consoleErrorLog('NotificationService', 'Error in notifyUsers', error)
    }
}
