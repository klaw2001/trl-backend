import * as Controller from './webhookController'
import { route } from '@core/helpers/router'

const router = route()

router.post('/bunny', Controller.bunnyWebhook)

export default router.router
