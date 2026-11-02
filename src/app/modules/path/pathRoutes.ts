import * as Controller from './pathController'
import writeAccessMiddleware from '@/app/middlewares/writeAccessMiddleware'
import { route } from '@core/helpers/router'
import moduleKeys from '@core/enum/moduleKeys'

const router = route()

router.get('/all', Controller.getAllPaths)
router.get('/single/:tp_id', Controller.getSinglePath)
router.post('/save', writeAccessMiddleware(moduleKeys.PATH), Controller.savePath)
router.post('/assign', writeAccessMiddleware([moduleKeys.PATH, moduleKeys.ASSIGNMENT]), Controller.assignPath)

export default router.router
