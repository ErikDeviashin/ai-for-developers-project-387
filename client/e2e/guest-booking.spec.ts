import { expect, test } from '@playwright/test'

test('гость бронирует слот, видит созданную встречу в сессии и теряет подсветку после обновления', async ({
  page,
  request,
}) => {
  const suffix = `${Date.now()}`
  const meetingTypeName = `Знакомство ${suffix}`
  const creation = await request.post('/meeting-types', {
    data: { name: meetingTypeName, durationMinutes: 30 },
  })
  expect(creation.status()).toBe(201)

  await page.goto('/')
  await page.getByRole('link', { name: 'Записаться на звонок' }).click()
  await expect(page).toHaveURL('/book')

  const meetingTypes = page.getByRole('list', { name: 'Опубликованные типы встреч' })
  await meetingTypes.getByRole('button', { name: new RegExp(meetingTypeName) }).click()

  await page.getByRole('button', { name: 'Понедельник, 23 ноября 2026' }).click()
  await page.getByRole('button', { name: '15:00' }).click()
  await page.getByRole('button', { name: 'Далее' }).click()

  await expect(page.getByRole('heading', { name: 'Данные гостя' })).toBeVisible()
  await page.getByLabel('Имя').fill('Анна Тестова')
  await page.getByLabel('Email').fill('anna.testova@example.com')
  await page.getByLabel('Дополнительная информация').fill('Подготовьте документы')
  await page.getByRole('button', { name: 'Подтвердить' }).click()

  await expect(page).toHaveURL('/book')
  await expect(page.getByText('Встреча создана')).toBeVisible()
  await expect(page.getByText('Ваша встреча').first()).toBeVisible()
  await expect(page.getByText('anna.testova@example.com')).toHaveCount(0)
  await expect(page.getByText('Анна Тестова')).toHaveCount(0)

  await page.reload()

  await expect(page.getByText('Встреча создана')).toHaveCount(0)
  await expect(page.getByText('Ваша встреча')).toHaveCount(0)

  await meetingTypes.getByRole('button', { name: new RegExp(meetingTypeName) }).click()
  await page.getByRole('button', { name: 'Понедельник, 23 ноября 2026' }).click()
  await expect(page.getByRole('button', { name: '15:00' })).toHaveCount(0)

  // The «Сейчас» badge is derived from the browser clock, so pin it to the meeting
  // time; server-side filtering by the injected clock is proven by API tests.
  await page.clock.setFixedTime('2026-11-23T15:10:00+04:00')
  await page.goto('/owner')

  const ownerMeetings = page.getByRole('list', { name: 'Список встреч' })
  const ownerMeeting = ownerMeetings.getByRole('listitem').filter({ hasText: meetingTypeName })

  await expect(ownerMeeting).toHaveCount(1)
  await expect(ownerMeeting).toContainText(meetingTypeName)
  await expect(ownerMeeting).toContainText('Понедельник, 23 ноября 2026, 15:00–15:30')
  await expect(ownerMeeting).toContainText('Анна Тестова')
  await expect(ownerMeeting).toContainText('anna.testova@example.com')
  await expect(ownerMeeting).toContainText('Подготовьте документы')
  await expect(ownerMeeting.getByText('Сейчас')).toBeVisible()
  await expect(page.getByText('Нет предстоящих встреч')).toHaveCount(0)
})
