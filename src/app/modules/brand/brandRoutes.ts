import * as Controller from './brandController'
import writeAccessMiddleware from '@/app/middlewares/writeAccessMiddleware'
import { route } from '@core/helpers/router'
import moduleKeys from '@core/enum/moduleKeys'

const router = route()

router.get('/all', Controller.getAllBrands)
router.get('/single/:brand_id', Controller.getSingleBrand)
router.post('/save', writeAccessMiddleware(moduleKeys.BRAND), Controller.saveBrand)

export default router.router
