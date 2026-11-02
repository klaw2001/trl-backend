import { getIntOrNull, getStringOrNull } from './commonHelpers'
import prisma from './prisma'

interface rowFlags {
    status?: any
    archived?: any
    deleted?: any
}

export function whereIfValue(options: any, col_name: string, value: any, filterFunction: (val: any) => any) {
    value = filterFunction(value)
    if (value !== undefined && value !== null) {
        if (!options.where) {
            options.where = {}
        }

        options.where[col_name] = value
    }
}

export function whereSomeIfValue(
    options: any,
    relation_name: string,
    col_name: string,
    value: any,
    filterFunction: (val: any) => any
) {
    value = filterFunction(value)
    if (value !== undefined && value !== null) {
        if (!options.where) {
            options.where = {}
        }

        options.where[relation_name] = { some: {} }
        options.where[relation_name].some[col_name] = value
    }
}

export function whereIfFlag(options: any, col_name: string, flag_value: any) {
    if (typeof flag_value === 'number') {
        flag_value = flag_value.toString()
    }

    if (flag_value === '1' || flag_value === '0') {
        if (!options.where) {
            options.where = {}
        }

        options.where[col_name] = flag_value === '1'
    }
}

// Deleted rows are hidden unless `deleted=1` is asked for explicitly
export function whereIfFlags(options: any, prefix: string, flags: rowFlags) {
    whereIfFlag(options, `${prefix}_status`, flags.status)
    whereIfFlag(options, `${prefix}_archived`, flags.archived)
    whereIfFlag(options, `${prefix}_deleted`, flags.deleted ?? '0')
}

// Adds a condition without overwriting conditions already in options.where
export function whereAnd(options: any, condition: any) {
    if (!options.where) {
        options.where = {}
    }

    options.where.AND = [...(options.where.AND || []), condition]
}

export function applyIfLimit(options: any, limit: any) {
    limit = getIntOrNull(limit)
    if (limit) {
        options.take = Math.min(limit, 1000)
    }
}

export function applyIfOffset(options: any, offset: any) {
    offset = getIntOrNull(offset)
    if (offset) {
        options.skip = offset
    }
}

// Case insensitive search. A nested array of columns matches each search word against each column in order,
// e.g. [['user_first_name', 'user_last_name']] matches "Ravi Kumar"
export function likeIfValue(options: any, cols: any[], search: any) {
    search = getStringOrNull(search)

    if (search) {
        const OR: any[] = []

        for (const col of cols) {
            if (col && Array.isArray(col)) {
                const obj: any = {}
                const searchArr = search.split(' ')
                for (let i = 0; i < col.length; i++) {
                    const inner_col = col[i]
                    if (searchArr[i]) {
                        obj[inner_col] = { contains: searchArr[i], mode: 'insensitive' }
                    }
                }
                OR.push(obj)
            } else {
                const obj: any = {}
                obj[col] = { contains: search, mode: 'insensitive' }
                OR.push(obj)
            }
        }

        whereAnd(options, { OR })
    }
}

export async function checkExists(table: string, prefix: string, id: number | null, columns: string[], values: any[]) {
    if (columns.length !== values.length) {
        throw new Error('columns and values array lengths does not match')
    }

    const OR: any[] = []

    // Filter undefined and null values
    for (let i = 0; i < values.length; i++) {
        if (values[i] !== undefined && values[i] !== null) {
            OR.push({ [columns[i]]: values[i] })
        }
    }

    if (!OR.length) {
        return {
            data: undefined,
            message: ''
        }
    }

    const where: any = {
        OR,
        [`${prefix}_deleted`]: false
    }

    if (id) {
        where[`${prefix}_id`] = { not: id }
    }

    const existing = await (prisma as any)[table].findFirst({ where })

    let message = ''
    if (existing) {
        for (let i = 0; i < columns.length; i++) {
            if (values[i] !== undefined && values[i] !== null && existing[columns[i]] === values[i]) {
                message = `${columns[i].replace(`${prefix}_`, '').replace(/_/g, ' ')} already exists`
                break
            }
        }
    }

    return {
        data: existing,
        message
    }
}
