import type { AuthUser, ShiftAccess } from '../../src/@core/types/auth'

declare global {
    namespace Express {
        interface Request {
            userInfo?: AuthUser
            shiftAccess?: ShiftAccess
            // Raw request body, kept for webhook signature verification
            rawBody?: Buffer
        }
    }
}

export {}
