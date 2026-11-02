import * as Controller from './mediaController'
import writeAccessMiddleware from '@/app/middlewares/writeAccessMiddleware'
import { route } from '@core/helpers/router'
import moduleKeys from '@core/enum/moduleKeys'

const router = route()

// Content managers of training or recipes can manage media
const contentWrite = writeAccessMiddleware([moduleKeys.TRAINING, moduleKeys.RECIPE])

router.get('/video/all', contentWrite, Controller.getAllVideos)
router.get('/video/preview/:video_id', contentWrite, Controller.getVideoPreview)
router.get('/video/status/:video_id', contentWrite, Controller.refreshVideoStatus)
router.post('/video/upload', contentWrite, Controller.createVideoUpload)
router.post('/video/register', contentWrite, Controller.registerVideo)
router.post('/video/external', contentWrite, Controller.addExternalVideo)
router.post('/video/save', contentWrite, Controller.saveVideo)
router.post('/file/upload', contentWrite, Controller.uploadFile)

export default router.router
