import type { MeetingType } from '../api/generated'

export function sortMeetingTypes(meetingTypes: MeetingType[]): MeetingType[] {
  return [...meetingTypes].sort(
    (left, right) =>
      left.durationMinutes - right.durationMinutes || left.name.localeCompare(right.name, 'ru'),
  )
}

export function formatDuration(durationMinutes: number): string {
  return `${durationMinutes} минут`
}
