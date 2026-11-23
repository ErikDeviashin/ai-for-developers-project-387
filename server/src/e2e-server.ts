import { buildApp } from './app.js'
import { openDatabase } from './database.js'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '127.0.0.1'
const db = openDatabase(':memory:')

// Sunday, 22 November 2026, 09:00 in Asia/Tbilisi.
// The first bookable date is Monday, 23 November 2026.
const FIXED_NOW = '2026-11-22T09:00:00+04:00'
const now = () => new Date(FIXED_NOW)

const app = buildApp({ db, now, logger: true })

try {
  await app.listen({ port, host })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
