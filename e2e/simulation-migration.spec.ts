import { expect, test } from '@playwright/test'
import { schemaV1 } from '../src/data/migrations/v1.ts'

type Request<T> = {
  result: T
  error: unknown
  onsuccess: (() => void) | null
  onerror: (() => void) | null
}
type Store = {
  add(row: unknown): void
  createIndex(
    name: string,
    key: string | string[],
    options: { unique: boolean },
  ): void
  getAll(): Request<unknown[]>
}
type Database = {
  version: number
  close(): void
  createObjectStore(name: string, options: { keyPath: string }): Store
  transaction(
    names: string[],
    mode?: 'readwrite',
  ): {
    objectStore(name: string): Store
    oncomplete: (() => void) | null
    onerror: (() => void) | null
    error: unknown
  }
}
type Factory = {
  open(
    name: string,
    version?: number,
  ): Request<Database> & { onupgradeneeded: (() => void) | null }
}

test('a v1 legacy demo retains selected club, journal and finances through upgrade and reload', async ({
  page,
}) => {
  const campaign = {
    id: 'demo',
    name: 'Legacy demo',
    kind: 'fictional',
    seed: 'legacy-browser-test',
    generatorVersion: '1',
    managedClubId: 'club-a',
    activeSeasonId: 'season-a',
    currency: 'EUR',
    createdAt: '2026-10-19T00:00:00.000Z',
    updatedAt: '2026-10-19T00:00:00.000Z',
    revision: 0,
    status: 'active',
  }
  const clubA = {
    id: 'club-a',
    campaignId: campaign.id,
    leagueId: null,
    name: 'Riverside Athletic',
    shortName: 'RIV',
    colors: { primary: '#113355', secondary: '#D4A017' },
    prestige: 40,
    academyTier: 3,
    scoutingRegion: null,
  }
  const seasonA = {
    id: 'season-a',
    campaignId: campaign.id,
    label: 'Season 1',
    ordinal: 1,
    status: 'active',
    startDate: '2026-10-19',
    endDate: null,
    openedAt: campaign.createdAt,
    closedAt: null,
  }
  const rows = {
    campaigns: [campaign],
    clubs: [{ ...clubA, campaignId: campaign.id }],
    seasons: [{ ...seasonA, campaignId: campaign.id }],
    ledgerEntries: [
      {
        id: 'ledger-a',
        campaignId: campaign.id,
        seasonId: seasonA.id,
        clubId: clubA.id,
        kind: 'initial_allocation',
        amountCents: 1_500_000,
        effectiveOn: '2026-10-19',
        sourceActionId: 'opening',
        reversesEntryId: null,
        note: null,
      },
    ],
    auditEvents: [
      {
        id: 'audit-a',
        campaignId: campaign.id,
        seasonId: seasonA.id,
        actionId: 'selected',
        actionType: 'campaign.select-club',
        createdAt: campaign.createdAt,
        summary: 'Selected Riverside Athletic',
        payload: {},
      },
    ],
    matchRecords: [
      {
        id: 'match-a',
        campaignId: campaign.id,
        seasonId: seasonA.id,
        date: '2026-10-19',
        opponent: 'Calder Reserve',
        homeAway: 'home',
        goalsFor: 2,
        goalsAgainst: 1,
        competition: null,
        notes: null,
        xgFor: null,
        xgAgainst: null,
      },
    ],
  }
  // Set up an isolated origin before loading app code; never edit a user save.
  await page.route('**/migration-setup', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Migration fixture</title>',
    }),
  )
  await page.goto('/migration-setup')
  await page.evaluate(
    async ({ schema, rows }) => {
      const factory = (globalThis as unknown as { indexedDB: Factory })
        .indexedDB
      const request = factory.open('touchline-os', 10)
      request.onupgradeneeded = () => {
        for (const [name, declaration] of Object.entries(schema)) {
          const [primary, ...indexes] = declaration.split(', ')
          const store = request.result.createObjectStore(name, {
            keyPath: primary!,
          })
          for (const index of indexes) {
            const key = index.replace(/^&/, '')
            store.createIndex(
              key,
              key.startsWith('[') ? key.slice(1, -1).split('+') : key,
              { unique: index.startsWith('&') },
            )
          }
        }
      }
      const database = await new Promise<Database>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(
            Object.keys(rows),
            'readwrite',
          )
          transaction.oncomplete = () => resolve()
          transaction.onerror = () => reject(transaction.error)
          for (const [table, values] of Object.entries(rows))
            for (const row of values) transaction.objectStore(table).add(row)
        })
      } finally {
        database.close()
      }
    },
    { schema: schemaV1, rows },
  )

  await page.goto('/app/demo/command-center')
  await expect(
    page.getByRole('heading', { level: 2, name: clubA.name }),
  ).toBeVisible()
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('link', { name: 'Match Journal', exact: true }).click()
    const journal = page.getByRole('list', { name: 'Recorded matches' })
    await expect(journal).toContainText('Calder Reserve')
    await expect(journal).toContainText('2–1')
    await page.getByRole('link', { name: 'Finance', exact: true }).click()
    await expect(
      page.getByText('€15,000.00', { exact: true }).first(),
    ).toBeVisible()
    await page.reload()
    await expect(
      page.getByText('€15,000.00', { exact: true }).first(),
    ).toBeVisible()
    await page.goto('/app/demo/command-center')
    await expect(
      page.getByRole('heading', { level: 2, name: clubA.name }),
    ).toBeVisible()
  }
  const persisted = await page.evaluate(async () => {
    const request = (
      globalThis as unknown as { indexedDB: Factory }
    ).indexedDB.open('touchline-os')
    const database = await new Promise<Database>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const names = [
        'campaigns',
        'matchRecords',
        'ledgerEntries',
        'simulationStates',
        'clubSimulationStates',
        'playerSimulationStates',
        'simulationReceipts',
      ]
      const rows = await Promise.all(
        names.map(
          (name) =>
            new Promise<unknown[]>((resolve, reject) => {
              const query = database
                .transaction([name])
                .objectStore(name)
                .getAll()
              query.onsuccess = () => resolve(query.result)
              query.onerror = () => reject(query.error)
            }),
        ),
      )
      return {
        version: database.version,
        rows: Object.fromEntries(
          names.map((name, index) => [name, rows[index]]),
        ),
      }
    } finally {
      database.close()
    }
  })
  expect(persisted.version).toBe(20)
  expect(persisted.rows.campaigns).toEqual([
    { ...campaign, mode: 'legacy', rulesMode: 'sandbox' },
  ])
  expect(persisted.rows.matchRecords).toEqual(rows.matchRecords)
  expect(persisted.rows.ledgerEntries).toEqual(rows.ledgerEntries)
  for (const name of [
    'simulationStates',
    'clubSimulationStates',
    'playerSimulationStates',
    'simulationReceipts',
  ])
    expect(persisted.rows[name]).toEqual([])
})
