import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { UploadedFile } from 'express-fileupload'

import prisma from '@core/helpers/prisma'
import { hmac, safeCompare } from '@core/securityService/CryptoClient'

const STORAGE_ROOT = path.resolve(process.env.STORAGE_PATH || 'storage')

const EXTENSIONS: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf'
}

export function resolveFilePath(file_key: string) {
    const fullPath = path.resolve(STORAGE_ROOT, file_key)

    // Guard against path traversal through a tampered key
    if (!fullPath.startsWith(STORAGE_ROOT + path.sep)) {
        throw new Error('Invalid file key')
    }

    return fullPath
}

export async function saveUploadedFile(file: UploadedFile, created_by: string) {
    const folder = new Date().toISOString().slice(0, 7)
    const extension = EXTENSIONS[file.mimetype] || 'bin'
    const file_key = `${folder}/${crypto.randomUUID()}.${extension}`
    const fullPath = resolveFilePath(file_key)

    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true })
    await file.mv(fullPath)

    return prisma.files.create({
        data: {
            file_name: file.name.slice(0, 255),
            file_key,
            file_mime: file.mimetype,
            file_size: file.size,
            file_created_by: created_by
        }
    })
}

// Files are served through the API with an expiring signature (img/pdf tags cannot send auth headers)
export function getSignedFileUrl(file_id: number | null | undefined, ttlSeconds = 60 * 60) {
    if (!file_id) {
        return null
    }

    const expires = Math.floor(Date.now() / 1000) + ttlSeconds
    const signature = hmac(`${file_id}:${expires}`, process.env.FILE_URL_SECRET)

    return `${process.env.API_BASEURL}/file/${file_id}?expires=${expires}&signature=${signature}`
}

export function verifyFileSignature(file_id: number, expires: number, signature: string) {
    if (!expires || expires < Math.floor(Date.now() / 1000) || !signature) {
        return false
    }

    return safeCompare(hmac(`${file_id}:${expires}`, process.env.FILE_URL_SECRET), signature)
}
