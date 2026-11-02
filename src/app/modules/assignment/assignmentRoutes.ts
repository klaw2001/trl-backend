import * as Controller from './assignmentController'
import writeAccessMiddleware from '@/app/middlewares/writeAccessMiddleware'
import { route } from '@core/helpers/router'
import moduleKeys from '@core/enum/moduleKeys'

const router = route()

const assignmentWrite = writeAccessMiddleware(moduleKeys.ASSIGNMENT)

router.get('/all', Controller.getAllAssignments)
router.post('/assign', assignmentWrite, Controller.assignModules)
router.post('/revoke', assignmentWrite, Controller.revokeAssignments)
router.post('/due-date', assignmentWrite, Controller.updateDueDate)
router.post('/retrain', assignmentWrite, Controller.retrainAssignments)

export default router.router
