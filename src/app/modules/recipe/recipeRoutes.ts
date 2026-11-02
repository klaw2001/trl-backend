import * as Controller from './recipeController'
import writeAccessMiddleware from '@/app/middlewares/writeAccessMiddleware'
import { route } from '@core/helpers/router'
import moduleKeys from '@core/enum/moduleKeys'

const router = route()

router.get('/all', Controller.getAllRecipes)
router.get('/single/:recipe_id', Controller.getSingleRecipe)
router.get('/revision/:rr_id', Controller.getRecipeRevision)
router.post('/save', writeAccessMiddleware(moduleKeys.RECIPE), Controller.saveRecipe)
router.post('/publish', writeAccessMiddleware(moduleKeys.RECIPE), Controller.publishRecipe)

export default router.router
