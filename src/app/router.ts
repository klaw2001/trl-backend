import express from 'express'

import moduleKeys from '@core/enum/moduleKeys'
import authMiddleware from '@/app/middlewares/authMiddleware'
import readAccessMiddleware from '@/app/middlewares/readAccessMiddleware'
import shiftAccessMiddleware from '@/app/middlewares/shiftAccessMiddleware'

import authRoutes from '@/app/modules/auth/authRoutes'
import fileRoutes from '@/app/modules/file/fileRoutes'
import webhookRoutes from '@/app/modules/webhook/webhookRoutes'
import homeRoutes from '@/app/modules/home/homeRoutes'
import masterRoutes from '@/app/modules/master/masterRoutes'
import notificationRoutes from '@/app/modules/notification/notificationRoutes'
import learnRoutes from '@/app/modules/learn/learnRoutes'
import libraryRoutes from '@/app/modules/library/libraryRoutes'
import userRoutes from '@/app/modules/user/userRoutes'
import roleRoutes from '@/app/modules/role/roleRoutes'
import brandRoutes from '@/app/modules/brand/brandRoutes'
import outletRoutes from '@/app/modules/outlet/outletRoutes'
import categoryRoutes from '@/app/modules/category/categoryRoutes'
import trainingRoutes from '@/app/modules/training/trainingRoutes'
import pathRoutes from '@/app/modules/path/pathRoutes'
import assignmentRoutes from '@/app/modules/assignment/assignmentRoutes'
import recipeRoutes from '@/app/modules/recipe/recipeRoutes'
import mediaRoutes from '@/app/modules/media/mediaRoutes'
import reportRoutes from '@/app/modules/report/reportRoutes'
import auditRoutes from '@/app/modules/audit/auditRoutes'

const router = express.Router()

// Public: authenticated by credentials, signed URLs or webhook signatures
router.use('/auth', authRoutes)
router.use('/file', fileRoutes)
router.use('/webhook', webhookRoutes)

router.use(authMiddleware)

// Every logged in user
router.use('/home', homeRoutes)
router.use('/master', masterRoutes)
router.use('/notification', notificationRoutes)
router.use('/learn', learnRoutes)
router.use('/library', shiftAccessMiddleware, libraryRoutes)

// Permission based
router.use('/user', readAccessMiddleware(moduleKeys.USER), userRoutes)
router.use('/role', readAccessMiddleware(moduleKeys.ROLE), roleRoutes)
router.use('/brand', readAccessMiddleware(moduleKeys.BRAND), brandRoutes)
router.use('/outlet', readAccessMiddleware(moduleKeys.OUTLET), outletRoutes)
router.use('/category', readAccessMiddleware(moduleKeys.CATEGORY), categoryRoutes)
router.use('/training', readAccessMiddleware(moduleKeys.TRAINING), trainingRoutes)
router.use('/path', readAccessMiddleware(moduleKeys.PATH), pathRoutes)
router.use('/assignment', readAccessMiddleware(moduleKeys.ASSIGNMENT), assignmentRoutes)
router.use('/recipe', readAccessMiddleware(moduleKeys.RECIPE), recipeRoutes)
router.use('/media', readAccessMiddleware([moduleKeys.TRAINING, moduleKeys.RECIPE]), mediaRoutes)
router.use('/report', readAccessMiddleware(moduleKeys.REPORT), reportRoutes)
router.use('/audit', readAccessMiddleware(moduleKeys.AUDIT), auditRoutes)

export default router
