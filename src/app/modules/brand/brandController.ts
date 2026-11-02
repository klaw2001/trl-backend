import { Request, Response } from 'express'

import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import { applyIfLimit, applyIfOffset, checkExists, likeIfValue, whereIfFlags } from '@core/helpers/prismaHelpers'
import { getIntOrNull, getStringOrNull, getTrueOrFalse } from '@core/helpers/commonHelpers'
import dataObjectBuilder from '@core/helpers/dataObjectBuilder'
import { audit } from '@core/services/AuditService'

export async function getAllBrands(req: Request, res: Response) {
    try {
        const { search, status, archived, deleted, limit, offset } = req.query

        const options: any = {}

        whereIfFlags(options, 'brand', { status, archived, deleted })

        likeIfValue(options, ['brand_name', 'brand_code'], search)

        const count = await prisma.brands.count(options)

        applyIfLimit(options, limit)

        applyIfOffset(options, offset)

        const brands = await prisma.brands.findMany({
            include: {
                _count: {
                    select: {
                        outlets: { where: { outlet_deleted: false } },
                        users: { where: { user_deleted: false } }
                    }
                }
            },
            orderBy: { brand_name: 'asc' },
            ...options
        })

        const data = {
            total: count,
            rows: brands
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllBrands', error)
        return sendResponse(res, false, null, 'Error getting all brands', statusType.DB_ERROR)
    }
}

export async function getSingleBrand(req: Request, res: Response) {
    try {
        const brand_id = getIntOrNull(req.params.brand_id)

        if (!brand_id) {
            return sendResponse(res, false, null, 'brand_id not valid', statusType.BAD_REQUEST)
        }

        const data = await prisma.brands.findFirst({
            where: { brand_id, brand_deleted: false }
        })

        if (!data) {
            return sendResponse(res, false, null, 'Brand not found', statusType.NOT_FOUND)
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getSingleBrand', error)
        return sendResponse(res, false, null, 'Error getting single brand', statusType.DB_ERROR)
    }
}

export async function saveBrand(req: Request, res: Response) {
    try {
        const data: any = dataObjectBuilder(req.body)
            .addIfValueExists('brand_name', getStringOrNull)
            .addIfValueExists('brand_code', (val) => getStringOrNull(val)?.toUpperCase() || null)
            .addIfValueExists('brand_description', getStringOrNull)
            .addIfValueExists('brand_status', getTrueOrFalse)
            .addIfValueExists('brand_archived', getTrueOrFalse)
            .addIfValueExists('brand_deleted', getTrueOrFalse)
            .getDataObject()

        let brand_id = getIntOrNull(req.body.brand_id)

        const exists = await checkExists('brands', 'brand', brand_id, ['brand_code'], [data.brand_code])

        if (exists.data) {
            return sendResponse(res, false, null, exists.message, statusType.CONFLICT)
        }

        if (brand_id) {
            data.brand_updated_by = String(req.userInfo!.user_id)

            await prisma.brands.update({ where: { brand_id }, data })
        } else {
            if (!data.brand_name || !data.brand_code) {
                return sendResponse(res, false, null, 'Brand name and code are required', statusType.BAD_REQUEST)
            }

            data.brand_created_by = String(req.userInfo!.user_id)

            const brand = await prisma.brands.create({ data })
            brand_id = brand.brand_id
        }

        await audit(req, req.body.brand_id ? 'update' : 'create', 'brand', brand_id, data)

        return sendResponse(res, true, { brand_id }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in saveBrand', error)
        return sendResponse(res, false, null, 'Error saving brand', statusType.DB_ERROR)
    }
}
