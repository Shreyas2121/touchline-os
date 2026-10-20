import { expect, test, type Locator, type Page } from '@playwright/test'
import { missingCampaignTitle, previewBanner } from '../src/app/copy.ts'

const ruleNames = [
  'SELL_TO_BUY',
  'MAX_SIGNING_AGE',
  'WAGE_TIER_CAP',
  'PRESTIGE_BID_SALE',
  'REGISTRATION_QUOTA',
]

test('shortlist, blocked signing, and registration blocker', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Try fictional demo', exact: true })
    .click()
  await page.getByRole('button', { name: 'Ashbridge', exact: true }).click()

  await page.getByRole('link', { name: 'Transfers', exact: true }).click()
  await expect(page.getByText(previewBanner)).toHaveCount(0)
  const search = page.getByLabel('Player search', { exact: true })
  await search.fill('a')
  await expect(
    page.getByText('Search the player pool to plan a move.', { exact: true }),
  ).toBeVisible()

  const row = await firstOutsider(page)
  const name = (await row.locator('span').first().innerText()).trim()
  await row
    .getByRole('button', { name: 'Add to shortlist', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'On the shortlist', exact: true }),
  ).toBeVisible()
  await page.reload()
  await expect(search).toBeVisible()
  await search.fill(name)
  await expect(
    page.getByRole('button', { name: 'On the shortlist', exact: true }),
  ).toBeVisible()

  const scenario = page.getByRole('region', { name: 'Scenario', exact: true })
  await page
    .getByRole('region', { name: 'Shortlist', exact: true })
    .getByRole('button', { name: 'Preview scenario', exact: true })
    .click()
  await previewPurchase(scenario)
  await expect(
    scenario.getByText('No constitution is saved, so no rule was checked.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    scenario.getByText('Preview only — no changes recorded.', { exact: true }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Constitution', exact: true }).click()
  await expect(page.getByLabel('Preset', { exact: true })).toHaveValue(
    'balanced',
  )
  await page
    .getByRole('button', { name: 'Save constitution', exact: true })
    .click()
  await expect(
    page.getByText('Saved constitution version 1.', { exact: true }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Transfers', exact: true }).click()
  await page
    .getByRole('region', { name: 'Shortlist', exact: true })
    .getByRole('button', { name: 'Preview scenario', exact: true })
    .click()
  await previewPurchase(scenario)
  await expect(
    scenario.getByText('Blocked', { exact: true }).first(),
  ).toBeVisible()
  await expect(
    scenario.getByText('The fee is above the remaining transfer capacity.', {
      exact: true,
    }),
  ).toBeVisible()
  await expect(
    scenario.getByRole('button', { name: 'Record this transfer', exact: true }),
  ).toBeDisabled()
  for (const rule of ruleNames) {
    await expect(page.getByRole('button', { name: rule })).toHaveCount(0)
    await expect(page.getByRole('checkbox', { name: rule })).toHaveCount(0)
  }

  await page.getByRole('link', { name: 'Squad', exact: true }).click()
  const squad = page.getByRole('table', { name: 'Squad', exact: true })
  await expect(
    squad.getByRole('columnheader', { name: 'Minutes', exact: true }),
  ).toBeVisible()
  const headers = await squad.getByRole('columnheader').allTextContents()
  const minutesColumn = headers.findIndex(
    (header) => header.trim() === 'Minutes',
  )
  expect(minutesColumn).toBeGreaterThanOrEqual(0)
  await expect(
    squad.getByRole('row').nth(1).getByRole('cell').nth(minutesColumn),
  ).toHaveText('Unknown')

  await page.getByRole('link', { name: 'Registration', exact: true }).click()
  await expect(page.getByText(previewBanner)).toHaveCount(0)
  await expect(
    page.getByText(
      'These checks are your saved challenge rules. They do not certify a real competition.',
    ),
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Preview registration', exact: true })
    .click()
  await expect(page.getByText('Blocked', { exact: true }).first()).toBeVisible()
  await expect(
    page.getByText('Saved registration.', { exact: true }),
  ).toHaveCount(0)

  await page.getByRole('link', { name: 'Transfers', exact: true }).click()
  await page.reload()
  await expect(
    page.getByRole('region', { name: 'Shortlist', exact: true }),
  ).toContainText(name)
  await expect(
    page.getByText('No completed deals for this season.', { exact: true }),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Scouting', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Scouting', exact: true }),
  ).toBeVisible()
  await expect(page.getByText(previewBanner)).toBeVisible()

  await page.getByRole('link', { name: 'Finance', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Record this action', exact: true }),
  ).toBeDisabled()

  await page.goto('/app/does-not-exist/transfers')
  await expect(
    page.getByRole('heading', { name: missingCampaignTitle, exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Squad', exact: true }),
  ).toHaveCount(0)
})

async function previewPurchase(scenario: Locator) {
  await scenario
    .getByLabel('Move', { exact: true })
    .selectOption({ label: 'Incoming purchase' })
  await scenario.getByLabel('Fee', { exact: true }).fill('6000000')
  await scenario.getByLabel('Tier', { exact: true }).selectOption('rotation')
  await scenario
    .getByRole('button', { name: 'Preview scenario', exact: true })
    .click()
}

async function firstOutsider(page: Page): Promise<Locator> {
  const search = page.getByLabel('Player search', { exact: true })
  const preferred = await outsiderName(page).catch(() => '')
  const queries = preferred ? [preferred, preferred.slice(0, 2)] : []
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'
  for (const first of alphabet) {
    for (const second of alphabet) queries.push(`${first}${second}`)
  }
  for (const query of queries) {
    if (query.trim().length < 2) continue
    await search.fill(query)
    const rows = page
      .getByRole('list', { name: 'Search results', exact: true })
      .getByRole('listitem')
    const count = await rows.count()
    for (let index = 0; index < count; index += 1) {
      const row = rows.nth(index)
      if (!(await row.innerText()).includes('Ashbridge')) return row
    }
  }
  throw new Error('No player outside Ashbridge was listed.')
}

async function outsiderName(page: Page): Promise<string> {
  return page.evaluate(async () => {
    type Row = { id?: string; name?: string; clubId?: string | null }
    type Store = {
      getAll(): {
        result: Row[]
        onsuccess: (() => void) | null
        onerror: (() => void) | null
      }
    }
    type Database = {
      close(): void
      transaction(name: string): { objectStore(name: string): Store }
    }
    const request = (
      globalThis as unknown as {
        indexedDB: {
          open(name: string): {
            result: Database
            error: unknown
            onsuccess: (() => void) | null
            onerror: (() => void) | null
          }
        }
      }
    ).indexedDB.open('touchline-os')
    const database = await new Promise<Database>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const read = (store: string) =>
      new Promise<Row[]>((resolve, reject) => {
        const query = database.transaction(store).objectStore(store).getAll()
        query.onsuccess = () => resolve(query.result)
        query.onerror = () => reject(query.result)
      })
    const players = await read('players')
    const clubs = await read('clubs')
    database.close()
    const ashbridge = new Set(
      clubs.filter((club) => club.name === 'Ashbridge').map((club) => club.id),
    )
    return (
      players.find(
        (player) =>
          typeof player.name === 'string' &&
          player.name.length >= 2 &&
          (player.clubId == null || !ashbridge.has(player.clubId)),
      )?.name ?? ''
    )
  })
}
