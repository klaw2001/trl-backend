import * as Controller from './auditController'
import { route } from '@core/helpers/router'

const router = route()

router.get('/all', Controller.getAllLogs)

export default router.router
