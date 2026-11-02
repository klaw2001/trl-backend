import cron from 'node-cron'
import moment from 'moment'

import { notification_type } from '@/generated/prisma/enums'
import prisma from '@core/helpers/prisma'
import logger from '@core/services/LoggingService'
import { getFullName } from '@core/helpers/commonHelpers'
import { notifyUsers } from '@core/services/NotificationService'
import { OPEN_STATES } from '@/app/services/assignmentService'

const OVERDUE_REPEAT_DAYS = 2

function groupByUser<T extends { asg_user_id: number }>(rows: T[]) {
    const groups = new Map<number, T[]>()
    rows.forEach((row) => groups.set(row.asg_user_id, [...(groups.get(row.asg_user_id) || []), row]))
    return groups
}

const activeOpen = {
    asg_deleted: false,
    asg_state: { in: OPEN_STATES },
    asg_user: { user_status: true, user_deleted: false },
    asg_module: { tm_archived: false }
}

async function sendDueSoonReminders(now: Date) {
    const daysBefore = Number(process.env.REMINDER_DAYS_BEFORE_DUE || 2)
    const startOfDay = moment(now).startOf('day').toDate()

    const rows = await prisma.assignments.findMany({
        select: { asg_id: true, asg_user_id: true, asg_due_at: true, asg_version: { select: { mv_title: true } } },
        where: {
            ...activeOpen,
            asg_due_at: { gte: now, lte: moment(now).add(daysBefore, 'days').toDate() },
            OR: [{ asg_last_reminder_at: null }, { asg_last_reminder_at: { lt: startOfDay } }]
        }
    })

    for (const [user_id, items] of groupByUser(rows)) {
        const list = items
            .map((i) => `"${i.asg_version.mv_title}" (due ${moment(i.asg_due_at).format('DD MMM')})`)
            .join(', ')

        await notifyUsers([user_id], {
            type: notification_type.deadline_reminder,
            title: items.length > 1 ? `${items.length} trainings due soon` : 'Training due soon',
            message: `Please complete ${list}.`,
            link: '/my-training',
            email: true
        })
    }

    await prisma.assignments.updateMany({
        where: { asg_id: { in: rows.map((r) => r.asg_id) } },
        data: { asg_last_reminder_at: now }
    })

    return rows.length
}

async function sendOverdueReminders(now: Date) {
    const rows = await prisma.assignments.findMany({
        select: {
            asg_id: true,
            asg_user_id: true,
            asg_due_at: true,
            asg_overdue_notified_at: true,
            asg_version: { select: { mv_title: true } },
            asg_user: {
                select: { user_first_name: true, user_last_name: true, user_employee_id: true, user_manager_id: true }
            }
        },
        where: {
            ...activeOpen,
            asg_due_at: { lt: now },
            OR: [
                { asg_overdue_notified_at: null },
                { asg_overdue_notified_at: { lt: moment(now).subtract(OVERDUE_REPEAT_DAYS, 'days').toDate() } }
            ]
        }
    })

    for (const [user_id, items] of groupByUser(rows)) {
        const titles = items.map((i) => `"${i.asg_version.mv_title}"`).join(', ')

        await notifyUsers([user_id], {
            type: notification_type.overdue,
            title: 'Training overdue',
            message: `${titles} ${items.length > 1 ? 'are' : 'is'} past the deadline. Please complete it during your next shift.`,
            link: '/my-training',
            email: true
        })

        // The manager hears about it the first time it becomes overdue
        const firstTime = items.filter((i) => !i.asg_overdue_notified_at)
        const manager_id = items[0].asg_user.user_manager_id

        if (firstTime.length && manager_id) {
            await notifyUsers([manager_id], {
                type: notification_type.overdue,
                title: 'Team training overdue',
                message: `${getFullName(items[0].asg_user)} (${items[0].asg_user.user_employee_id}) has overdue training: ${firstTime
                    .map((i) => `"${i.asg_version.mv_title}"`)
                    .join(', ')}.`,
                link: `/team/${user_id}`
            })
        }
    }

    await prisma.assignments.updateMany({
        where: { asg_id: { in: rows.map((r) => r.asg_id) } },
        data: { asg_overdue_notified_at: now }
    })

    return rows.length
}

// Temporary access that has run out is switched off for good (auth already blocks it)
async function deactivateExpiredAccess(now: Date) {
    const result = await prisma.users.updateMany({
        where: { user_status: true, user_access_expires_at: { lt: now } },
        data: {
            user_status: false,
            user_deactivated_at: now,
            user_deactivation_reason: 'Access period ended',
            user_token_version: { increment: 1 }
        }
    })

    return result.count
}

export async function runReminders() {
    const now = new Date()

    try {
        const dueSoon = await sendDueSoonReminders(now)
        const overdue = await sendOverdueReminders(now)
        const expired = await deactivateExpiredAccess(now)

        logger.consoleInfoLog(
            'reminderJob',
            `Reminders sent: due soon ${dueSoon}, overdue ${overdue}; expired access ${expired}`
        )
    } catch (error) {
        logger.consoleErrorLog('reminderJob', 'Error in runReminders', error)
    }
}

export function startReminderJob() {
    const expression = process.env.REMINDER_CRON || '0 9 * * *'

    if (!cron.validate(expression)) {
        logger.consoleErrorLog('reminderJob', `Invalid REMINDER_CRON "${expression}"`, null)
        return
    }

    cron.schedule(expression, runReminders, {
        name: 'training-reminders',
        timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
        noOverlap: true
    })

    logger.consoleInfoLog('reminderJob', `Reminder job scheduled (${expression})`)
}
