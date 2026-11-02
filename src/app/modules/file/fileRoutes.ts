import * as Controller from './fileController'
import { route } from '@core/helpers/router'

const router = route()

router.get('/:file_id', Controller.getFile)

export default router.router
