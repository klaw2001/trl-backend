import * as Controller from './roleController'
import writeAccessMiddleware from '@/app/middlewares/writeAccessMiddleware'
import { route } from '@core/helpers/router'
import moduleKeys from '@core/enum/moduleKeys'

const router = route()

router.get('/all', Controller.getAllRoles)
router.get('/single/:role_id', Controller.getSingleRole)
router.post('/save', writeAccessMiddleware(moduleKeys.ROLE), Controller.saveRole)

export default router.router
