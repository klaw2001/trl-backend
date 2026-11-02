import * as homeController from './homeController'
import { route } from '@core/helpers/router'

const router = route()

router.get('/', homeController.getHome)

export default router.router
