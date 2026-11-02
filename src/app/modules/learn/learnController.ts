import { Request, Response } from 'express'

import {
    assignment_source,
    assignment_state,
    attempt_state,
    notification_type,
    question_type
} from '@/generated/prisma/enums'
import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import {
    getFullName,
    getIntArray,
    getIntOrNull,
    getNumberOrZero,
    getStringOrNull,
    shuffle
} from '@core/helpers/commonHelpers'
import { getSignedFileUrl } from '@core/services/StorageService'
import { notifyUsers } from '@core/services/NotificationService'
import { audit } from '@core/services/AuditService'
import { AuthUser } from '@core/types/auth'
import {
    computeSteps,
    createAssignments,
    getAssignmentSteps,
    isPrerequisiteMet,
    refreshAssignmentState,
    stepsInclude
} from '@/app/services/assignmentService'
import { isOverdue } from '@/app/services/assignmentQuery'
import { getVideoPlayback, playbackExpiry } from '@/app/services/mediaService'

// Longest gap between two heartbeats that still counts as continuous playback (seconds)
const MAX_HEARTBEAT_GAP = 30
// Fastest playback rate credited
const MAX_PLAYBACK_RATE = 2
const HEARTBEAT_SLACK = 5

// Assignment of the logged in learner, never another user's
function findOwnAssignment(user_id: number, asg_id: number | null) {
    if (!asg_id) {
        return Promise.resolve(null)
    }

    return prisma.assignments.findFirst({
        where: {
            asg_id,
            asg_user_id: user_id,
            asg_deleted: false,
            asg_state: { not: assignment_state.revoked }
        },
        include: { asg_version: true, asg_module: true }
    })
}

function watermark(user: AuthUser) {
    return {
        name: getFullName(user),
        employee_id: user.user_employee_id,
        outlet: user.user_outlet?.outlet_name || null
    }
}

function moduleVisibleTo(user: AuthUser) {
    return {
        AND: [
            {
                OR: [
                    { tm_brand_ids: { isEmpty: true } },
                    ...(user.user_brand_id ? [{ tm_brand_ids: { has: user.user_brand_id } }] : [])
                ]
            },
            { OR: [{ tm_role_ids: { isEmpty: true } }, { tm_role_ids: { has: user.user_role_id } }] }
        ]
    }
}

// My training list (metadata only, also available outside shift hours)
export async function getMyAssignments(req: Request, res: Response) {
    try {
        const { user_id } = req.userInfo!

        const assignments = await prisma.assignments.findMany({
            where: {
                asg_user_id: user_id,
                asg_deleted: false,
                asg_state: { not: assignment_state.revoked },
                // Archived modules disappear unless already completed (history)
                OR: [{ asg_module: { tm_archived: false } }, { asg_state: assignment_state.completed }]
            },
            include: {
                ...stepsInclude,
                asg_version: {
                    select: {
                        ...stepsInclude.asg_version.select,
                        mv_id: true,
                        mv_title: true,
                        mv_description: true,
                        mv_version_no: true,
                        mv_pass_mark: true,
                        mv_max_attempts: true
                    }
                },
                asg_module: {
                    select: {
                        tm_id: true,
                        tm_code: true,
                        tm_prerequisite_id: true,
                        tm_category: { select: { cat_name: true } }
                    }
                }
            },
            orderBy: [{ asg_due_at: { sort: 'asc', nulls: 'last' } }, { asg_id: 'asc' }]
        })

        const completedModules = new Set(
            assignments.filter((a) => a.asg_state === assignment_state.completed).map((a) => a.asg_module_id)
        )

        const rows = assignments.map(({ lesson_progress, ...assignment }) => {
            const steps = computeSteps({ ...assignment, lesson_progress })
            const prerequisite = assignment.asg_module.tm_prerequisite_id

            return {
                asg_id: assignment.asg_id,
                asg_state: assignment.asg_state,
                asg_source: assignment.asg_source,
                asg_is_mandatory: assignment.asg_is_mandatory,
                asg_ack_only: assignment.asg_ack_only,
                asg_due_at: assignment.asg_due_at,
                asg_started_at: assignment.asg_started_at,
                asg_completed_at: assignment.asg_completed_at,
                asg_best_score: assignment.asg_best_score,
                asg_attempts_used: assignment.asg_attempts_used,
                module: {
                    tm_id: assignment.asg_module.tm_id,
                    tm_code: assignment.asg_module.tm_code,
                    category: assignment.asg_module.tm_category?.cat_name || null
                },
                version: {
                    mv_id: assignment.asg_version.mv_id,
                    mv_title: assignment.asg_version.mv_title,
                    mv_description: assignment.asg_version.mv_description,
                    mv_version_no: assignment.asg_version.mv_version_no,
                    mv_pass_mark: assignment.asg_version.mv_pass_mark,
                    mv_max_attempts: assignment.asg_version.mv_max_attempts
                },
                steps,
                progress: steps.total_steps ? Math.round((steps.done_steps / steps.total_steps) * 100) : 0,
                is_overdue: isOverdue(assignment),
                is_locked: Boolean(prerequisite && !completedModules.has(prerequisite))
            }
        })

        return sendResponse(res, true, rows, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getMyAssignments', error)
        return sendResponse(res, false, null, 'Error getting your training', statusType.DB_ERROR)
    }
}

// Optional published modules for the learner's brand and role that are not assigned yet
export async function getAvailableModules(req: Request, res: Response) {
    try {
        const user = req.userInfo!

        const modules = await prisma.training_modules.findMany({
            where: {
                AND: [
                    moduleVisibleTo(user),
                    {
                        tm_is_mandatory: false,
                        tm_status: true,
                        tm_archived: false,
                        tm_deleted: false,
                        tm_current_version_id: { not: null },
                        assignments: {
                            none: {
                                asg_user_id: user.user_id,
                                asg_deleted: false,
                                asg_state: { not: assignment_state.revoked }
                            }
                        }
                    }
                ]
            },
            include: {
                tm_category: { select: { cat_name: true } },
                tm_current_version: {
                    select: { mv_title: true, mv_description: true, _count: { select: { lessons: true } } }
                }
            },
            orderBy: [{ tm_sequence: 'asc' }, { tm_id: 'asc' }]
        })

        const data = modules.map((m) => ({
            tm_id: m.tm_id,
            tm_code: m.tm_code,
            category: m.tm_category?.cat_name || null,
            title: m.tm_current_version?.mv_title,
            description: m.tm_current_version?.mv_description,
            lessons: m.tm_current_version?._count.lessons || 0
        }))

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAvailableModules', error)
        return sendResponse(res, false, null, 'Error getting available modules', statusType.DB_ERROR)
    }
}

export async function enrollModule(req: Request, res: Response) {
    try {
        const user = req.userInfo!
        const tm_id = getIntOrNull(req.body.tm_id)

        const module = tm_id
            ? await prisma.training_modules.findFirst({
                  where: {
                      AND: [
                          moduleVisibleTo(user),
                          { tm_id, tm_is_mandatory: false, tm_archived: false, tm_deleted: false }
                      ]
                  }
              })
            : null

        if (!module) {
            return sendResponse(res, false, null, 'Module not available', statusType.NOT_FOUND)
        }

        const result = await createAssignments({
            module_id: module.tm_id,
            user_ids: [user.user_id],
            source: assignment_source.self,
            assigned_by_id: user.user_id,
            created_by: String(user.user_id)
        })

        return sendResponse(res, result.created > 0, result, result.created ? 'Enrolled' : result.message)
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in enrollModule', error)
        return sendResponse(res, false, null, 'Error enrolling', statusType.DB_ERROR)
    }
}

export async function getAssignmentDetail(req: Request, res: Response) {
    try {
        const user = req.userInfo!
        const assignment = await findOwnAssignment(user.user_id, getIntOrNull(req.params.asg_id))

        if (!assignment) {
            return sendResponse(res, false, null, 'Training not found', statusType.NOT_FOUND)
        }

        const prerequisiteMet = await isPrerequisiteMet(user.user_id, assignment.asg_module.tm_prerequisite_id)

        if (!prerequisiteMet) {
            const prerequisite = await prisma.training_modules.findUnique({
                where: { tm_id: assignment.asg_module.tm_prerequisite_id! },
                select: { tm_current_version: { select: { mv_title: true } } }
            })

            return sendResponse(
                res,
                false,
                { locked: true, prerequisite: prerequisite?.tm_current_version?.mv_title },
                'Complete the prerequisite module first',
                statusType.FORBIDDEN
            )
        }

        if (assignment.asg_module.tm_archived && assignment.asg_state !== assignment_state.completed) {
            return sendResponse(res, false, null, 'This module is no longer available', statusType.NOT_FOUND)
        }

        // Opening the module starts it
        if (!assignment.asg_started_at && assignment.asg_state === assignment_state.assigned) {
            await prisma.assignments.update({
                where: { asg_id: assignment.asg_id },
                data: { asg_started_at: new Date(), asg_state: assignment_state.in_progress }
            })
        }

        const version = await prisma.module_versions.findUniqueOrThrow({
            where: { mv_id: assignment.asg_version_id },
            include: {
                lessons: {
                    orderBy: { lesson_sequence: 'asc' },
                    include: {
                        lesson_video: { select: { video_id: true, video_duration_seconds: true, video_state: true } },
                        lesson_files: { orderBy: { lf_sequence: 'asc' }, include: { lf_file: true } },
                        lesson_progress: { where: { lp_assignment_id: assignment.asg_id } }
                    }
                },
                _count: { select: { questions: true } }
            }
        })

        const attempts = await prisma.assessment_attempts.findMany({
            select: {
                aa_id: true,
                aa_attempt_no: true,
                aa_state: true,
                aa_score: true,
                aa_passed: true,
                aa_started_at: true,
                aa_submitted_at: true
            },
            where: { aa_assignment_id: assignment.asg_id, aa_version_id: assignment.asg_version_id },
            orderBy: { aa_attempt_no: 'asc' }
        })

        const steps = await getAssignmentSteps(assignment.asg_id)
        const questionCount = version.mv_question_limit
            ? Math.min(version.mv_question_limit, version._count.questions)
            : version._count.questions

        const data = {
            assignment: {
                ...steps.assignment,
                lesson_progress: undefined,
                asg_version: undefined,
                is_overdue: isOverdue(steps.assignment)
            },
            module: {
                tm_id: assignment.asg_module.tm_id,
                tm_code: assignment.asg_module.tm_code
            },
            version: {
                mv_id: version.mv_id,
                mv_version_no: version.mv_version_no,
                mv_title: version.mv_title,
                mv_description: version.mv_description,
                mv_instructions: version.mv_instructions,
                mv_pass_mark: version.mv_pass_mark,
                mv_max_attempts: version.mv_max_attempts,
                mv_min_watch_percent: version.mv_min_watch_percent,
                mv_requires_ack: version.mv_requires_ack || assignment.asg_ack_only,
                mv_ack_text: version.mv_ack_text,
                question_count: questionCount
            },
            lessons: version.lessons.map((lesson) => {
                const progress = lesson.lesson_progress[0]

                return {
                    lesson_id: lesson.lesson_id,
                    lesson_title: lesson.lesson_title,
                    lesson_content: lesson.lesson_content,
                    lesson_sequence: lesson.lesson_sequence,
                    lesson_is_required: lesson.lesson_is_required,
                    min_watch_percent: lesson.lesson_min_watch_percent ?? version.mv_min_watch_percent,
                    video: lesson.lesson_video,
                    files: lesson.lesson_files.map((lf) => ({
                        file_id: lf.lf_file.file_id,
                        file_name: lf.lf_file.file_name,
                        file_mime: lf.lf_file.file_mime,
                        url: getSignedFileUrl(lf.lf_file.file_id)
                    })),
                    progress: {
                        position: progress?.lp_position_seconds || 0,
                        max_position: progress?.lp_max_position || 0,
                        watched_percent: progress?.lp_watched_percent || 0,
                        completed_at: progress?.lp_completed_at || null
                    }
                }
            }),
            attempts,
            steps: { ...steps, assignment: undefined },
            shift: req.shiftAccess
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAssignmentDetail', error)
        return sendResponse(res, false, null, 'Error getting training', statusType.DB_ERROR)
    }
}

async function findOwnLesson(user_id: number, asg_id: number | null, lesson_id: number | null) {
    const assignment = await findOwnAssignment(user_id, asg_id)

    if (!assignment || !lesson_id) {
        return { assignment: null, lesson: null }
    }

    const lesson = await prisma.lessons.findFirst({
        where: { lesson_id, lesson_version_id: assignment.asg_version_id },
        include: { lesson_video: true }
    })

    return { assignment, lesson }
}

// Signed, short lived HLS URL; expiry never passes the end of the learner's shift
export async function getLessonPlayback(req: Request, res: Response) {
    try {
        const user = req.userInfo!
        const { assignment, lesson } = await findOwnLesson(
            user.user_id,
            getIntOrNull(req.query.asg_id),
            getIntOrNull(req.query.lesson_id)
        )

        if (!assignment || !lesson || !lesson.lesson_video) {
            return sendResponse(res, false, null, 'Video not found', statusType.NOT_FOUND)
        }

        const playback = getVideoPlayback(lesson.lesson_video, playbackExpiry(req.shiftAccess?.ends_at))

        if (!playback?.url) {
            return sendResponse(res, false, null, 'Video is not available yet', statusType.SERVICE_UNAVAILABLE)
        }

        const progress = await prisma.lesson_progress.findUnique({
            where: {
                lp_assignment_id_lp_lesson_id: { lp_assignment_id: assignment.asg_id, lp_lesson_id: lesson.lesson_id }
            }
        })

        const data = {
            ...playback,
            resume_position: progress?.lp_position_seconds || 0,
            max_position: progress?.lp_max_position || 0,
            completed: Boolean(progress?.lp_completed_at),
            watermark: watermark(user),
            heartbeat_seconds: 10
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getLessonPlayback', error)
        return sendResponse(res, false, null, 'Error getting video', statusType.DB_ERROR)
    }
}

// Heartbeat from the player. Only continuous, plausible forward playback is credited, so skipping
// ahead or leaving the tab open does not count as watching. Body: { asg_id, lesson_id, position, event }
export async function saveLessonProgress(req: Request, res: Response) {
    try {
        const user = req.userInfo!
        const { assignment, lesson } = await findOwnLesson(
            user.user_id,
            getIntOrNull(req.body.asg_id),
            getIntOrNull(req.body.lesson_id)
        )

        if (!assignment || !lesson || !lesson.lesson_video) {
            return sendResponse(res, false, null, 'Lesson not found', statusType.NOT_FOUND)
        }

        const now = new Date()
        const key = { lp_assignment_id: assignment.asg_id, lp_lesson_id: lesson.lesson_id }

        const progress =
            (await prisma.lesson_progress.findUnique({ where: { lp_assignment_id_lp_lesson_id: key } })) ||
            (await prisma.lesson_progress.create({ data: { ...key, lp_user_id: user.user_id } }))

        const duration =
            lesson.lesson_video.video_duration_seconds || Math.floor(getNumberOrZero(req.body.duration)) || null
        const position = Math.max(0, Math.min(Math.floor(getNumberOrZero(req.body.position)), duration ?? Infinity))
        const isSessionStart = req.body.event === 'play' || !progress.lp_last_heartbeat_at

        let credit = 0
        let maxPosition = progress.lp_max_position

        if (!isSessionStart) {
            const elapsed = Math.min(
                (now.getTime() - progress.lp_last_heartbeat_at!.getTime()) / 1000,
                MAX_HEARTBEAT_GAP
            )
            const delta = position - progress.lp_position_seconds
            const plausible = delta > 0 && delta <= elapsed * MAX_PLAYBACK_RATE + HEARTBEAT_SLACK
            const contiguous = progress.lp_position_seconds <= progress.lp_max_position + HEARTBEAT_SLACK

            if (plausible && contiguous && position > progress.lp_max_position) {
                credit = position - Math.max(progress.lp_position_seconds, progress.lp_max_position)
                maxPosition = position
            }
        }

        const watched = Math.min(progress.lp_watched_seconds + credit, duration ?? Infinity)
        const percent = duration ? Math.min(100, Math.floor((watched / duration) * 100)) : 0
        const required = lesson.lesson_min_watch_percent ?? assignment.asg_version.mv_min_watch_percent
        const completesNow = !progress.lp_completed_at && duration !== null && percent >= required

        await prisma.lesson_progress.update({
            where: { lp_id: progress.lp_id },
            data: {
                lp_position_seconds: position,
                lp_max_position: maxPosition,
                lp_watched_seconds: watched,
                lp_duration_seconds: duration,
                lp_watched_percent: percent,
                lp_last_heartbeat_at: now,
                ...(completesNow ? { lp_completed_at: now } : {})
            }
        })

        if (completesNow) {
            await refreshAssignmentState(assignment.asg_id)
        }

        const data = {
            watched_percent: percent,
            max_position: maxPosition,
            completed: Boolean(progress.lp_completed_at) || completesNow,
            required_percent: required
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in saveLessonProgress', error)
        return sendResponse(res, false, null, 'Error saving progress', statusType.DB_ERROR)
    }
}

// Marks a reading lesson (text / documents, no video) as done
export async function completeLesson(req: Request, res: Response) {
    try {
        const user = req.userInfo!
        const { assignment, lesson } = await findOwnLesson(
            user.user_id,
            getIntOrNull(req.body.asg_id),
            getIntOrNull(req.body.lesson_id)
        )

        if (!assignment || !lesson) {
            return sendResponse(res, false, null, 'Lesson not found', statusType.NOT_FOUND)
        }

        if (lesson.lesson_video_id) {
            return sendResponse(res, false, null, 'Watch the video to complete this lesson', statusType.BAD_REQUEST)
        }

        const now = new Date()

        await prisma.lesson_progress.upsert({
            where: {
                lp_assignment_id_lp_lesson_id: { lp_assignment_id: assignment.asg_id, lp_lesson_id: lesson.lesson_id }
            },
            create: {
                lp_assignment_id: assignment.asg_id,
                lp_lesson_id: lesson.lesson_id,
                lp_user_id: user.user_id,
                lp_watched_percent: 100,
                lp_completed_at: now
            },
            update: { lp_watched_percent: 100, lp_completed_at: now }
        })

        await refreshAssignmentState(assignment.asg_id)

        return sendResponse(res, true, null, 'Lesson completed')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in completeLesson', error)
        return sendResponse(res, false, null, 'Error completing lesson', statusType.DB_ERROR)
    }
}

// Starts (or resumes) an assessment attempt. Questions are served without the answers.
export async function startAttempt(req: Request, res: Response) {
    try {
        const user = req.userInfo!
        const assignment = await findOwnAssignment(user.user_id, getIntOrNull(req.body.asg_id))

        if (!assignment) {
            return sendResponse(res, false, null, 'Training not found', statusType.NOT_FOUND)
        }

        const steps = await getAssignmentSteps(assignment.asg_id)
        const version = assignment.asg_version

        if (!steps.has_assessment) {
            return sendResponse(res, false, null, 'This module has no assessment', statusType.BAD_REQUEST)
        }

        if (!steps.all_lessons_done) {
            return sendResponse(res, false, null, 'Complete all lessons before the assessment', statusType.BAD_REQUEST)
        }

        if (assignment.asg_assessment_passed_at) {
            return sendResponse(res, false, null, 'You have already passed this assessment', statusType.BAD_REQUEST)
        }

        let attempt = await prisma.assessment_attempts.findFirst({
            where: {
                aa_assignment_id: assignment.asg_id,
                aa_version_id: version.mv_id,
                aa_state: attempt_state.in_progress
            }
        })

        if (!attempt) {
            if (version.mv_max_attempts > 0 && assignment.asg_attempts_used >= version.mv_max_attempts) {
                return sendResponse(
                    res,
                    false,
                    null,
                    'No attempts left. Your manager will assign retraining.',
                    statusType.BAD_REQUEST
                )
            }

            const questions = await prisma.questions.findMany({
                where: { q_version_id: version.mv_id },
                include: { options: { orderBy: { qo_sequence: 'asc' } } },
                orderBy: { q_sequence: 'asc' }
            })

            let selected = version.mv_randomize_questions ? shuffle(questions) : questions
            if (version.mv_question_limit && version.mv_question_limit < selected.length) {
                selected = selected.slice(0, version.mv_question_limit)
            }

            const optionOrder: Record<number, number[]> = {}
            for (const question of selected) {
                const ids = question.options.map((o) => o.qo_id)
                optionOrder[question.q_id] = version.mv_randomize_options ? shuffle(ids) : ids
            }

            const previousAttempts = await prisma.assessment_attempts.count({
                where: { aa_assignment_id: assignment.asg_id, aa_version_id: version.mv_id }
            })

            attempt = await prisma.assessment_attempts.create({
                data: {
                    aa_assignment_id: assignment.asg_id,
                    aa_user_id: user.user_id,
                    aa_version_id: version.mv_id,
                    aa_attempt_no: previousAttempts + 1,
                    aa_question_ids: selected.map((q) => q.q_id),
                    aa_option_order: optionOrder
                }
            })
        }

        const questions = await prisma.questions.findMany({
            where: { q_id: { in: attempt.aa_question_ids } },
            include: { options: true }
        })
        const optionOrder = (attempt.aa_option_order || {}) as Record<string, number[]>

        const data = {
            aa_id: attempt.aa_id,
            aa_attempt_no: attempt.aa_attempt_no,
            pass_mark: version.mv_pass_mark,
            max_attempts: version.mv_max_attempts,
            attempts_used: assignment.asg_attempts_used,
            questions: attempt.aa_question_ids.map((q_id) => {
                const question = questions.find((q) => q.q_id === q_id)!
                const order = optionOrder[q_id] || question.options.map((o) => o.qo_id)

                return {
                    q_id: question.q_id,
                    q_type: question.q_type,
                    q_text: question.q_text,
                    q_marks: question.q_marks,
                    options: order
                        .map((qo_id) => question.options.find((o) => o.qo_id === qo_id))
                        .filter(Boolean)
                        .map((o) => ({ qo_id: o!.qo_id, qo_text: o!.qo_text }))
                }
            })
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in startAttempt', error)
        return sendResponse(res, false, null, 'Error starting assessment', statusType.DB_ERROR)
    }
}

function sameIds(a: number[], b: number[]) {
    return a.length === b.length && a.every((id) => b.includes(id))
}

// Grades an attempt. Written answers are stored for review but do not count towards the score.
// Body: { aa_id, answers: [{ q_id, option_ids: [], text }] }
export async function submitAttempt(req: Request, res: Response) {
    try {
        const user = req.userInfo!
        const aa_id = getIntOrNull(req.body.aa_id)

        const attempt = aa_id
            ? await prisma.assessment_attempts.findFirst({
                  where: { aa_id, aa_user_id: user.user_id, aa_state: attempt_state.in_progress },
                  include: { aa_assignment: { include: { asg_version: true } } }
              })
            : null

        if (!attempt || attempt.aa_assignment.asg_state === assignment_state.revoked) {
            return sendResponse(res, false, null, 'Assessment not found or already submitted', statusType.NOT_FOUND)
        }

        const assignment = attempt.aa_assignment
        const version = assignment.asg_version

        const questions = await prisma.questions.findMany({
            where: { q_id: { in: attempt.aa_question_ids } },
            include: { options: true }
        })

        const submitted = new Map<number, any>()
        for (const answer of Array.isArray(req.body.answers) ? req.body.answers : []) {
            const q_id = getIntOrNull(answer?.q_id)
            if (q_id) {
                submitted.set(q_id, answer)
            }
        }

        let marksTotal = 0
        let marksObtained = 0

        const answers = questions.map((question) => {
            const answer = submitted.get(question.q_id)
            const validIds = question.options.map((o) => o.qo_id)
            const optionIds = getIntArray(answer?.option_ids).filter((id) => validIds.includes(id))

            if (question.q_type === question_type.written) {
                return {
                    ans_question_id: question.q_id,
                    ans_option_ids: [],
                    ans_text: getStringOrNull(answer?.text),
                    ans_is_correct: null,
                    ans_marks: 0
                }
            }

            const correctIds = question.options.filter((o) => o.qo_is_correct).map((o) => o.qo_id)
            const chosen = question.q_type === question_type.single ? optionIds.slice(0, 1) : optionIds
            const isCorrect = sameIds(chosen, correctIds)

            marksTotal += question.q_marks
            marksObtained += isCorrect ? question.q_marks : 0

            return {
                ans_question_id: question.q_id,
                ans_option_ids: chosen,
                ans_text: null,
                ans_is_correct: isCorrect,
                ans_marks: isCorrect ? question.q_marks : 0
            }
        })

        const score = marksTotal ? Math.round((marksObtained / marksTotal) * 100) : 100
        const passed = score >= version.mv_pass_mark
        const attemptsUsed = assignment.asg_attempts_used + 1
        const outOfAttempts = !passed && version.mv_max_attempts > 0 && attemptsUsed >= version.mv_max_attempts
        const now = new Date()

        await prisma.$transaction([
            prisma.attempt_answers.createMany({
                data: answers.map((answer) => ({ ...answer, ans_attempt_id: attempt.aa_id }))
            }),
            prisma.assessment_attempts.update({
                where: { aa_id: attempt.aa_id },
                data: {
                    aa_state: attempt_state.submitted,
                    aa_marks_total: marksTotal,
                    aa_marks_obtained: marksObtained,
                    aa_score: score,
                    aa_passed: passed,
                    aa_submitted_at: now
                }
            }),
            prisma.assignments.update({
                where: { asg_id: assignment.asg_id },
                data: {
                    asg_attempts_used: attemptsUsed,
                    asg_best_score: Math.max(assignment.asg_best_score ?? 0, score),
                    ...(passed ? { asg_assessment_passed_at: now } : {}),
                    ...(outOfAttempts ? { asg_state: assignment_state.failed } : {})
                }
            })
        ])

        await refreshAssignmentState(assignment.asg_id)

        if (outOfAttempts && user.user_manager_id) {
            await notifyUsers([user.user_manager_id], {
                type: notification_type.general,
                title: 'Assessment failed',
                message: `${getFullName(user)} (${user.user_employee_id}) failed "${version.mv_title}" after ${attemptsUsed} attempts and needs retraining.`,
                link: `/team/${user.user_id}`
            })
        }

        await audit(req, 'submit_attempt', 'assignment', assignment.asg_id, { aa_id: attempt.aa_id, score, passed })

        // Correct answers are revealed only once the learner can no longer retry
        const reveal = passed || outOfAttempts

        const data = {
            aa_id: attempt.aa_id,
            score,
            passed,
            marks_obtained: marksObtained,
            marks_total: marksTotal,
            pass_mark: version.mv_pass_mark,
            attempts_used: attemptsUsed,
            attempts_left: version.mv_max_attempts > 0 ? Math.max(0, version.mv_max_attempts - attemptsUsed) : null,
            failed: outOfAttempts,
            review: attempt.aa_question_ids.map((q_id) => {
                const question = questions.find((q) => q.q_id === q_id)!
                const answer = answers.find((a) => a.ans_question_id === q_id)!

                return {
                    q_id,
                    q_text: question.q_text,
                    q_type: question.q_type,
                    is_correct: answer.ans_is_correct,
                    explanation: reveal ? question.q_explanation : null,
                    correct_option_ids: reveal
                        ? question.options.filter((o) => o.qo_is_correct).map((o) => o.qo_id)
                        : null
                }
            })
        }

        return sendResponse(res, true, data, passed ? 'Assessment passed' : 'Assessment not passed')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in submitAttempt', error)
        return sendResponse(res, false, null, 'Error submitting assessment', statusType.DB_ERROR)
    }
}

// Final step: the learner acknowledges the SOP text of the version they completed
export async function acknowledge(req: Request, res: Response) {
    try {
        const user = req.userInfo!
        const assignment = await findOwnAssignment(user.user_id, getIntOrNull(req.body.asg_id))

        if (!assignment) {
            return sendResponse(res, false, null, 'Training not found', statusType.NOT_FOUND)
        }

        const steps = await getAssignmentSteps(assignment.asg_id)

        if (!steps.requires_ack) {
            return sendResponse(res, false, null, 'No acknowledgement required', statusType.BAD_REQUEST)
        }

        if (!steps.all_lessons_done || !steps.assessment_done) {
            return sendResponse(
                res,
                false,
                null,
                'Complete the lessons and pass the assessment before acknowledging',
                statusType.BAD_REQUEST
            )
        }

        if (assignment.asg_acknowledged_at) {
            return sendResponse(res, true, null, 'Already acknowledged')
        }

        const now = new Date()

        await prisma.$transaction([
            prisma.acknowledgements.create({
                data: {
                    ack_assignment_id: assignment.asg_id,
                    ack_user_id: user.user_id,
                    ack_version_id: assignment.asg_version_id,
                    ack_text: assignment.asg_version.mv_ack_text,
                    ack_ip: req.ip?.slice(0, 64) || null,
                    ack_user_agent: req.get('user-agent')?.slice(0, 255) || null
                }
            }),
            prisma.assignments.update({
                where: { asg_id: assignment.asg_id },
                data: { asg_acknowledged_at: now }
            })
        ])

        const state = await refreshAssignmentState(assignment.asg_id)

        await audit(req, 'acknowledge', 'assignment', assignment.asg_id, { mv_id: assignment.asg_version_id })

        return sendResponse(res, true, { asg_state: state }, 'Acknowledged')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in acknowledge', error)
        return sendResponse(res, false, null, 'Error saving acknowledgement', statusType.DB_ERROR)
    }
}

// Completed training with the version, score and acknowledgement that were recorded
export async function getMyHistory(req: Request, res: Response) {
    try {
        const { user_id } = req.userInfo!

        const data = await prisma.assignments.findMany({
            select: {
                asg_id: true,
                asg_source: true,
                asg_completed_at: true,
                asg_best_score: true,
                asg_attempts_used: true,
                asg_version: { select: { mv_title: true, mv_version_no: true } },
                acknowledgement: { select: { ack_created_at: true } }
            },
            where: { asg_user_id: user_id, asg_deleted: false, asg_state: assignment_state.completed },
            orderBy: { asg_completed_at: 'desc' }
        })

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getMyHistory', error)
        return sendResponse(res, false, null, 'Error getting history', statusType.DB_ERROR)
    }
}
