import { afterEach, expect, it } from 'vitest'
import { deleteDatabaseForTests, getDatabase } from '../../data/db'
import { campaignA } from '../fixtures/campaign'

const databaseName = 'test-storage-environment'

afterEach(async () => {
  await deleteDatabaseForTests(databaseName)
})

it('provides IndexedDB without a DOM and deletes cached database state', async () => {
  expect(typeof window).toBe('undefined')
  expect(typeof document).toBe('undefined')
  expect(typeof indexedDB.open).toBe('function')
  const database = getDatabase(databaseName)
  await database.campaigns.add(campaignA)
  expect(await database.campaigns.count()).toBe(1)
  await deleteDatabaseForTests(databaseName)
  const reopened = getDatabase(databaseName)
  expect(reopened).not.toBe(database)
  expect(await reopened.campaigns.count()).toBe(0)
})
