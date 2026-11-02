import * as Controller from './userController'
import writeAccessMiddleware from '@/app/middlewares/writeAccessMiddleware'
import { route } from '@core/helpers/router'
import moduleKeys from '@core/enum/moduleKeys'

const router = route()

router.get('/all', Controller.getAllUsers)
router.get('/single/:user_id', Controller.getSingleUser)
router.post('/save', writeAccessMiddleware(moduleKeys.USER), Controller.saveUser)
router.post('/transfer', writeAccessMiddleware(moduleKeys.USER), Controller.transferUser)
router.post('/deactivate', writeAccessMiddleware(moduleKeys.USER), Controller.deactivateUser)
router.post('/reactivate', writeAccessMiddleware(moduleKeys.USER), Controller.reactivateUser)
router.post('/force-logout', writeAccessMiddleware(moduleKeys.USER), Controller.forceLogout)
router.post('/reset-password', writeAccessMiddleware(moduleKeys.USER), Controller.resetUserPassword)

export default router.router
