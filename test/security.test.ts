import crypto from 'crypto'

import { hashPassword, verifyPassword, encrypt, decrypt } from '../src/@core/securityService/CryptoClient'
import { extractVideoGuid, getSignedPlaylistUrl, getTusUploadCredentials } from '../src/@core/services/BunnyService'
import { getIntArray, getArrayOrNull, getStringOrNull } from '../src/@core/helpers/commonHelpers'

describe('passwords', () => {
    test('scrypt hashes verify and never match a wrong password', () => {
        const stored = hashPassword('Kitchen2026')

        expect(stored.startsWith('scrypt$')).toBe(true)
        expect(verifyPassword('Kitchen2026', stored)).toBe(true)
        expect(verifyPassword('kitchen2026', stored)).toBe(false)
    })
})

describe('encryption', () => {
    test('round trips with aes-256-cbc', () => {
        process.env.ENCRYPT_KEY = crypto.randomBytes(32).toString('hex')
        process.env.ENCRYPT_IV = crypto.randomBytes(16).toString('hex')

        expect(decrypt(encrypt('secret value'))).toBe('secret value')
    })
})

describe('Bunny', () => {
    beforeAll(() => {
        process.env.BUNNY_STREAM_LIBRARY_ID = '12345'
        process.env.BUNNY_STREAM_API_KEY = 'api-key'
        process.env.BUNNY_STREAM_CDN_HOSTNAME = 'vz-test.b-cdn.net'
        process.env.BUNNY_STREAM_TOKEN_KEY = 'token-key'
    })

    test('signs HLS playlists with a directory token so segments inherit it', () => {
        const guid = 'f1b2c3d4-0000-4000-8000-123456789abc'
        const expires = 1900000000
        const url = getSignedPlaylistUrl(guid, expires)

        const directory = `/${guid}/`
        const expected = crypto
            .createHmac('sha256', 'token-key')
            .update(directory)
            .update(String(expires))
            .update(`token_path=${directory}`)
            .digest('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '')

        expect(url).toBe(
            `https://vz-test.b-cdn.net/bcdn_token=HS256-${expected}&token_path=${encodeURIComponent(directory)}&expires=${expires}/${guid}/playlist.m3u8`
        )
    })

    test('TUS signature is sha256(library + key + expiry + video)', () => {
        const creds = getTusUploadCredentials('video-guid', 60)
        const expected = crypto.createHash('sha256').update(`12345api-key${creds.expire}video-guid`).digest('hex')

        expect(creds.signature).toBe(expected)
    })

    test('extracts a GUID from Bunny URLs', () => {
        expect(
            extractVideoGuid('https://iframe.mediadelivery.net/play/12345/F1B2C3D4-0000-4000-8000-123456789ABC')
        ).toBe('f1b2c3d4-0000-4000-8000-123456789abc')
        expect(extractVideoGuid('not a video')).toBeNull()
    })
})

describe('helpers', () => {
    test('getArrayOrNull keeps null for missing values', () => {
        expect(getArrayOrNull(undefined)).toBeNull()
        expect(getArrayOrNull(null)).toBeNull()
        expect(getArrayOrNull(3)).toEqual([3])
    })

    test('getIntArray accepts arrays, JSON and csv', () => {
        expect(getIntArray([1, '2', 'x', 2])).toEqual([1, 2])
        expect(getIntArray('[3,4]')).toEqual([3, 4])
        expect(getIntArray('5,6')).toEqual([5, 6])
    })

    test('getStringOrNull trims blanks to null', () => {
        expect(getStringOrNull('  ')).toBeNull()
        expect(getStringOrNull(' Chai ')).toBe('Chai')
    })
})
