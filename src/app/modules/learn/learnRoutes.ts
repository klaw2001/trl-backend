import * as Controller from './learnController'
import shiftAccessMiddleware from '@/app/middlewares/shiftAccessMiddleware'
import { route } from '@core/helpers/router'

const router = route()

// Lists stay visible outside shift hours so learners can see what is due
router.get('/assignments', Controller.getMyAssignments)
router.get('/available', Controller.getAvailableModules)
router.get('/history', Controller.getMyHistory)

// Content and records only during the shift window
router.post('/enroll', shiftAccessMiddleware, Controller.enrollModule)
router.get('/assignment/:asg_id', shiftAccessMiddleware, Controller.getAssignmentDetail)
router.get('/lesson/play', shiftAccessMiddleware, Controller.getLessonPlayback)
router.post('/lesson/progress', shiftAccessMiddleware, Controller.saveLessonProgress)
router.post('/lesson/complete', shiftAccessMiddleware, Controller.completeLesson)
router.post('/attempt/start', shiftAccessMiddleware, Controller.startAttempt)
router.post('/attempt/submit', shiftAccessMiddleware, Controller.submitAttempt)
router.post('/acknowledge', shiftAccessMiddleware, Controller.acknowledge)

export default router.router
