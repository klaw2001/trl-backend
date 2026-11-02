import nodemailer from 'nodemailer'

import logger from '@core/services/LoggingService'

interface mailOptions {
    to: string
    from?: string | null
    subject: string
    body: string | null
}

const mail = process.env.MAIL_HOST
    ? nodemailer.createTransport({
          host: process.env.MAIL_HOST,
          port: Number(process.env.MAIL_PORT || 587),
          secure: process.env.MAIL_SECURE === 'true',
          auth: {
              user: process.env.MAIL_USER,
              pass: process.env.MAIL_PASSWORD
          }
      })
    : null

export async function sendMail(options: mailOptions) {
    try {
        if (!mail) {
            logger.consoleInfoLog(
                'mailHelpers.ts',
                `Mail not configured, skipped "${options.subject}" to ${options.to}`
            )
            return false
        }

        const info = await mail.sendMail({
            from: options.from || process.env.MAIL_FROM,
            to: options.to,
            subject: options.subject,
            html: options.body || ''
        })

        logger.consoleInfoLog('mailHelpers.ts', `Mail sent ${info.messageId}`)
        return true
    } catch (error) {
        logger.consoleErrorLog('mailHelpers.ts', 'Error in sendMail', error)
        return false
    }
}
