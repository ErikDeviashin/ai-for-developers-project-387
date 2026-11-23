const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]

const MONTHS_NOMINATIVE = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

const MONTHS_SHORT = [
  'янв.',
  'февр.',
  'мар.',
  'апр.',
  'мая',
  'июн.',
  'июл.',
  'авг.',
  'сент.',
  'окт.',
  'нояб.',
  'дек.',
]

const WEEKDAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']

export const WEEKDAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

type CalendarDate = {
  year: number
  month: number
  day: number
}

export type CalendarDay = {
  date: string
  dayOfMonth: number
  inTitleMonth: boolean
  monthLabel: string
}

function parseCalendarDate(value: string): CalendarDate {
  const [year, month, day] = value.split('-').map(Number)

  return { year: year ?? 0, month: month ?? 1, day: day ?? 1 }
}

function toUtcDate(date: CalendarDate): Date {
  return new Date(Date.UTC(date.year, date.month - 1, date.day))
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days))

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDate(date: CalendarDate): string {
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`
}

function weekdayIndex(date: CalendarDate): number {
  return (toUtcDate(date).getUTCDay() + 6) % 7
}

export function formatLongDate(value: string): string {
  const date = parseCalendarDate(value)

  return `${WEEKDAYS[weekdayIndex(date)]}, ${date.day} ${MONTHS_GENITIVE[date.month - 1]} ${date.year}`
}

export function formatMonthTitle(value: string): string {
  const date = parseCalendarDate(value)

  return `${MONTHS_NOMINATIVE[date.month - 1]} ${date.year}`
}

export function formatSlotTime(value: string): string {
  return /T(\d{2}:\d{2})/.exec(value)?.[1] ?? value
}

export function buildCalendarWeeks(firstWindowDate: string, weekCount = 4): CalendarDay[][] {
  const firstDate = parseCalendarDate(firstWindowDate)
  const titleMonth = firstDate.month
  const titleYear = firstDate.year
  const calendarStart = addDays(firstDate, -weekdayIndex(firstDate))
  const weeks: CalendarDay[][] = []

  for (let week = 0; week < weekCount; week += 1) {
    const days: CalendarDay[] = []

    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = addDays(calendarStart, week * 7 + weekday)
      const inTitleMonth = date.year === titleYear && date.month === titleMonth

      days.push({
        date: formatDate(date),
        dayOfMonth: date.day,
        inTitleMonth,
        monthLabel: MONTHS_SHORT[date.month - 1] ?? '',
      })
    }

    weeks.push(days)
  }

  return weeks
}
