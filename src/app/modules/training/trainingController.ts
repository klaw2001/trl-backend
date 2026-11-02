import { Request, Response } from 'express'

import {
    assignment_source,
    assignment_state,
    question_type,
    update_action,
    version_state
} from '@/generated/prisma/enums'
import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import { DEFAULT_ACK_TEXT } from '@core/helpers/constant'
import {
    applyIfLimit,
    applyIfOffset,
    checkExists,
    whereAnd,
    whereIfFlags,
    whereIfValue
} from '@core/helpers/prismaHelpers'
import {
    getArrayOrNull,
    getEnumOrNull,
    getIntArray,
    getIntOrNull,
    getIntOrZero,
    getStringOrNull,
    getTrueOrFalse
} from '@core/helpers/commonHelpers'
import dataObjectBuilder from '@core/helpers/dataObjectBuilder'
import { audit } from '@core/services/AuditService'
import { applyVersionPublish, createAssignments } from '@/app/services/assignmentService'
import {
    cloneVersionAsDraft,
    getDraftVersion,
    validateVersionForPublish,
    versionInclude,
    withFileUrls
} from './trainingService'

function clampPercent(val: any) {
    const num = getIntOrNull(val)
    return num === null ? null : Math.max(0, Math.min(100, num))
}

// Version fields editable on a draft
function versionData(body: any) {
    return dataObjectBuilder(body)
        .addIfValueExists('mv_title', getStringOrNull)
        .addIfValueExists('mv_description', getStringOrNull)
        .addIfValueExists('mv_instructions', getStringOrNull)
        .addIfValueExists('mv_min_watch_percent', clampPercent)
        .addIfValueExists('mv_pass_mark', clampPercent)
        .addIfValueExists('mv_max_attempts', getIntOrZero)
        .addIfValueExists('mv_question_limit', getIntOrNull)
        .addIfValueExists('mv_randomize_questions', getTrueOrFalse)
        .addIfValueExists('mv_randomize_options', getTrueOrFalse)
        .addIfValueExists('mv_requires_ack', getTrueOrFalse)
        .addIfValueExists('mv_ack_text', (val) => getStringOrNull(val) || DEFAULT_ACK_TEXT)
        .addIfValueExists('mv_change_note', getStringOrNull)
        .getDataObject()
}

export async function getAllModules(req: Request, res: Response) {
    try {
        const { search, status, archived, deleted, limit, offset, category_id, brand_id, role_id, state } = req.query

        const options: any = {}

        whereIfFlags(options, 'tm', { status, archived, deleted })
        whereIfValue(options, 'tm_category_id', category_id, getIntOrNull)

        const brand = getIntOrNull(brand_id)
        if (brand) {
            whereAnd(options, { OR: [{ tm_brand_ids: { has: brand } }, { tm_brand_ids: { isEmpty: true } }] })
        }

        const role = getIntOrNull(role_id)
        if (role) {
            whereAnd(options, { OR: [{ tm_role_ids: { has: role } }, { tm_role_ids: { isEmpty: true } }] })
        }

        if (state === 'published') {
            whereAnd(options, { tm_current_version_id: { not: null } })
        } else if (state === 'draft') {
            whereAnd(options, { tm_current_version_id: null })
        }

        const searchValue = getStringOrNull(search)
        if (searchValue) {
            whereAnd(options, {
                OR: [
                    { tm_code: { contains: searchValue, mode: 'insensitive' } },
                    { versions: { some: { mv_title: { contains: searchValue, mode: 'insensitive' } } } }
                ]
            })
        }

        const count = await prisma.training_modules.count(options)

        applyIfLimit(options, limit)

        applyIfOffset(options, offset)

        const modules = await prisma.training_modules.findMany({
            include: {
                tm_category: { select: { cat_id: true, cat_name: true } },
                tm_current_version: {
                    select: { mv_id: true, mv_version_no: true, mv_title: true, mv_published_at: true }
                },
                versions: {
                    select: { mv_id: true, mv_version_no: true, mv_title: true },
                    where: { mv_state: version_state.draft }
                },
                _count: {
                    select: {
                        assignments: { where: { asg_deleted: false, asg_state: { not: assignment_state.revoked } } }
                    }
                }
            },
            orderBy: [{ tm_sequence: 'asc' }, { tm_id: 'desc' }],
            where: options.where,
            take: options.take,
            skip: options.skip
        })

        const rows = modules.map(({ versions, ...module }) => ({
            ...module,
            title: versions[0]?.mv_title || module.tm_current_version?.mv_title,
            draft_version: versions[0] || null
        }))

        const data = {
            total: count,
            rows
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllModules', error)
        return sendResponse(res, false, null, 'Error getting training modules', statusType.DB_ERROR)
    }
}

export async function getSingleModule(req: Request, res: Response) {
    try {
        const tm_id = getIntOrNull(req.params.tm_id)

        const module = tm_id
            ? await prisma.training_modules.findFirst({
                  where: { tm_id, tm_deleted: false },
                  include: {
                      tm_category: { select: { cat_id: true, cat_name: true } },
                      tm_prerequisite: {
                          select: { tm_id: true, tm_current_version: { select: { mv_title: true } } }
                      },
                      versions: {
                          select: {
                              mv_id: true,
                              mv_version_no: true,
                              mv_state: true,
                              mv_title: true,
                              mv_update_action: true,
                              mv_change_note: true,
                              mv_published_at: true,
                              mv_created_at: true,
                              mv_published_by: { select: { user_first_name: true, user_last_name: true } },
                              _count: { select: { assignments: true, lessons: true, questions: true } }
                          },
                          orderBy: { mv_version_no: 'desc' }
                      }
                  }
              })
            : null

        if (!module) {
            return sendResponse(res, false, null, 'Module not found', statusType.NOT_FOUND)
        }

        const draft = module.versions.find((v) => v.mv_state === version_state.draft)

        const data = {
            ...module,
            draft_version_id: draft?.mv_id || null,
            // Version shown in the editor: the draft, else the published one (read only)
            editable_version_id: draft?.mv_id || module.tm_current_version_id
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getSingleModule', error)
        return sendResponse(res, false, null, 'Error getting module', statusType.DB_ERROR)
    }
}

// Full version content for the editor and admin preview (includes correct answers)
export async function getVersion(req: Request, res: Response) {
    try {
        const mv_id = getIntOrNull(req.params.mv_id)

        const version = mv_id
            ? await prisma.module_versions.findUnique({ where: { mv_id }, include: versionInclude })
            : null

        if (!version) {
            return sendResponse(res, false, null, 'Version not found', statusType.NOT_FOUND)
        }

        const data = { ...version, lessons: version.lessons.map(withFileUrls) }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getVersion', error)
        return sendResponse(res, false, null, 'Error getting version', statusType.DB_ERROR)
    }
}

// Creates or updates module settings; a new module starts with draft version 1
export async function saveModule(req: Request, res: Response) {
    try {
        const actor = String(req.userInfo!.user_id)

        const data: any = dataObjectBuilder(req.body)
            .addIfValueExists('tm_code', (val) => getStringOrNull(val)?.toUpperCase() || null)
            .addIfValueExists('tm_category_id', getIntOrNull)
            .addIfValueExists('tm_language', getStringOrNull)
            .addIfValueExists('tm_brand_ids', getIntArray)
            .addIfValueExists('tm_role_ids', getIntArray)
            .addIfValueExists('tm_is_mandatory', getTrueOrFalse)
            .addIfValueExists('tm_sequence', getIntOrZero)
            .addIfValueExists('tm_prerequisite_id', getIntOrNull)
            .addIfValueExists('tm_due_days', getIntOrZero)
            .addIfValueExists('tm_status', getTrueOrFalse)
            .addIfValueExists('tm_deleted', getTrueOrFalse)
            .getDataObject()

        let tm_id = getIntOrNull(req.body.tm_id)

        if (tm_id && data.tm_prerequisite_id === tm_id) {
            return sendResponse(res, false, null, 'A module cannot be its own prerequisite', statusType.BAD_REQUEST)
        }

        const exists = await checkExists('training_modules', 'tm', tm_id, ['tm_code'], [data.tm_code])

        if (exists.data) {
            return sendResponse(res, false, null, exists.message, statusType.CONFLICT)
        }

        if (tm_id) {
            data.tm_updated_by = actor

            await prisma.training_modules.update({ where: { tm_id }, data })
        } else {
            const version = versionData(req.body)

            if (!version.mv_title) {
                return sendResponse(res, false, null, 'Module title is required', statusType.BAD_REQUEST)
            }

            const module = await prisma.training_modules.create({
                data: {
                    ...data,
                    tm_created_by: actor,
                    versions: {
                        create: { ...version, mv_version_no: 1, mv_state: version_state.draft, mv_created_by: actor }
                    }
                }
            })

            tm_id = module.tm_id
        }

        await audit(req, req.body.tm_id ? 'update' : 'create', 'training_module', tm_id, data)

        return sendResponse(res, true, { tm_id }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in saveModule', error)
        return sendResponse(res, false, null, 'Error saving module', statusType.DB_ERROR)
    }
}

export async function archiveModule(req: Request, res: Response) {
    try {
        const tm_id = getIntOrNull(req.body.tm_id)
        const archived = getTrueOrFalse(req.body.archived)

        if (!tm_id) {
            return sendResponse(res, false, null, 'tm_id is required', statusType.BAD_REQUEST)
        }

        await prisma.training_modules.update({
            where: { tm_id },
            data: { tm_archived: archived, tm_updated_by: String(req.userInfo!.user_id) }
        })

        await audit(req, archived ? 'archive' : 'restore', 'training_module', tm_id)

        return sendResponse(res, true, null, archived ? 'Module archived' : 'Module restored')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in archiveModule', error)
        return sendResponse(res, false, null, 'Error archiving module', statusType.DB_ERROR)
    }
}

// Starts editing a published module: copies the current version into a new draft
export async function createDraft(req: Request, res: Response) {
    try {
        const tm_id = getIntOrNull(req.body.tm_id)

        const module = tm_id ? await prisma.training_modules.findFirst({ where: { tm_id, tm_deleted: false } }) : null

        if (!module || !module.tm_current_version_id) {
            return sendResponse(res, false, null, 'Module has no published version', statusType.BAD_REQUEST)
        }

        const existingDraft = await prisma.module_versions.findFirst({
            where: { mv_module_id: module.tm_id, mv_state: version_state.draft }
        })

        if (existingDraft) {
            return sendResponse(res, true, { mv_id: existingDraft.mv_id }, 'Draft already exists')
        }

        const draft = await cloneVersionAsDraft(module.tm_current_version_id, String(req.userInfo!.user_id))

        await audit(req, 'create_draft', 'training_module', module.tm_id, { mv_id: draft.mv_id })

        return sendResponse(res, true, { mv_id: draft.mv_id }, 'Draft created')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in createDraft', error)
        return sendResponse(res, false, null, 'Error creating draft', statusType.DB_ERROR)
    }
}

export async function discardDraft(req: Request, res: Response) {
    try {
        const mv_id = getIntOrNull(req.body.mv_id)
        const draft = mv_id ? await getDraftVersion(mv_id) : null

        if (!draft) {
            return sendResponse(res, false, null, 'Draft not found', statusType.NOT_FOUND)
        }

        const module = await prisma.training_modules.findUniqueOrThrow({ where: { tm_id: draft.mv_module_id } })

        if (!module.tm_current_version_id) {
            return sendResponse(res, false, null, 'The first version cannot be discarded', statusType.BAD_REQUEST)
        }

        await prisma.module_versions.delete({ where: { mv_id: draft.mv_id } })

        await audit(req, 'discard_draft', 'training_module', draft.mv_module_id, { mv_id: draft.mv_id })

        return sendResponse(res, true, null, 'Draft discarded')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in discardDraft', error)
        return sendResponse(res, false, null, 'Error discarding draft', statusType.DB_ERROR)
    }
}

export async function saveVersion(req: Request, res: Response) {
    try {
        const mv_id = getIntOrNull(req.body.mv_id)
        const draft = mv_id ? await getDraftVersion(mv_id) : null

        if (!draft) {
            return sendResponse(res, false, null, 'Only draft versions can be edited', statusType.BAD_REQUEST)
        }

        const data = versionData(req.body)

        if (data.mv_title === null) {
            return sendResponse(res, false, null, 'Module title is required', statusType.BAD_REQUEST)
        }

        data.mv_updated_by = String(req.userInfo!.user_id)

        await prisma.module_versions.update({ where: { mv_id: draft.mv_id }, data })

        return sendResponse(res, true, { mv_id: draft.mv_id }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in saveVersion', error)
        return sendResponse(res, false, null, 'Error saving version', statusType.DB_ERROR)
    }
}

export async function publishVersion(req: Request, res: Response) {
    try {
        const viewer = req.userInfo!
        const mv_id = getIntOrNull(req.body.mv_id)
        const draft = mv_id ? await getDraftVersion(mv_id) : null

        if (!draft) {
            return sendResponse(res, false, null, 'Draft not found', statusType.NOT_FOUND)
        }

        const module = await prisma.training_modules.findUniqueOrThrow({ where: { tm_id: draft.mv_module_id } })

        if (module.tm_archived) {
            return sendResponse(res, false, null, 'Restore the module before publishing', statusType.BAD_REQUEST)
        }

        const errors = await validateVersionForPublish(draft.mv_id)

        if (errors.length) {
            return sendResponse(res, false, { errors }, 'Fix these issues before publishing', statusType.BAD_REQUEST)
        }

        const isFirstPublish = !module.tm_current_version_id
        const action = isFirstPublish
            ? update_action.none
            : getEnumOrNull(req.body.update_action, update_action) || update_action.none

        await prisma.$transaction([
            prisma.module_versions.updateMany({
                where: { mv_module_id: module.tm_id, mv_state: version_state.published },
                data: { mv_state: version_state.superseded }
            }),
            prisma.module_versions.update({
                where: { mv_id: draft.mv_id },
                data: {
                    mv_state: version_state.published,
                    mv_update_action: action,
                    mv_change_note: getStringOrNull(req.body.change_note) ?? draft.mv_change_note,
                    mv_published_at: new Date(),
                    mv_published_by_id: viewer.user_id
                }
            }),
            prisma.training_modules.update({
                where: { tm_id: module.tm_id },
                data: { tm_current_version_id: draft.mv_id, tm_updated_by: String(viewer.user_id) }
            })
        ])

        const result = await applyVersionPublish(
            module.tm_id,
            draft.mv_id,
            action,
            viewer.user_id,
            String(viewer.user_id)
        )

        // Learners onboarded on a path before this module existed get it on first publish
        let pathAssigned = 0
        if (isFirstPublish) {
            const pathUsers = await prisma.users.findMany({
                select: { user_id: true },
                where: {
                    user_status: true,
                    user_deleted: false,
                    user_path: { modules: { some: { tpm_module_id: module.tm_id } } }
                }
            })

            const assigned = await createAssignments({
                module_id: module.tm_id,
                user_ids: pathUsers.map((u) => u.user_id),
                source: assignment_source.path,
                assigned_by_id: viewer.user_id,
                created_by: String(viewer.user_id)
            })
            pathAssigned = assigned.created
        }

        await audit(req, 'publish', 'training_module', module.tm_id, {
            mv_id: draft.mv_id,
            version_no: draft.mv_version_no,
            update_action: action,
            ...result,
            path_assigned: pathAssigned
        })

        return sendResponse(res, true, { ...result, path_assigned: pathAssigned }, 'Version published')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in publishVersion', error)
        return sendResponse(res, false, null, 'Error publishing version', statusType.DB_ERROR)
    }
}

export async function saveLesson(req: Request, res: Response) {
    try {
        const lesson_id = getIntOrNull(req.body.lesson_id)
        const existing = lesson_id ? await prisma.lessons.findUnique({ where: { lesson_id } }) : null
        const mv_id = existing?.lesson_version_id || getIntOrNull(req.body.lesson_version_id)
        const draft = mv_id ? await getDraftVersion(mv_id) : null

        if (!draft || (lesson_id && !existing)) {
            return sendResponse(
                res,
                false,
                null,
                'Lessons can only be edited on a draft version',
                statusType.BAD_REQUEST
            )
        }

        const data: any = dataObjectBuilder(req.body)
            .addIfValueExists('lesson_title', getStringOrNull)
            .addIfValueExists('lesson_content', getStringOrNull)
            .addIfValueExists('lesson_video_id', getIntOrNull)
            .addIfValueExists('lesson_sequence', getIntOrZero)
            .addIfValueExists('lesson_is_required', getTrueOrFalse)
            .addIfValueExists('lesson_min_watch_percent', clampPercent)
            .getDataObject()

        if (!existing && !data.lesson_title) {
            return sendResponse(res, false, null, 'Lesson title is required', statusType.BAD_REQUEST)
        }

        let saved_id: number

        if (existing) {
            await prisma.lessons.update({ where: { lesson_id: existing.lesson_id }, data })
            saved_id = existing.lesson_id
        } else {
            if (data.lesson_sequence === undefined) {
                data.lesson_sequence = await prisma.lessons.count({ where: { lesson_version_id: draft.mv_id } })
            }

            const lesson = await prisma.lessons.create({ data: { ...data, lesson_version_id: draft.mv_id } })
            saved_id = lesson.lesson_id
        }

        // Replace attachments when file_ids is sent
        if (req.body.file_ids !== undefined) {
            const file_ids = getIntArray(req.body.file_ids)

            await prisma.$transaction([
                prisma.lesson_files.deleteMany({ where: { lf_lesson_id: saved_id } }),
                prisma.lesson_files.createMany({
                    data: file_ids.map((file_id, index) => ({
                        lf_lesson_id: saved_id,
                        lf_file_id: file_id,
                        lf_sequence: index
                    }))
                })
            ])
        }

        return sendResponse(res, true, { lesson_id: saved_id }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in saveLesson', error)
        return sendResponse(res, false, null, 'Error saving lesson', statusType.DB_ERROR)
    }
}

export async function deleteLesson(req: Request, res: Response) {
    try {
        const lesson_id = getIntOrNull(req.body.lesson_id)
        const lesson = lesson_id ? await prisma.lessons.findUnique({ where: { lesson_id } }) : null

        if (!lesson || !(await getDraftVersion(lesson.lesson_version_id))) {
            return sendResponse(res, false, null, 'Lessons can only be removed from a draft', statusType.BAD_REQUEST)
        }

        await prisma.lessons.delete({ where: { lesson_id: lesson.lesson_id } })

        return sendResponse(res, true, null, 'Lesson removed')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in deleteLesson', error)
        return sendResponse(res, false, null, 'Error removing lesson', statusType.DB_ERROR)
    }
}

// Body: { mv_id, ids: [] } in display order; works for lessons and questions
export async function reorderItems(req: Request, res: Response) {
    try {
        const mv_id = getIntOrNull(req.body.mv_id)
        const ids = getIntArray(req.body.ids)
        const draft = mv_id ? await getDraftVersion(mv_id) : null

        if (!draft) {
            return sendResponse(res, false, null, 'Only draft versions can be reordered', statusType.BAD_REQUEST)
        }

        if (req.body.type === 'question') {
            await prisma.$transaction(
                ids.map((q_id, index) =>
                    prisma.questions.updateMany({
                        where: { q_id, q_version_id: draft.mv_id },
                        data: { q_sequence: index }
                    })
                )
            )
        } else {
            await prisma.$transaction(
                ids.map((lesson_id, index) =>
                    prisma.lessons.updateMany({
                        where: { lesson_id, lesson_version_id: draft.mv_id },
                        data: { lesson_sequence: index }
                    })
                )
            )
        }

        return sendResponse(res, true, null, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in reorderItems', error)
        return sendResponse(res, false, null, 'Error reordering', statusType.DB_ERROR)
    }
}

// Body: { q_id?, q_version_id, q_type, q_text, q_explanation, q_marks, options: [{ qo_text, qo_is_correct }] }
export async function saveQuestion(req: Request, res: Response) {
    try {
        const q_id = getIntOrNull(req.body.q_id)
        const existing = q_id ? await prisma.questions.findUnique({ where: { q_id } }) : null
        const mv_id = existing?.q_version_id || getIntOrNull(req.body.q_version_id)
        const draft = mv_id ? await getDraftVersion(mv_id) : null

        if (!draft || (q_id && !existing)) {
            return sendResponse(res, false, null, 'Questions can only be edited on a draft', statusType.BAD_REQUEST)
        }

        const q_type = getEnumOrNull(req.body.q_type, question_type) || existing?.q_type || question_type.single
        const q_text = getStringOrNull(req.body.q_text) || existing?.q_text

        if (!q_text) {
            return sendResponse(res, false, null, 'Question text is required', statusType.BAD_REQUEST)
        }

        const options = (getArrayOrNull(req.body.options) || [])
            .map((option: any, index: number) => ({
                qo_text: getStringOrNull(option?.qo_text),
                qo_is_correct: getTrueOrFalse(option?.qo_is_correct),
                qo_sequence: index
            }))
            .filter((option: any) => option.qo_text)

        if (q_type !== question_type.written) {
            const correct = options.filter((o: any) => o.qo_is_correct).length

            if (options.length < 2) {
                return sendResponse(res, false, null, 'Add at least two options', statusType.BAD_REQUEST)
            }

            if (q_type === question_type.single && correct !== 1) {
                return sendResponse(res, false, null, 'Mark exactly one correct option', statusType.BAD_REQUEST)
            }

            if (q_type === question_type.multiple && correct < 1) {
                return sendResponse(res, false, null, 'Mark at least one correct option', statusType.BAD_REQUEST)
            }
        }

        const data = {
            q_type,
            q_text,
            q_explanation: getStringOrNull(req.body.q_explanation),
            q_marks: Math.max(1, getIntOrZero(req.body.q_marks) || 1)
        }

        const optionRows = q_type === question_type.written ? [] : options

        let saved_id: number

        if (existing) {
            await prisma.$transaction([
                prisma.question_options.deleteMany({ where: { qo_question_id: existing.q_id } }),
                prisma.questions.update({
                    where: { q_id: existing.q_id },
                    data: { ...data, options: { create: optionRows } }
                })
            ])
            saved_id = existing.q_id
        } else {
            const sequence = await prisma.questions.count({ where: { q_version_id: draft.mv_id } })
            const question = await prisma.questions.create({
                data: { ...data, q_version_id: draft.mv_id, q_sequence: sequence, options: { create: optionRows } }
            })
            saved_id = question.q_id
        }

        return sendResponse(res, true, { q_id: saved_id }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in saveQuestion', error)
        return sendResponse(res, false, null, 'Error saving question', statusType.DB_ERROR)
    }
}

export async function deleteQuestion(req: Request, res: Response) {
    try {
        const q_id = getIntOrNull(req.body.q_id)
        const question = q_id ? await prisma.questions.findUnique({ where: { q_id } }) : null

        if (!question || !(await getDraftVersion(question.q_version_id))) {
            return sendResponse(res, false, null, 'Questions can only be removed from a draft', statusType.BAD_REQUEST)
        }

        await prisma.questions.delete({ where: { q_id: question.q_id } })

        return sendResponse(res, true, null, 'Question removed')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in deleteQuestion', error)
        return sendResponse(res, false, null, 'Error removing question', statusType.DB_ERROR)
    }
}
