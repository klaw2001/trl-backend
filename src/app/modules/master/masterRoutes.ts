import * as Controller from './masterController'
import { route } from '@core/helpers/router'

const router = route()

router.get('/user-profile', Controller.getUserProfile)
router.get('/users', Controller.getAllUsers)
router.get('/roles', Controller.getAllActiveRoles)
router.get('/modules', Controller.getAllModules)
router.get('/brands', Controller.getAllActiveBrands)
router.get('/outlets', Controller.getAllActiveOutlets)
router.get('/categories', Controller.getAllActiveCategories)
router.get('/paths', Controller.getAllActivePaths)
router.get('/training-modules', Controller.getAllPublishedModules)

export default router.router
