import { expect, test } from '@playwright/test'

test('гость переходит с главной страницы на страницу записи', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Календарь звонков')
  await expect(page.getByRole('heading', { level: 1, name: 'Календарь звонков' })).toBeVisible()

  const bookLink = page.getByRole('link', { name: 'Записаться на звонок' })
  await expect(bookLink).toBeVisible()
  await bookLink.click()

  await expect(page).toHaveURL('/book')
  await expect(page).toHaveTitle('Запись на звонок')
  await expect(page.getByRole('heading', { level: 1, name: 'Запись на звонок' })).toBeVisible()
})
