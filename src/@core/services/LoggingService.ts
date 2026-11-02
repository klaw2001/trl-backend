import winston, { Logger } from 'winston'

import logType from '@core/enum/logType'

// Error objects serialize to {} with JSON.stringify, keep message and stack
function serializeError(error: any) {
    if (error instanceof Error) {
        return { name: error.name, message: error.message, stack: error.stack }
    }
    return error
}

class LoggingService {
    DEBUG_LOGGING_ON: boolean
    logger: Logger

    constructor() {
        this.DEBUG_LOGGING_ON = process.env.MODE !== 'production'
        this.logger = winston.createLogger({
            levels: winston.config.npm.levels,
            level: this.DEBUG_LOGGING_ON ? logType.DEBUG : logType.INFO,
            format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
            transports: [
                new winston.transports.Console({
                    silent: process.env.NODE_ENV === 'test',
                    format: this.DEBUG_LOGGING_ON
                        ? winston.format.combine(winston.format.colorize(), winston.format.simple())
                        : winston.format.json()
                }),
                new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
                new winston.transports.File({ filename: 'logs/combined.log' })
            ]
        })
    }

    getWinstonLogger() {
        return this.logger
    }

    consoleLog(route: string, message: string, error: any = null, level = logType.VERBOSE) {
        if (error || level == logType.ERROR || level == logType.WARNING) {
            this.consoleErrorLog(route, message, error)
        } else {
            this.consoleInfoLog(route, message)
        }
    }

    consoleErrorLog(route: string, message: string, error: any) {
        this.logger.error({ route, message, error: serializeError(error) })
    }

    consoleInfoLog(route: string, message: string) {
        this.logger.info({ route, message })
    }
}

const logger = new LoggingService()
export default logger
