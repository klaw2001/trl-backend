import * as Controller from './libraryController'
import { route } from '@core/helpers/router'

const router = route()

router.get('/recipes', Controller.searchRecipes)
router.get('/recipe/:recipe_id', Controller.getRecipe)
router.get('/recipe/:recipe_id/play', Controller.getRecipePlayback)

export default router.router
