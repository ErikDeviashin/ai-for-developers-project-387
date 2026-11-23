import { describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { openDatabase } from '../src/database.js'

describe('GET /health', () => {
  it('returns the health status', async () => {
    const db = openDatabase()
    const app = buildApp({ db })

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/health',
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ status: 'ok' })
    } finally {
      await app.close()
      db.close()
    }
  })
})
