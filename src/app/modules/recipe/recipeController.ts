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
    whereIfFlag,
    whereIfFlags,
    whereIfValue
} from '@core/helpers/prismaHelpers'
import {
    getArrayOrNull,
    getDoubleOrNull,
    getIntArray,
    getIntOrNull,
    getStringArray,
    getStringOrNull,
    getTrueOrFalse
} from '@core/helpers/commonHelpers'
import dataObjectBuilder from '@core/helpers/dataObjectBuilder'
import { getSignedFileUrl } from '@core/services/StorageService'
import { audit } from '@core/services/AuditService'
import { recipeInclude, snapshotRecipe, withRecipeUrls } from './recipeService'

export async function getAllRecipes(req: Request, res: Response) {
    try {
        const { search, status, archived, deleted, limit, offset, brand_id, category_id, published } = req.query

        const options: any = {}

        whereIfFlags(options, 'recipe', { status, archived, deleted })
        whereIfFlag(options, 'recipe_is_published', published)
        whereIfValue(options, 'recipe_brand_id', brand_id, getIntOrNull)
        whereIfValue(options, 'recipe_category_id', category_id, getIntOrNull)

        likeIfValue(options, ['recipe_name', 'recipe_code'], search)

        const count = await prisma.recipes.count(options)

        applyIfLimit(options, limit)

        applyIfOffset(options, offset)

        const recipes = await prisma.recipes.findMany({
            include: {
                recipe_brand: { select: { brand_id: true, brand_name: true } },
                recipe_category: { select: { cat_id: true, cat_name: true } },
                recipe_video: { select: { video_id: true, video_state: true } }
            },
            orderBy: { recipe_updated_at: 'desc' },
            ...options
        })

        const data = {
            total: count,
            rows: recipes.map((recipe) => ({
                ...recipe,
                plating_image_url: getSignedFileUrl(recipe.recipe_plating_image_id)
            }))
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getAllRecipes', error)
        return sendResponse(res, false, null, 'Error getting recipes', statusType.DB_ERROR)
    }
}

export async function getSingleRecipe(req: Request, res: Response) {
    try {
        const recipe_id = getIntOrNull(req.params.recipe_id)

        const recipe = recipe_id
            ? await prisma.recipes.findFirst({ where: { recipe_id, recipe_deleted: false }, include: recipeInclude })
            : null

        if (!recipe) {
            return sendResponse(res, false, null, 'Recipe not found', statusType.NOT_FOUND)
        }

        const revisions = await prisma.recipe_revisions.findMany({
            select: { rr_id: true, rr_revision: true, rr_note: true, rr_created_by: true, rr_created_at: true },
            where: { rr_recipe_id: recipe.recipe_id },
            orderBy: { rr_revision: 'desc' }
        })

        return sendResponse(res, true, { ...withRecipeUrls(recipe), revisions }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getSingleRecipe', error)
        return sendResponse(res, false, null, 'Error getting recipe', statusType.DB_ERROR)
    }
}

// Saves recipe fields; `ingredients` and `steps` arrays replace the existing rows when sent.
// Changes to a published recipe go live immediately and are recorded as a new revision.
export async function saveRecipe(req: Request, res: Response) {
    try {
        const actor = String(req.userInfo!.user_id)

        const data: any = dataObjectBuilder(req.body)
            .addIfValueExists('recipe_name', getStringOrNull)
            .addIfValueExists('recipe_code', (val) => getStringOrNull(val)?.toUpperCase() || null)
            .addIfValueExists('recipe_brand_id', getIntOrNull)
            .addIfValueExists('recipe_category_id', getIntOrNull)
            .addIfValueExists('recipe_role_ids', getIntArray)
            .addIfValueExists('recipe_description', getStringOrNull)
            .addIfValueExists('recipe_video_id', getIntOrNull)
            .addIfValueExists('recipe_portion_size', getStringOrNull)
            .addIfValueExists('recipe_yield', getStringOrNull)
            .addIfValueExists('recipe_prep_time_minutes', getIntOrNull)
            .addIfValueExists('recipe_cook_time_minutes', getIntOrNull)
            .addIfValueExists('recipe_equipment', getStringArray)
            .addIfValueExists('recipe_cooking_instructions', getStringOrNull)
            .addIfValueExists('recipe_plating_instructions', getStringOrNull)
            .addIfValueExists('recipe_plating_image_id', getIntOrNull)
            .addIfValueExists('recipe_storage_instructions', getStringOrNull)
            .addIfValueExists('recipe_shelf_life', getStringOrNull)
            .addIfValueExists('recipe_food_safety', getStringOrNull)
            .addIfValueExists('recipe_common_mistakes', getStringArray)
            .addIfValueExists('recipe_quality_checkpoints', getStringArray)
            .addIfValueExists('recipe_status', getTrueOrFalse)
            .addIfValueExists('recipe_archived', getTrueOrFalse)
            .addIfValueExists('recipe_deleted', getTrueOrFalse)
            .getDataObject()

        let recipe_id = getIntOrNull(req.body.recipe_id)

        const exists = await checkExists('recipes', 'recipe', recipe_id, ['recipe_code'], [data.recipe_code])

        if (exists.data) {
            return sendResponse(res, false, null, exists.message, statusType.CONFLICT)
        }

        if (recipe_id) {
            data.recipe_updated_by = actor

            await prisma.recipes.update({ where: { recipe_id }, data })
        } else {
            if (!data.recipe_name) {
                return sendResponse(res, false, null, 'Recipe name is required', statusType.BAD_REQUEST)
            }

            data.recipe_created_by = actor

            const recipe = await prisma.recipes.create({ data })
            recipe_id = recipe.recipe_id
        }

        const ingredients = getArrayOrNull(req.body.ingredients)

        if (ingredients) {
            const rows = ingredients
                .map((item: any, index: number) => ({
                    ri_recipe_id: recipe_id as number,
                    ri_name: getStringOrNull(item?.ri_name),
                    ri_quantity: getDoubleOrNull(item?.ri_quantity),
                    ri_unit: getStringOrNull(item?.ri_unit),
                    ri_note: getStringOrNull(item?.ri_note),
                    ri_sequence: index
                }))
                .filter((row: any) => row.ri_name)

            await prisma.$transaction([
                prisma.recipe_ingredients.deleteMany({ where: { ri_recipe_id: recipe_id } }),
                prisma.recipe_ingredients.createMany({ data: rows })
            ])
        }

        const steps = getArrayOrNull(req.body.steps)

        if (steps) {
            const rows = steps
                .map((item: any, index: number) => ({
                    rs_recipe_id: recipe_id as number,
                    rs_instruction: getStringOrNull(item?.rs_instruction),
                    rs_duration_minutes: getIntOrNull(item?.rs_duration_minutes),
                    rs_image_id: getIntOrNull(item?.rs_image_id),
                    rs_sequence: index
                }))
                .filter((row: any) => row.rs_instruction)

            await prisma.$transaction([
                prisma.recipe_steps.deleteMany({ where: { rs_recipe_id: recipe_id } }),
                prisma.recipe_steps.createMany({ data: rows })
            ])
        }

        const recipe = await prisma.recipes.findUniqueOrThrow({ where: { recipe_id } })

        if (req.body.recipe_id && recipe.recipe_is_published) {
            await snapshotRecipe(recipe_id, getStringOrNull(req.body.change_note) || 'Edited', actor)
        }

        await audit(req, req.body.recipe_id ? 'update' : 'create', 'recipe', recipe_id, {
            fields: Object.keys(data),
            ingredients: ingredients?.length,
            steps: steps?.length
        })

        return sendResponse(res, true, { recipe_id }, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in saveRecipe', error)
        return sendResponse(res, false, null, 'Error saving recipe', statusType.DB_ERROR)
    }
}

// Body: { recipe_id, published, note }
export async function publishRecipe(req: Request, res: Response) {
    try {
        const recipe_id = getIntOrNull(req.body.recipe_id)
        const published = getTrueOrFalse(req.body.published)

        const recipe = recipe_id
            ? await prisma.recipes.findFirst({ where: { recipe_id, recipe_deleted: false }, include: recipeInclude })
            : null

        if (!recipe) {
            return sendResponse(res, false, null, 'Recipe not found', statusType.NOT_FOUND)
        }

        if (published) {
            const errors: string[] = []
            if (!recipe.recipe_category_id) {
                errors.push('Select a category')
            }
            if (!recipe.ingredients.length) {
                errors.push('Add the ingredients and quantities')
            }
            if (!recipe.steps.length) {
                errors.push('Add the preparation steps')
            }
            if (errors.length) {
                return sendResponse(
                    res,
                    false,
                    { errors },
                    'Fix these issues before publishing',
                    statusType.BAD_REQUEST
                )
            }
        }

        await prisma.recipes.update({
            where: { recipe_id: recipe.recipe_id },
            data: {
                recipe_is_published: published,
                recipe_published_at: published ? new Date() : recipe.recipe_published_at,
                recipe_updated_by: String(req.userInfo!.user_id)
            }
        })

        let revision = recipe.recipe_revision
        if (published) {
            revision = await snapshotRecipe(
                recipe.recipe_id,
                getStringOrNull(req.body.note) || 'Published',
                String(req.userInfo!.user_id)
            )
        }

        await audit(req, published ? 'publish' : 'unpublish', 'recipe', recipe.recipe_id, { revision })

        return sendResponse(res, true, { revision }, published ? 'Recipe published' : 'Recipe unpublished')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in publishRecipe', error)
        return sendResponse(res, false, null, 'Error publishing recipe', statusType.DB_ERROR)
    }
}

export async function getRecipeRevision(req: Request, res: Response) {
    try {
        const rr_id = getIntOrNull(req.params.rr_id)

        const data = rr_id ? await prisma.recipe_revisions.findUnique({ where: { rr_id } }) : null

        if (!data) {
            return sendResponse(res, false, null, 'Revision not found', statusType.NOT_FOUND)
        }

        return sendResponse(res, true, data, 'success')
    } catch (error) {
        logger.consoleErrorLog(req.originalUrl, 'Error in getRecipeRevision', error)
        return sendResponse(res, false, null, 'Error getting revision', statusType.DB_ERROR)
    }
}
