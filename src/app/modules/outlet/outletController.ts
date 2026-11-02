import { Request, Response } from 'express'

import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import {
    applyIfLimit,
    applyIfOffset,
    checkExists,
    likeIfValue,
    whereAnd,
    whereIfFlags,
    whereIfValue
} from '@core/helpers/prismaHelpers'
import {
    getHHmmTimeOrNull,
    getIntArray,
    getIntOrNull,
    getStringOrNull,
    getTrueOrFalse
} from '@core/helpers/commonHelpers'
import dataObjectBuilder from '@core/helpers/dataObjectBuilder'
import { audit } from '@core/services/AuditService'
import { canViewOutlet, outletScopeWhere } from '@/app/services/scopeService'

function isValidTimezone(timezone: string) {
    try {
        new Intl.DateTimeFormat('en-GB', { timeZone: timezone })
        return true
    } catch (error) {
        return false
    }
}

export async function getAllOutlets(req: Request, res: Response) {
    try {
        const { search, status, archived, deleted, limit, offset, brand_id } = req.query

        const options: any = {}

        whereIfFlags(options, 'outlet', { status, archived, deleted })
        whereAnd(options, outletScopeWhere(req.userInfo!))
        whereIfValue(options, 'outlet_brand_id', brand_id, getIntOrNull)

        likeIfValue(options, ['outlet_name', 'outlet_code', 'outlet_city'], search)

        const count = await prisma.outlets.count(options)

        applyIfLimit(options, limit)

        applyIfOffset(options, offset)

        const outlets = await prisma.outlets.findMany({
            include: {
                outlet_brand: { select: { brand_id: true, brand_name: true } },
                outlet_franchisee: { select: { user_id: true, user_first_name: true, user_last_name: true } },
                _count: { select: { users: { where: { user_deleted: false, user_status: true } } } }
            },
            orderBy: { outlet_name: 'asc' },
            ...options
        })

        const data = {
            total: count,
            rows: outlets
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllOutlets', error)
        return sendResponse(res, false, null, 'Error getting all outlets', statusType.DB_ERROR)
    }
}

export async function getSingleOutlet(req: Request, res: Response) {
    try {
        const outlet_id = getIntOrNull(req.params.outlet_id)

        if (!outlet_id || !(await canViewOutlet(req.userInfo!, outlet_id))) {
            return sendResponse(res, false, null, 'Outlet not found', statusType.NOT_FOUND)
        }

        const data = await prisma.outlets.findUnique({
            where: { outlet_id },
            include: {
                outlet_brand: { select: { brand_id: true, brand_name: true } },
                outlet_franchisee: { select: { user_id: true, user_first_name: true, user_last_name: true } }
            }
        })

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getSingleOutlet', error)
        return sendResponse(res, false, null, 'Error getting single outlet', statusType.DB_ERROR)
    }
}

export async function saveOutlet(req: Request, res: Response) {
    try {
        const data: any = dataObjectBuilder(req.body)
            .addIfValueExists('outlet_name', getStringOrNull)
            .addIfValueExists('outlet_code', (val) => getStringOrNull(val)?.toUpperCase() || null)
            .addIfValueExists('outlet_brand_id', getIntOrNull)
            .addIfValueExists('outlet_city', getStringOrNull)
            .addIfValueExists('outlet_address', getStringOrNull)
            .addIfValueExists('outlet_franchisee_id', getIntOrNull)
            .addIfValueExists('outlet_timezone', getStringOrNull)
            .addIfValueExists('outlet_shift_start', getHHmmTimeOrNull)
            .addIfValueExists('outlet_shift_end', getHHmmTimeOrNull)
            .addIfValueExists('outlet_shift_days', (val) => getIntArray(val).filter((d) => d >= 1 && d <= 7))
            .addIfValueExists('outlet_status', getTrueOrFalse)
            .addIfValueExists('outlet_archived', getTrueOrFalse)
            .addIfValueExists('outlet_deleted', getTrueOrFalse)
            .getDataObject()

        let outlet_id = getIntOrNull(req.body.outlet_id)

        if (outlet_id && !(await canViewOutlet(req.userInfo!, outlet_id))) {
            return sendResponse(res, false, null, 'Outlet not found', statusType.NOT_FOUND)
        }

        if (data.outlet_timezone && !isValidTimezone(data.outlet_timezone)) {
            return sendResponse(res, false, null, 'Invalid timezone', statusType.BAD_REQUEST)
        }

        if (Boolean(data.outlet_shift_start) !== Boolean(data.outlet_shift_end)) {
            return sendResponse(res, false, null, 'Shift needs both start and end time', statusType.BAD_REQUEST)
        }

        const exists = await checkExists('outlets', 'outlet', outlet_id, ['outlet_code'], [data.outlet_code])

        if (exists.data) {
            return sendResponse(res, false, null, exists.message, statusType.CONFLICT)
        }

        if (outlet_id) {
            data.outlet_updated_by = String(req.userInfo!.user_id)

            await prisma.outlets.update({ where: { outlet_id }, data })
        } else {
            if (!data.outlet_name || !data.outlet_code || !data.outlet_brand_id) {
                return sendResponse(
                    res,
                    false,
                    null,
                    'Outlet name, code and brand are required',
                    statusType.BAD_REQUEST
                )
            }

            data.outlet_created_by = String(req.userInfo!.user_id)

            const outlet = await prisma.outlets.create({ data })
            outlet_id = outlet.outlet_id
        }

        // Keep staff brand in sync when the outlet moves to another brand
        if (data.outlet_brand_id) {
            await prisma.users.updateMany({
                where: { user_outlet_id: outlet_id },
                data: { user_brand_id: data.outlet_brand_id }
            })
        }

        await audit(req, req.body.outlet_id ? 'update' : 'create', 'outlet', outlet_id, data)

        return sendResponse(res, true, { outlet_id }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in saveOutlet', error)
        return sendResponse(res, false, null, 'Error saving outlet', statusType.DB_ERROR)
    }
}
