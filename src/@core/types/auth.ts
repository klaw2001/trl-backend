import type { outlets, roles, users } from '@/generated/prisma/client'

// Authenticated user attached to req.userInfo by authMiddleware
export type AuthUser = Omit<users, 'user_password'> & {
    user_role_relation: roles
    user_outlet: outlets | null
}

// Result of the shift window check, attached to req.shiftAccess by shiftAccessMiddleware
export interface ShiftAccess {
    restricted: boolean
    allowed: boolean
    timezone: string
    start: string | null
    end: string | null
    days: number[]
    // Current window end (allowed) or next window start (blocked)
    ends_at: Date | null
    next_start_at: Date | null
}
