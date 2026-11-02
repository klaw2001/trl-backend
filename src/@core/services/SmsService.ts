import logger from '@core/services/LoggingService'

// Plug an SMS gateway in here; `console` logs the message for development
export async function sendSms(mobile: string, message: string) {
    try {
        switch (process.env.SMS_PROVIDER || 'console') {
            case 'console':
            default:
                logger.consoleInfoLog('SmsService', `SMS to ${mobile}: ${message}`)
                return true
        }
    } catch (error) {
        logger.consoleErrorLog('SmsService', 'Error in sendSms', error)
        return false
    }
}
