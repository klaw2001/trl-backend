import { Request, Response } from 'express'
import { UploadedFile } from 'express-fileupload'

import { video_source, video_state } from '@/generated/prisma/enums'
import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import uploadType, { UPLOAD_MIME_TYPES } from '@core/enum/uploadType'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import { applyIfLimit, applyIfOffset, likeIfValue, whereIfFlags, whereIfValue } from '@core/helpers/prismaHelpers'
import { getEnumOrNull, getIntOrNull, getStringOrNull } from '@core/helpers/commonHelpers'
import {
    createVideo,
    extractVideoGuid,
    getTusUploadCredentials,
    getVideo,
    isBunnyConfigured,
    mapVideoStatus
} from '@core/services/BunnyService'
import { getSignedFileUrl, saveUploadedFile } from '@core/services/StorageService'
import { audit } from '@core/services/AuditService'
import { getVideoPlayback, playbackExpiry } from '@/app/services/mediaService'

export async function getAllVideos(req: Request, res: Response) {
    try {
        const { search, status, archived, deleted, limit, offset, state } = req.query

        const options: any = {}

        whereIfFlags(options, 'video', { status, archived, deleted })
        whereIfValue(options, 'video_state', state, (val) => getEnumOrNull(val, video_state))

        likeIfValue(options, ['video_title', 'video_guid'], search)

        const count = await prisma.videos.count(options)

        applyIfLimit(options, limit)

        applyIfOffset(options, offset)

        const videos = await prisma.videos.findMany({
            include: { _count: { select: { lessons: true, recipes: true } } },
            orderBy: { video_created_at: 'desc' },
            ...options
        })

        const data = {
            total: count,
            rows: videos
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllVideos', error)
        return sendResponse(res, false, null, 'Error getting videos', statusType.DB_ERROR)
    }
}

// Creates the Bunny video object and returns TUS credentials so the browser uploads straight to Bunny
export async function createVideoUpload(req: Request, res: Response) {
    try {
        const title = getStringOrNull(req.body.title)

        if (!title) {
            return sendResponse(res, false, null, 'Video title is required', statusType.BAD_REQUEST)
        }

        if (!isBunnyConfigured()) {
            return sendResponse(res, false, null, 'Bunny Stream is not configured', statusType.SERVICE_UNAVAILABLE)
        }

        const bunnyVideo = await createVideo(title)

        const video = await prisma.videos.create({
            data: {
                video_source: video_source.bunny,
                video_guid: bunnyVideo.guid,
                video_library_id: process.env.BUNNY_STREAM_LIBRARY_ID,
                video_title: title,
                video_state: video_state.uploading,
                video_created_by: String(req.userInfo!.user_id)
            }
        })

        await audit(req, 'create', 'video', video.video_id, { guid: bunnyVideo.guid })

        return sendResponse(res, true, { video, upload: getTusUploadCredentials(bunnyVideo.guid) }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in createVideoUpload', error)
        return sendResponse(res, false, null, 'Error creating video upload', statusType.DB_ERROR)
    }
}

// Registers a video that already exists in the Bunny library (GUID or any Bunny URL)
export async function registerVideo(req: Request, res: Response) {
    try {
        const guid = extractVideoGuid(getStringOrNull(req.body.value) || '')

        if (!guid) {
            return sendResponse(res, false, null, 'Paste a Bunny video ID or video URL', statusType.BAD_REQUEST)
        }

        if (!isBunnyConfigured()) {
            return sendResponse(res, false, null, 'Bunny Stream is not configured', statusType.SERVICE_UNAVAILABLE)
        }

        const existing = await prisma.videos.findUnique({ where: { video_guid: guid } })

        if (existing) {
            return sendResponse(res, true, { video: existing }, 'Video already registered')
        }

        const bunnyVideo = await getVideo(guid).catch(() => null)

        if (!bunnyVideo) {
            return sendResponse(res, false, null, 'Video not found in the Bunny library', statusType.NOT_FOUND)
        }

        const video = await prisma.videos.create({
            data: {
                video_source: video_source.bunny,
                video_guid: guid,
                video_library_id: process.env.BUNNY_STREAM_LIBRARY_ID,
                video_title: getStringOrNull(req.body.title) || bunnyVideo.title,
                video_state: mapVideoStatus(bunnyVideo.status),
                video_duration_seconds: bunnyVideo.length || null,
                video_created_by: String(req.userInfo!.user_id)
            }
        })

        await audit(req, 'register', 'video', video.video_id, { guid })

        return sendResponse(res, true, { video }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in registerVideo', error)
        return sendResponse(res, false, null, 'Error registering video', statusType.DB_ERROR)
    }
}

// Unprotected HLS link; meant for demo or legacy content that is not in Bunny
export async function addExternalVideo(req: Request, res: Response) {
    try {
        const url = getStringOrNull(req.body.url)
        const title = getStringOrNull(req.body.title)

        if (!url || !/^https:\/\/\S+\.m3u8(\?\S*)?$/i.test(url) || !title) {
            return sendResponse(res, false, null, 'Title and an https .m3u8 link are required', statusType.BAD_REQUEST)
        }

        const video = await prisma.videos.create({
            data: {
                video_source: video_source.external,
                video_url: url,
                video_title: title,
                video_state: video_state.ready,
                video_duration_seconds: getIntOrNull(req.body.duration_seconds),
                video_created_by: String(req.userInfo!.user_id)
            }
        })

        await audit(req, 'create_external', 'video', video.video_id, { url })

        return sendResponse(res, true, { video }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in addExternalVideo', error)
        return sendResponse(res, false, null, 'Error adding video', statusType.DB_ERROR)
    }
}

// Pulls encoding state and duration from Bunny (fallback when webhooks are not configured)
export async function refreshVideoStatus(req: Request, res: Response) {
    try {
        const video_id = getIntOrNull(req.params.video_id)

        const video = video_id ? await prisma.videos.findUnique({ where: { video_id } }) : null

        if (!video) {
            return sendResponse(res, false, null, 'Video not found', statusType.NOT_FOUND)
        }

        if (video.video_source !== video_source.bunny || !video.video_guid || !isBunnyConfigured()) {
            return sendResponse(res, true, { video }, 'success')
        }

        const bunnyVideo = await getVideo(video.video_guid)

        const updated = await prisma.videos.update({
            where: { video_id: video.video_id },
            data: {
                video_state: mapVideoStatus(bunnyVideo.status),
                video_duration_seconds: bunnyVideo.length || video.video_duration_seconds
            }
        })

        return sendResponse(res, true, { video: updated, encode_progress: bunnyVideo.encodeProgress }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in refreshVideoStatus', error)
        return sendResponse(res, false, null, 'Error refreshing video status', statusType.DB_ERROR)
    }
}

// Admin preview playback (content managers are not shift restricted)
export async function getVideoPreview(req: Request, res: Response) {
    try {
        const video_id = getIntOrNull(req.params.video_id)

        const video = video_id ? await prisma.videos.findUnique({ where: { video_id } }) : null

        if (!video) {
            return sendResponse(res, false, null, 'Video not found', statusType.NOT_FOUND)
        }

        return sendResponse(res, true, getVideoPlayback(video, playbackExpiry()), 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getVideoPreview', error)
        return sendResponse(res, false, null, 'Error getting video preview', statusType.DB_ERROR)
    }
}

export async function saveVideo(req: Request, res: Response) {
    try {
        const video_id = getIntOrNull(req.body.video_id)
        const title = getStringOrNull(req.body.video_title)

        if (!video_id || !title) {
            return sendResponse(res, false, null, 'video_id and title are required', statusType.BAD_REQUEST)
        }

        await prisma.videos.update({
            where: { video_id },
            data: { video_title: title, video_updated_by: String(req.userInfo!.user_id) }
        })

        return sendResponse(res, true, { video_id }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in saveVideo', error)
        return sendResponse(res, false, null, 'Error saving video', statusType.DB_ERROR)
    }
}

// Multipart upload of an image or PDF (`file` field, `type` = image | document)
export async function uploadFile(req: Request, res: Response) {
    try {
        const file = req.files?.file as UploadedFile | undefined
        const type = getEnumOrNull(req.body.type, uploadType) || uploadType.IMAGE

        if (!file || Array.isArray(file)) {
            return sendResponse(res, false, null, 'Attach one file in the `file` field', statusType.BAD_REQUEST)
        }

        if (!UPLOAD_MIME_TYPES[type].includes(file.mimetype)) {
            return sendResponse(
                res,
                false,
                null,
                `Allowed types: ${UPLOAD_MIME_TYPES[type].join(', ')}`,
                statusType.BAD_REQUEST
            )
        }

        const saved = await saveUploadedFile(file, String(req.userInfo!.user_id))

        await audit(req, 'upload', 'file', saved.file_id, { name: saved.file_name, size: saved.file_size })

        return sendResponse(res, true, { file: saved, url: getSignedFileUrl(saved.file_id) }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in uploadFile', error)
        return sendResponse(res, false, null, 'Error uploading file', statusType.DB_ERROR)
    }
}
