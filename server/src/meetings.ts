import type { DatabaseSync } from 'node:sqlite'
import { formatInstant } from './availability.js'
import type { MeetingType } from './meeting-types.js'

export type MeetingTypeSummary = {
  id: number
  name: string
  durationMinutes: number
}

export type Meeting = {
  id: number
  meetingType: MeetingTypeSummary
  start: string
  end: string
  guestName: string
  guestEmail: string
  guestAdditionalInfo?: string
}

export type NewMeeting = {
  startMs: number
  endMs: number
  guestName: string
  guestEmail: string
  guestAdditionalInfo?: string
}

export type CreateMeetingResult = { ok: true; meeting: Meeting } | { ok: false }

export type CancelMeetingResult = 'cancelled' | 'not_found' | 'already_started'

type OwnerMeetingRow = {
  id: number
  meeting_type_id: number
  meeting_type_name: string
  duration_minutes: number
  start_ms: number
  end_ms: number
  guest_name: string
  guest_email: string
  guest_additional_info: string | null
}

function toMeeting(row: OwnerMeetingRow): Meeting {
  return {
    id: row.id,
    meetingType: {
      id: row.meeting_type_id,
      name: row.meeting_type_name,
      durationMinutes: row.duration_minutes,
    },
    start: formatInstant(row.start_ms),
    end: formatInstant(row.end_ms),
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    ...(row.guest_additional_info === null
      ? {}
      : { guestAdditionalInfo: row.guest_additional_info }),
  }
}

export function listOwnerMeetings(db: DatabaseSync, now: Date): Meeting[] {
  const rows = db
    .prepare(
      `SELECT meetings.id AS id,
              meeting_types.id AS meeting_type_id,
              meeting_types.name AS meeting_type_name,
              meeting_types.duration_minutes AS duration_minutes,
              meetings.start_ms AS start_ms,
              meetings.end_ms AS end_ms,
              meetings.guest_name AS guest_name,
              meetings.guest_email AS guest_email,
              meetings.guest_additional_info AS guest_additional_info
         FROM meetings
         JOIN meeting_types ON meeting_types.id = meetings.meeting_type_id
        WHERE meetings.end_ms > ?
        ORDER BY meetings.start_ms ASC, meetings.id ASC`,
    )
    .all(now.getTime()) as unknown as OwnerMeetingRow[]

  return rows.map(toMeeting)
}

export function cancelMeeting(
  db: DatabaseSync,
  id: number,
  guestEmail: string,
  now: Date,
): CancelMeetingResult {
  const deletion = db
    .prepare(
      `DELETE FROM meetings
        WHERE id = ?
          AND LOWER(TRIM(guest_email)) = LOWER(TRIM(?))
          AND start_ms > ?`,
    )
    .run(id, guestEmail, now.getTime())

  if (Number(deletion.changes) > 0) {
    return 'cancelled'
  }

  // No row was deleted: either the meeting/email pair does not match, or the
  // meeting has already started. Match the same expression as the DELETE so
  // the reason is consistent with it.
  const remaining = db
    .prepare(
      `SELECT start_ms AS start_ms
         FROM meetings
        WHERE id = ?
          AND LOWER(TRIM(guest_email)) = LOWER(TRIM(?))`,
    )
    .get(id, guestEmail) as { start_ms: number } | undefined

  if (remaining === undefined) {
    return 'not_found'
  }

  return remaining.start_ms <= now.getTime() ? 'already_started' : 'not_found'
}

export function createMeeting(
  db: DatabaseSync,
  meetingType: MeetingType,
  meeting: NewMeeting,
): CreateMeetingResult {
  db.exec('BEGIN IMMEDIATE')

  try {
    const occupying = db
      .prepare('SELECT 1 AS taken FROM meetings WHERE start_ms < ? AND end_ms > ? LIMIT 1')
      .get(meeting.endMs, meeting.startMs)

    if (occupying !== undefined) {
      db.exec('ROLLBACK')
      return { ok: false }
    }

    const result = db
      .prepare(
        `INSERT INTO meetings
          (meeting_type_id, start_ms, end_ms, guest_name, guest_email, guest_additional_info)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        meetingType.id,
        meeting.startMs,
        meeting.endMs,
        meeting.guestName,
        meeting.guestEmail,
        meeting.guestAdditionalInfo ?? null,
      )

    db.exec('COMMIT')

    return {
      ok: true,
      meeting: {
        id: Number(result.lastInsertRowid),
        meetingType: {
          id: meetingType.id,
          name: meetingType.name,
          durationMinutes: meetingType.durationMinutes,
        },
        start: formatInstant(meeting.startMs),
        end: formatInstant(meeting.endMs),
        guestName: meeting.guestName,
        guestEmail: meeting.guestEmail,
        ...(meeting.guestAdditionalInfo === undefined
          ? {}
          : { guestAdditionalInfo: meeting.guestAdditionalInfo }),
      },
    }
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
