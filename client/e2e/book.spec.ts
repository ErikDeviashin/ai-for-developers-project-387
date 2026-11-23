import { expect, test } from '@playwright/test'

test('владелец публикует типы встреч, и гость видит их на странице записи', async ({ page }) => {
  const suffix = `${Date.now()}`
  const shortName = `Бета ${suffix}`
  const longName = `Альфа ${suffix}`
  const shortDescription = 'Короткий звонок с описанием'
  const longDescription = 'Длинный звонок без лишних деталей'

  await page.goto('/owner')

  await page.getByLabel('Название').fill(shortName)
  await page.getByLabel('Описание').fill(shortDescription)
  await page.getByLabel('Длительность').selectOption('15')
  await page.getByRole('button', { name: 'Создать тип встречи' }).click()
  await expect(page.getByText('Тип встречи создан')).toBeVisible()
  await expect(page.getByRole('heading', { name: shortName })).toBeVisible()

  await page.getByLabel('Название').fill(longName)
  await page.getByLabel('Описание').fill(longDescription)
  await page.getByLabel('Длительность').selectOption('60')
  await page.getByRole('button', { name: 'Создать тип встречи' }).click()
  await expect(page.getByRole('heading', { name: longName })).toBeVisible()

  await page.getByRole('link', { name: 'К странице записи' }).click()

  await expect(page).toHaveURL('/book')
  await expect(page.getByRole('heading', { level: 1, name: 'Запись на звонок' })).toBeVisible()
  await expect(page.getByText('Пока нет опубликованных типов встреч')).toHaveCount(0)

  const publishedTypes = page.getByRole('list', { name: 'Опубликованные типы встреч' })
  const guestTypes = publishedTypes.getByRole('listitem').filter({ hasText: suffix })

  await expect(guestTypes).toHaveCount(2)
  await expect(guestTypes.nth(0)).toContainText(shortName)
  await expect(guestTypes.nth(0)).toContainText('15 минут')
  await expect(guestTypes.nth(0)).toContainText(shortDescription)
  await expect(guestTypes.nth(1)).toContainText(longName)
  await expect(guestTypes.nth(1)).toContainText('60 минут')
  await expect(guestTypes.nth(1)).toContainText(longDescription)

  await guestTypes.nth(0).getByRole('button').click()

  await expect(page.getByRole('heading', { name: 'Выбор даты и времени' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ноябрь 2026' })).toBeVisible()

  const monday = page.getByRole('button', { name: 'Понедельник, 23 ноября 2026' })
  await expect(monday).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Суббота, 28 ноября 2026' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Вторник, 1 декабря 2026' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Понедельник, 14 декабря 2026' })).toBeDisabled()
  await expect(page.getByText('Пожалуйста, выберите свободную дату')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Далее' })).toBeDisabled()

  await monday.click()

  await expect(page.getByRole('heading', { name: /Понедельник, 23 ноября 2026/ })).toBeVisible()
  await expect(page.getByText('Время по Тбилиси (UTC+4)').first()).toBeVisible()

  await page.getByRole('button', { name: '10:00' }).click()
  await expect(page.getByRole('button', { name: '10:00' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Далее' })).toBeEnabled()
  await page.getByRole('button', { name: 'Далее' }).click()

  await expect(page.getByRole('heading', { name: 'Данные гостя' })).toBeVisible()
})
