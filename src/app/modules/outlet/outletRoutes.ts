import * as Controller from './outletController'
import writeAccessMiddleware from '@/app/middlewares/writeAccessMiddleware'
import { route } from '@core/helpers/router'
import moduleKeys from '@core/enum/moduleKeys'

const router = route()

router.get('/all', Controller.getAllOutlets)
router.get('/single/:outlet_id', Controller.getSingleOutlet)
router.post('/save', writeAccessMiddleware(moduleKeys.OUTLET), Controller.saveOutlet)

export default router.router
