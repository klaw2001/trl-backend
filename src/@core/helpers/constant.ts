// enums
import appDetails from '@core/enum/appDetails'

export const APP_NAME = appDetails.APPNAME
export const SERVICE_NAME = appDetails.SERVICE_NAME

export const MOMENT_DATE_FORMAT = 'YYYY-MM-DD'

export const MOMENT_DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss'

export const MESSAGE_NOT_ALLOWED = 'You are not allowed to access this resource'
export const MESSAGE_AUTH_ERROR = 'Unauthorized or invalid OTP.'
export const MESSAGE_NOT_FOUND_ERROR = 'Not found. Please try after sometime.'
export const MESSAGE_DB_ERROR = 'Something went wrong while processing data.'
export const MESSAGE_APP_ERROR = 'Something went wrong while processing data.'

// Response Messages

export const RESPONSE_MESSAGES = {
    CODE_400: 'Auth Token is required. Please provide a valid auth token along with request.',
    CODE_401: 'You need to login to view this',
    CODE_403: 'You are forbidden from seeing this',
    CODE_404: 'The resource referenced by request does not exists.',
    CODE_405: 'Requested method is not valid',
    CODE_408: 'Request getting too much time. please try after some time',
    CODE_429: 'Too many requests. Please try again later.',
    CODE_500: 'Something went wrong on server. Please contact server admin.',
    CODE_501: 'We will patch no such thing',
    CODE_503: 'Requested service is unavailable for this time',
    CODE_200: 'Success',
    CODE_201: 'Created',
    CODE_422: 'Something went wrong, Database error'
}

export const DEFAULT_ACK_TEXT = 'I have read and understood this SOP and will follow it.'

// Passwords: at least 8 characters with a letter and a digit
export const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/

export const HH_MM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/
