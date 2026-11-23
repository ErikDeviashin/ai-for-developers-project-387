import type { DatabaseSync } from 'node:sqlite'
import {
  MINUTES_IN_MS,
  SLOT_STEP_MINUTES,
  TBILISI_OFFSET_MINUTES,
  WORKDAY_END_MINUTES,
  WORKDAY_START_MINUTES,
} from './booking-rules.js'
import type { MeetingType } from './meeting-types.js'

const WINDOW_DAYS = 14

export type Slot = {
  start: string
  end: string
}

export type AvailabilityDay = {
  date: string
  slots: Slot[]
}

export type MeetingTypeAvailability = {
  days: AvailabilityDay[]
}

type CalendarDate = {
  year: number
  month: number
  day: number
}

type OccupiedInterval = {
  start_ms: number
  end_ms: number
}

export type BookingWindow = {
  firstDate: CalendarDate
  firstMidnightMs: number
  endMidnightMs: number
}

export function tbilisiDate(instant: Date): CalendarDate {
  const local = new Date(instant.getTime() + TBILISI_OFFSET_MINUTES * MINUTES_IN_MS)

  return {
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
  }
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days))

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

export function tbilisiMidnightMs(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day) - TBILISI_OFFSET_MINUTES * MINUTES_IN_MS
}

export function isWeekend(date: CalendarDate): boolean {
  const dayOfWeek = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()

  return dayOfWeek === 0 || dayOfWeek === 6
}

export function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function formatDate(date: CalendarDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`
}

export function formatTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

export function formatInstant(ms: number): string {
  const date = tbilisiDate(new Date(ms))
  const minutes = Math.floor((ms - tbilisiMidnightMs(date)) / MINUTES_IN_MS)

  return `${formatDate(date)}T${formatTime(minutes)}:00+04:00`
}

export function getBookingWindow(now: Date): BookingWindow {
  const firstDate = addDays(tbilisiDate(now), 1)

  return {
    firstDate,
    firstMidnightMs: tbilisiMidnightMs(firstDate),
    endMidnightMs: tbilisiMidnightMs(addDays(firstDate, WINDOW_DAYS)),
  }
}

function lastStartMinutes(durationMinutes: number): number {
  const availableMinutes = WORKDAY_END_MINUTES - WORKDAY_START_MINUTES

  return (
    WORKDAY_START_MINUTES +
    SLOT_STEP_MINUTES * Math.floor((availableMinutes - durationMinutes) / SLOT_STEP_MINUTES)
  )
}

export function getMeetingTypeAvailability(
  db: DatabaseSync,
  meetingType: MeetingType,
  now: Date,
): MeetingTypeAvailability {
  const window = getBookingWindow(now)
  const occupied = db
    .prepare('SELECT start_ms, end_ms FROM meetings WHERE start_ms < ? AND end_ms > ?')
    .all(window.endMidnightMs, window.firstMidnightMs) as unknown as OccupiedInterval[]

  const days: AvailabilityDay[] = []

  for (let offset = 0; offset < WINDOW_DAYS; offset += 1) {
    const date = addDays(window.firstDate, offset)
    const slots: Slot[] = []

    if (!isWeekend(date)) {
      const midnightMs = tbilisiMidnightMs(date)
      const lastStart = lastStartMinutes(meetingType.durationMinutes)

      for (let start = WORKDAY_START_MINUTES; start <= lastStart; start += SLOT_STEP_MINUTES) {
        const startMs = midnightMs + start * MINUTES_IN_MS
        const endMs = startMs + meetingType.durationMinutes * MINUTES_IN_MS
        const isOccupied = occupied.some(
          (interval) => startMs < interval.end_ms && interval.start_ms < endMs,
        )

        if (!isOccupied) {
          slots.push({
            start: formatInstant(startMs),
            end: formatInstant(endMs),
          })
        }
      }
    }

    days.push({ date: formatDate(date), slots })
  }

  return { days }
}
