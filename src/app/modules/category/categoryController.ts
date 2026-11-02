import { Request, Response } from 'express'

import { category_type } from '@/generated/prisma/enums'
import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import { applyIfLimit, applyIfOffset, likeIfValue, whereIfFlags, whereIfValue } from '@core/helpers/prismaHelpers'
import { getEnumOrNull, getIntOrNull, getIntOrZero, getStringOrNull, getTrueOrFalse } from '@core/helpers/commonHelpers'
import dataObjectBuilder from '@core/helpers/dataObjectBuilder'
import { audit } from '@core/services/AuditService'

export async function getAllCategories(req: Request, res: Response) {
    try {
        const { search, status, archived, deleted, limit, offset, type } = req.query

        const options: any = {}

        whereIfFlags(options, 'cat', { status, archived, deleted })
        whereIfValue(options, 'cat_type', type, (val) => getEnumOrNull(val, category_type))

        likeIfValue(options, ['cat_name'], search)

        const count = await prisma.categories.count(options)

        applyIfLimit(options, limit)

        applyIfOffset(options, offset)

        const categories = await prisma.categories.findMany({
            include: {
                _count: {
                    select: {
                        modules: { where: { tm_deleted: false } },
                        recipes: { where: { recipe_deleted: false } }
                    }
                }
            },
            orderBy: [{ cat_type: 'asc' }, { cat_sequence: 'asc' }, { cat_name: 'asc' }],
            ...options
        })

        const data = {
            total: count,
            rows: categories
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllCategories', error)
        return sendResponse(res, false, null, 'Error getting all categories', statusType.DB_ERROR)
    }
}

export async function saveCategory(req: Request, res: Response) {
    try {
        const data: any = dataObjectBuilder(req.body)
            .addIfValueExists('cat_name', getStringOrNull)
            .addIfValueExists('cat_type', (val) => getEnumOrNull(val, category_type))
            .addIfValueExists('cat_sequence', getIntOrZero)
            .addIfValueExists('cat_status', getTrueOrFalse)
            .addIfValueExists('cat_archived', getTrueOrFalse)
            .addIfValueExists('cat_deleted', getTrueOrFalse)
            .getDataObject()

        let cat_id = getIntOrNull(req.body.cat_id)

        if (data.cat_type === null) {
            return sendResponse(res, false, null, 'Category type must be training or recipe', statusType.BAD_REQUEST)
        }

        if (cat_id) {
            data.cat_updated_by = String(req.userInfo!.user_id)

            await prisma.categories.update({ where: { cat_id }, data })
        } else {
            if (!data.cat_name || !data.cat_type) {
                return sendResponse(res, false, null, 'Category name and type are required', statusType.BAD_REQUEST)
            }

            data.cat_created_by = String(req.userInfo!.user_id)

            const category = await prisma.categories.create({ data })
            cat_id = category.cat_id
        }

        await audit(req, req.body.cat_id ? 'update' : 'create', 'category', cat_id, data)

        return sendResponse(res, true, { cat_id }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in saveCategory', error)
        return sendResponse(res, false, null, 'Error saving category', statusType.DB_ERROR)
    }
}
