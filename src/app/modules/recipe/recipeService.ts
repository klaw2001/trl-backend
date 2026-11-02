import type { Prisma } from '@/generated/prisma/client'
import prisma from '@core/helpers/prisma'
import { getSignedFileUrl } from '@core/services/StorageService'
import { AuthUser } from '@core/types/auth'
import { viewerBrandIds } from '@/app/services/scopeService'

export const recipeInclude = {
    recipe_brand: { select: { brand_id: true, brand_name: true } },
    recipe_category: { select: { cat_id: true, cat_name: true } },
    recipe_video: true,
    recipe_plating_image: true,
    ingredients: { orderBy: { ri_sequence: 'asc' as const } },
    steps: { orderBy: { rs_sequence: 'asc' as const }, include: { rs_image: true } }
}

type RecipeWithRelations = Prisma.recipesGetPayload<{ include: typeof recipeInclude }>

// Replaces file relations with signed URLs
export function withRecipeUrls(recipe: RecipeWithRelations) {
    return {
        ...recipe,
        plating_image_url: getSignedFileUrl(recipe.recipe_plating_image_id),
        steps: recipe.steps.map((step) => ({ ...step, image_url: getSignedFileUrl(step.rs_image_id) }))
    }
}

// Published recipes of the viewer's brands and role
export async function recipeAccessWhere(viewer: AuthUser): Promise<Prisma.recipesWhereInput> {
    const brandIds = await viewerBrandIds(viewer)

    return {
        AND: [
            { recipe_is_published: true, recipe_status: true, recipe_archived: false, recipe_deleted: false },
            brandIds === null ? {} : { OR: [{ recipe_brand_id: null }, { recipe_brand_id: { in: brandIds } }] },
            { OR: [{ recipe_role_ids: { isEmpty: true } }, { recipe_role_ids: { has: viewer.user_role_id } }] }
        ]
    }
}

// Stores the current state of a recipe as the next revision (change history)
export async function snapshotRecipe(recipe_id: number, note: string | null, created_by: string) {
    const recipe = await prisma.recipes.findUniqueOrThrow({ where: { recipe_id }, include: recipeInclude })
    const revision = recipe.recipe_revision + 1

    await prisma.$transaction([
        prisma.recipe_revisions.create({
            data: {
                rr_recipe_id: recipe_id,
                rr_revision: revision,
                rr_snapshot: JSON.parse(JSON.stringify(recipe)),
                rr_note: note,
                rr_created_by: created_by
            }
        }),
        prisma.recipes.update({ where: { recipe_id }, data: { recipe_revision: revision } })
    ])

    return revision
}
