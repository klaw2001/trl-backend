import { config } from 'dotenv'

// Loads .env before anything reads process.env; must be the first import of the entry file
config({ quiet: true })
