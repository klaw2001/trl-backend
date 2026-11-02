import { getShiftAccess } from '../src/app/services/shiftService'
import { AuthUser } from '../src/@core/types/auth'

// 2026-10-26 is a Monday; 12:00 UTC = 17:30 in Asia/Kolkata
const MONDAY_1730_IST = new Date('2026-10-26T12:00:00Z')

function user(overrides: Partial<AuthUser> = {}, restricted = true): AuthUser {
    return {
        user_shift_start: null,
        user_shift_end: null,
        user_shift_days: [],
        user_shift_exempt: false,
        user_role_relation: { role_shift_restricted: restricted },
        user_outlet: {
            outlet_timezone: 'Asia/Kolkata',
            outlet_shift_start: '09:00',
            outlet_shift_end: '18:00',
            outlet_shift_days: []
        },
        ...overrides
    } as unknown as AuthUser
}

describe('getShiftAccess', () => {
    beforeAll(() => {
        process.env.SHIFT_GRACE_MINUTES = '0'
    })

    test('allows access inside the outlet shift and reports when it ends', () => {
        const access = getShiftAccess(user(), MONDAY_1730_IST)

        expect(access.allowed).toBe(true)
        expect(access.ends_at?.toISOString()).toBe('2026-10-26T12:30:00.000Z')
    })

    test('blocks access outside the shift with the next start time', () => {
        const access = getShiftAccess(user({ user_shift_start: '06:00', user_shift_end: '14:00' }), MONDAY_1730_IST)

        expect(access.allowed).toBe(false)
        // Next day 06:00 IST = 00:30 UTC
        expect(access.next_start_at?.toISOString()).toBe('2026-10-27T00:30:00.000Z')
    })

    test('supports overnight shifts that started yesterday', () => {
        const lateNight = new Date('2026-10-26T20:30:00Z') // Tue 02:00 IST
        const access = getShiftAccess(user({ user_shift_start: '22:00', user_shift_end: '06:00' }), lateNight)

        expect(access.allowed).toBe(true)
    })

    test('respects working days', () => {
        const access = getShiftAccess(user({ user_shift_days: [2, 3, 4] }), MONDAY_1730_IST)

        expect(access.allowed).toBe(false)
    })

    test('roles without shift restriction and exempt users are never blocked', () => {
        const night = new Date('2026-10-26T20:30:00Z')

        expect(getShiftAccess(user({}, false), night).allowed).toBe(true)
        expect(getShiftAccess(user({ user_shift_exempt: true }), night).allowed).toBe(true)
    })

    test('grace minutes extend the window', () => {
        process.env.SHIFT_GRACE_MINUTES = '15'
        const justAfter = new Date('2026-10-26T12:40:00Z') // 18:10 IST

        expect(getShiftAccess(user(), justAfter).allowed).toBe(true)
        process.env.SHIFT_GRACE_MINUTES = '0'
    })
})
