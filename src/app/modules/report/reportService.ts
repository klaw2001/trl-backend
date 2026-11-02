import { assignment_state } from '@/generated/prisma/enums'
import prisma from '@core/helpers/prisma'
import { getFullName } from '@core/helpers/commonHelpers'
import { AuthUser } from '@core/types/auth'
import { AssignmentFilters, assignmentListInclude, assignmentWhere, isOverdue } from '@/app/services/assignmentQuery'

export type GroupBy = 'employee' | 'outlet' | 'brand' | 'role' | 'module'

export interface SummaryRow {
    key: number | string
    name: string
    employee_id?: string
    outlet?: string | null
    brand?: string | null
    role?: string | null
    assigned: number
    completed: number
    in_progress: number
    not_started: number
    failed: number
    overdue: number
    completion_rate: number
    avg_score: number | null
    last_completed_at: Date | null
}

// Minimal assignment rows for aggregation, limited to the viewer's scope
function loadAssignments(viewer: AuthUser, filters: AssignmentFilters) {
    return prisma.assignments.findMany({
        select: {
            asg_id: true,
            asg_state: true,
            asg_due_at: true,
            asg_best_score: true,
            asg_completed_at: true,
            asg_module_id: true,
            asg_version: { select: { mv_title: true } },
            asg_user: {
                select: {
                    user_id: true,
                    user_employee_id: true,
                    user_first_name: true,
                    user_last_name: true,
                    user_role_relation: { select: { role_id: true, role_name: true } },
                    user_outlet: { select: { outlet_id: true, outlet_name: true } },
                    user_brand: { select: { brand_id: true, brand_name: true } }
                }
            }
        },
        where: assignmentWhere(viewer, filters)
    })
}

type LoadedAssignment = Awaited<ReturnType<typeof loadAssignments>>[number]

function groupKey(a: LoadedAssignment, groupBy: GroupBy) {
    const user = a.asg_user

    switch (groupBy) {
        case 'outlet':
            return { key: user.user_outlet?.outlet_id ?? 0, name: user.user_outlet?.outlet_name || 'No outlet' }
        case 'brand':
            return { key: user.user_brand?.brand_id ?? 0, name: user.user_brand?.brand_name || 'No brand' }
        case 'role':
            return { key: user.user_role_relation.role_id, name: user.user_role_relation.role_name }
        case 'module':
            return { key: a.asg_module_id, name: a.asg_version.mv_title }
        default:
            return {
                key: user.user_id,
                name: getFullName(user),
                employee_id: user.user_employee_id,
                outlet: user.user_outlet?.outlet_name || null,
                brand: user.user_brand?.brand_name || null,
                role: user.user_role_relation.role_name
            }
    }
}

export async function completionSummary(viewer: AuthUser, groupBy: GroupBy, filters: AssignmentFilters) {
    const assignments = await loadAssignments(viewer, filters)
    const groups = new Map<number | string, SummaryRow & { scoreSum: number; scoreCount: number }>()

    for (const a of assignments) {
        const { key, ...meta } = groupKey(a, groupBy)

        if (!groups.has(key)) {
            groups.set(key, {
                key,
                ...meta,
                assigned: 0,
                completed: 0,
                in_progress: 0,
                not_started: 0,
                failed: 0,
                overdue: 0,
                completion_rate: 0,
                avg_score: null,
                last_completed_at: null,
                scoreSum: 0,
                scoreCount: 0
            })
        }

        const row = groups.get(key)!
        row.assigned++

        if (a.asg_state === assignment_state.completed) {
            row.completed++
            if (!row.last_completed_at || (a.asg_completed_at && a.asg_completed_at > row.last_completed_at)) {
                row.last_completed_at = a.asg_completed_at
            }
        } else if (a.asg_state === assignment_state.in_progress) {
            row.in_progress++
        } else if (a.asg_state === assignment_state.failed) {
            row.failed++
        } else {
            row.not_started++
        }

        if (isOverdue(a)) {
            row.overdue++
        }

        if (a.asg_best_score !== null) {
            row.scoreSum += a.asg_best_score
            row.scoreCount++
        }
    }

    return Array.from(groups.values())
        .map(({ scoreSum, scoreCount, ...row }) => ({
            ...row,
            completion_rate: row.assigned ? Math.round((row.completed / row.assigned) * 100) : 0,
            avg_score: scoreCount ? Math.round(scoreSum / scoreCount) : null
        }))
        .sort((a, b) => a.completion_rate - b.completion_rate || String(a.name).localeCompare(String(b.name)))
}

export async function dashboardStats(viewer: AuthUser, filters: AssignmentFilters) {
    const assignments = await loadAssignments(viewer, filters)

    const totals = {
        assigned: assignments.length,
        completed: 0,
        in_progress: 0,
        not_started: 0,
        failed: 0,
        overdue: 0,
        completion_rate: 0,
        avg_score: null as number | null,
        learners: new Set(assignments.map((a) => a.asg_user.user_id)).size
    }

    let scoreSum = 0
    let scoreCount = 0

    for (const a of assignments) {
        if (a.asg_state === assignment_state.completed) {
            totals.completed++
        } else if (a.asg_state === assignment_state.in_progress) {
            totals.in_progress++
        } else if (a.asg_state === assignment_state.failed) {
            totals.failed++
        } else {
            totals.not_started++
        }

        if (isOverdue(a)) {
            totals.overdue++
        }

        if (a.asg_best_score !== null) {
            scoreSum += a.asg_best_score
            scoreCount++
        }
    }

    totals.completion_rate = totals.assigned ? Math.round((totals.completed / totals.assigned) * 100) : 0
    totals.avg_score = scoreCount ? Math.round(scoreSum / scoreCount) : null

    return totals
}

// Assignment rows for list reports (overdue, failed, repeated attempts)
export async function assignmentRows(
    viewer: AuthUser,
    filters: AssignmentFilters & { min_attempts?: any },
    take = 500,
    skip = 0
) {
    const where = assignmentWhere(viewer, filters)
    const minAttempts = Number(filters.min_attempts) || 0

    if (minAttempts > 0) {
        where.AND = [...(where.AND as any[]), { asg_attempts_used: { gte: minAttempts } }]
    }

    const [total, rows] = await Promise.all([
        prisma.assignments.count({ where }),
        prisma.assignments.findMany({
            where,
            include: {
                ...assignmentListInclude,
                assessment_attempts: {
                    select: { aa_attempt_no: true, aa_score: true, aa_passed: true, aa_submitted_at: true },
                    where: { aa_submitted_at: { not: null } },
                    orderBy: { aa_attempt_no: 'asc' }
                }
            },
            orderBy: [{ asg_due_at: { sort: 'asc', nulls: 'last' } }, { asg_id: 'desc' }],
            take,
            skip
        })
    ])

    return {
        total,
        rows: rows.map((a) => ({
            ...a,
            is_overdue: isOverdue(a),
            days_overdue:
                isOverdue(a) && a.asg_due_at ? Math.floor((Date.now() - a.asg_due_at.getTime()) / 86400000) : 0
        }))
    }
}
