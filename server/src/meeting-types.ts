import type { DatabaseSync } from 'node:sqlite'

export type MeetingType = {
  id: number
  name: string
  description?: string
  durationMinutes: number
}

export type NewMeetingType = {
  name: string
  description?: string
  durationMinutes: number
}

type MeetingTypeRow = {
  id: number
  name: string
  description: string | null
  duration_minutes: number
}

function toMeetingType(row: MeetingTypeRow): MeetingType {
  return {
    id: row.id,
    name: row.name,
    ...(row.description === null ? {} : { description: row.description }),
    durationMinutes: row.duration_minutes,
  }
}

export function listMeetingTypes(db: DatabaseSync): MeetingType[] {
  const rows = db
    .prepare('SELECT id, name, description, duration_minutes FROM meeting_types')
    .all() as unknown as MeetingTypeRow[]

  return rows
    .map(toMeetingType)
    .sort(
      (left, right) =>
        left.durationMinutes - right.durationMinutes || left.name.localeCompare(right.name, 'ru'),
    )
}

export function findMeetingType(db: DatabaseSync, id: number): MeetingType | undefined {
  const row = db
    .prepare('SELECT id, name, description, duration_minutes FROM meeting_types WHERE id = ?')
    .get(id) as unknown as MeetingTypeRow | undefined

  return row === undefined ? undefined : toMeetingType(row)
}

export function createMeetingType(db: DatabaseSync, meetingType: NewMeetingType): MeetingType {
  const result = db
    .prepare('INSERT INTO meeting_types (name, description, duration_minutes) VALUES (?, ?, ?)')
    .run(meetingType.name, meetingType.description ?? null, meetingType.durationMinutes)

  return {
    id: Number(result.lastInsertRowid),
    name: meetingType.name,
    ...(meetingType.description === undefined ? {} : { description: meetingType.description }),
    durationMinutes: meetingType.durationMinutes,
  }
}
