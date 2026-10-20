import { expect, test } from '@playwright/test'
import {
  exportEmpty,
  exportLocal,
  exportOrigin,
  exportStarted,
} from '../src/app/copy.ts'
import { readFile } from 'node:fs/promises'

test('exports a local campaign file and leaves the save in place', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByText(exportOrigin('http://127.0.0.1:4173')),
  ).toBeVisible()
  await expect(page.getByText(exportEmpty)).toBeVisible()
  await expect(page.getByText(exportLocal)).toBeVisible()

  await page.getByRole('button', { name: 'Create new campaign' }).click()
  await page.getByLabel('Campaign name', { exact: true }).fill('Harbor')
  await page.getByLabel('Club name', { exact: true }).fill('Harbor Athletic')
  await page.getByLabel('Short name', { exact: true }).fill('HAR')
  await page.getByRole('button', { name: 'Save campaign', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/[A-Za-z0-9-]+\/command-center$/)
  await page.goto('/')

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export Harbor for Desktop' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(
    /^touchline-[A-Za-z0-9-]+-desktop\.json$/,
  )
  const file = await download.path()
  expect(file).toBeTruthy()
  const snapshot = JSON.parse(await readFile(file ?? '', 'utf8'))
  expect(snapshot.format).toBe('touchline-campaign')
  expect(snapshot.formatVersion).toBe(1)
  expect(snapshot.sourceStorage).toBe('indexeddb')
  expect(snapshot.sourceSchemaVersion).toBe(2)
  expect(Object.keys(snapshot.tables)).toHaveLength(23)
  expect(snapshot.tables.campaigns).toHaveLength(1)
  expect(snapshot.tables.campaigns[0].name).toBe('Harbor')
  expect(snapshot.tables.campaigns[0].seed).toBeNull()
  expect(snapshot.tables.campaigns[0].revision).toBe(snapshot.campaignRevision)
  expect(snapshot.tables.contracts).toEqual([])
  expect(snapshot.tables.simulationStates).toEqual([])
  expect(snapshot.tables.seasons[0].endDate).toBeNull()
  await expect(page.getByText(exportStarted)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('link', { name: 'Harbor' })).toBeVisible()
  await page.getByRole('link', { name: 'Harbor' }).click()
  await expect(
    page.getByRole('heading', { name: 'Harbor Athletic', level: 2 }),
  ).toBeVisible()
})
