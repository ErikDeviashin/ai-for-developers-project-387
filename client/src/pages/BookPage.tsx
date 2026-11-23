import { useEffect, useState, type FormEvent } from 'react'
import {
  cancelMeeting,
  createMeeting,
  getMeetingTypeAvailability,
  listMeetingTypes,
  type AvailabilityDay,
  type Meeting,
  type MeetingType,
  type MeetingTypeAvailability,
} from '../api/generated'
import { toErrorResponse } from '../api/errors'
import { PageContainer } from '../components/PageContainer'
import { PageHeading } from '../components/PageHeading'
import {
  WEEKDAY_LABELS,
  buildCalendarWeeks,
  formatLongDate,
  formatMonthTitle,
  formatSlotTime,
} from '../lib/calendar'
import { formatDuration } from '../lib/meetingTypes'

type Step = 'type' | 'datetime' | 'guest'

const GUEST_FIELDS = new Set(['guestName', 'guestEmail', 'guestAdditionalInfo'])
const CREATE_MEETING_FALLBACK = 'Не удалось создать встречу. Попробуйте ещё раз.'
const CANCEL_MEETING_FALLBACK = 'Не удалось отменить встречу. Попробуйте ещё раз.'

type CalendarProps = {
  firstDate: string
  daysByDate: Map<string, AvailabilityDay>
  selectedDate: string | null
  sessionMeetingDate: string | null
  onSelectDate: (date: string) => void
}

function AvailabilityCalendar({
  firstDate,
  daysByDate,
  selectedDate,
  sessionMeetingDate,
  onSelectDate,
}: CalendarProps) {
  const weeks = buildCalendarWeeks(firstDate)

  return (
    <div className="mt-6">
      <h3 id="calendar-heading" className="text-xl font-semibold">
        {formatMonthTitle(firstDate)}
      </h3>
      <table aria-labelledby="calendar-heading" className="mt-3 w-full table-fixed border-collapse">
        <thead>
          <tr>
            {WEEKDAY_LABELS.map((label) => (
              <th key={label} scope="col" className="pb-2 text-sm font-medium text-slate-500">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week) => (
            <tr key={week[0]?.date}>
              {week.map((day) => {
                const availabilityDay = daysByDate.get(day.date)
                const isYours = sessionMeetingDate === day.date
                const isEnabled =
                  isYours || (availabilityDay !== undefined && availabilityDay.slots.length > 0)
                const isSelected = selectedDate === day.date
                const className = [
                  'w-full rounded-lg border px-1 py-2 text-center transition-colors',
                  isSelected
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : isEnabled
                      ? 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50'
                      : 'cursor-not-allowed border-transparent bg-slate-50 text-slate-300',
                  isYours ? 'ring-2 ring-green-500 ring-offset-1' : '',
                ].join(' ')

                return (
                  <td key={day.date} className="p-1">
                    <button
                      type="button"
                      disabled={!isEnabled}
                      aria-label={formatLongDate(day.date)}
                      aria-pressed={isSelected}
                      onClick={() => onSelectDate(day.date)}
                      className={className}
                    >
                      <span className="block text-base font-medium">{day.dayOfMonth}</span>
                      {day.inTitleMonth ? null : (
                        <span className="block text-[11px] leading-tight">{day.monthLabel}</span>
                      )}
                      {isYours ? (
                        <span className="block text-[11px] leading-tight">Ваша встреча</span>
                      ) : null}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function BookPage() {
  const [meetingTypes, setMeetingTypes] = useState<MeetingType[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('type')
  const [selectedType, setSelectedType] = useState<MeetingType | null>(null)

  const [availability, setAvailability] = useState<MeetingTypeAvailability | null>(null)
  const [availabilityError, setAvailabilityError] = useState<string | null>(null)
  const [availabilityNotFound, setAvailabilityNotFound] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestAdditionalInfo, setGuestAdditionalInfo] = useState('')
  const [guestFieldErrors, setGuestFieldErrors] = useState<Record<string, string>>({})
  const [startError, setStartError] = useState<string | null>(null)
  const [guestError, setGuestError] = useState<string | null>(null)
  const [slotTaken, setSlotTaken] = useState(false)
  const [typeNotFound, setTypeNotFound] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [createdMeeting, setCreatedMeeting] = useState<Meeting | null>(null)
  const [cancelConfirming, setCancelConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [meetingStarted, setMeetingStarted] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    let active = true

    listMeetingTypes({ throwOnError: true })
      .then(({ data }) => {
        if (active) {
          setMeetingTypes(data ?? [])
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setListError(
            toErrorResponse(error)?.message ??
              'Не удалось загрузить типы встреч. Обновите страницу.',
          )
        }
      })

    return () => {
      active = false
    }
  }, [])

  const meetingTypeId = selectedType?.id

  useEffect(() => {
    if (meetingTypeId === undefined) {
      return
    }

    let active = true

    getMeetingTypeAvailability({ path: { meetingTypeId }, throwOnError: true })
      .then(({ data }) => {
        if (active) {
          setAvailability(data ?? { days: [] })
        }
      })
      .catch((error: unknown) => {
        if (active) {
          const response = toErrorResponse(error)

          if (response?.code === 'MEETING_TYPE_NOT_FOUND') {
            setAvailabilityNotFound(response.message)
            return
          }

          setAvailabilityError(
            response?.message ?? 'Не удалось загрузить доступное время. Попробуйте ещё раз.',
          )
        }
      })

    return () => {
      active = false
    }
  }, [meetingTypeId, reloadKey])

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 30_000)

    return () => clearInterval(timer)
  }, [])

  function resetCancelState() {
    setCancelConfirming(false)
    setCancelling(false)
    setCancelError(null)
    setMeetingStarted(false)
    setNowMs(Date.now())
  }

  function handleTypeSelect(meetingType: MeetingType) {
    const isSameType = selectedType?.id === meetingType.id

    resetCancelState()
    setNotice(null)
    setCheckError(null)
    setStartError(null)
    setSuccessMessage(null)
    setAvailability(null)
    setAvailabilityError(null)
    setAvailabilityNotFound(null)
    setTypeNotFound(false)

    if (!isSameType) {
      setSelectedDate(null)
      setSelectedSlot(null)
    }

    setSelectedType(meetingType)
    setStep('datetime')
    setReloadKey((current) => current + 1)
  }

  function retryAvailability() {
    setAvailability(null)
    setAvailabilityError(null)
    setAvailabilityNotFound(null)
    setReloadKey((current) => current + 1)
  }

  function handleDateSelect(date: string) {
    resetCancelState()
    setSelectedDate(date)
    setSelectedSlot(null)
    setNotice(null)
    setCheckError(null)
    setStartError(null)
    setSuccessMessage(null)
  }

  function handleSlotSelect(slotStart: string) {
    resetCancelState()
    setSelectedSlot(slotStart)
    setNotice(null)
    setCheckError(null)
    setStartError(null)
    setSuccessMessage(null)
  }

  function handleBackToTypes() {
    resetCancelState()
    setNotice(null)
    setCheckError(null)
    setStartError(null)
    setGuestError(null)
    setSlotTaken(false)
    setTypeNotFound(false)
    setAvailabilityNotFound(null)
    setSuccessMessage(null)
    setStep('type')
  }

  async function handleNext() {
    if (selectedType === null || selectedDate === null || selectedSlot === null) {
      return
    }

    setChecking(true)
    setNotice(null)
    setCheckError(null)
    setStartError(null)
    setAvailabilityNotFound(null)

    try {
      const { data } = await getMeetingTypeAvailability({
        path: { meetingTypeId: selectedType.id },
        throwOnError: true,
      })
      const freshAvailability = data ?? { days: [] }
      setAvailability(freshAvailability)

      const freshDay = freshAvailability.days.find((day) => day.date === selectedDate)
      const isStillFree = freshDay?.slots.some((slot) => slot.start === selectedSlot) ?? false

      if (!isStillFree) {
        setSelectedSlot(null)
        setNotice(
          freshDay === undefined || freshDay.slots.length === 0
            ? 'На эту дату нет свободного времени'
            : 'Этот слот уже заняли, выберите другое время',
        )
        return
      }

      setStep('guest')
    } catch (error: unknown) {
      const response = toErrorResponse(error)

      if (response?.code === 'MEETING_TYPE_NOT_FOUND') {
        setAvailability(null)
        setAvailabilityNotFound(response.message)
        return
      }

      setCheckError(response?.message ?? 'Не удалось проверить доступность. Попробуйте ещё раз.')
    } finally {
      setChecking(false)
    }
  }

  async function handleSubmit() {
    if (selectedType === null || selectedSlot === null || submitting) {
      return
    }

    setSubmitting(true)
    setGuestFieldErrors({})
    setStartError(null)
    setGuestError(null)
    setSlotTaken(false)
    setTypeNotFound(false)

    try {
      const { data } = await createMeeting({
        body: {
          meetingTypeId: selectedType.id,
          start: selectedSlot,
          guestName,
          guestEmail,
          ...(guestAdditionalInfo.trim() === ''
            ? {}
            : { guestAdditionalInfo: guestAdditionalInfo.trim() }),
        },
        throwOnError: true,
      })

      if (!data) {
        setGuestError(CREATE_MEETING_FALLBACK)
        return
      }

      setCreatedMeeting(data)
      resetCancelState()
      setSelectedDate(data.start.slice(0, 10))
      setSelectedSlot(null)
      setNotice(null)
      setCheckError(null)
      setStep('datetime')
      setSuccessMessage('Встреча создана')
      setAvailability(null)
      setAvailabilityError(null)
      setReloadKey((current) => current + 1)
    } catch (error: unknown) {
      const response = toErrorResponse(error)
      const details = response?.details ?? []
      const fieldErrors: Record<string, string> = {}
      let startMessage: string | undefined
      let hasOtherFieldErrors = false

      for (const detail of details) {
        if (GUEST_FIELDS.has(detail.field)) {
          fieldErrors[detail.field] = detail.message
        } else if (detail.field === 'start') {
          startMessage = detail.message
        } else {
          hasOtherFieldErrors = true
        }
      }

      const isSlotTaken = response?.code === 'SLOT_TAKEN'
      const isTypeNotFound = response?.code === 'MEETING_TYPE_NOT_FOUND'
      const hasInlineErrors = Object.keys(fieldErrors).length > 0 || startMessage !== undefined
      const showGeneralMessage =
        isSlotTaken || isTypeNotFound || hasOtherFieldErrors || !hasInlineErrors

      setGuestFieldErrors(fieldErrors)
      setStartError(startMessage ?? null)
      setSlotTaken(isSlotTaken)
      setTypeNotFound(isTypeNotFound)
      setGuestError(showGeneralMessage ? (response?.message ?? CREATE_MEETING_FALLBACK) : null)

      if (startMessage !== undefined) {
        setSelectedSlot(null)
        setStep('datetime')
      }
    } finally {
      setSubmitting(false)
    }
  }

  function chooseAnotherTime() {
    resetCancelState()
    setStep('datetime')
    setSelectedSlot(null)
    setStartError(null)
    setGuestError(null)
    setGuestFieldErrors({})
    setSlotTaken(false)
    setTypeNotFound(false)
    setSuccessMessage(null)
    setAvailability(null)
    setAvailabilityError(null)
    setAvailabilityNotFound(null)
    setReloadKey((current) => current + 1)
  }

  async function handleCancel() {
    if (createdMeeting === null || cancelling) {
      return
    }

    setCancelling(true)
    setCancelError(null)

    try {
      const { response } = await cancelMeeting({
        path: { id: createdMeeting.id },
        body: { guestEmail: createdMeeting.guestEmail },
        throwOnError: true,
      })

      if (response?.status !== 204) {
        setCancelError(CANCEL_MEETING_FALLBACK)
        return
      }

      setCreatedMeeting(null)
      setCancelConfirming(false)
      setCancelError(null)
      setMeetingStarted(false)
      setSuccessMessage('Встреча отменена')
      setNotice(null)
      setCheckError(null)
      setStartError(null)
      setAvailability(null)
      setAvailabilityError(null)
      setAvailabilityNotFound(null)
      setReloadKey((current) => current + 1)
    } catch (error: unknown) {
      const response = toErrorResponse(error)

      if (response?.code === 'MEETING_ALREADY_STARTED') {
        setCancelConfirming(false)
        setMeetingStarted(true)
        setCancelError(response.message)
        return
      }

      if (response?.code === 'MEETING_NOT_FOUND') {
        setCancelConfirming(false)
        setCancelError(response.message)
        return
      }

      setCancelError(response?.message ?? CANCEL_MEETING_FALLBACK)
    } finally {
      setCancelling(false)
    }
  }

  function handleDeclineCancel() {
    setCancelConfirming(false)
    setCancelError(null)
  }

  const daysByDate = new Map((availability?.days ?? []).map((day) => [day.date, day]))
  const selectedDay = selectedDate === null ? undefined : daysByDate.get(selectedDate)
  const hasAnySlot = (availability?.days ?? []).some((day) => day.slots.length > 0)
  const availabilityLoading =
    availability === null && availabilityError === null && availabilityNotFound === null
  const sessionMeetingDate =
    createdMeeting !== null &&
    selectedType !== null &&
    createdMeeting.meetingType.id === selectedType.id
      ? createdMeeting.start.slice(0, 10)
      : null
  const canCancel =
    createdMeeting !== null && !meetingStarted && nowMs < Date.parse(createdMeeting.start)

  return (
    <PageContainer>
      <PageHeading title="Запись на звонок" />

      <div className="mt-6">
        {step === 'type' ? (
          listError ? (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
              {listError}
            </p>
          ) : meetingTypes === null ? (
            <p className="text-slate-600">Загрузка типов встреч…</p>
          ) : meetingTypes.length === 0 ? (
            <p className="text-slate-600">Пока нет опубликованных типов встреч</p>
          ) : (
            <ul aria-label="Опубликованные типы встреч" className="space-y-3">
              {meetingTypes.map((meetingType) => {
                const isSelected = selectedType?.id === meetingType.id

                return (
                  <li key={meetingType.id} className="rounded-xl border border-slate-200 bg-white">
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => handleTypeSelect(meetingType)}
                      className={[
                        'w-full rounded-xl p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900',
                        isSelected ? 'bg-slate-100' : 'hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-lg font-medium">{meetingType.name}</span>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                          {formatDuration(meetingType.durationMinutes)}
                        </span>
                      </span>
                      {meetingType.description ? (
                        <span className="mt-2 block text-slate-600">{meetingType.description}</span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          )
        ) : step === 'datetime' && selectedType !== null ? (
          <section
            aria-labelledby="next-step-heading"
            className="rounded-xl border border-slate-200 bg-white p-6"
          >
            <h2 id="next-step-heading" className="text-2xl font-semibold">
              Выбор даты и времени
            </h2>

            {successMessage ? (
              <output className="mt-4 block rounded-lg bg-green-50 p-3 text-green-800">
                {successMessage}
              </output>
            ) : null}

            <div className="mt-4 rounded-lg bg-slate-50 p-4">
              <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                Календарь звонков
              </p>
              <p className="mt-1 text-lg font-medium">
                {selectedType.name} · {formatDuration(selectedType.durationMinutes)}
              </p>
              {selectedDate ? (
                <p className="mt-1 text-slate-700">
                  {formatLongDate(selectedDate)}
                  {selectedSlot ? `, ${formatSlotTime(selectedSlot)}` : ''}
                </p>
              ) : null}
              <p className="mt-2 text-sm text-slate-600">Время по Тбилиси (UTC+4)</p>
            </div>

            {availabilityNotFound ? (
              <div role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-red-800">
                <p>{availabilityNotFound}</p>
                <button
                  type="button"
                  onClick={handleBackToTypes}
                  className="mt-2 font-medium underline underline-offset-4"
                >
                  К выбору типа встречи
                </button>
              </div>
            ) : availabilityError ? (
              <div role="alert" className="mt-6 rounded-lg bg-red-50 p-3 text-red-800">
                <p>{availabilityError}</p>
                <button
                  type="button"
                  onClick={retryAvailability}
                  className="mt-2 font-medium underline underline-offset-4"
                >
                  Повторить
                </button>
              </div>
            ) : availabilityLoading ? (
              <p className="mt-6 text-slate-600">Загрузка доступного времени…</p>
            ) : availability === null ? null : (
              <>
                <AvailabilityCalendar
                  firstDate={availability.days[0]?.date ?? ''}
                  daysByDate={daysByDate}
                  selectedDate={selectedDate}
                  sessionMeetingDate={sessionMeetingDate}
                  onSelectDate={handleDateSelect}
                />

                <div className="mt-8 rounded-xl border border-slate-200 p-4">
                  <h3 className="text-lg font-semibold">
                    {selectedDate === null
                      ? `Время · ${selectedType.name}`
                      : `${formatLongDate(selectedDate)} · ${selectedType.name}`}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">Время по Тбилиси (UTC+4)</p>

                  {createdMeeting !== null && sessionMeetingDate === selectedDate ? (
                    <div className="mt-4 rounded-lg border border-green-300 bg-green-50 p-3 text-green-900">
                      <p className="font-medium">Ваша встреча</p>
                      <p className="mt-1">
                        {formatSlotTime(createdMeeting.start)}–{formatSlotTime(createdMeeting.end)}
                      </p>

                      {canCancel ? (
                        cancelConfirming ? (
                          <div
                            role="group"
                            aria-label="Подтверждение отмены встречи"
                            className="mt-3"
                          >
                            <p>Отменить встречу?</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void handleCancel()}
                                disabled={cancelling}
                                className="rounded-lg bg-red-700 px-4 py-2 font-medium text-white transition-colors hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {cancelling ? 'Отменяем…' : 'Да, отменить'}
                              </button>
                              <button
                                type="button"
                                onClick={handleDeclineCancel}
                                disabled={cancelling}
                                className="rounded-lg border border-green-700 px-4 py-2 font-medium text-green-900 transition-colors hover:bg-green-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Нет
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setCancelConfirming(true)
                              setCancelError(null)
                            }}
                            className="mt-3 rounded-lg border border-red-700 px-4 py-2 font-medium text-red-800 transition-colors hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                          >
                            Отменить встречу
                          </button>
                        )
                      ) : null}

                      {cancelError ? (
                        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-red-800">
                          {cancelError}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {notice ? (
                    <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-amber-900">
                      {notice}
                    </p>
                  ) : null}

                  {startError ? (
                    <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">
                      {startError}
                    </p>
                  ) : null}

                  {checkError ? (
                    <div role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-red-800">
                      <p>{checkError}</p>
                      <button
                        type="button"
                        onClick={handleNext}
                        className="mt-2 font-medium underline underline-offset-4"
                      >
                        Повторить
                      </button>
                    </div>
                  ) : null}

                  {selectedDate === null ? (
                    hasAnySlot ? (
                      <p className="mt-4 text-slate-600">Пожалуйста, выберите свободную дату</p>
                    ) : (
                      <p className="mt-4 text-slate-600">
                        В ближайшие 14 дней нет свободного времени
                      </p>
                    )
                  ) : selectedDay !== undefined && selectedDay.slots.length > 0 ? (
                    <fieldset className="mt-4 min-w-0 border-0 p-0">
                      <legend className="sr-only">Свободные слоты</legend>
                      <div className="flex flex-wrap gap-2">
                        {selectedDay.slots.map((slot) => {
                          const isSelected = selectedSlot === slot.start

                          return (
                            <button
                              key={slot.start}
                              type="button"
                              aria-pressed={isSelected}
                              onClick={() => handleSlotSelect(slot.start)}
                              className={[
                                'rounded-lg border px-4 py-2 font-medium transition-colors',
                                isSelected
                                  ? 'border-slate-900 bg-slate-900 text-white'
                                  : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-50',
                              ].join(' ')}
                            >
                              {formatSlotTime(slot.start)}
                            </button>
                          )
                        })}
                      </div>
                    </fieldset>
                  ) : notice === null ? (
                    <p className="mt-4 text-slate-600">На эту дату нет свободного времени</p>
                  ) : null}
                </div>
              </>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleBackToTypes}
                className="rounded-lg border border-slate-300 px-5 py-3 font-medium text-slate-900 transition-colors hover:bg-slate-50"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={selectedSlot === null || checking}
                onClick={handleNext}
                className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {checking ? 'Проверяем…' : 'Далее'}
              </button>
            </div>
          </section>
        ) : (
          <section
            aria-labelledby="guest-step-heading"
            className="rounded-xl border border-slate-200 bg-white p-6"
          >
            <h2 id="guest-step-heading" className="text-2xl font-semibold">
              Данные гостя
            </h2>

            {selectedType !== null && selectedDate !== null && selectedSlot !== null ? (
              <div className="mt-4 rounded-lg bg-slate-50 p-4">
                <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                  Календарь звонков
                </p>
                <p className="mt-1 text-lg font-medium">
                  {selectedType.name} · {formatDuration(selectedType.durationMinutes)}
                </p>
                <p className="mt-1 text-slate-700">
                  {formatLongDate(selectedDate)}, {formatSlotTime(selectedSlot)}
                </p>
                <p className="mt-2 text-sm text-slate-600">Время по Тбилиси (UTC+4)</p>
              </div>
            ) : null}

            <form
              noValidate
              aria-labelledby="guest-step-heading"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault()
                void handleSubmit()
              }}
              className="mt-6 space-y-4"
            >
              <div>
                <label htmlFor="guest-name" className="block font-medium">
                  Имя
                </label>
                <input
                  id="guest-name"
                  type="text"
                  value={guestName}
                  onChange={(event) => setGuestName(event.target.value)}
                  aria-invalid={guestFieldErrors.guestName ? true : undefined}
                  aria-describedby={guestFieldErrors.guestName ? 'guest-name-error' : undefined}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
                {guestFieldErrors.guestName ? (
                  <p id="guest-name-error" className="mt-1 text-sm text-red-700">
                    {guestFieldErrors.guestName}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="guest-email" className="block font-medium">
                  Email
                </label>
                <input
                  id="guest-email"
                  type="email"
                  value={guestEmail}
                  onChange={(event) => setGuestEmail(event.target.value)}
                  aria-invalid={guestFieldErrors.guestEmail ? true : undefined}
                  aria-describedby={guestFieldErrors.guestEmail ? 'guest-email-error' : undefined}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
                {guestFieldErrors.guestEmail ? (
                  <p id="guest-email-error" className="mt-1 text-sm text-red-700">
                    {guestFieldErrors.guestEmail}
                  </p>
                ) : null}
              </div>

              <div>
                <label htmlFor="guest-additional-info" className="block font-medium">
                  Дополнительная информация
                </label>
                <textarea
                  id="guest-additional-info"
                  value={guestAdditionalInfo}
                  onChange={(event) => setGuestAdditionalInfo(event.target.value)}
                  aria-invalid={guestFieldErrors.guestAdditionalInfo ? true : undefined}
                  aria-describedby={
                    guestFieldErrors.guestAdditionalInfo
                      ? 'guest-additional-info-error'
                      : 'guest-additional-info-hint'
                  }
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
                <p id="guest-additional-info-hint" className="mt-1 text-sm text-slate-600">
                  Необязательно
                </p>
                {guestFieldErrors.guestAdditionalInfo ? (
                  <p id="guest-additional-info-error" className="mt-1 text-sm text-red-700">
                    {guestFieldErrors.guestAdditionalInfo}
                  </p>
                ) : null}
              </div>

              {guestError ? (
                <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
                  <p>{guestError}</p>
                  {slotTaken ? (
                    <button
                      type="button"
                      onClick={chooseAnotherTime}
                      className="mt-2 font-medium underline underline-offset-4"
                    >
                      Выбрать другое время
                    </button>
                  ) : null}
                  {typeNotFound ? (
                    <button
                      type="button"
                      onClick={handleBackToTypes}
                      className="mt-2 font-medium underline underline-offset-4"
                    >
                      К выбору типа встречи
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep('datetime')}
                  className="rounded-lg border border-slate-300 px-5 py-3 font-medium text-slate-900 transition-colors hover:bg-slate-50"
                >
                  Назад
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-slate-900 px-5 py-3 font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? 'Отправляем…' : 'Подтвердить'}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </PageContainer>
  )
}
