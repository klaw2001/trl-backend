import * as authenticationController from './authController'
import { route } from '@core/helpers/router'
import authMiddleware from '@/app/middlewares/authMiddleware'
import { loginRateLimit, otpRateLimit } from '@/app/middlewares/rateLimitMiddleware'

const router = route()

router.post('/login', loginRateLimit, authenticationController.login)
router.post('/access-token', authenticationController.getAccessToken)
router.post('/forgot-password', otpRateLimit, authenticationController.requestOtp)
router.post('/verify-otp', otpRateLimit, authenticationController.verifyOtp)
router.post('/reset-password', otpRateLimit, authenticationController.resetPassword)
router.post('/change-password', authMiddleware, authenticationController.changePassword)
router.post('/logout', authMiddleware, authenticationController.logout)

export default router.router
