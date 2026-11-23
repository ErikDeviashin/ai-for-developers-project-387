import type { FastifyInstance } from 'fastify'
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'
import { openDatabase } from '../src/database.js'
import { occupyInterval } from './support/meetings.js'

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
  durationMinutes: number
}

async function createMeetingType(durationMinutes: number): Promise<MeetingTypeResponse> {
  const response = await app.inject({
    method: 'POST',
    url: '/meeting-types',
    payload: { name: `Звонок ${durationMinutes}`, durationMinutes },
  })

  expect(response.statusCode).toBe(201)
  return response.json()
}

async function getAvailability(meetingTypeId: number, query = '') {
  return app.inject({
    method: 'GET',
    url: `/meeting-types/${meetingTypeId}/availability${query}`,
  })
}

describe('GET /meeting-types/{meetingTypeId}/availability', () => {
  it('returns exactly the 14-day Tbilisi window starting tomorrow, including weekends', async () => {
    const meetingType = await createMeetingType(30)

    const response = await getAvailability(meetingType.id)

    expect(response.statusCode).toBe(200)
    const body = response.json() as { days: Array<{ date: string; slots: unknown[] }> }
    expect(body.days.map((day) => day.date)).toEqual([
      '2026-11-23',
      '2026-11-24',
      '2026-11-25',
      '2026-11-26',
      '2026-11-27',
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
      '2026-12-05',
      '2026-12-06',
    ])
    expect(body.days.find((day) => day.date === '2026-11-28')?.slots).toEqual([])
    expect(body.days.find((day) => day.date === '2026-11-29')?.slots).toEqual([])
    expect(body.days.find((day) => day.date === '2026-12-05')?.slots).toEqual([])
    expect(body.days.find((day) => day.date === '2026-12-06')?.slots).toEqual([])

    for (const day of body.days) {
      for (const slot of day.slots as Array<{ start: string; end: string }>) {
        expect(slot.start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+04:00$/)
        expect(slot.end).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+04:00$/)
      }
    }
  })

  it.each([
    {
      durationMinutes: 15,
      slotCount: 16,
      firstStart: '2026-11-23T10:00:00+04:00',
      lastStart: '2026-11-23T17:30:00+04:00',
      lastEnd: '2026-11-23T17:45:00+04:00',
    },
    {
      durationMinutes: 30,
      slotCount: 16,
      firstStart: '2026-11-23T10:00:00+04:00',
      lastStart: '2026-11-23T17:30:00+04:00',
      lastEnd: '2026-11-23T18:00:00+04:00',
    },
    {
      durationMinutes: 60,
      slotCount: 15,
      firstStart: '2026-11-23T10:00:00+04:00',
      lastStart: '2026-11-23T17:00:00+04:00',
      lastEnd: '2026-11-23T18:00:00+04:00',
    },
    {
      durationMinutes: 120,
      slotCount: 13,
      firstStart: '2026-11-23T10:00:00+04:00',
      lastStart: '2026-11-23T16:00:00+04:00',
      lastEnd: '2026-11-23T18:00:00+04:00',
    },
  ])(
    'offers 30-minute starts from 10:00 for $durationMinutes-minute meetings',
    async ({ durationMinutes, slotCount, firstStart, lastStart, lastEnd }) => {
      const meetingType = await createMeetingType(durationMinutes)

      const response = await getAvailability(meetingType.id)

      expect(response.statusCode).toBe(200)
      const body = response.json() as {
        days: Array<{ date: string; slots: Array<{ start: string; end: string }> }>
      }
      const monday = body.days.find((day) => day.date === '2026-11-23')
      expect(monday?.slots).toHaveLength(slotCount)
      expect(monday?.slots[0]?.start).toBe(firstStart)
      expect(monday?.slots.at(-1)).toEqual({ start: lastStart, end: lastEnd })
      expect(monday?.slots[1]?.start).toBe('2026-11-23T10:30:00+04:00')
    },
  )

  it('excludes slots that overlap an occupied interval of another meeting type', async () => {
    const requestedType = await createMeetingType(30)
    const otherType = await createMeetingType(60)
    occupyInterval(db, {
      meetingTypeId: otherType.id,
      start: '2026-11-23T10:00:00+04:00',
      end: '2026-11-23T11:00:00+04:00',
    })

    const response = await getAvailability(requestedType.id)

    expect(response.statusCode).toBe(200)
    const body = response.json() as {
      days: Array<{ date: string; slots: Array<{ start: string; end: string }> }>
    }
    const starts = body.days
      .find((day) => day.date === '2026-11-23')
      ?.slots.map((slot) => slot.start)

    expect(starts).not.toContain('2026-11-23T10:00:00+04:00')
    expect(starts).not.toContain('2026-11-23T10:30:00+04:00')
    expect(starts).toContain('2026-11-23T11:00:00+04:00')
    expect(starts).toHaveLength(14)
  })

  it('allows a back-to-back meeting and excludes only the overlapping start', async () => {
    const meetingType = await createMeetingType(30)
    occupyInterval(db, {
      meetingTypeId: meetingType.id,
      start: '2026-11-23T10:00:00+04:00',
      end: '2026-11-23T10:30:00+04:00',
    })

    const response = await getAvailability(meetingType.id)

    const body = response.json() as {
      days: Array<{ date: string; slots: Array<{ start: string }> }>
    }
    const starts = body.days
      .find((day) => day.date === '2026-11-23')
      ?.slots.map((slot) => slot.start)

    expect(starts).not.toContain('2026-11-23T10:00:00+04:00')
    expect(starts).toContain('2026-11-23T10:30:00+04:00')
    expect(starts).toHaveLength(15)
  })

  it('excludes every slot that partially overlaps an occupied interval', async () => {
    const meetingType = await createMeetingType(30)
    occupyInterval(db, {
      meetingTypeId: meetingType.id,
      start: '2026-11-23T10:15:00+04:00',
      end: '2026-11-23T10:45:00+04:00',
    })

    const response = await getAvailability(meetingType.id)

    const body = response.json() as {
      days: Array<{ date: string; slots: Array<{ start: string }> }>
    }
    const starts = body.days
      .find((day) => day.date === '2026-11-23')
      ?.slots.map((slot) => slot.start)

    expect(starts).not.toContain('2026-11-23T10:00:00+04:00')
    expect(starts).not.toContain('2026-11-23T10:30:00+04:00')
    expect(starts).toContain('2026-11-23T11:00:00+04:00')
  })

  it('returns an empty day when the whole working day is occupied', async () => {
    const meetingType = await createMeetingType(30)
    const otherType = await createMeetingType(120)
    occupyInterval(db, {
      meetingTypeId: otherType.id,
      start: '2026-11-24T10:00:00+04:00',
      end: '2026-11-24T18:00:00+04:00',
    })

    const response = await getAvailability(meetingType.id)

    expect(response.statusCode).toBe(200)
    const body = response.json() as {
      days: Array<{ date: string; slots: Array<{ start: string }> }>
    }
    expect(body.days).toHaveLength(14)
    expect(body.days.find((day) => day.date === '2026-11-24')?.slots).toEqual([])
    expect(body.days.find((day) => day.date === '2026-11-23')?.slots.length).toBeGreaterThan(0)
  })

  it('keeps occupied intervals on one date out of the other dates', async () => {
    const meetingType = await createMeetingType(60)
    occupyInterval(db, {
      meetingTypeId: meetingType.id,
      start: '2026-11-25T10:00:00+04:00',
      end: '2026-11-25T11:00:00+04:00',
    })

    const response = await getAvailability(meetingType.id)

    const body = response.json() as {
      days: Array<{ date: string; slots: Array<{ start: string }> }>
    }
    expect(
      body.days.find((day) => day.date === '2026-11-25')?.slots.map((slot) => slot.start),
    ).not.toContain('2026-11-25T10:00:00+04:00')
    expect(
      body.days.find((day) => day.date === '2026-11-26')?.slots.map((slot) => slot.start),
    ).toContain('2026-11-26T10:00:00+04:00')
  })
})

describe('availability window', () => {
  it('shifts to the next day at Tbilisi midnight', async () => {
    const midnightDb = openDatabase()
    const beforeMidnight = buildApp({
      db: midnightDb,
      now: () => new Date('2026-11-22T23:59:00+04:00'),
    })
    const atMidnight = buildApp({
      db: midnightDb,
      now: () => new Date('2026-11-23T00:00:00+04:00'),
    })

    try {
      const created = await beforeMidnight.inject({
        method: 'POST',
        url: '/meeting-types',
        payload: { name: 'Звонок', durationMinutes: 30 },
      })
      const meetingType = created.json() as MeetingTypeResponse

      const before = await beforeMidnight.inject({
        method: 'GET',
        url: `/meeting-types/${meetingType.id}/availability`,
      })
      const after = await atMidnight.inject({
        method: 'GET',
        url: `/meeting-types/${meetingType.id}/availability`,
      })

      expect((before.json() as { days: Array<{ date: string }> }).days[0]?.date).toBe('2026-11-23')
      expect((after.json() as { days: Array<{ date: string }> }).days[0]?.date).toBe('2026-11-24')
    } finally {
      await beforeMidnight.close()
      await atMidnight.close()
      midnightDb.close()
    }
  })
})

describe('availability errors', () => {
  it('returns 404 MEETING_TYPE_NOT_FOUND without details for a valid unknown id', async () => {
    const response = await getAvailability(999)

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      code: 'MEETING_TYPE_NOT_FOUND',
      message: expect.any(String),
    })
  })

  it.each([
    { title: 'zero', url: '/meeting-types/0/availability' },
    { title: 'negative', url: '/meeting-types/-1/availability' },
    { title: 'non-numeric', url: '/meeting-types/abc/availability' },
    { title: 'decimal', url: '/meeting-types/1.5/availability' },
    { title: 'above int32', url: '/meeting-types/2147483648/availability' },
  ])('rejects $title meeting type id with a validation error', async ({ url }) => {
    const response = await app.inject({ method: 'GET', url })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: expect.any(String),
      details: [
        {
          field: 'meetingTypeId',
          code: 'INVALID_VALUE',
          message: expect.any(String),
        },
      ],
    })
  })

  it('rejects an unknown query parameter', async () => {
    const meetingType = await createMeetingType(30)

    const response = await getAvailability(meetingType.id, '?date=2026-11-23')

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Проверьте заполнение полей',
      details: [
        {
          field: 'date',
          code: 'UNKNOWN_QUERY_PARAMETER',
          message: expect.any(String),
        },
      ],
    })
  })
})
