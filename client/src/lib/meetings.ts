import type { Meeting } from '../api/generated'
import { formatLongDate, formatSlotTime } from './calendar'

export function formatMeetingInterval(meeting: Meeting): string {
  const date = meeting.start.slice(0, 10)

  return `${formatLongDate(date)}, ${formatSlotTime(meeting.start)}–${formatSlotTime(meeting.end)}`
}

export function isMeetingOngoing(meeting: Meeting, nowMs: number): boolean {
  return Date.parse(meeting.start) <= nowMs && nowMs < Date.parse(meeting.end)
}
