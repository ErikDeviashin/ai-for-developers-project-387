import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildApp } from './app.js'
import { openDatabase } from './database.js'

const port = Number(process.env.PORT ?? 3000)
const host = process.env.HOST ?? '127.0.0.1'

const entryDir = dirname(fileURLToPath(import.meta.url))
const clientDist = resolve(entryDir, '../../client/dist')
const clientDir = existsSync(join(clientDist, 'index.html')) ? clientDist : undefined

if (clientDir === undefined && process.env.NODE_ENV === 'production') {
  console.error(
    `Сборка клиента не найдена: ${clientDist}. Выполните pnpm build перед production-запуском.`,
  )
  process.exit(1)
}

const db = openDatabase(process.env.DATABASE_PATH ?? 'calendar.sqlite')

const app = buildApp({
  db,
  logger: true,
  ...(clientDir === undefined ? {} : { clientDir }),
})

try {
  await app.listen({ port, host })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
