import crypto from 'crypto'

import { video_state } from '@/generated/prisma/enums'
import logger from '@core/services/LoggingService'

const STREAM_API = 'https://video.bunnycdn.com'
const TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload'

export interface BunnyVideo {
    guid: string
    title: string
    status: number
    length: number
    encodeProgress: number
}

function config() {
    return {
        libraryId: process.env.BUNNY_STREAM_LIBRARY_ID || '',
        apiKey: process.env.BUNNY_STREAM_API_KEY || '',
        readOnlyKey: process.env.BUNNY_STREAM_READ_ONLY_API_KEY || '',
        cdnHostname: process.env.BUNNY_STREAM_CDN_HOSTNAME || '',
        tokenKey: process.env.BUNNY_STREAM_TOKEN_KEY || ''
    }
}

export function isBunnyConfigured() {
    const { libraryId, apiKey, cdnHostname } = config()
    return Boolean(libraryId && apiKey && cdnHostname)
}

async function streamRequest<T>(method: string, path: string, body?: object): Promise<T> {
    const { libraryId, apiKey } = config()

    if (!libraryId || !apiKey) {
        throw new Error('Bunny Stream is not configured')
    }

    const response = await fetch(`${STREAM_API}/library/${libraryId}${path}`, {
        method,
        headers: {
            AccessKey: apiKey,
            accept: 'application/json',
            'content-type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    })

    if (!response.ok) {
        throw new Error(`Bunny Stream ${method} ${path} failed with ${response.status}`)
    }

    return (await response.json()) as T
}

export async function createVideo(title: string) {
    return streamRequest<BunnyVideo>('POST', '/videos', { title })
}

export async function getVideo(guid: string) {
    return streamRequest<BunnyVideo>('GET', `/videos/${guid}`)
}

export async function deleteVideo(guid: string) {
    try {
        await streamRequest('DELETE', `/videos/${guid}`)
        return true
    } catch (error) {
        logger.consoleErrorLog('BunnyService', 'Error in deleteVideo', error)
        return false
    }
}

// Maps Bunny video object status (0-8) to our state
export function mapVideoStatus(status: number) {
    if (status === 4) {
        return video_state.ready
    }
    if (status === 5 || status === 6) {
        return video_state.failed
    }
    if (status === 0) {
        return video_state.uploading
    }
    return video_state.processing
}

// Maps webhook status codes, which differ from the video object status
export function mapWebhookStatus(status: number) {
    if (status === 3 || status === 4) {
        return video_state.ready
    }
    if (status === 5 || status === 8) {
        return video_state.failed
    }
    return video_state.processing
}

// Credentials for a direct browser -> Bunny TUS upload; the API key never leaves the server
export function getTusUploadCredentials(guid: string, ttlSeconds = 6 * 60 * 60) {
    const { libraryId, apiKey } = config()
    const expire = Math.floor(Date.now() / 1000) + ttlSeconds
    const signature = crypto.createHash('sha256').update(`${libraryId}${apiKey}${expire}${guid}`).digest('hex')

    return {
        endpoint: TUS_ENDPOINT,
        library_id: libraryId,
        video_id: guid,
        expire,
        signature
    }
}

// Bunny CDN advanced token (HMAC-SHA256), path based so HLS segments inherit the token.
// https://bunny.net/docs/cdn/security/token-authentication/advanced
export function signDirectoryUrl(path: string, directory: string, expiresAt: number) {
    const { cdnHostname, tokenKey } = config()

    if (!tokenKey) {
        // Token authentication disabled on the pull zone (development only)
        return `https://${cdnHostname}${path}`
    }

    const expires = String(expiresAt)
    const signingData = `token_path=${directory}`
    const digest = crypto.createHmac('sha256', tokenKey).update(directory).update(expires).update(signingData).digest()
    const token = 'HS256-' + digest.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    return `https://${cdnHostname}/bcdn_token=${token}&token_path=${encodeURIComponent(directory)}&expires=${expires}${path}`
}

export function getSignedPlaylistUrl(guid: string, expiresAt: number) {
    return signDirectoryUrl(`/${guid}/playlist.m3u8`, `/${guid}/`, expiresAt)
}

export function getSignedThumbnailUrl(guid: string, expiresAt: number) {
    return signDirectoryUrl(`/${guid}/thumbnail.jpg`, `/${guid}/`, expiresAt)
}

// Webhook v1 signature: lowercase hex HMAC-SHA256 of the raw body keyed with the read-only API key
export function verifyWebhookSignature(rawBody: Buffer | undefined, signature: string | undefined) {
    const { readOnlyKey } = config()

    if (!rawBody || !signature || !readOnlyKey) {
        return false
    }

    const expected = crypto.createHmac('sha256', readOnlyKey).update(rawBody).digest('hex')

    return expected.length === signature.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

// Accepts a bare GUID or any Bunny URL that contains one
export function extractVideoGuid(value: string) {
    const match = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    return match ? match[0].toLowerCase() : null
}
