import * as Controller from './notificationController'
import { route } from '@core/helpers/router'

const router = route()

router.get('/all', Controller.getMyNotifications)
router.post('/read', Controller.markRead)

export default router.router
