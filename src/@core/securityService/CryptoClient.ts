import crypto from 'crypto'

import logger from '../services/LoggingService'

const algorithm = 'aes-256-cbc'

const SCRYPT_KEYLEN = 64
const SCRYPT_COST = 16384

export function hash(plainText: string) {
    try {
        return crypto.createHash('sha256').update(plainText).digest('hex')
    } catch (error) {
        logger.consoleErrorLog('core SECURITY', 'Error in hash', error)
        return ''
    }
}

export function hmac(plainText: string, secret: string) {
    return crypto.createHmac('sha256', secret).update(plainText).digest('hex')
}

// Stored as scrypt$<cost>$<salt>$<hash>
export function hashPassword(plainText: string) {
    const salt = crypto.randomBytes(16).toString('hex')
    const derived = crypto.scryptSync(plainText, salt, SCRYPT_KEYLEN, { N: SCRYPT_COST }).toString('hex')

    return `scrypt$${SCRYPT_COST}$${salt}$${derived}`
}

export function verifyPassword(plainText: string, stored: string) {
    try {
        const [scheme, cost, salt, expected] = stored.split('$')

        if (scheme !== 'scrypt' || !salt || !expected) {
            return false
        }

        const derived = crypto.scryptSync(plainText, salt, SCRYPT_KEYLEN, { N: Number(cost) })
        const expectedBuffer = Buffer.from(expected, 'hex')

        return expectedBuffer.length === derived.length && crypto.timingSafeEqual(expectedBuffer, derived)
    } catch (error) {
        logger.consoleErrorLog('core SECURITY', 'Error in verifyPassword', error)
        return false
    }
}

export function safeCompare(a: string, b: string) {
    const bufferA = Buffer.from(a)
    const bufferB = Buffer.from(b)

    return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB)
}

export function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex')
}

export function generateOtp(length = 6) {
    let otp = ''
    for (let i = 0; i < length; i++) {
        otp += crypto.randomInt(0, 10).toString()
    }
    return otp
}

export function encrypt(plainText: string) {
    try {
        if (!process.env.ENCRYPT_IV || !process.env.ENCRYPT_KEY) {
            throw new Error('ENCRYPT_IV or ENCRYPT_KEY not defined in env')
        }

        const iv = Buffer.from(process.env.ENCRYPT_IV, 'hex')
        const key = Buffer.from(process.env.ENCRYPT_KEY, 'hex')

        const cipher = crypto.createCipheriv(algorithm, key, iv)
        return Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]).toString('hex')
    } catch (error) {
        logger.consoleErrorLog('core SECURITY', 'Error in encrypt', error)
        return ''
    }
}

export function decrypt(cipherText: string) {
    try {
        if (!process.env.ENCRYPT_IV || !process.env.ENCRYPT_KEY) {
            throw new Error('ENCRYPT_IV or ENCRYPT_KEY not defined in env')
        }

        const iv = Buffer.from(process.env.ENCRYPT_IV, 'hex')
        const key = Buffer.from(process.env.ENCRYPT_KEY, 'hex')

        const decipher = crypto.createDecipheriv(algorithm, key, iv)
        return Buffer.concat([decipher.update(Buffer.from(cipherText, 'hex')), decipher.final()]).toString('utf8')
    } catch (error) {
        logger.consoleErrorLog('core SECURITY', 'Error in decrypt', error)
        return ''
    }
}
