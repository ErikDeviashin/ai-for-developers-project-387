import type { DatabaseSync } from 'node:sqlite'

export type OccupiedInterval = {
  meetingTypeId: number
  start: string
  end: string
}

// Test fixture for availability: inserts an occupied interval directly so the
// schedule can be prepared without going through the booking endpoint.
export function occupyInterval(db: DatabaseSync, interval: OccupiedInterval): void {
  db.prepare(
    `INSERT INTO meetings
      (meeting_type_id, start_ms, end_ms, guest_name, guest_email)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    interval.meetingTypeId,
    Date.parse(interval.start),
    Date.parse(interval.end),
    'Гость',
    'guest@example.com',
  )
}
