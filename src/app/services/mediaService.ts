import type { videos } from '@/generated/prisma/client'
import { video_source, video_state } from '@/generated/prisma/enums'
import { getSignedPlaylistUrl, getSignedThumbnailUrl, isBunnyConfigured } from '@core/services/BunnyService'

// Playback info for a video. Bunny URLs are token signed and expire at `expiresAt` (unix seconds)
export function getVideoPlayback(video: videos | null, expiresAt: number) {
    if (!video || video.video_deleted || !video.video_status) {
        return null
    }

    if (video.video_source === video_source.external) {
        return {
            video_id: video.video_id,
            state: video.video_state,
            url: video.video_url,
            thumbnail: null,
            duration: video.video_duration_seconds,
            expires_at: null,
            protected: false
        }
    }

    if (!video.video_guid || !isBunnyConfigured() || video.video_state !== video_state.ready) {
        return {
            video_id: video.video_id,
            state: video.video_state,
            url: null,
            thumbnail: null,
            duration: video.video_duration_seconds,
            expires_at: null,
            protected: true
        }
    }

    return {
        video_id: video.video_id,
        state: video.video_state,
        url: getSignedPlaylistUrl(video.video_guid, expiresAt),
        thumbnail: getSignedThumbnailUrl(video.video_guid, expiresAt),
        duration: video.video_duration_seconds,
        expires_at: new Date(expiresAt * 1000),
        protected: true
    }
}

// Token lifetime, never beyond the end of the viewer's shift
export function playbackExpiry(shiftEndsAt?: Date | null) {
    const ttl = Number(process.env.VIDEO_TOKEN_TTL_SECONDS || 3600)
    const defaultExpiry = Math.floor(Date.now() / 1000) + ttl

    if (!shiftEndsAt) {
        return defaultExpiry
    }

    return Math.max(
        Math.min(defaultExpiry, Math.floor(shiftEndsAt.getTime() / 1000)),
        Math.floor(Date.now() / 1000) + 60
    )
}
