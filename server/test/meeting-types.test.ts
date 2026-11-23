import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { buildApp } from '../src/app.js'
import { openDatabase } from '../src/database.js'

let app: FastifyInstance
let db: DatabaseSync

beforeEach(() => {
  db = openDatabase()
  app = buildApp({ db })
})

afterEach(async () => {
  await app.close()
  db.close()
})

describe('GET /meeting-types', () => {
  it('returns an empty list when no meeting types exist', async () => {
    const response = await app.inject({ method: 'GET', url: '/meeting-types' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
  })

  it('returns persisted meeting types sorted by duration then name', async () => {
    for (const payload of [
      { name: 'Бета', durationMinutes: 60 },
      { name: 'Яблоко', durationMinutes: 15 },
      { name: 'Апельсин', durationMinutes: 15 },
      { name: 'Альфа', durationMinutes: 30 },
    ]) {
      const created = await app.inject({
        method: 'POST',
        url: '/meeting-types',
        payload,
      })
      expect(created.statusCode).toBe(201)
    }

    const response = await app.inject({ method: 'GET', url: '/meeting-types' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([
      { id: 3, name: 'Апельсин', durationMinutes: 15 },
      { id: 2, name: 'Яблоко', durationMinutes: 15 },
      { id: 4, name: 'Альфа', durationMinutes: 30 },
      { id: 1, name: 'Бета', durationMinutes: 60 },
    ])
  })
})

describe('POST /meeting-types', () => {
  it('creates a meeting type and returns it', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/meeting-types',
      payload: {
        name: 'Вводный звонок',
        description: 'Знакомство и обсуждение задачи',
        durationMinutes: 30,
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({
      id: 1,
      name: 'Вводный звонок',
      description: 'Знакомство и обсуждение задачи',
      durationMinutes: 30,
    })
  })

  it('trims text fields and omits an empty description', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/meeting-types',
      payload: {
        name: '  Короткий звонок  ',
        description: '   ',
        durationMinutes: 15,
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({
      id: 1,
      name: 'Короткий звонок',
      durationMinutes: 15,
    })
  })

  it.each([
    {
      title: 'missing name',
      payload: { durationMinutes: 30 },
      field: 'name',
      code: 'REQUIRED',
    },
    {
      title: 'blank name',
      payload: { name: '   ', durationMinutes: 30 },
      field: 'name',
      code: 'REQUIRED',
    },
    {
      title: 'name longer than 80 characters',
      payload: { name: 'a'.repeat(81), durationMinutes: 30 },
      field: 'name',
      code: 'TOO_LONG',
    },
    {
      title: 'missing duration',
      payload: { name: 'Звонок' },
      field: 'durationMinutes',
      code: 'REQUIRED',
    },
    {
      title: 'unsupported duration',
      payload: { name: 'Звонок', durationMinutes: 45 },
      field: 'durationMinutes',
      code: 'INVALID_DURATION',
    },
    {
      title: 'non-numeric duration',
      payload: { name: 'Звонок', durationMinutes: '30' },
      field: 'durationMinutes',
      code: 'INVALID_DURATION',
    },
    {
      title: 'description longer than 500 characters',
      payload: {
        name: 'Звонок',
        description: 'a'.repeat(501),
        durationMinutes: 30,
      },
      field: 'description',
      code: 'TOO_LONG',
    },
    {
      title: 'non-string description',
      payload: { name: 'Звонок', description: 42, durationMinutes: 30 },
      field: 'description',
      code: 'INVALID_VALUE',
    },
    {
      title: 'unknown field',
      payload: { name: 'Звонок', durationMinutes: 30, color: 'red' },
      field: 'color',
      code: 'UNKNOWN_FIELD',
    },
  ])('rejects $title with a field error', async ({ payload, field, code }) => {
    const response = await app.inject({
      method: 'POST',
      url: '/meeting-types',
      payload,
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Проверьте заполнение полей',
      details: [{ field, code, message: expect.any(String) }],
    })
  })

  it('accepts boundary lengths', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/meeting-types',
      payload: {
        name: 'a'.repeat(80),
        description: 'b'.repeat(500),
        durationMinutes: 120,
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      name: 'a'.repeat(80),
      description: 'b'.repeat(500),
      durationMinutes: 120,
    })
  })

  it('rejects an unknown query parameter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/meeting-types?limit=10',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Проверьте заполнение полей',
      details: [
        {
          field: 'limit',
          code: 'UNKNOWN_QUERY_PARAMETER',
          message: expect.any(String),
        },
      ],
    })
  })

  it('rejects an unknown query parameter on creation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/meeting-types?source=test',
      payload: { name: 'Звонок', durationMinutes: 30 },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: [{ field: 'source', code: 'UNKNOWN_QUERY_PARAMETER' }],
    })
  })

  it('rejects a body that is not a JSON object', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/meeting-types',
      payload: [],
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Тело запроса должно быть JSON-объектом',
    })
  })

  it('responds with ErrorResponse for malformed JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/meeting-types',
      headers: { 'content-type': 'application/json' },
      payload: '{"name":',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Тело запроса содержит некорректный JSON',
    })
  })
})
