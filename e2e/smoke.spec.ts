import { expect, test } from '@playwright/test'
import {
  backToWelcome,
  constitutionNote,
  createPanel,
  disclaimer,
  importPanel,
  missingCampaignTitle,
  noRecords,
  notFoundTitle,
  pitchPreview,
  previewBanner,
  previewValue,
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

test('phase 1 shell smoke', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Touchline OS' }),
  ).toBeVisible()
  await expect(page.getByText(disclaimer)).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Try fictional demo' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Create new campaign' }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Import backup' }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Try fictional demo' }).click()
  await expect(page).toHaveURL(/\/app\/demo\/command-center$/)
  await expect(page.getByText(previewBanner)).toBeVisible()
  await expect(page.getByText(previewValue, { exact: true })).toHaveCount(4)
  for (const word of ['Blocked', 'Warning', 'Informational', 'Passed']) {
    await expect(page.getByText(word)).toBeVisible()
  }

  await page.goto('/')
  await page.getByRole('button', { name: 'Create new campaign' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(createPanel)).toBeVisible()
  await page.getByRole('button', { name: 'Import backup' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(importPanel)).toBeVisible()
  await expect(page.locator('input[type=file]')).toHaveCount(0)

  await page.getByRole('link', { name: 'Try fictional demo' }).click()
  await page.getByRole('link', { name: 'Squad' }).click()
  await expect(page).toHaveURL(/\/squad$/)
  await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible()
  await expect(page.getByText(noRecords)).toBeVisible()

  await page.getByRole('link', { name: 'Tactics' }).click()
  await expect(page.getByText(pitchPreview)).toBeVisible()

  await page.getByRole('link', { name: 'Constitution' }).click()
  await expect(page.getByText(constitutionNote)).toBeVisible()
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

  await page.goto('/app/demo/not-a-section')
  await expect(page.getByRole('heading', { name: notFoundTitle })).toBeVisible()
  await expect(page.getByText(previewBanner)).toBeVisible()

  await page.goto('/nope')
  await expect(page.getByRole('heading', { name: notFoundTitle })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Squad' })).toHaveCount(0)
})
