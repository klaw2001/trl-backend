import { question_type, version_state, video_state } from '@/generated/prisma/enums'
import prisma from '@core/helpers/prisma'
import { getSignedFileUrl } from '@core/services/StorageService'

export const versionInclude = {
    lessons: {
        orderBy: { lesson_sequence: 'asc' as const },
        include: {
            lesson_video: true,
            lesson_files: {
                orderBy: { lf_sequence: 'asc' as const },
                include: { lf_file: true }
            }
        }
    },
    questions: {
        orderBy: { q_sequence: 'asc' as const },
        include: { options: { orderBy: { qo_sequence: 'asc' as const } } }
    }
}

// Lesson files as signed URLs (files are never public)
export function withFileUrls<T extends { lesson_files: { lf_file: { file_id: number } }[] }>(lesson: T) {
    return {
        ...lesson,
        lesson_files: lesson.lesson_files.map((lf) => ({ ...lf, url: getSignedFileUrl(lf.lf_file.file_id) }))
    }
}

export async function getDraftVersion(mv_id: number) {
    return prisma.module_versions.findFirst({
        where: { mv_id, mv_state: version_state.draft, mv_module: { tm_deleted: false } }
    })
}

// Deep copies a version (lessons, files, questions, options) into a new draft
export async function cloneVersionAsDraft(source_id: number, created_by: string) {
    const source = await prisma.module_versions.findUniqueOrThrow({
        where: { mv_id: source_id },
        include: versionInclude
    })

    const latest = await prisma.module_versions.aggregate({
        _max: { mv_version_no: true },
        where: { mv_module_id: source.mv_module_id }
    })

    return prisma.module_versions.create({
        data: {
            mv_module_id: source.mv_module_id,
            mv_version_no: (latest._max.mv_version_no || 0) + 1,
            mv_state: version_state.draft,
            mv_title: source.mv_title,
            mv_description: source.mv_description,
            mv_instructions: source.mv_instructions,
            mv_min_watch_percent: source.mv_min_watch_percent,
            mv_pass_mark: source.mv_pass_mark,
            mv_max_attempts: source.mv_max_attempts,
            mv_question_limit: source.mv_question_limit,
            mv_randomize_questions: source.mv_randomize_questions,
            mv_randomize_options: source.mv_randomize_options,
            mv_requires_ack: source.mv_requires_ack,
            mv_ack_text: source.mv_ack_text,
            mv_created_by: created_by,
            lessons: {
                create: source.lessons.map((lesson) => ({
                    lesson_title: lesson.lesson_title,
                    lesson_content: lesson.lesson_content,
                    lesson_video_id: lesson.lesson_video_id,
                    lesson_sequence: lesson.lesson_sequence,
                    lesson_is_required: lesson.lesson_is_required,
                    lesson_min_watch_percent: lesson.lesson_min_watch_percent,
                    lesson_files: {
                        create: lesson.lesson_files.map((lf) => ({
                            lf_file_id: lf.lf_file_id,
                            lf_sequence: lf.lf_sequence
                        }))
                    }
                }))
            },
            questions: {
                create: source.questions.map((question) => ({
                    q_type: question.q_type,
                    q_text: question.q_text,
                    q_explanation: question.q_explanation,
                    q_marks: question.q_marks,
                    q_sequence: question.q_sequence,
                    options: {
                        create: question.options.map((option) => ({
                            qo_text: option.qo_text,
                            qo_is_correct: option.qo_is_correct,
                            qo_sequence: option.qo_sequence
                        }))
                    }
                }))
            }
        }
    })
}

// Returns a list of problems that block publishing (empty when the version is publishable)
export async function validateVersionForPublish(mv_id: number) {
    const version = await prisma.module_versions.findUniqueOrThrow({
        where: { mv_id },
        include: versionInclude
    })

    const errors: string[] = []

    if (!version.lessons.length) {
        errors.push('Add at least one lesson')
    }

    for (const lesson of version.lessons) {
        if (!lesson.lesson_video_id && !lesson.lesson_content && !lesson.lesson_files.length) {
            errors.push(`Lesson "${lesson.lesson_title}" has no video, text or files`)
        }

        if (lesson.lesson_video && lesson.lesson_video.video_state !== video_state.ready) {
            errors.push(`Video of lesson "${lesson.lesson_title}" is not ready (${lesson.lesson_video.video_state})`)
        }
    }

    for (const [index, question] of version.questions.entries()) {
        const label = `Question ${index + 1}`
        const correct = question.options.filter((o) => o.qo_is_correct).length

        if (question.q_type === question_type.written) {
            continue
        }

        if (question.options.length < 2) {
            errors.push(`${label} needs at least two options`)
        }

        if (question.q_type === question_type.single && correct !== 1) {
            errors.push(`${label} must have exactly one correct option`)
        }

        if (question.q_type === question_type.multiple && correct < 1) {
            errors.push(`${label} must have at least one correct option`)
        }
    }

    if (version.mv_requires_ack && !version.mv_ack_text.trim()) {
        errors.push('Acknowledgement text is required')
    }

    return errors
}
