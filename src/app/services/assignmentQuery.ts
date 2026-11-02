import type { Prisma } from '@/generated/prisma/client'
import { assignment_source, assignment_state } from '@/generated/prisma/enums'
import { getDateOrNull, getEnumOrNull, getIntOrNull, getStringOrNull } from '@core/helpers/commonHelpers'
import { AuthUser } from '@core/types/auth'
import { OPEN_STATES } from './assignmentService'
import { userScopeWhere } from './scopeService'

export interface AssignmentFilters {
    search?: any
    user_id?: any
    module_id?: any
    state?: any
    source?: any
    outlet_id?: any
    brand_id?: any
    role_id?: any
    overdue?: any
    from?: any
    to?: any
    include_revoked?: any
}

export const overdueWhere = (): Prisma.assignmentsWhereInput => ({
    asg_state: { in: OPEN_STATES },
    asg_due_at: { lt: new Date() }
})

// Assignments visible to the viewer, narrowed by report / list filters
export function assignmentWhere(viewer: AuthUser, filters: AssignmentFilters): Prisma.assignmentsWhereInput {
    const userWhere: Prisma.usersWhereInput[] = [userScopeWhere(viewer), { user_deleted: false }]
    const AND: Prisma.assignmentsWhereInput[] = [{ asg_deleted: false }]

    const user_id = getIntOrNull(filters.user_id)
    const outlet_id = getIntOrNull(filters.outlet_id)
    const brand_id = getIntOrNull(filters.brand_id)
    const role_id = getIntOrNull(filters.role_id)
    const module_id = getIntOrNull(filters.module_id)
    const state = getEnumOrNull(filters.state, assignment_state)
    const source = getEnumOrNull(filters.source, assignment_source)
    const search = getStringOrNull(filters.search)
    const from = getDateOrNull(filters.from)
    const to = getDateOrNull(filters.to)

    if (user_id) {
        userWhere.push({ user_id })
    }
    if (outlet_id) {
        userWhere.push({ user_outlet_id: outlet_id })
    }
    if (brand_id) {
        userWhere.push({ user_brand_id: brand_id })
    }
    if (role_id) {
        userWhere.push({ user_role_id: role_id })
    }

    AND.push({ asg_user: { AND: userWhere } })

    if (module_id) {
        AND.push({ asg_module_id: module_id })
    }
    if (filters.state === 'open') {
        AND.push({ asg_state: { in: OPEN_STATES } })
    } else if (state) {
        AND.push({ asg_state: state })
    } else if (filters.include_revoked !== '1') {
        AND.push({ asg_state: { not: assignment_state.revoked } })
    }
    if (source) {
        AND.push({ asg_source: source })
    }
    if (filters.overdue === '1') {
        AND.push(overdueWhere())
    }
    if (from) {
        AND.push({ asg_created_at: { gte: from } })
    }
    if (to) {
        AND.push({ asg_created_at: { lte: to } })
    }
    if (search) {
        AND.push({
            OR: [
                { asg_user: { user_first_name: { contains: search, mode: 'insensitive' } } },
                { asg_user: { user_last_name: { contains: search, mode: 'insensitive' } } },
                { asg_user: { user_employee_id: { contains: search, mode: 'insensitive' } } },
                { asg_version: { mv_title: { contains: search, mode: 'insensitive' } } }
            ]
        })
    }

    return { AND }
}

export const assignmentListInclude = {
    asg_user: {
        select: {
            user_id: true,
            user_employee_id: true,
            user_first_name: true,
            user_last_name: true,
            user_role_relation: { select: { role_name: true } },
            user_outlet: { select: { outlet_id: true, outlet_name: true } },
            user_brand: { select: { brand_id: true, brand_name: true } }
        }
    },
    asg_version: { select: { mv_id: true, mv_title: true, mv_version_no: true, mv_max_attempts: true } },
    asg_assigned_by: { select: { user_first_name: true, user_last_name: true } }
}

export function isOverdue(assignment: { asg_state: assignment_state; asg_due_at: Date | null }) {
    return Boolean(
        assignment.asg_due_at && assignment.asg_due_at < new Date() && OPEN_STATES.includes(assignment.asg_state as any)
    )
}
