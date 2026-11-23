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
  description?: string
  durationMinutes: number
}

type MeetingResponse = {
  id: number
  meetingType: { id: number; name: string; durationMinutes: number }
  start: string
  end: string
  guestName: string
  guestEmail: string
  guestAdditionalInfo?: string
}

async function createMeetingType(
  durationMinutes = 30,
  name = `Звонок ${durationMinutes}`,
): Promise<MeetingTypeResponse> {
  const response = await app.inject({
    method: 'POST',
    url: '/meeting-types',
    payload: { name, durationMinutes },
  })

  expect(response.statusCode).toBe(201)
  return response.json()
}

async function postMeeting(payload: Record<string, unknown>) {
  return app.inject({ method: 'POST', url: '/meetings', payload })
}

describe('POST /meetings', () => {
  it('creates a meeting, computes its end and returns the nested meeting type summary', async () => {
    const meetingType = await createMeetingType(60, 'Консультация')

    const response = await postMeeting({
      meetingTypeId: meetingType.id,
      start: '2026-11-23T10:00:00+04:00',
      guestName: '  Анна  ',
      guestEmail: '  Anna@Example.COM ',
      guestAdditionalInfo: '  Нужен созвон  ',
    })

    expect(response.statusCode).toBe(201)
    const body = response.json() as MeetingResponse
    expect(Object.keys(body).sort()).toEqual([
      'end',
      'guestAdditionalInfo',
      'guestEmail',
      'guestName',
      'id',
      'meetingType',
      'start',
    ])
    expect(body).toMatchObject({
      id: expect.any(Number),
      meetingType: {
        id: meetingType.id,
        name: 'Консультация',
        durationMinutes: 60,
      },
      start: '2026-11-23T10:00:00+04:00',
      end: '2026-11-23T11:00:00+04:00',
      guestName: 'Анна',
      guestEmail: 'Anna@Example.COM',
      guestAdditionalInfo: 'Нужен созвон',
    })
    expect(Object.keys(body.meetingType).sort()).toEqual(['durationMinutes', 'id', 'name'])
  })

  it.each([
    { durationMinutes: 15, start: '2026-11-23T10:00:00+04:00', end: '2026-11-23T10:15:00+04:00' },
    { durationMinutes: 120, start: '2026-11-24T16:00:00+04:00', end: '2026-11-24T18:00:00+04:00' },
  ])(
    'computes the end of a $durationMinutes-minute meeting from its start',
    async ({ durationMinutes, start, end }) => {
      const meetingType = await createMeetingType(durationMinutes)

      const response = await postMeeting({
        meetingTypeId: meetingType.id,
        start,
        guestName: 'Анна',
        guestEmail: 'anna@example.com',
      })

      expect(response.statusCode).toBe(201)
      expect(response.json()).toMatchObject({ start, end })
    },
  )

  it('omits the optional additional info when it is empty', async () => {
    const meetingType = await createMeetingType(30)

    const response = await postMeeting({
      meetingTypeId: meetingType.id,
      start: '2026-11-23T12:00:00+04:00',
      guestName: 'Анна',
      guestEmail: 'anna@example.com',
      guestAdditionalInfo: '   ',
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).not.toHaveProperty('guestAdditionalInfo')
  })

  it('accepts the last aligned start of the working day', async () => {
    const meetingType = await createMeetingType(30)

    const response = await postMeeting({
      meetingTypeId: meetingType.id,
      start: '2026-12-04T17:30:00+04:00',
      guestName: 'Анна',
      guestEmail: 'anna@example.com',
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      start: '2026-12-04T17:30:00+04:00',
      end: '2026-12-04T18:00:00+04:00',
    })
  })
})

describe('POST /meetings guest validation', () => {
  it.each([
    {
      title: 'missing meeting type',
      payload: { start: '2026-11-23T10:00:00+04:00', guestName: 'Анна', guestEmail: 'a@b.co' },
      field: 'meetingTypeId',
      code: 'REQUIRED',
    },
    {
      title: 'non-numeric meeting type',
      payload: {
        meetingTypeId: '1',
        start: '2026-11-23T10:00:00+04:00',
        guestName: 'Анна',
        guestEmail: 'a@b.co',
      },
      field: 'meetingTypeId',
      code: 'INVALID_VALUE',
    },
    {
      title: 'zero meeting type',
      payload: {
        meetingTypeId: 0,
        start: '2026-11-23T10:00:00+04:00',
        guestName: 'Анна',
        guestEmail: 'a@b.co',
      },
      field: 'meetingTypeId',
      code: 'INVALID_VALUE',
    },
    {
      title: 'negative meeting type',
      payload: {
        meetingTypeId: -5,
        start: '2026-11-23T10:00:00+04:00',
        guestName: 'Анна',
        guestEmail: 'a@b.co',
      },
      field: 'meetingTypeId',
      code: 'INVALID_VALUE',
    },
    {
      title: 'missing guest name',
      payload: { meetingTypeId: 1, start: '2026-11-23T10:00:00+04:00', guestEmail: 'a@b.co' },
      field: 'guestName',
      code: 'REQUIRED',
    },
    {
      title: 'blank guest name',
      payload: {
        meetingTypeId: 1,
        start: '2026-11-23T10:00:00+04:00',
        guestName: '   ',
        guestEmail: 'a@b.co',
      },
      field: 'guestName',
      code: 'REQUIRED',
    },
    {
      title: 'guest name longer than 100 characters',
      payload: {
        meetingTypeId: 1,
        start: '2026-11-23T10:00:00+04:00',
        guestName: 'a'.repeat(101),
        guestEmail: 'a@b.co',
      },
      field: 'guestName',
      code: 'TOO_LONG',
    },
    {
      title: 'missing guest email',
      payload: { meetingTypeId: 1, start: '2026-11-23T10:00:00+04:00', guestName: 'Анна' },
      field: 'guestEmail',
      code: 'REQUIRED',
    },
    {
      title: 'guest email without a domain',
      payload: {
        meetingTypeId: 1,
        start: '2026-11-23T10:00:00+04:00',
        guestName: 'Анна',
        guestEmail: 'anna@example',
      },
      field: 'guestEmail',
      code: 'INVALID_EMAIL',
    },
    {
      title: 'guest email shorter than 3 characters',
      payload: {
        meetingTypeId: 1,
        start: '2026-11-23T10:00:00+04:00',
        guestName: 'Анна',
        guestEmail: 'a@',
      },
      field: 'guestEmail',
      code: 'INVALID_VALUE',
    },
    {
      title: 'guest email longer than 254 characters',
      payload: {
        meetingTypeId: 1,
        start: '2026-11-23T10:00:00+04:00',
        guestName: 'Анна',
        guestEmail: `${'a'.repeat(243)}@example.com`,
      },
      field: 'guestEmail',
      code: 'TOO_LONG',
    },
    {
      title: 'additional info longer than 500 characters',
      payload: {
        meetingTypeId: 1,
        start: '2026-11-23T10:00:00+04:00',
        guestName: 'Анна',
        guestEmail: 'anna@example.com',
        guestAdditionalInfo: 'a'.repeat(501),
      },
      field: 'guestAdditionalInfo',
      code: 'TOO_LONG',
    },
    {
      title: 'non-string additional info',
      payload: {
        meetingTypeId: 1,
        start: '2026-11-23T10:00:00+04:00',
        guestName: 'Анна',
        guestEmail: 'anna@example.com',
        guestAdditionalInfo: 42,
      },
      field: 'guestAdditionalInfo',
      code: 'INVALID_VALUE',
    },
    {
      title: 'unknown field',
      payload: {
        meetingTypeId: 1,
        start: '2026-11-23T10:00:00+04:00',
        guestName: 'Анна',
        guestEmail: 'anna@example.com',
        end: '2026-11-23T11:00:00+04:00',
      },
      field: 'end',
      code: 'UNKNOWN_FIELD',
    },
  ])('rejects $title with a field error', async ({ payload, field, code }) => {
    const response = await postMeeting(payload)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Проверьте заполнение полей',
      details: [{ field, code, message: expect.any(String) }],
    })
  })

  it('rejects a body that is not a JSON object', async () => {
    const response = await app.inject({ method: 'POST', url: '/meetings', payload: [] })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Тело запроса должно быть JSON-объектом',
    })
  })

  it('responds with ErrorResponse for malformed JSON', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/meetings',
      headers: { 'content-type': 'application/json' },
      payload: '{"meetingTypeId":',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Тело запроса содержит некорректный JSON',
    })
  })

  it('rejects an unknown query parameter', async () => {
    const meetingType = await createMeetingType(30)

    const response = await app.inject({
      method: 'POST',
      url: '/meetings?source=test',
      payload: {
        meetingTypeId: meetingType.id,
        start: '2026-11-23T10:00:00+04:00',
        guestName: 'Анна',
        guestEmail: 'anna@example.com',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Проверьте заполнение полей',
      details: [
        {
          field: 'source',
          code: 'UNKNOWN_QUERY_PARAMETER',
          message: expect.any(String),
        },
      ],
    })
  })

  it('returns 404 MEETING_TYPE_NOT_FOUND without details for a valid unknown id', async () => {
    const response = await postMeeting({
      meetingTypeId: 999,
      start: '2026-11-23T10:00:00+04:00',
      guestName: 'Анна',
      guestEmail: 'anna@example.com',
    })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      code: 'MEETING_TYPE_NOT_FOUND',
      message: expect.any(String),
    })
  })
})

describe('POST /meetings start validation', () => {
  it.each([
    {
      title: 'a start without an offset',
      start: '2026-11-23T10:00:00',
      code: 'INVALID_DATETIME',
    },
    {
      title: 'a start with a Z offset',
      start: '2026-11-23T10:00:00Z',
      code: 'INVALID_DATETIME',
    },
    {
      title: 'a start with a non-Tbilisi offset',
      start: '2026-11-23T10:00:00+03:00',
      code: 'INVALID_DATETIME',
    },
    {
      title: 'a start with milliseconds',
      start: '2026-11-23T10:00:00.000+04:00',
      code: 'INVALID_DATETIME',
    },
    {
      title: 'a start with non-zero seconds',
      start: '2026-11-23T10:00:30+04:00',
      code: 'INVALID_DATETIME',
    },
    {
      title: 'a non-existent date',
      start: '2026-02-30T10:00:00+04:00',
      code: 'INVALID_DATETIME',
    },
    {
      title: 'today',
      start: '2026-11-22T10:00:00+04:00',
      code: 'START_OUTSIDE_WINDOW',
    },
    {
      title: 'yesterday',
      start: '2026-11-21T10:00:00+04:00',
      code: 'START_OUTSIDE_WINDOW',
    },
    {
      title: 'the day after the window',
      start: '2026-12-07T10:00:00+04:00',
      code: 'START_OUTSIDE_WINDOW',
    },
    {
      title: 'a Saturday',
      start: '2026-11-28T10:00:00+04:00',
      code: 'NON_WORKING_DAY',
    },
    {
      title: 'a Sunday',
      start: '2026-11-29T10:00:00+04:00',
      code: 'NON_WORKING_DAY',
    },
    {
      title: 'a start not aligned to 30 minutes',
      start: '2026-11-23T10:15:00+04:00',
      code: 'START_NOT_ALIGNED',
    },
    {
      title: 'a start before working hours',
      start: '2026-11-23T09:30:00+04:00',
      code: 'START_OUTSIDE_WORKING_HOURS',
    },
    {
      title: 'a 60-minute meeting ending after working hours',
      start: '2026-11-23T17:30:00+04:00',
      code: 'START_OUTSIDE_WORKING_HOURS',
      durationMinutes: 60,
    },
    {
      title: 'a 120-minute meeting ending after working hours',
      start: '2026-11-23T16:30:00+04:00',
      code: 'START_OUTSIDE_WORKING_HOURS',
      durationMinutes: 120,
    },
  ])('rejects $title', async ({ start, code, durationMinutes = 30 }) => {
    const meetingType = await createMeetingType(durationMinutes)

    const response = await postMeeting({
      meetingTypeId: meetingType.id,
      start,
      guestName: 'Анна',
      guestEmail: 'anna@example.com',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Проверьте заполнение полей',
      details: [{ field: 'start', code, message: expect.any(String) }],
    })
  })

  it.each([undefined, null, 42, {}])('rejects a non-string start: %s', async (start) => {
    const meetingType = await createMeetingType(30)

    const response = await postMeeting({
      meetingTypeId: meetingType.id,
      start,
      guestName: 'Анна',
      guestEmail: 'anna@example.com',
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Проверьте заполнение полей',
      details: [{ field: 'start', code: 'INVALID_DATETIME', message: expect.any(String) }],
    })
  })
})

describe('POST /meetings conflicts', () => {
  it('returns 409 SLOT_TAKEN without details when the slot is occupied', async () => {
    const meetingType = await createMeetingType(30)
    const payload = {
      meetingTypeId: meetingType.id,
      start: '2026-11-23T10:00:00+04:00',
      guestName: 'Анна',
      guestEmail: 'anna@example.com',
    }

    const first = await postMeeting(payload)
    expect(first.statusCode).toBe(201)

    const second = await postMeeting(payload)

    expect(second.statusCode).toBe(409)
    expect(second.json()).toEqual({
      code: 'SLOT_TAKEN',
      message: expect.any(String),
    })
    expect(second.json()).not.toHaveProperty('details')
  })

  it('rejects an overlapping meeting of another type', async () => {
    const first = await createMeetingType(30)
    const second = await createMeetingType(15)

    expect(
      (
        await postMeeting({
          meetingTypeId: first.id,
          start: '2026-11-23T10:00:00+04:00',
          guestName: 'Анна',
          guestEmail: 'anna@example.com',
        })
      ).statusCode,
    ).toBe(201)

    const response = await postMeeting({
      meetingTypeId: second.id,
      start: '2026-11-23T10:00:00+04:00',
      guestName: 'Борис',
      guestEmail: 'boris@example.com',
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      code: 'SLOT_TAKEN',
      message: expect.any(String),
    })
  })

  it('rejects a partial overlap with a different meeting type', async () => {
    const sixtyMinutes = await createMeetingType(60)
    const thirtyMinutes = await createMeetingType(30)

    const first = await postMeeting({
      meetingTypeId: sixtyMinutes.id,
      start: '2026-11-23T10:00:00+04:00',
      guestName: 'Анна',
      guestEmail: 'anna@example.com',
    })

    expect(first.statusCode).toBe(201)

    const second = await postMeeting({
      meetingTypeId: thirtyMinutes.id,
      start: '2026-11-23T10:30:00+04:00',
      guestName: 'Борис',
      guestEmail: 'boris@example.com',
    })

    expect(second.statusCode).toBe(409)
    expect(second.json()).toEqual({
      code: 'SLOT_TAKEN',
      message: expect.any(String),
    })
    expect(second.json()).not.toHaveProperty('details')
  })

  it('allows back-to-back meetings', async () => {
    const meetingType = await createMeetingType(30)

    const first = await postMeeting({
      meetingTypeId: meetingType.id,
      start: '2026-11-23T10:00:00+04:00',
      guestName: 'Анна',
      guestEmail: 'anna@example.com',
    })
    const second = await postMeeting({
      meetingTypeId: meetingType.id,
      start: '2026-11-23T10:30:00+04:00',
      guestName: 'Борис',
      guestEmail: 'boris@example.com',
    })

    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(201)
    expect(second.json()).toMatchObject({
      start: '2026-11-23T10:30:00+04:00',
      end: '2026-11-23T11:00:00+04:00',
    })
  })

  it('does not create a duplicate when the same submission is repeated', async () => {
    const meetingType = await createMeetingType(30)
    const payload = {
      meetingTypeId: meetingType.id,
      start: '2026-11-23T10:00:00+04:00',
      guestName: 'Анна',
      guestEmail: 'anna@example.com',
    }

    expect((await postMeeting(payload)).statusCode).toBe(201)
    expect((await postMeeting(payload)).statusCode).toBe(409)

    const availability = await app.inject({
      method: 'GET',
      url: `/meeting-types/${meetingType.id}/availability`,
    })
    const monday = (
      availability.json() as { days: Array<{ date: string; slots: unknown[] }> }
    ).days.find((day) => day.date === '2026-11-23')

    expect(monday?.slots).toHaveLength(15)
  })
})

describe('GET /meetings owner list', () => {
  async function listMeetingsAt(now: string): Promise<MeetingResponse[]> {
    const reader = buildApp({ db, now: () => new Date(now) })

    try {
      const response = await reader.inject({ method: 'GET', url: '/meetings' })

      expect(response.statusCode).toBe(200)
      return response.json() as MeetingResponse[]
    } finally {
      await reader.close()
    }
  }

  async function book(
    meetingTypeId: number,
    start: string,
    guestName: string,
    guestAdditionalInfo?: string,
  ) {
    const response = await postMeeting({
      meetingTypeId,
      start,
      guestName,
      guestEmail: `${guestName.toLowerCase()}@example.com`,
      ...(guestAdditionalInfo === undefined ? {} : { guestAdditionalInfo }),
    })

    expect(response.statusCode).toBe(201)
    return response.json() as MeetingResponse
  }

  it('returns an empty list when there are no meetings', async () => {
    const response = await app.inject({ method: 'GET', url: '/meetings' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
  })

  it('returns upcoming meetings sorted by start ascending regardless of creation order', async () => {
    const meetingType = await createMeetingType(30)

    await book(meetingType.id, '2026-11-24T12:00:00+04:00', 'Борис')
    await book(meetingType.id, '2026-11-23T12:00:00+04:00', 'Вера')
    await book(meetingType.id, '2026-11-23T10:00:00+04:00', 'Анна')

    const meetings = await listMeetingsAt(NOW)

    expect(meetings.map((meeting) => meeting.start)).toEqual([
      '2026-11-23T10:00:00+04:00',
      '2026-11-23T12:00:00+04:00',
      '2026-11-24T12:00:00+04:00',
    ])
    expect(meetings.map((meeting) => meeting.guestName)).toEqual(['Анна', 'Вера', 'Борис'])
  })

  it('keeps an ongoing meeting in the list and drops it once it has ended', async () => {
    const meetingType = await createMeetingType(30)

    await book(meetingType.id, '2026-11-23T10:00:00+04:00', 'Анна')
    await book(meetingType.id, '2026-11-23T12:00:00+04:00', 'Борис')

    const duringFirst = await listMeetingsAt('2026-11-23T10:10:00+04:00')
    expect(duringFirst.map((meeting) => meeting.start)).toEqual([
      '2026-11-23T10:00:00+04:00',
      '2026-11-23T12:00:00+04:00',
    ])

    const atFirstEnd = await listMeetingsAt('2026-11-23T10:30:00+04:00')
    expect(atFirstEnd.map((meeting) => meeting.start)).toEqual(['2026-11-23T12:00:00+04:00'])

    const afterAll = await listMeetingsAt('2026-11-23T13:00:00+04:00')
    expect(afterAll).toEqual([])
  })

  it('includes meetings of every meeting type', async () => {
    const shortType = await createMeetingType(15, 'Короткий звонок')
    const longType = await createMeetingType(120, 'Длинный звонок')

    await book(shortType.id, '2026-11-23T10:00:00+04:00', 'Анна')
    await book(longType.id, '2026-11-23T11:00:00+04:00', 'Борис')

    const meetings = await listMeetingsAt(NOW)

    expect(meetings.map((meeting) => meeting.meetingType.name)).toEqual([
      'Короткий звонок',
      'Длинный звонок',
    ])
  })

  it('returns the same meeting shape as creation with the guest fields', async () => {
    const meetingType = await createMeetingType(60, 'Консультация')

    const created = await book(
      meetingType.id,
      '2026-11-23T15:00:00+04:00',
      'Анна',
      'Подготовьте документы',
    )
    const meetings = await listMeetingsAt(NOW)

    expect(meetings).toEqual([created])
    expect(meetings[0]).toMatchObject({
      guestName: 'Анна',
      guestEmail: 'анна@example.com',
      guestAdditionalInfo: 'Подготовьте документы',
      start: '2026-11-23T15:00:00+04:00',
      end: '2026-11-23T16:00:00+04:00',
      meetingType: { id: meetingType.id, name: 'Консультация', durationMinutes: 60 },
    })
    expect(Object.keys(meetings[0] ?? {}).sort()).toEqual([
      'end',
      'guestAdditionalInfo',
      'guestEmail',
      'guestName',
      'id',
      'meetingType',
      'start',
    ])
  })

  it('omits the additional info when the guest left it empty', async () => {
    const meetingType = await createMeetingType(30)

    await book(meetingType.id, '2026-11-23T10:00:00+04:00', 'Анна')

    const meetings = await listMeetingsAt(NOW)

    expect(meetings).toHaveLength(1)
    expect(meetings[0]).not.toHaveProperty('guestAdditionalInfo')
  })

  it('rejects an unknown query parameter', async () => {
    const response = await app.inject({ method: 'GET', url: '/meetings?from=2026-11-23' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Проверьте заполнение полей',
      details: [
        {
          field: 'from',
          code: 'UNKNOWN_QUERY_PARAMETER',
          message: expect.any(String),
        },
      ],
    })
  })
})

describe('POST /meetings concurrency', () => {
  it('creates exactly one meeting when two requests book the same slot concurrently', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'calendar-concurrency-'))
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
      const payload = {
        meetingTypeId: meetingType.id,
        start: '2026-11-23T10:00:00+04:00',
        guestName: 'Анна',
        guestEmail: 'anna@example.com',
      }

      const [first, second] = await Promise.all([
        firstApp.inject({ method: 'POST', url: '/meetings', payload }),
        secondApp.inject({
          method: 'POST',
          url: '/meetings',
          payload: { ...payload, guestName: 'Борис', guestEmail: 'boris@example.com' },
        }),
      ])

      expect([first.statusCode, second.statusCode].sort((left, right) => left - right)).toEqual([
        201, 409,
      ])

      const conflict = first.statusCode === 409 ? first : second
      expect(conflict.json()).toEqual({
        code: 'SLOT_TAKEN',
        message: expect.any(String),
      })

      const availability = await firstApp.inject({
        method: 'GET',
        url: `/meeting-types/${meetingType.id}/availability`,
      })
      const monday = (
        availability.json() as { days: Array<{ date: string; slots: unknown[] }> }
      ).days.find((day) => day.date === '2026-11-23')

      expect(monday?.slots).toHaveLength(15)
    } finally {
      await firstApp.close()
      await secondApp.close()
      firstDb.close()
      secondDb.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
