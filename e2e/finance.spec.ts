import { expect, test, type Page } from '@playwright/test'
import { previewBanner } from '../src/app/copy.ts'

function kpi(page: Page, label: string) {
  return page
    .locator('p')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .locator('..')
    .locator('p')
    .nth(1)
}

test('Balanced finances persist while action previews record nothing', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Try fictional demo', exact: true })
    .click()
  await page.getByRole('button', { name: 'Ashbridge', exact: true }).click()
  await expect(kpi(page, 'Transfer capacity')).toHaveText('Unknown')
  await expect(page.locator('body')).not.toContainText('€')

  await page.getByRole('link', { name: 'Constitution', exact: true }).click()
  await expect(page.getByText(previewBanner)).toHaveCount(0)
  await expect(
    page.getByText('Rules are not active in this build.'),
  ).toHaveCount(0)
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue(
    'balanced',
  )
  await page
    .getByRole('button', { name: 'Save constitution', exact: true })
    .click()
  await expect(
    page.getByText('Saved constitution version 1.', { exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(page.getByText('Version 1', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Sales percent', { exact: true })).toHaveValue(
    '70',
  )
  await expect(page.getByLabel('Age cap', { exact: true })).toHaveValue('26')

  await page.getByRole('link', { name: 'Finance', exact: true }).click()
  await expect(page.getByText(previewBanner)).toHaveCount(0)
  await expect(kpi(page, 'Transfer capacity')).toHaveText('€5,000,000.00')
  const ledger = page.getByRole('table', { name: 'Ledger', exact: true })
  await expect(
    ledger.getByText('Opening allocation', { exact: true }),
  ).toHaveCount(1)
  await expect(ledger.getByRole('row')).toHaveCount(2)

  await page.getByLabel('Fee', { exact: true }).fill('6000000')
  await page.getByLabel('Age', { exact: true }).fill('24')
  await page.getByLabel('Weekly wage', { exact: true }).fill('10000')
  await page.getByLabel('Tier', { exact: true }).selectOption('rotation')
  const preview = page.getByRole('button', {
    name: 'Preview action',
    exact: true,
  })
  await preview.focus()
  await page.keyboard.press('Enter')
  const result = page.getByRole('region', {
    name: 'Preview result',
    exact: true,
  })
  await expect(result).toBeFocused()
  await expect(result.getByText('Blocked', { exact: true })).toBeVisible()
  await expect(
    result.getByText('The fee is above the remaining transfer capacity.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    result.getByText('Preview only — no changes recorded.', { exact: true }),
  ).toBeVisible()
  await expect(
    result.getByText('Transfer capacity: Short by €1,000,000.00', {
      exact: true,
    }),
  ).toBeVisible()

  await page.getByLabel('Fee', { exact: true }).fill('1000000')
  await page.getByLabel('Age', { exact: true }).fill('27')
  await preview.click()
  await expect(
    result.getByText('Age 27 is above the cap of 26.', { exact: true }),
  ).toBeVisible()
  await page.getByLabel('Age', { exact: true }).fill('24')
  await preview.click()
  await expect(
    result.getByText('No rule blocked this action.', { exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Record this action', exact: true }),
  ).toBeDisabled()

  await page.reload()
  await expect(kpi(page, 'Transfer capacity')).toHaveText('€5,000,000.00')
  await expect(ledger.getByRole('row')).toHaveCount(2)
  await expect(ledger).not.toContainText('Incoming fee')
  await page.getByLabel('Prize amount', { exact: true }).fill('1000000')
  await page
    .getByRole('button', { name: 'Post prize income', exact: true })
    .click()
  await expect(
    page.getByText('Posted prize income.', { exact: true }),
  ).toBeVisible()
  await expect(kpi(page, 'Transfer capacity')).toHaveText('€6,000,000.00')
  await page
    .getByRole('button', { name: 'Reverse Prize income', exact: true })
    .click()
  await page
    .getByLabel('Reversal note', { exact: true })
    .fill('Corrected prize income')
  await page.getByRole('button', { name: 'Reverse entry', exact: true }).click()
  await expect(
    page.getByText('Reversed ledger entry.', { exact: true }),
  ).toBeVisible()
  await expect(kpi(page, 'Transfer capacity')).toHaveText('€5,000,000.00')
  await expect(ledger).not.toContainText('Incoming fee')

  await page.getByRole('link', { name: 'Scouting', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Scouting', exact: true }),
  ).toBeVisible()
  await expect(page.getByText(previewBanner)).toBeVisible()
  await page.getByRole('link', { name: 'Squad', exact: true }).click()
  await expect(page.getByText(previewBanner)).toHaveCount(0)
  await expect(
    page.getByRole('columnheader').filter({ hasText: /wage/i }),
  ).toBeVisible()
  const headers = await page.getByRole('columnheader').allTextContents()
  const wageColumn = headers.findIndex((header) => /wage/i.test(header))
  expect(wageColumn).toBeGreaterThanOrEqual(0)
  await expect(
    page
      .getByRole('table')
      .getByRole('row')
      .nth(1)
      .getByRole('cell')
      .nth(wageColumn),
  ).toHaveText('Unknown')
})
