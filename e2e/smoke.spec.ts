import { expect, test } from '@playwright/test'
import {
  backToWelcome,
  constitutionNote,
  disclaimer,
  importPanel,
  missingCampaignTitle,
  noRecords,
  notFoundTitle,
  previewBanner,
} from '../src/app/copy.ts'

declare const document: {
  body: {
    setAttribute(name: string, value: string): void
    focus(): void
  }
  activeElement: { id: string; textContent: string | null } | null
}

declare function getComputedStyle(element: { nodeType: number }): {
  outlineStyle: string
}

test('persistent campaign shell smoke', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Touchline OS' }),
  ).toBeVisible()
  await expect(page.getByText(disclaimer)).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Try fictional demo' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Create new campaign' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Import backup' }),
  ).toBeVisible()

  await page.getByRole('button', { name: 'Create new campaign' }).click()
  await page.getByLabel('Campaign name', { exact: true }).fill('Harbor')
  await page.getByLabel('Club name', { exact: true }).fill('Harbor Athletic')
  await page.getByLabel('Short name', { exact: true }).fill('HAR')
  await page.getByRole('button', { name: 'Save campaign', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/[A-Za-z0-9-]+\/command-center$/)
  const workspaceUrl = page.url()
  await expect(
    page.getByRole('heading', { name: 'Harbor Athletic', level: 2 }),
  ).toBeVisible()
  await expect(page.getByText(previewBanner)).toHaveCount(0)
  await expect(page.getByText('Unknown', { exact: true })).toHaveCount(4)
  await expect(page.getByText('Preview', { exact: true })).toHaveCount(0)
  for (const word of ['Blocked', 'Warning', 'Informational', 'Passed']) {
    await expect(page.getByText(word)).toHaveCount(0)
  }

  await page.goto('/')
  await page.getByRole('button', { name: 'Create new campaign' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(
    page.getByRole('button', { name: 'Save campaign' }),
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Import backup' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(importPanel)).toBeVisible()
  await expect(page.locator('input[type=file]')).toHaveCount(0)

  await page.goto(workspaceUrl)
  await page.getByRole('link', { name: 'Squad' }).click()
  await expect(page).toHaveURL(/\/squad$/)
  await expect(page.getByText(previewBanner)).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible()
  await expect(page.getByText('No players at this club.')).toBeVisible()
  await expect(page.getByText(noRecords)).toHaveCount(0)

  await page.getByRole('link', { name: 'Tactics' }).click()
  await expect(
    page.getByRole('img', { name: 'Pitch', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByText('This lineup is on this screen only. It is not saved yet.'),
  ).toHaveCount(0)
  await expect(page.getByLabel('Formation', { exact: true })).toHaveValue(
    '4-3-3',
  )
  await expect(page.getByText(previewBanner)).toHaveCount(0)

  await page.getByRole('link', { name: 'Constitution' }).click()
  await expect(page.getByText(constitutionNote)).toBeVisible()
  await expect(page.getByText(previewBanner)).toBeVisible()
  await expect(page.getByText('SELL_TO_BUY')).toBeVisible()

  await page.evaluate(() => {
    document.body.setAttribute('tabindex', '-1')
    document.body.focus()
  })
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  const outlineStyle = await skip.evaluate(
    (element) => getComputedStyle(element).outlineStyle,
  )
  expect(outlineStyle).toBe('solid')
  await page.keyboard.press('Enter')
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id))
    .toBe('main')

  for (let tab = 0; tab < 15; tab += 1) {
    const focusedName = await page.evaluate(
      () => document.activeElement?.textContent,
    )
    if (focusedName?.trim() === 'Squad') {
      break
    }
    await page.keyboard.press('Tab')
  }
  await expect(page.getByRole('link', { name: 'Squad' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/squad$/)

  await page.goto('/app')
  await expect(
    page.getByRole('heading', { name: missingCampaignTitle }),
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'Squad' })).toHaveCount(0)
  await page.getByRole('link', { name: backToWelcome }).click()
  await expect(page).toHaveURL(/\/$/)

  await page.goto(workspaceUrl.replace(/command-center$/, 'not-a-section'))
  await expect(page.getByRole('heading', { name: notFoundTitle })).toBeVisible()
  await expect(page.getByText(previewBanner)).toBeVisible()

  await page.goto('/nope')
  await expect(page.getByRole('heading', { name: notFoundTitle })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Squad' })).toHaveCount(0)
})
