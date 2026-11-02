import * as Controller from './trainingController'
import writeAccessMiddleware from '@/app/middlewares/writeAccessMiddleware'
import { route } from '@core/helpers/router'
import moduleKeys from '@core/enum/moduleKeys'

const router = route()

const trainingWrite = writeAccessMiddleware(moduleKeys.TRAINING)

router.get('/all', Controller.getAllModules)
router.get('/single/:tm_id', Controller.getSingleModule)
router.get('/version/:mv_id', Controller.getVersion)
router.post('/save', trainingWrite, Controller.saveModule)
router.post('/archive', trainingWrite, Controller.archiveModule)
router.post('/version/draft', trainingWrite, Controller.createDraft)
router.post('/version/discard', trainingWrite, Controller.discardDraft)
router.post('/version/save', trainingWrite, Controller.saveVersion)
router.post('/version/publish', trainingWrite, Controller.publishVersion)
router.post('/lesson/save', trainingWrite, Controller.saveLesson)
router.post('/lesson/delete', trainingWrite, Controller.deleteLesson)
router.post('/reorder', trainingWrite, Controller.reorderItems)
router.post('/question/save', trainingWrite, Controller.saveQuestion)
router.post('/question/delete', trainingWrite, Controller.deleteQuestion)

export default router.router
