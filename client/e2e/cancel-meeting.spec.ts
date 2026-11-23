import { expect, test, type Page } from '@playwright/test'

const FIXED_CLIENT_TIME = '2026-11-23T09:00:00+04:00'
const MONDAY = 'Понедельник, 23 ноября 2026'

async function createMeetingType(page: Page, name: string) {
  const response = await page.request.post('/meeting-types', {
    data: { name, durationMinutes: 30 },
  })
  expect(response.status()).toBe(201)
}

async function bookSlot(
  page: Page,
  meetingTypeName: string,
  time: string,
  guestName = 'Анна Тестова',
  guestEmail = 'anna.testova@example.com',
) {
  await page.goto('/book')

  const meetingTypes = page.getByRole('list', { name: 'Опубликованные типы встреч' })
  await meetingTypes.getByRole('button', { name: new RegExp(meetingTypeName) }).click()

  await page.getByRole('button', { name: MONDAY }).click()
  await page.getByRole('button', { name: time, exact: true }).click()
  await page.getByRole('button', { name: 'Далее' }).click()

  await expect(page.getByRole('heading', { name: 'Данные гостя' })).toBeVisible()
  await page.getByLabel('Имя').fill(guestName)
  await page.getByLabel('Email').fill(guestEmail)
  await page.getByRole('button', { name: 'Подтвердить' }).click()

  await expect(page.getByText('Встреча создана')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Отменить встречу', exact: true })).toBeVisible()
}

test('гость отменяет встречу после двухшагового подтверждения', async ({ page }) => {
  const suffix = `${Date.now()}`
  const meetingTypeName = `Отмена ${suffix}`

  await page.clock.setFixedTime(FIXED_CLIENT_TIME)
  await createMeetingType(page, meetingTypeName)
  await bookSlot(page, meetingTypeName, '16:00')

  await page.getByRole('button', { name: 'Отменить встречу', exact: true }).click()

  const confirmation = page.getByRole('group', { name: 'Подтверждение отмены встречи' })
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByText('Отменить встречу?')).toBeVisible()

  await confirmation.getByRole('button', { name: 'Нет' }).click()

  await expect(page.getByText('Ваша встреча').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Отменить встречу', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '16:00', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Отменить встречу', exact: true }).click()
  await page.getByRole('button', { name: 'Да, отменить' }).click()

  await expect(page.getByText('Встреча отменена')).toBeVisible()
  await expect(page.getByText('Ваша встреча')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '16:00', exact: true })).toBeVisible()

  await page.goto('/owner')
  const ownerMeetings = page.getByRole('list', { name: 'Список встреч' })
  await expect(ownerMeetings.getByText(meetingTypeName)).toHaveCount(0)
})

test('после отмены и перезагрузки освободившийся слот снова доступен', async ({ page }) => {
  const suffix = `${Date.now()}`
  const meetingTypeName = `Повтор ${suffix}`

  await page.clock.setFixedTime(FIXED_CLIENT_TIME)
  await createMeetingType(page, meetingTypeName)
  await bookSlot(page, meetingTypeName, '17:00')

  await page.getByRole('button', { name: 'Отменить встречу', exact: true }).click()
  await page.getByRole('button', { name: 'Да, отменить' }).click()
  await expect(page.getByText('Встреча отменена')).toBeVisible()

  await page.reload()
  await page.clock.setFixedTime(FIXED_CLIENT_TIME)

  await expect(page.getByText('Встреча отменена')).toHaveCount(0)
  await expect(page.getByText('Ваша встреча')).toHaveCount(0)

  await bookSlot(page, meetingTypeName, '17:00', 'Борис Тестов', 'boris.testov@example.com')
})
