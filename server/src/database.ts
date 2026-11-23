import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meeting_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL
      CHECK (duration_minutes IN (15, 30, 60, 120))
  );

  CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_type_id INTEGER NOT NULL REFERENCES meeting_types(id),
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    guest_name TEXT NOT NULL,
    guest_email TEXT NOT NULL,
    guest_additional_info TEXT,
    CHECK (end_ms > start_ms)
  );

  CREATE INDEX IF NOT EXISTS meetings_start_end ON meetings (start_ms, end_ms);
`

export function openDatabase(filename = ':memory:'): DatabaseSync {
  if (filename !== ':memory:') {
    mkdirSync(dirname(filename), { recursive: true })
  }

  const db = new DatabaseSync(filename)
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec(SCHEMA)

  return db
}
