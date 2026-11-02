import { PASSWORD_REGEX } from './constant'

export const checkEmail = (email: any) => {
    return typeof email === 'string' && /^\S+@\S+\.\S+$/.test(email)
}

// Indian mobile numbers with optional country code, e.g. 9876543210 / 919876543210
export const checkMobile = (mobile: any) => {
    return typeof mobile === 'string' && /^(91)?[6-9]\d{9}$/.test(mobile)
}

export const checkPassword = (password: any) => {
    return typeof password === 'string' && PASSWORD_REGEX.test(password)
}

export const normalizeMobile = (mobile: any) => {
    if (typeof mobile !== 'string' && typeof mobile !== 'number') {
        return null
    }

    const digits = mobile.toString().replace(/\D/g, '')
    return digits.length === 10 ? `91${digits}` : digits
}

// Login identifier can be employee id, mobile or email
export const validateLogin = (body: any) => {
    const isIdentifier = typeof body.identifier === 'string' && body.identifier.trim().length > 0
    const isPassword = typeof body.password === 'string' && body.password.length > 0 && body.password.length <= 64

    return isIdentifier && isPassword
}
