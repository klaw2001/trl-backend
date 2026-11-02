import { Request, Response } from 'express'

import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import { getEnumOrNull, getFullName, getIntOrNull } from '@core/helpers/commonHelpers'
import { ExportColumn, sendExport } from '@core/helpers/exportHelpers'
import { audit } from '@core/services/AuditService'
import { canViewUser } from '@/app/services/scopeService'
import { isOverdue } from '@/app/services/assignmentQuery'
import { GroupBy, assignmentRows, completionSummary, dashboardStats } from './reportService'

const GROUP_BY: GroupBy[] = ['employee', 'outlet', 'brand', 'role', 'module']

export async function getDashboard(req: Request, res: Response) {
    try {
        const viewer = req.userInfo!

        const [totals, byOutlet, byBrand, byRole, overdue, failed] = await Promise.all([
            dashboardStats(viewer, req.query),
            completionSummary(viewer, 'outlet', req.query),
            completionSummary(viewer, 'brand', req.query),
            completionSummary(viewer, 'role', req.query),
            assignmentRows(viewer, { ...req.query, overdue: '1' }, 8),
            assignmentRows(viewer, { ...req.query, state: 'failed' }, 8)
        ])

        const data = {
            totals,
            by_outlet: byOutlet,
            by_brand: byBrand,
            by_role: byRole,
            overdue: overdue.rows,
            failed: failed.rows
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getDashboard', error)
        return sendResponse(res, false, null, 'Error getting dashboard', statusType.DB_ERROR)
    }
}

// Query: group_by = employee | outlet | brand | role | module, plus assignment filters
export async function getCompletion(req: Request, res: Response) {
    try {
        const groupBy = getEnumOrNull(req.query.group_by, GROUP_BY) || 'employee'

        const rows = await completionSummary(req.userInfo!, groupBy, req.query)

        return sendResponse(res, true, { group_by: groupBy, rows }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getCompletion', error)
        return sendResponse(res, false, null, 'Error getting completion report', statusType.DB_ERROR)
    }
}

// Overdue (overdue=1), failed (state=failed) or repeated attempts (min_attempts=2)
export async function getAssignmentReport(req: Request, res: Response) {
    try {
        const take = Math.min(getIntOrNull(req.query.limit) || 50, 500)
        const skip = getIntOrNull(req.query.offset) || 0

        const data = await assignmentRows(req.userInfo!, req.query, take, skip)

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAssignmentReport', error)
        return sendResponse(res, false, null, 'Error getting assignment report', statusType.DB_ERROR)
    }
}

// Complete training history of one employee, including retraining and every attempt
export async function getUserHistory(req: Request, res: Response) {
    try {
        const user_id = getIntOrNull(req.params.user_id)

        if (!user_id || !(await canViewUser(req.userInfo!, user_id))) {
            return sendResponse(res, false, null, 'User not found', statusType.NOT_FOUND)
        }

        const user = await prisma.users.findUniqueOrThrow({
            omit: { user_password: true },
            where: { user_id },
            include: {
                user_role_relation: { select: { role_name: true } },
                user_outlet: { select: { outlet_name: true } },
                user_brand: { select: { brand_name: true } },
                user_path: { select: { tp_name: true } }
            }
        })

        const assignments = await prisma.assignments.findMany({
            where: { asg_user_id: user_id, asg_deleted: false },
            include: {
                asg_version: { select: { mv_title: true, mv_version_no: true, mv_pass_mark: true } },
                asg_assigned_by: { select: { user_first_name: true, user_last_name: true } },
                assessment_attempts: {
                    select: {
                        aa_attempt_no: true,
                        aa_score: true,
                        aa_passed: true,
                        aa_submitted_at: true,
                        aa_version: { select: { mv_version_no: true } }
                    },
                    where: { aa_submitted_at: { not: null } },
                    orderBy: { aa_attempt_no: 'asc' }
                },
                acknowledgement: { select: { ack_created_at: true, ack_text: true } },
                lesson_progress: { select: { lp_watched_percent: true, lp_completed_at: true } }
            },
            orderBy: { asg_created_at: 'desc' }
        })

        const data = {
            user,
            assignments: assignments.map((a) => ({ ...a, is_overdue: isOverdue(a) }))
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getUserHistory', error)
        return sendResponse(res, false, null, 'Error getting training history', statusType.DB_ERROR)
    }
}

const summaryColumns = (groupBy: GroupBy): ExportColumn[] => [
    ...(groupBy === 'employee'
        ? [
              { key: 'employee_id', header: 'Employee ID' },
              { key: 'name', header: 'Name', width: 26 },
              { key: 'role', header: 'Role' },
              { key: 'outlet', header: 'Outlet', width: 24 },
              { key: 'brand', header: 'Brand' }
          ]
        : [{ key: 'name', header: groupBy.charAt(0).toUpperCase() + groupBy.slice(1), width: 28 }]),
    { key: 'assigned', header: 'Assigned' },
    { key: 'completed', header: 'Completed' },
    { key: 'in_progress', header: 'In progress' },
    { key: 'not_started', header: 'Not started' },
    { key: 'overdue', header: 'Overdue' },
    { key: 'failed', header: 'Failed' },
    { key: 'completion_rate', header: 'Completion %' },
    { key: 'avg_score', header: 'Avg score %' },
    { key: 'last_completed_at', header: 'Last completed' }
]

const assignmentColumns: ExportColumn[] = [
    { key: 'employee_id', header: 'Employee ID' },
    { key: 'name', header: 'Name', width: 26 },
    { key: 'role', header: 'Role' },
    { key: 'outlet', header: 'Outlet', width: 24 },
    { key: 'brand', header: 'Brand' },
    { key: 'module', header: 'Module', width: 32 },
    { key: 'version', header: 'Version' },
    { key: 'source', header: 'Source' },
    { key: 'state', header: 'Status' },
    { key: 'due_at', header: 'Due' },
    { key: 'days_overdue', header: 'Days overdue' },
    { key: 'attempts', header: 'Attempts' },
    { key: 'scores', header: 'Attempt scores' },
    { key: 'best_score', header: 'Best score %' },
    { key: 'acknowledged_at', header: 'Acknowledged' },
    { key: 'completed_at', header: 'Completed' }
]

// Query: report = completion | assignments, format = csv | xlsx, plus the filters of that report
export async function exportReport(req: Request, res: Response) {
    try {
        const viewer = req.userInfo!
        const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv'

        if (req.query.report === 'assignments') {
            const { rows } = await assignmentRows(viewer, req.query, 50000)

            const data = rows.map((a) => ({
                employee_id: a.asg_user.user_employee_id,
                name: getFullName(a.asg_user),
                role: a.asg_user.user_role_relation.role_name,
                outlet: a.asg_user.user_outlet?.outlet_name,
                brand: a.asg_user.user_brand?.brand_name,
                module: a.asg_version.mv_title,
                version: `v${a.asg_version.mv_version_no}`,
                source: a.asg_source,
                state: a.is_overdue ? 'overdue' : a.asg_state,
                due_at: a.asg_due_at,
                days_overdue: a.days_overdue || '',
                attempts: a.asg_attempts_used,
                scores: a.assessment_attempts.map((t) => `${t.aa_score}%`).join(' / '),
                best_score: a.asg_best_score,
                acknowledged_at: a.asg_acknowledged_at,
                completed_at: a.asg_completed_at
            }))

            await audit(req, 'export', 'report', null, { report: 'assignments', format, rows: data.length })

            return sendExport(res, format, 'training-assignments', assignmentColumns, data)
        }

        const groupBy = getEnumOrNull(req.query.group_by, GROUP_BY) || 'employee'
        const rows = await completionSummary(viewer, groupBy, req.query)

        await audit(req, 'export', 'report', null, {
            report: 'completion',
            group_by: groupBy,
            format,
            rows: rows.length
        })

        return sendExport(res, format, `completion-by-${groupBy}`, summaryColumns(groupBy), rows)
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in exportReport', error)
        return sendResponse(res, false, null, 'Error exporting report', statusType.DB_ERROR)
    }
}
