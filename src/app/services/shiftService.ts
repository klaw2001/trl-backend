import { AuthUser, ShiftAccess } from '@core/types/auth'

const MINUTES_IN_DAY = 24 * 60

function toMinutes(time: string) {
    const [hours, minutes] = time.split(':').map(Number)
    return hours * 60 + minutes
}

// Wall clock of `date` in the given timezone: minutes since midnight and ISO weekday (1 = Mon ... 7 = Sun)
function localClock(date: Date, timezone: string) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        weekday: 'short',
        hourCycle: 'h23'
    }).formatToParts(date)

    const get = (type: string) => parts.find((p) => p.type === type)?.value || ''
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    return {
        minutes: Number(get('hour')) * 60 + Number(get('minute')),
        weekday: weekdays.indexOf(get('weekday')) + 1
    }
}

function shiftDay(weekday: number, offset: number) {
    return ((((weekday - 1 + offset) % 7) + 7) % 7) + 1
}

// User override wins over the outlet default; admins and exempt users are never restricted
export function getShiftAccess(user: AuthUser, now = new Date()): ShiftAccess {
    const timezone = user.user_outlet?.outlet_timezone || process.env.APP_TIMEZONE || 'Asia/Kolkata'
    const hasUserShift = Boolean(user.user_shift_start && user.user_shift_end)
    const start = hasUserShift ? user.user_shift_start : user.user_outlet?.outlet_shift_start || null
    const end = hasUserShift ? user.user_shift_end : user.user_outlet?.outlet_shift_end || null
    const days = user.user_shift_days.length ? user.user_shift_days : user.user_outlet?.outlet_shift_days || []

    const base = { timezone, start, end, days }

    if (!user.user_role_relation.role_shift_restricted || user.user_shift_exempt || !start || !end) {
        return { ...base, restricted: false, allowed: true, ends_at: null, next_start_at: null }
    }

    const grace = Number(process.env.SHIFT_GRACE_MINUTES || 0)
    const startMin = toMinutes(start) - grace
    const length = ((toMinutes(end) - toMinutes(start) + MINUTES_IN_DAY) % MINUTES_IN_DAY || MINUTES_IN_DAY) + grace * 2
    const clock = localClock(now, timezone)
    const worksOn = (weekday: number) => days.length === 0 || days.includes(weekday)
    const minutesFromNow = (minutes: number) => new Date(now.getTime() + minutes * 60 * 1000)

    // A window may start yesterday (overnight shift) or today
    for (const dayOffset of [-1, 0]) {
        const windowStart = startMin + dayOffset * MINUTES_IN_DAY
        const windowEnd = windowStart + length

        if (worksOn(shiftDay(clock.weekday, dayOffset)) && clock.minutes >= windowStart && clock.minutes < windowEnd) {
            return {
                ...base,
                restricted: true,
                allowed: true,
                ends_at: minutesFromNow(windowEnd - clock.minutes),
                next_start_at: null
            }
        }
    }

    // Next window start within the coming week
    let next_start_at: Date | null = null
    for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
        const windowStart = startMin + dayOffset * MINUTES_IN_DAY
        if (windowStart > clock.minutes && worksOn(shiftDay(clock.weekday, dayOffset))) {
            next_start_at = minutesFromNow(windowStart - clock.minutes)
            break
        }
    }

    return { ...base, restricted: true, allowed: false, ends_at: null, next_start_at }
}
