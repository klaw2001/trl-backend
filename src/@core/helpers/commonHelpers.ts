import moment from 'moment'

import { HH_MM_REGEX, MOMENT_DATETIME_FORMAT } from './constant'

export function getDateTimeOrNull(item: any) {
    try {
        if (item && moment(item).isValid()) {
            return moment(item).format(MOMENT_DATETIME_FORMAT)
        }

        return null
    } catch (err) {
        return null
    }
}

export function getDateOrNull(item: any) {
    try {
        if (item && moment(item).isValid()) {
            return moment(item).toDate()
        }

        return null
    } catch (err) {
        return null
    }
}

export function getDateOrCurrentDate(item: any) {
    try {
        if (item && moment(item).isValid()) {
            return moment(item).startOf('day').toDate()
        }
        return moment().startOf('day').toDate()
    } catch (err) {
        return moment().startOf('day').toDate()
    }
}

export function getStringOrNull(item: any) {
    try {
        if (item === '' || item === null || item === undefined) {
            return null
        }

        if (typeof item === 'string') {
            const trimmed = item.trim()
            return trimmed === '' ? null : trimmed
        }

        if (item && item.toString) {
            return item.toString()
        }

        return JSON.stringify(item)
    } catch (error) {
        return null
    }
}

export function getOneOrZero(item: any) {
    return !item || item === '0' || item === 'false' ? '0' : '1'
}

export function getObjOrNull(obj: any) {
    return obj ? obj : null
}

export function getObjOrUndefined(value: any) {
    try {
        if (!value) {
            return undefined
        }
        return value
    } catch (err) {
        return undefined
    }
}

export function getIntOrNull(val: any) {
    try {
        if (val !== null && val !== undefined && val !== '' && !isNaN(val) && parseInt(val) >= 0) {
            return parseInt(val)
        }
        return null
    } catch (err) {
        return null
    }
}

export function getNumberOrZero(val: any) {
    try {
        if (val && !isNaN(val)) {
            return Number(val)
        }
        return 0
    } catch (err) {
        return 0
    }
}

export function getNumberOrOne(val: any) {
    try {
        if (val && !isNaN(val)) {
            return Number(val)
        }
        return 1
    } catch (err) {
        return 1
    }
}

export function getNumberOrNull(val: any) {
    try {
        if (val !== null && val !== undefined && val !== '' && !isNaN(val)) {
            return Number(val)
        }
        return null
    } catch (err) {
        return null
    }
}

export function getDoubleOrNull(val: any) {
    try {
        if (val !== null && val !== undefined && val !== '' && !isNaN(val) && Number(val) >= 0) {
            return Number(Number(val).toFixed(2))
        }
        return null
    } catch (err) {
        return null
    }
}

export function getDoubleOrZero(val: any) {
    try {
        if (val && !isNaN(val)) {
            return Number(Number(val).toFixed(2))
        }
        return 0
    } catch (err) {
        return 0
    }
}

export function getIntOrZero(val: any) {
    try {
        if (val !== null && val !== undefined && val !== '' && !isNaN(val) && parseInt(val) >= 0) {
            return parseInt(val)
        }
        return 0
    } catch (err) {
        return 0
    }
}

export function getIntOrUndefined(val: any) {
    try {
        if (val !== null && val !== undefined && val !== '' && Number.isInteger(Number(val))) {
            return parseInt(val)
        }
        return undefined
    } catch (err) {
        return undefined
    }
}

export function getTrueOrFalse(value: any) {
    if (
        value === true ||
        value === 1 ||
        value === '1' ||
        (typeof value === 'string' && value.toLocaleLowerCase() === 'true')
    ) {
        return true
    }
    return false
}

export function getArrayOrNull(value: any) {
    try {
        if (Array.isArray(value)) {
            return value
        } else if (value !== undefined && value !== null) {
            return [value]
        }
        return null
    } catch (error) {
        return null
    }
}

// Accepts an array, a JSON array string or a comma separated string of ids
export function getIntArray(value: any): number[] {
    let arr: any[] = []

    if (Array.isArray(value)) {
        arr = value
    } else if (typeof value === 'string' && value.trim().startsWith('[')) {
        arr = getArrayFromStringOrNull(value)
    } else if (typeof value === 'string' && value.trim() !== '') {
        arr = value.split(',')
    } else if (typeof value === 'number') {
        arr = [value]
    }

    return removeRepetitions(arr.map((v) => getIntOrNull(v)).filter((v): v is number => v !== null))
}

export function getStringArray(value: any): string[] {
    const arr = Array.isArray(value) ? value : value ? [value] : []

    return arr.map((v) => getStringOrNull(v)).filter((v): v is string => v !== null)
}

export function getArrayFirstElementOrNull(value: any) {
    try {
        if (value && Array.isArray(value)) {
            return value[0]
        }
        return null
    } catch (error) {
        return null
    }
}

export function getEnumOrNull<T extends string>(value: any, allowed: readonly T[] | Record<string, T>): T | null {
    const values = (Array.isArray(allowed) ? allowed : Object.values(allowed)) as T[]

    return typeof value === 'string' && values.includes(value as T) ? (value as T) : null
}

export function removeRepetitions<T>(array: T[]) {
    return Array.from(new Set(array))
}

export function getArrayFromStringOrNull(item: any) {
    try {
        if (item) {
            const arr = JSON.parse(item)

            if (Array.isArray(arr)) {
                return arr
            }
            return []
        }
        return []
    } catch (error) {
        if (typeof item === 'string') {
            return [item]
        }

        return []
    }
}

export function getHHmmTimeOrNull(item: any) {
    return typeof item === 'string' && HH_MM_REGEX.test(item) ? item : null
}

// This will add property only if it exists on req.body with applying given function to body value
export function addIfPropertyExists(obj: any, body: any, key: string, filterFunction: (val: any) => any) {
    if (body[key] !== undefined) {
        obj[key] = filterFunction(body[key])
    }
}

export function checkIfValuesNull(vals: any[]) {
    for (const val of vals) {
        if (val === null) {
            return true
        }
    }
    return false
}

export function checkIfKeyExists(keys: string[], obj: object) {
    const objKeys: string[] = Object.keys(obj)

    for (const k of keys) {
        if (!objKeys.includes(k)) {
            return false
        }
    }

    return true
}

export function getFullName(user: { user_first_name?: string | null; user_last_name?: string | null } | null) {
    if (!user) {
        return ''
    }
    return [user.user_first_name, user.user_last_name].filter(Boolean).join(' ')
}

export function shuffle<T>(array: T[]) {
    const arr = [...array]

    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }

    return arr
}

export function addDays(date: Date, days: number) {
    return moment(date).add(days, 'days').toDate()
}
