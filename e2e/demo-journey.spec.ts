import { expect, test, type Page } from '@playwright/test'
import { disclaimer, previewBanner } from '../src/app/copy.ts'

function kpi(page: Page, label: string) {
  return page
    .locator('p')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .locator('..')
    .locator('p')
    .nth(1)
}

test('demo choice, refresh, campaign switching and reset preserve campaign isolation', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await expect(page.getByText(disclaimer)).toBeVisible()
  await page.getByRole('button', { name: 'Import backup' }).click()
  await expect(page.locator('input[type=file]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Try fictional demo' }).click()
  await expect(
    page.getByRole('heading', { name: 'Choose the club you manage' }),
  ).toBeVisible({ timeout: 60_000 })
  await expect(
    page.getByRole('heading', { name: 'Northwater Premier' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Ashbridge', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Ashdale', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/demo\/command-center$/)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Ashdale' }),
  ).toBeVisible()
  const squad = kpi(page, 'Squad')
  await expect(squad).toHaveText(/^\d+$/)
  const demoCount = await squad.innerText()
  expect(demoCount).not.toBe('0')
  expect(demoCount).toBe('36')
  await expect(kpi(page, 'Squad age')).toHaveText(/\d+ years/)
  await expect(kpi(page, 'Transfer capacity')).toHaveText('Unknown')
  await expect(page.getByText(previewBanner)).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('€')
  await page.reload()
  await expect(page).toHaveURL(/\/app\/demo\/command-center$/)
  await expect(kpi(page, 'Squad')).toHaveText(demoCount)
  await expect(
    page.getByRole('heading', { name: 'Choose the club you manage' }),
  ).toHaveCount(0)

  await page.goto('/')
  await page.getByRole('button', { name: 'Create new campaign' }).click()
  await page.getByLabel('Campaign name', { exact: true }).fill('Harbor')
  await page.getByLabel('Club name', { exact: true }).fill('Harbor Athletic')
  await page.getByLabel('Short name', { exact: true }).fill('HAR')
  await page.getByRole('button', { name: 'Save campaign', exact: true }).click()
  await expect(
    page.getByRole('heading', { level: 2, name: 'Harbor Athletic' }),
  ).toBeVisible()
  await expect(kpi(page, 'Squad')).toHaveText('0')
  await page.goto('/')
  await page.getByRole('link', { name: 'Fictional demo', exact: true }).click()
  await expect(kpi(page, 'Squad')).toHaveText(demoCount)
  await expect(
    page.getByRole('heading', { level: 2, name: 'Ashdale' }),
  ).toBeVisible()
  await page.goto('/')
  // Starting the completed demo again must keep its selected club and squad.
  await page.getByRole('button', { name: 'Try fictional demo' }).click()
  await expect(
    page.getByRole('heading', { level: 2, name: 'Ashdale' }),
  ).toBeVisible()
  await expect(kpi(page, 'Squad')).toHaveText(demoCount)
  await page.goto('/')
  await page.getByRole('link', { name: 'Harbor', exact: true }).click()
  await expect(kpi(page, 'Squad')).toHaveText('0')

  await page.goto('/')
  await page
    .getByRole('button', { name: 'Reset fictional demo', exact: true })
    .click()
  const reset = page.getByRole('button', { name: 'Reset demo', exact: true })
  await expect(reset).toBeDisabled()
  await page
    .getByLabel('Type the confirmation phrase')
    .fill('Reset fictional demo')
  await reset.click()
  await expect(
    page.getByRole('heading', { name: 'Choose the club you manage' }),
  ).toBeVisible({ timeout: 60_000 })
  await page.goto('/')
  await page.getByRole('link', { name: 'Harbor', exact: true }).click()
  await expect(kpi(page, 'Squad')).toHaveText('0')
  await page.goto('/')
  await page.getByRole('button', { name: 'Try fictional demo' }).click()
  await page.getByRole('button', { name: 'Ashbridge', exact: true }).click()
  await expect(
    page.getByRole('heading', { level: 2, name: 'Ashbridge' }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Constitution', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Choose a constitution', exact: true }),
  ).toBeVisible()
  await expect(page.getByText(previewBanner)).toHaveCount(0)
  await page.getByRole('link', { name: 'Scouting', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Scouting', exact: true }),
  ).toBeVisible()
  await expect(page.getByText(previewBanner)).toBeVisible()
})
