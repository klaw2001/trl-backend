import * as Controller from './reportController'
import { route } from '@core/helpers/router'

const router = route()

router.get('/dashboard', Controller.getDashboard)
router.get('/completion', Controller.getCompletion)
router.get('/assignments', Controller.getAssignmentReport)
router.get('/user/:user_id', Controller.getUserHistory)
router.get('/export', Controller.exportReport)

export default router.router
