import * as Controller from './categoryController'
import writeAccessMiddleware from '@/app/middlewares/writeAccessMiddleware'
import { route } from '@core/helpers/router'
import moduleKeys from '@core/enum/moduleKeys'

const router = route()

router.get('/all', Controller.getAllCategories)
router.post('/save', writeAccessMiddleware(moduleKeys.CATEGORY), Controller.saveCategory)

export default router.router
