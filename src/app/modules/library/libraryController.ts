import { Request, Response } from 'express'

import { sendResponse } from '@core/services/ResponseService'
import statusType from '@core/enum/statusTypes'
import logger from '@core/services/LoggingService'
import prisma from '@core/helpers/prisma'
import { applyIfLimit, applyIfOffset, whereAnd } from '@core/helpers/prismaHelpers'
import { getFullName, getIntOrNull, getStringOrNull } from '@core/helpers/commonHelpers'
import { getSignedFileUrl } from '@core/services/StorageService'
import { getVideoPlayback, playbackExpiry } from '@/app/services/mediaService'
import { recipeAccessWhere, recipeInclude, withRecipeUrls } from '@/app/modules/recipe/recipeService'

// Search by name, code or ingredient within the recipes the user is allowed to see
export async function searchRecipes(req: Request, res: Response) {
    try {
        const { limit, offset } = req.query
        const search = getStringOrNull(req.query.search)
        const category_id = getIntOrNull(req.query.category_id)

        const options: any = { where: await recipeAccessWhere(req.userInfo!) }

        if (category_id) {
            whereAnd(options, { recipe_category_id: category_id })
        }

        if (search) {
            whereAnd(options, {
                OR: [
                    { recipe_name: { contains: search, mode: 'insensitive' } },
                    { recipe_code: { contains: search, mode: 'insensitive' } },
                    { ingredients: { some: { ri_name: { contains: search, mode: 'insensitive' } } } }
                ]
            })
        }

        const count = await prisma.recipes.count(options)

        applyIfLimit(options, limit || 24)

        applyIfOffset(options, offset)

        const recipes = await prisma.recipes.findMany({
            select: {
                recipe_id: true,
                recipe_name: true,
                recipe_code: true,
                recipe_description: true,
                recipe_prep_time_minutes: true,
                recipe_cook_time_minutes: true,
                recipe_portion_size: true,
                recipe_plating_image_id: true,
                recipe_video_id: true,
                recipe_brand: { select: { brand_name: true } },
                recipe_category: { select: { cat_id: true, cat_name: true } }
            },
            orderBy: { recipe_name: 'asc' },
            ...options
        })

        const data = {
            total: count,
            rows: recipes.map((recipe) => ({
                ...recipe,
                has_video: Boolean(recipe.recipe_video_id),
                plating_image_url: getSignedFileUrl(recipe.recipe_plating_image_id)
            }))
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in searchRecipes', error)
        return sendResponse(res, false, null, 'Error searching recipes', statusType.DB_ERROR)
    }
}

export async function getRecipe(req: Request, res: Response) {
    try {
        const recipe_id = getIntOrNull(req.params.recipe_id)

        const recipe = recipe_id
            ? await prisma.recipes.findFirst({
                  where: { AND: [await recipeAccessWhere(req.userInfo!), { recipe_id }] },
                  include: recipeInclude
              })
            : null

        if (!recipe) {
            return sendResponse(res, false, null, 'Recipe not found', statusType.NOT_FOUND)
        }

        const { recipe_video, ...rest } = withRecipeUrls(recipe)

        const data = {
            ...rest,
            video: recipe_video
                ? { video_id: recipe_video.video_id, duration: recipe_video.video_duration_seconds }
                : null,
            watermark: {
                name: getFullName(req.userInfo!),
                employee_id: req.userInfo!.user_employee_id
            }
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getRecipe', error)
        return sendResponse(res, false, null, 'Error getting recipe', statusType.DB_ERROR)
    }
}

export async function getRecipePlayback(req: Request, res: Response) {
    try {
        const recipe_id = getIntOrNull(req.params.recipe_id)

        const recipe = recipe_id
            ? await prisma.recipes.findFirst({
                  where: { AND: [await recipeAccessWhere(req.userInfo!), { recipe_id }] },
                  include: { recipe_video: true }
              })
            : null

        const playback = getVideoPlayback(recipe?.recipe_video || null, playbackExpiry(req.shiftAccess?.ends_at))

        if (!playback?.url) {
            return sendResponse(res, false, null, 'Video is not available', statusType.NOT_FOUND)
        }

        const data = {
            ...playback,
            watermark: {
                name: getFullName(req.userInfo!),
                employee_id: req.userInfo!.user_employee_id,
                outlet: req.userInfo!.user_outlet?.outlet_name || null
            }
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getRecipePlayback', error)
        return sendResponse(res, false, null, 'Error getting video', statusType.DB_ERROR)
    }
}
