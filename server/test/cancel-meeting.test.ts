import type { FastifyInstance } from 'fastify'
import type { DatabaseSync } from 'node:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { openDatabase } from '../src/database.js'

// Sunday, 22 November 2026, 09:00 in Asia/Tbilisi (+04:00).
const NOW = '2026-11-22T09:00:00+04:00'
const START = '2026-11-23T10:00:00+04:00'
const END = '2026-11-23T10:30:00+04:00'

let app: FastifyInstance
let db: DatabaseSync

beforeEach(() => {
  db = openDatabase()
  app = buildApp({ db, now: () => new Date(NOW) })
})

afterEach(async () => {
  await app.close()
  db.close()
})

type MeetingTypeResponse = {
  id: number
  name: string
  durationMinutes: number
}

type MeetingResponse = {
  id: number
  meetingType: { id: number; name: string; durationMinutes: number }
  start: string
  end: string
  guestName: string
  guestEmail: string
}

async function createMeetingType(durationMinutes = 30): Promise<MeetingTypeResponse> {
  const response = await app.inject({
    method: 'POST',
    url: '/meeting-types',
    payload: { name: `Звонок ${durationMinutes}`, durationMinutes },
  })

  expect(response.statusCode).toBe(201)
  return response.json()
}

async function book(
  meetingTypeId: number,
  start = START,
  guestName = 'Анна',
  guestEmail = 'anna@example.com',
): Promise<MeetingResponse> {
  const response = await app.inject({
    method: 'POST',
    url: '/meetings',
    payload: { meetingTypeId, start, guestName, guestEmail },
  })

  expect(response.statusCode).toBe(201)
  return response.json()
}

function cancel(
  id: number | string,
  body: Record<string, unknown>,
  runner: FastifyInstance = app,
  query = '',
) {
  return runner.inject({
    method: 'POST',
    url: `/meetings/${id}/cancel${query}`,
    payload: body,
  })
}

async function listMeetings(runner: FastifyInstance = app): Promise<MeetingResponse[]> {
  const response = await runner.inject({ method: 'GET', url: '/meetings' })

  expect(response.statusCode).toBe(200)
  return response.json()
}

async function availabilityStarts(meetingTypeId: number): Promise<string[]> {
  const response = await app.inject({
    method: 'GET',
    url: `/meeting-types/${meetingTypeId}/availability`,
  })

  expect(response.statusCode).toBe(200)
  const body = response.json() as {
    days: Array<{ date: string; slots: Array<{ start: string }> }>
  }

  return (body.days.find((day) => day.date === '2026-11-23')?.slots ?? []).map((slot) => slot.start)
}

describe('POST /meetings/{id}/cancel', () => {
  it('deletes the meeting, frees the slot and removes it from the owner list', async () => {
    const meetingType = await createMeetingType()
    const meeting = await book(meetingType.id)

    expect(await availabilityStarts(meetingType.id)).not.toContain(START)

    const response = await cancel(meeting.id, { guestEmail: 'anna@example.com' })

    expect(response.statusCode).toBe(204)
    expect(response.body).toBe('')
    expect(await listMeetings()).toEqual([])
    expect(await availabilityStarts(meetingType.id)).toContain(START)
  })

  it('matches the guest email without regard to case and surrounding whitespace', async () => {
    const meetingType = await createMeetingType()
    const meeting = await book(meetingType.id, START, 'Анна', '  Anna@Example.COM  ')

    const response = await cancel(meeting.id, { guestEmail: ' anna@example.com ' })

    expect(response.statusCode).toBe(204)
    expect(await listMeetings()).toEqual([])
  })

  it('rejects a cancellation once the meeting has started and keeps it', async () => {
    const meetingType = await createMeetingType()
    const meeting = await book(meetingType.id)
    const startedApp = buildApp({ db, now: () => new Date(START) })

    try {
      const response = await cancel(meeting.id, { guestEmail: 'anna@example.com' }, startedApp)

      expect(response.statusCode).toBe(409)
      expect(response.json()).toEqual({
        code: 'MEETING_ALREADY_STARTED',
        message: expect.any(String),
      })

      const meetings = await listMeetings(startedApp)
      expect(meetings.map((entry) => entry.id)).toEqual([meeting.id])
    } finally {
      await startedApp.close()
    }

    expect(await availabilityStarts(meetingType.id)).not.toContain(START)
  })

  it('rejects a cancellation during the meeting', async () => {
    const meetingType = await createMeetingType()
    const meeting = await book(meetingType.id)
    const duringApp = buildApp({ db, now: () => new Date('2026-11-23T10:15:00+04:00') })

    try {
      const response = await cancel(meeting.id, { guestEmail: 'anna@example.com' }, duringApp)

      expect(response.statusCode).toBe(409)
      expect(response.json()).toMatchObject({ code: 'MEETING_ALREADY_STARTED' })
      expect(await listMeetings(duringApp)).toHaveLength(1)
    } finally {
      await duringApp.close()
    }
  })

  it('returns the same 404 for a mismatched email and keeps the meeting', async () => {
    const meetingType = await createMeetingType()
    const meeting = await book(meetingType.id)

    const response = await cancel(meeting.id, { guestEmail: 'other@example.com' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      code: 'MEETING_NOT_FOUND',
      message: expect.any(String),
    })
    expect(response.json()).not.toHaveProperty('details')
    expect(await listMeetings()).toHaveLength(1)
    expect(await availabilityStarts(meetingType.id)).not.toContain(START)
  })

  it('returns 404 MEETING_NOT_FOUND for an unknown meeting id', async () => {
    const response = await cancel(9999, { guestEmail: 'anna@example.com' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      code: 'MEETING_NOT_FOUND',
      message: expect.any(String),
    })
  })

  it('returns 404 when the meeting is cancelled twice without reporting a second success', async () => {
    const meetingType = await createMeetingType()
    const meeting = await book(meetingType.id)

    expect((await cancel(meeting.id, { guestEmail: 'anna@example.com' })).statusCode).toBe(204)

    const repeat = await cancel(meeting.id, { guestEmail: 'anna@example.com' })

    expect(repeat.statusCode).toBe(404)
    expect(repeat.json()).toMatchObject({ code: 'MEETING_NOT_FOUND' })
  })

  it('lets the freed slot be booked again with the regular creation rules', async () => {
    const meetingType = await createMeetingType()
    const meeting = await book(meetingType.id)

    expect((await cancel(meeting.id, { guestEmail: 'anna@example.com' })).statusCode).toBe(204)

    const rebooked = await app.inject({
      method: 'POST',
      url: '/meetings',
      payload: {
        meetingTypeId: meetingType.id,
        start: START,
        guestName: 'Борис',
        guestEmail: 'boris@example.com',
      },
    })

    expect(rebooked.statusCode).toBe(201)
    expect(rebooked.json()).toMatchObject({ start: START, end: END })
  })
})

describe('POST /meetings/{id}/cancel validation', () => {
  it.each([
    { title: 'a non-numeric id', id: 'abc' },
    { title: 'a zero id', id: '0' },
    { title: 'a negative id', id: '-1' },
    { title: 'a fractional id', id: '1.5' },
  ])('rejects $title with a field error', async ({ id }) => {
    const response = await cancel(id, { guestEmail: 'anna@example.com' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Проверьте параметры запроса',
      details: [{ field: 'id', code: 'INVALID_VALUE', message: expect.any(String) }],
    })
  })

  it.each([
    { title: 'missing email', body: {}, code: 'REQUIRED' },
    {
      title: 'blank email',
      body: { guestEmail: '   ' },
      code: 'REQUIRED',
    },
    {
      title: 'non-string email',
      body: { guestEmail: 42 },
      code: 'REQUIRED',
    },
    {
      title: 'email without a domain',
      body: { guestEmail: 'anna@example' },
      code: 'INVALID_EMAIL',
    },
    {
      title: 'email shorter than 3 characters',
      body: { guestEmail: 'a@' },
      code: 'INVALID_VALUE',
    },
    {
      title: 'email longer than 254 characters',
      body: { guestEmail: `${'a'.repeat(243)}@example.com` },
      code: 'TOO_LONG',
    },
    {
      title: 'unknown field',
      body: { guestEmail: 'anna@example.com', guestName: 'Анна' },
      code: 'UNKNOWN_FIELD',
    },
  ])('rejects $title with a validation error', async ({ body, code }) => {
    const field = code === 'UNKNOWN_FIELD' ? 'guestName' : 'guestEmail'
    const response = await cancel(1, body)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Проверьте заполнение полей',
      details: [{ field, code, message: expect.any(String) }],
    })
  })

  it('rejects a body that is not a JSON object', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/meetings/1/cancel',
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
      url: '/meetings/1/cancel',
      headers: { 'content-type': 'application/json' },
      payload: '{"guestEmail":',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Тело запроса содержит некорректный JSON',
    })
  })

  it('rejects an unknown query parameter', async () => {
    const response = await cancel(1, { guestEmail: 'anna@example.com' }, app, '?reason=test')

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Проверьте заполнение полей',
      details: [
        {
          field: 'reason',
          code: 'UNKNOWN_QUERY_PARAMETER',
          message: expect.any(String),
        },
      ],
    })
  })

  it('does not delete the meeting when the request is invalid', async () => {
    const meetingType = await createMeetingType()
    const meeting = await book(meetingType.id)

    const response = await cancel(meeting.id, { guestEmail: 'not-an-email' })

    expect(response.statusCode).toBe(400)
    expect(await listMeetings()).toHaveLength(1)
    expect(await availabilityStarts(meetingType.id)).not.toContain(START)
  })
})

describe('POST /meetings/{id}/cancel concurrency', () => {
  it('cancels exactly once when two requests cancel the same meeting concurrently', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'calendar-cancel-'))
    const filename = join(directory, 'calendar.sqlite')
    const firstDb = openDatabase(filename)
    const secondDb = openDatabase(filename)
    const firstApp = buildApp({ db: firstDb, now: () => new Date(NOW) })
    const secondApp = buildApp({ db: secondDb, now: () => new Date(NOW) })

    try {
      const created = await firstApp.inject({
        method: 'POST',
        url: '/meeting-types',
        payload: { name: 'Консультация', durationMinutes: 30 },
      })
      const meetingType = created.json() as MeetingTypeResponse
      const booked = await firstApp.inject({
        method: 'POST',
        url: '/meetings',
        payload: {
          meetingTypeId: meetingType.id,
          start: START,
          guestName: 'Анна',
          guestEmail: 'anna@example.com',
        },
      })
      const meeting = booked.json() as MeetingResponse

      const body = { guestEmail: 'anna@example.com' }
      const [first, second] = await Promise.all([
        firstApp.inject({ method: 'POST', url: `/meetings/${meeting.id}/cancel`, payload: body }),
        secondApp.inject({ method: 'POST', url: `/meetings/${meeting.id}/cancel`, payload: body }),
      ])

      expect([first.statusCode, second.statusCode].sort((left, right) => left - right)).toEqual([
        204, 404,
      ])
    } finally {
      await firstApp.close()
      await secondApp.close()
      firstDb.close()
      secondDb.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
