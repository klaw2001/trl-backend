import { assignment_source, assignment_state, notification_type, update_action } from '@/generated/prisma/enums'
import prisma from '@core/helpers/prisma'
import { addDays } from '@core/helpers/commonHelpers'
import { notifyUsers } from '@core/services/NotificationService'

// States that still need work from the learner
export const OPEN_STATES = [assignment_state.assigned, assignment_state.in_progress]

interface CreateAssignmentsOptions {
    module_id: number
    user_ids: number[]
    source: assignment_source
    assigned_by_id?: number | null
    due_at?: Date | null
    ack_only?: boolean
    // user_id -> previous assignment id (retraining chain)
    previous?: Map<number, number>
    created_by?: string
}

export function dueDateFromDays(days: number | null | undefined, from = new Date()) {
    return days && days > 0 ? addDays(from, days) : null
}

// Creates assignments on the module's published version, skipping users that already have an open assignment
// or have completed the current version. Returns the number created and skipped.
export async function createAssignments(options: CreateAssignmentsOptions) {
    const module = await prisma.training_modules.findFirst({
        where: {
            tm_id: options.module_id,
            tm_status: true,
            tm_archived: false,
            tm_deleted: false,
            tm_current_version_id: { not: null }
        },
        include: { tm_current_version: { select: { mv_id: true, mv_title: true } } }
    })

    if (!module || !module.tm_current_version) {
        return { created: 0, skipped: options.user_ids.length, message: 'Module is not published' }
    }

    const version = module.tm_current_version

    const activeUsers = await prisma.users.findMany({
        select: { user_id: true },
        where: { user_id: { in: options.user_ids }, user_status: true, user_deleted: false }
    })

    const existing = await prisma.assignments.findMany({
        select: { asg_user_id: true },
        where: {
            asg_module_id: module.tm_id,
            asg_user_id: { in: activeUsers.map((u) => u.user_id) },
            asg_deleted: false,
            OR: [
                { asg_state: { in: OPEN_STATES } },
                { asg_state: assignment_state.completed, asg_version_id: version.mv_id }
            ]
        }
    })

    const skip = new Set(existing.map((e) => e.asg_user_id))
    const targets = activeUsers.map((u) => u.user_id).filter((user_id) => !skip.has(user_id))

    if (!targets.length) {
        return { created: 0, skipped: options.user_ids.length, message: 'Already assigned' }
    }

    const due_at = options.due_at !== undefined ? options.due_at : dueDateFromDays(module.tm_due_days)

    const created = await prisma.assignments.createManyAndReturn({
        select: { asg_id: true, asg_user_id: true },
        data: targets.map((user_id) => ({
            asg_user_id: user_id,
            asg_module_id: module.tm_id,
            asg_version_id: version.mv_id,
            asg_source: options.source,
            asg_is_mandatory: module.tm_is_mandatory,
            asg_ack_only: Boolean(options.ack_only),
            asg_due_at: due_at,
            asg_assigned_by_id: options.assigned_by_id || null,
            asg_previous_id: options.previous?.get(user_id) || null,
            asg_created_by: options.created_by || null
        }))
    })

    const isRetraining = options.source === assignment_source.retraining
    const dueText = due_at ? ` Complete it by ${due_at.toDateString()}.` : ''

    await notifyUsers(
        created.map((c) => c.asg_user_id),
        {
            type: isRetraining ? notification_type.retraining : notification_type.new_training,
            title: isRetraining
                ? options.ack_only
                    ? `Updated SOP: ${version.mv_title}`
                    : `Retraining required: ${version.mv_title}`
                : `New training: ${version.mv_title}`,
            message: isRetraining
                ? options.ack_only
                    ? `The SOP "${version.mv_title}" was updated. Please review it and acknowledge again.${dueText}`
                    : `The module "${version.mv_title}" was updated and must be completed again.${dueText}`
                : `You have been assigned "${version.mv_title}".${dueText}`,
            link: '/my-training',
            email: true
        }
    )

    return { created: created.length, skipped: options.user_ids.length - created.length, message: 'success' }
}

// Assigns every published module of a training path to a user
export async function assignPathToUser(
    user_id: number,
    path_id: number,
    deadline: Date | null,
    assigned_by_id: number | null,
    created_by?: string
) {
    const pathModules = await prisma.training_path_modules.findMany({
        where: { tpm_path_id: path_id, tpm_path: { tp_deleted: false, tp_status: true } },
        include: { tpm_module: { select: { tm_due_days: true } } },
        orderBy: { tpm_sequence: 'asc' }
    })

    let created = 0
    for (const pm of pathModules) {
        const result = await createAssignments({
            module_id: pm.tpm_module_id,
            user_ids: [user_id],
            source: assignment_source.path,
            assigned_by_id,
            due_at: deadline || dueDateFromDays(pm.tpm_due_days ?? pm.tpm_module.tm_due_days),
            created_by
        })
        created += result.created
    }

    return created
}

// New assignment on the current version for a learner who failed or must redo a module
export async function retrainAssignment(asg_id: number, assigned_by_id: number, created_by: string) {
    const assignment = await prisma.assignments.findFirst({ where: { asg_id, asg_deleted: false } })

    if (!assignment) {
        return { created: 0, message: 'Assignment not found' }
    }

    if (OPEN_STATES.includes(assignment.asg_state as any)) {
        await prisma.assignments.update({
            where: { asg_id },
            data: { asg_state: assignment_state.revoked, asg_revoked_at: new Date(), asg_revoke_reason: 'Retraining' }
        })
    }

    return createAssignments({
        module_id: assignment.asg_module_id,
        user_ids: [assignment.asg_user_id],
        source: assignment_source.retraining,
        assigned_by_id,
        previous: new Map([[assignment.asg_user_id, assignment.asg_id]]),
        created_by
    })
}

export async function isPrerequisiteMet(user_id: number, prerequisite_id: number | null) {
    if (!prerequisite_id) {
        return true
    }

    const completed = await prisma.assignments.count({
        where: {
            asg_user_id: user_id,
            asg_module_id: prerequisite_id,
            asg_state: assignment_state.completed,
            asg_deleted: false
        }
    })

    return completed > 0
}

// Include needed by computeSteps
export const stepsInclude = {
    asg_version: {
        select: {
            mv_requires_ack: true,
            lessons: { select: { lesson_id: true, lesson_is_required: true } },
            _count: { select: { questions: true } }
        }
    },
    lesson_progress: { select: { lp_lesson_id: true, lp_completed_at: true } }
}

interface StepsSource {
    asg_ack_only: boolean
    asg_assessment_passed_at: Date | null
    asg_acknowledged_at: Date | null
    asg_version: {
        mv_requires_ack: boolean
        lessons: { lesson_id: number; lesson_is_required: boolean }[]
        _count: { questions: number }
    }
    lesson_progress: { lp_lesson_id: number; lp_completed_at: Date | null }[]
}

// Step counts used for progress bars: required lessons + assessment + acknowledgement
export function computeSteps(assignment: StepsSource) {
    const version = assignment.asg_version
    const requiredLessons = version.lessons.filter((l) => l.lesson_is_required).map((l) => l.lesson_id)
    const completedLessons = new Set(
        assignment.lesson_progress.filter((p) => p.lp_completed_at).map((p) => p.lp_lesson_id)
    )
    const lessonsDone = requiredLessons.filter((id) => completedLessons.has(id)).length
    const hasAssessment = version._count.questions > 0
    const requiresAck = version.mv_requires_ack || assignment.asg_ack_only

    if (assignment.asg_ack_only) {
        return {
            lessons_total: requiredLessons.length,
            lessons_done: requiredLessons.length,
            has_assessment: false,
            requires_ack: true,
            all_lessons_done: true,
            assessment_done: true,
            ack_done: Boolean(assignment.asg_acknowledged_at),
            total_steps: 1,
            done_steps: assignment.asg_acknowledged_at ? 1 : 0
        }
    }

    const all_lessons_done = lessonsDone === requiredLessons.length
    const assessment_done = !hasAssessment || Boolean(assignment.asg_assessment_passed_at)
    const ack_done = !requiresAck || Boolean(assignment.asg_acknowledged_at)

    return {
        lessons_total: requiredLessons.length,
        lessons_done: lessonsDone,
        has_assessment: hasAssessment,
        requires_ack: requiresAck,
        all_lessons_done,
        assessment_done,
        ack_done,
        total_steps: requiredLessons.length + (hasAssessment ? 1 : 0) + (requiresAck ? 1 : 0),
        done_steps: lessonsDone + (hasAssessment && assessment_done ? 1 : 0) + (requiresAck && ack_done ? 1 : 0)
    }
}

export async function getAssignmentSteps(asg_id: number) {
    const assignment = await prisma.assignments.findUniqueOrThrow({
        where: { asg_id },
        include: stepsInclude
    })

    return { assignment, ...computeSteps(assignment) }
}

// Re-evaluates an assignment after any learner action. Complete only when lessons, assessment and
// acknowledgement are all done; video playback alone never completes a module.
export async function refreshAssignmentState(asg_id: number) {
    const steps = await getAssignmentSteps(asg_id)
    const assignment = steps.assignment

    if (assignment.asg_state === assignment_state.completed || assignment.asg_state === assignment_state.revoked) {
        return assignment.asg_state
    }

    const data: any = {}
    const now = new Date()

    if (steps.all_lessons_done && !assignment.asg_lessons_completed_at) {
        data.asg_lessons_completed_at = now
    }

    if (steps.all_lessons_done && steps.assessment_done && steps.ack_done) {
        data.asg_state = assignment_state.completed
        data.asg_completed_at = now
    } else if (assignment.asg_state !== assignment_state.failed) {
        data.asg_state = assignment.asg_started_at ? assignment_state.in_progress : assignment_state.assigned
    }

    if (Object.keys(data).length) {
        await prisma.assignments.update({ where: { asg_id }, data })
    }

    return data.asg_state || assignment.asg_state
}

// Applies a newly published version to existing learners.
// none: open assignments not yet started move to the new version, everything else stays.
// reacknowledge / retrain: open assignments restart on the new version; learners who completed an older
// version get a new assignment (acknowledgement only, or the full module). Old records stay untouched.
export async function applyVersionPublish(
    module_id: number,
    version_id: number,
    action: update_action,
    actor_id: number,
    created_by: string
) {
    const olderOpen = {
        asg_module_id: module_id,
        asg_version_id: { not: version_id },
        asg_state: { in: OPEN_STATES },
        asg_deleted: false
    }

    await prisma.assignments.updateMany({
        where: { ...olderOpen, asg_started_at: null },
        data: { asg_version_id: version_id }
    })

    if (action === update_action.none) {
        return { moved: 0, retrained: 0 }
    }

    const restarted = await prisma.assignments.updateMany({
        where: olderOpen,
        data: {
            asg_version_id: version_id,
            asg_state: assignment_state.assigned,
            asg_started_at: null,
            asg_lessons_completed_at: null,
            asg_assessment_passed_at: null,
            asg_acknowledged_at: null,
            asg_best_score: null,
            asg_attempts_used: 0
        }
    })

    const completed = await prisma.assignments.findMany({
        select: { asg_id: true, asg_user_id: true },
        where: {
            asg_module_id: module_id,
            asg_version_id: { not: version_id },
            asg_state: assignment_state.completed,
            asg_deleted: false
        },
        orderBy: { asg_completed_at: 'asc' }
    })

    // Latest completed assignment per user becomes the previous link
    const previous = new Map<number, number>()
    completed.forEach((c) => previous.set(c.asg_user_id, c.asg_id))

    const result = await createAssignments({
        module_id,
        user_ids: Array.from(previous.keys()),
        source: assignment_source.retraining,
        assigned_by_id: actor_id,
        ack_only: action === update_action.reacknowledge,
        previous,
        created_by
    })

    return { moved: restarted.count, retrained: result.created }
}
