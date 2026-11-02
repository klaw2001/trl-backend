// Machine readable codes sent in `data.code` so the frontend can react (logout, lock screen, ...)
const errorCodes = {
    TOKEN_MISSING: 'TOKEN_MISSING',
    TOKEN_INVALID: 'TOKEN_INVALID',
    SESSION_REVOKED: 'SESSION_REVOKED',
    ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
    ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
    PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
    OUTSIDE_SHIFT: 'OUTSIDE_SHIFT',
    NO_ACCESS: 'NO_ACCESS'
}

export default errorCodes
