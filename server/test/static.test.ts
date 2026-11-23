import type { FastifyInstance } from 'fastify'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { openDatabase } from '../src/database.js'

const INDEX_MARKER = 'SPA_FIXTURE'
const INDEX_HTML = `<!doctype html><html><body><div id="root">${INDEX_MARKER}</div></body></html>`
const ASSET_BODY = 'console.log("asset")'

let app: FastifyInstance
let db: DatabaseSync
let clientDir: string

beforeEach(() => {
  clientDir = mkdtempSync(join(tmpdir(), 'calendar-client-'))
  writeFileSync(join(clientDir, 'index.html'), INDEX_HTML)
  mkdirSync(join(clientDir, 'assets'))
  writeFileSync(join(clientDir, 'assets/app.js'), ASSET_BODY)

  db = openDatabase()
  app = buildApp({ db, clientDir })
})

afterEach(async () => {
  await app.close()
  db.close()
  rmSync(clientDir, { recursive: true, force: true })
})

describe('static client', () => {
  it.each(['/', '/book', '/owner'])('serves index.html for %s', async (url) => {
    const response = await app.inject({
      method: 'GET',
      url,
      headers: { accept: 'text/html' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
    expect(response.body).toContain(INDEX_MARKER)
  })

  it('serves index.html for HEAD requests on client routes', async () => {
    const response = await app.inject({
      method: 'HEAD',
      url: '/book',
      headers: { accept: 'text/html' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('text/html')
  })

  it('serves an existing asset instead of index.html', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/assets/app.js',
      headers: { accept: 'text/html' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('javascript')
    expect(response.body).toBe(ASSET_BODY)
  })

  it('serves index.html for an unknown client route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/unknown-client-route',
      headers: { accept: 'text/html' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.body).toContain(INDEX_MARKER)
  })

  it.each(['/health/unknown', '/meeting-types/1/unknown', '/meetings/unknown'])(
    'keeps an unknown API path as JSON for %s',
    async (url) => {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { accept: 'text/html' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.headers['content-type']).toContain('application/json')
      expect(response.body).not.toContain(INDEX_MARKER)
    },
  )

  it('does not serve index.html for a JSON request to /book', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/book',
      headers: { accept: 'application/json' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.body).not.toContain(INDEX_MARKER)
  })

  it('does not serve index.html for POST /book', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/book',
      headers: { accept: 'text/html' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.body).not.toContain(INDEX_MARKER)
  })

  it('does not serve index.html for a missing asset', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/assets/missing.js',
      headers: { accept: 'text/html' },
    })

    expect(response.statusCode).toBe(404)
    expect(response.body).not.toContain(INDEX_MARKER)
  })

  it('keeps the health endpoint working', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { accept: 'text/html' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })
})

describe('buildApp without clientDir', () => {
  it('stays API-only and does not require client/dist', async () => {
    const apiDb = openDatabase()
    const apiApp = buildApp({ db: apiDb })

    try {
      const response = await apiApp.inject({
        method: 'GET',
        url: '/book',
        headers: { accept: 'text/html' },
      })

      expect(response.statusCode).toBe(404)
      expect(response.body).not.toContain(INDEX_MARKER)

      const health = await apiApp.inject({ method: 'GET', url: '/health' })
      expect(health.statusCode).toBe(200)
      expect(health.json()).toEqual({ status: 'ok' })
    } finally {
      await apiApp.close()
      apiDb.close()
    }
  })
})
