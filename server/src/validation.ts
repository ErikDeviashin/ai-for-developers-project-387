import {
  formatInstant,
  getBookingWindow,
  isWeekend,
  tbilisiDate,
  tbilisiMidnightMs,
} from './availability.js'
import {
  ALLOWED_DURATIONS,
  MINUTES_IN_MS,
  SLOT_STEP_MINUTES,
  WORKDAY_END_MINUTES,
  WORKDAY_START_MINUTES,
} from './booking-rules.js'

export type FieldError = {
  field: string
  code: string
  message: string
}

export type ErrorResponse = {
  code: string
  message: string
  details?: FieldError[]
}

export type NewMeetingTypeInput = {
  name: string
  description?: string
  durationMinutes: number
}

export type NewMeetingInput = {
  meetingTypeId: number
  start: string
  startMs: number
  guestName: string
  guestEmail: string
  guestAdditionalInfo?: string
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: ErrorResponse }

const NAME_MAX_LENGTH = 80
const DESCRIPTION_MAX_LENGTH = 500
const BODY_FIELDS = new Set(['name', 'description', 'durationMinutes'])
const INT32_MAX = 2_147_483_647

const GUEST_NAME_MAX_LENGTH = 100
const GUEST_EMAIL_MIN_LENGTH = 3
const GUEST_EMAIL_MAX_LENGTH = 254
const GUEST_ADDITIONAL_INFO_MAX_LENGTH = 500
const MEETING_BODY_FIELDS = new Set([
  'meetingTypeId',
  'start',
  'guestName',
  'guestEmail',
  'guestAdditionalInfo',
])
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const START_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+04:00$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validationError(details: FieldError[]): ErrorResponse {
  return {
    code: 'VALIDATION_ERROR',
    message: 'Проверьте заполнение полей',
    details,
  }
}

export function parseCreateMeetingTypeBody(body: unknown): ParseResult<NewMeetingTypeInput> {
  if (!isRecord(body)) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Тело запроса должно быть JSON-объектом',
      },
    }
  }

  const details: FieldError[] = []

  for (const field of Object.keys(body)) {
    if (!BODY_FIELDS.has(field)) {
      details.push({
        field,
        code: 'UNKNOWN_FIELD',
        message: `Неизвестное поле «${field}»`,
      })
    }
  }

  let name: string | undefined
  if (typeof body.name !== 'string' || body.name.trim() === '') {
    details.push({
      field: 'name',
      code: 'REQUIRED',
      message: 'Укажите название типа встречи',
    })
  } else {
    name = body.name.trim()
    if (name.length > NAME_MAX_LENGTH) {
      details.push({
        field: 'name',
        code: 'TOO_LONG',
        message: `Название должно быть не длиннее ${NAME_MAX_LENGTH} символов`,
      })
    }
  }

  let description: string | undefined
  if (body.description !== undefined) {
    if (typeof body.description !== 'string') {
      details.push({
        field: 'description',
        code: 'INVALID_VALUE',
        message: 'Описание должно быть строкой',
      })
    } else {
      const trimmed = body.description.trim()
      if (trimmed.length > DESCRIPTION_MAX_LENGTH) {
        details.push({
          field: 'description',
          code: 'TOO_LONG',
          message: `Описание должно быть не длиннее ${DESCRIPTION_MAX_LENGTH} символов`,
        })
      } else if (trimmed !== '') {
        description = trimmed
      }
    }
  }

  let durationMinutes: number | undefined
  if (body.durationMinutes === undefined) {
    details.push({
      field: 'durationMinutes',
      code: 'REQUIRED',
      message: 'Выберите длительность встречи',
    })
  } else if (
    typeof body.durationMinutes !== 'number' ||
    !ALLOWED_DURATIONS.includes(body.durationMinutes)
  ) {
    details.push({
      field: 'durationMinutes',
      code: 'INVALID_DURATION',
      message: 'Длительность должна быть 15, 30, 60 или 120 минут',
    })
  } else {
    durationMinutes = body.durationMinutes
  }

  if (details.length > 0 || name === undefined || durationMinutes === undefined) {
    return { ok: false, error: validationError(details) }
  }

  return {
    ok: true,
    value: {
      name,
      ...(description === undefined ? {} : { description }),
      durationMinutes,
    },
  }
}

export function parseCreateMeetingBody(body: unknown): ParseResult<NewMeetingInput> {
  if (!isRecord(body)) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Тело запроса должно быть JSON-объектом',
      },
    }
  }

  const details: FieldError[] = []

  for (const field of Object.keys(body)) {
    if (!MEETING_BODY_FIELDS.has(field)) {
      details.push({
        field,
        code: 'UNKNOWN_FIELD',
        message: `Неизвестное поле «${field}»`,
      })
    }
  }

  let meetingTypeId: number | undefined
  if (body.meetingTypeId === undefined) {
    details.push({
      field: 'meetingTypeId',
      code: 'REQUIRED',
      message: 'Выберите тип встречи',
    })
  } else if (
    typeof body.meetingTypeId !== 'number' ||
    !Number.isInteger(body.meetingTypeId) ||
    body.meetingTypeId <= 0 ||
    body.meetingTypeId > INT32_MAX
  ) {
    details.push({
      field: 'meetingTypeId',
      code: 'INVALID_VALUE',
      message: 'Идентификатор типа встречи должен быть положительным целым числом',
    })
  } else {
    meetingTypeId = body.meetingTypeId
  }

  let guestName: string | undefined
  if (typeof body.guestName !== 'string' || body.guestName.trim() === '') {
    details.push({
      field: 'guestName',
      code: 'REQUIRED',
      message: 'Укажите имя',
    })
  } else if (body.guestName.trim().length > GUEST_NAME_MAX_LENGTH) {
    details.push({
      field: 'guestName',
      code: 'TOO_LONG',
      message: `Имя должно быть не длиннее ${GUEST_NAME_MAX_LENGTH} символов`,
    })
  } else {
    guestName = body.guestName.trim()
  }

  let guestEmail: string | undefined
  if (typeof body.guestEmail !== 'string' || body.guestEmail.trim() === '') {
    details.push({
      field: 'guestEmail',
      code: 'REQUIRED',
      message: 'Укажите email',
    })
  } else {
    const trimmed = body.guestEmail.trim()

    if (trimmed.length < GUEST_EMAIL_MIN_LENGTH) {
      details.push({
        field: 'guestEmail',
        code: 'INVALID_VALUE',
        message: `Email должен быть длиной от ${GUEST_EMAIL_MIN_LENGTH} до ${GUEST_EMAIL_MAX_LENGTH} символов`,
      })
    } else if (trimmed.length > GUEST_EMAIL_MAX_LENGTH) {
      details.push({
        field: 'guestEmail',
        code: 'TOO_LONG',
        message: `Email должен быть не длиннее ${GUEST_EMAIL_MAX_LENGTH} символов`,
      })
    } else if (!EMAIL_PATTERN.test(trimmed)) {
      details.push({
        field: 'guestEmail',
        code: 'INVALID_EMAIL',
        message: 'Укажите корректный email',
      })
    } else {
      guestEmail = trimmed
    }
  }

  let guestAdditionalInfo: string | undefined
  if (body.guestAdditionalInfo !== undefined) {
    if (typeof body.guestAdditionalInfo !== 'string') {
      details.push({
        field: 'guestAdditionalInfo',
        code: 'INVALID_VALUE',
        message: 'Дополнительная информация должна быть строкой',
      })
    } else {
      const trimmed = body.guestAdditionalInfo.trim()
      if (trimmed.length > GUEST_ADDITIONAL_INFO_MAX_LENGTH) {
        details.push({
          field: 'guestAdditionalInfo',
          code: 'TOO_LONG',
          message: `Дополнительная информация должна быть не длиннее ${GUEST_ADDITIONAL_INFO_MAX_LENGTH} символов`,
        })
      } else if (trimmed !== '') {
        guestAdditionalInfo = trimmed
      }
    }
  }

  let start: string | undefined
  let startMs: number | undefined
  if (typeof body.start !== 'string') {
    details.push(invalidStartFieldError())
  } else {
    startMs = parseStartInstant(body.start)
    if (startMs === undefined) {
      details.push(invalidStartFieldError())
    } else {
      start = body.start
    }
  }

  if (
    details.length > 0 ||
    meetingTypeId === undefined ||
    start === undefined ||
    startMs === undefined ||
    guestName === undefined ||
    guestEmail === undefined
  ) {
    return { ok: false, error: validationError(details) }
  }

  return {
    ok: true,
    value: {
      meetingTypeId,
      start,
      startMs,
      guestName,
      guestEmail,
      ...(guestAdditionalInfo === undefined ? {} : { guestAdditionalInfo }),
    },
  }
}

function parseStartInstant(value: string): number | undefined {
  if (!START_PATTERN.test(value)) {
    return undefined
  }

  const startMs = Date.parse(value)
  if (Number.isNaN(startMs)) {
    return undefined
  }

  return formatInstant(startMs) === value ? startMs : undefined
}

function invalidStartFieldError(): FieldError {
  return {
    field: 'start',
    code: 'INVALID_DATETIME',
    message: 'Укажите дату и время в формате ISO 8601 с часовым поясом +04:00',
  }
}

export function validateBookingStart(
  startMs: number,
  durationMinutes: number,
  now: Date,
): ErrorResponse | undefined {
  const window = getBookingWindow(now)
  const date = tbilisiDate(new Date(startMs))
  const minutes = Math.floor((startMs - tbilisiMidnightMs(date)) / MINUTES_IN_MS)

  let fieldError: FieldError | undefined

  if (startMs < window.firstMidnightMs || startMs >= window.endMidnightMs) {
    fieldError = {
      field: 'start',
      code: 'START_OUTSIDE_WINDOW',
      message: 'Выберите дату в ближайшие 14 дней',
    }
  } else if (isWeekend(date)) {
    fieldError = {
      field: 'start',
      code: 'NON_WORKING_DAY',
      message: 'Выберите рабочий день с понедельника по пятницу',
    }
  } else if (minutes % SLOT_STEP_MINUTES !== 0) {
    fieldError = {
      field: 'start',
      code: 'START_NOT_ALIGNED',
      message: 'Время начала должно быть кратно 30 минутам',
    }
  } else if (minutes < WORKDAY_START_MINUTES || minutes + durationMinutes > WORKDAY_END_MINUTES) {
    fieldError = {
      field: 'start',
      code: 'START_OUTSIDE_WORKING_HOURS',
      message: 'Встреча должна помещаться в рабочие часы с 10:00 до 18:00',
    }
  }

  return fieldError === undefined ? undefined : validationError([fieldError])
}

export function parseMeetingTypeId(raw: string | undefined): ParseResult<number> {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return { ok: false, error: invalidMeetingTypeId() }
  }

  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0 || id > INT32_MAX) {
    return { ok: false, error: invalidMeetingTypeId() }
  }

  return { ok: true, value: id }
}

function invalidMeetingTypeId(): ErrorResponse {
  return {
    code: 'VALIDATION_ERROR',
    message: 'Проверьте параметры запроса',
    details: [
      {
        field: 'meetingTypeId',
        code: 'INVALID_VALUE',
        message: 'Идентификатор типа встречи должен быть положительным целым числом',
      },
    ],
  }
}

export function rejectQueryParameters(query: Record<string, unknown>): ErrorResponse | undefined {
  const fields = Object.keys(query)

  if (fields.length === 0) {
    return undefined
  }

  return validationError(
    fields.map((field) => ({
      field,
      code: 'UNKNOWN_QUERY_PARAMETER',
      message: `Лишний параметр запроса «${field}»`,
    })),
  )
}
