declare global {
    namespace NodeJS {
        interface ProcessEnv {
            TZ: string
            MODE: 'development' | 'staging' | 'production'
            NODE_ENV?: string
            PORT?: string
            API_BASEURL?: string
            FRONTEND_BASEURL?: string
            CORS_ORIGINS?: string
            APP_TIMEZONE?: string

            DATABASE_URL: string

            JWT_ACCESS_SECRET: string
            JWT_ACCESS_TOKEN_EXPIRE: string
            JWT_REFRESH_SECRET: string
            JWT_REFRESH_TOKEN_EXPIRE: string
            LOGIN_MAX_ATTEMPTS?: string
            LOGIN_LOCK_MINUTES?: string
            OTP_EXPIRE_MINUTES?: string

            ENCRYPT_KEY: string
            ENCRYPT_IV: string
            FILE_URL_SECRET: string

            SHIFT_GRACE_MINUTES?: string

            BUNNY_STREAM_LIBRARY_ID?: string
            BUNNY_STREAM_API_KEY?: string
            BUNNY_STREAM_READ_ONLY_API_KEY?: string
            BUNNY_STREAM_CDN_HOSTNAME?: string
            BUNNY_STREAM_TOKEN_KEY?: string
            VIDEO_TOKEN_TTL_SECONDS?: string

            STORAGE_PATH?: string
            UPLOAD_MAX_MB?: string

            MAIL_HOST?: string
            MAIL_PORT?: string
            MAIL_SECURE?: string
            MAIL_USER?: string
            MAIL_PASSWORD?: string
            MAIL_FROM?: string

            SMS_PROVIDER?: 'console'

            REMINDER_CRON?: string
            REMINDER_DAYS_BEFORE_DUE?: string
        }
    }
}

export {}
