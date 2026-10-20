import { afterEach, describe, expect, it } from 'vitest'
import { addPlayer } from '../data/commands/add-player'
import { closeShortlistItem } from '../data/commands/close-shortlist-item'
import { createCampaign } from '../data/commands/create-campaign'
import { saveShortlistItem } from '../data/commands/save-shortlist-item'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { getCampaign } from '../data/repositories/campaigns'
import {
  listShortlist,
  insertShortlistItem,
} from '../data/repositories/shortlist'
import { runCommand } from '../data/transactions/run-command'
import {
  entityIdSchema,
  shortlistItemSchema,
} from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'

const now = '2026-10-19T00:00:00.000Z'
const databaseName = 'touchline-os-test'
const database = () => getDatabase(databaseName)
const id = entityIdSchema.parse

afterEach(async () => {
  await deleteDatabaseForTests(databaseName)
})

async function harbor(): Promise<number> {
  const created = await createCampaign(database(), harborInput)
  expect(created.ok).toBe(true)
  if (!created.ok) return 0
  const added = await addPlayer(database(), {
    campaignId: 'campaign-a',
    playerId: 'player-a',
    expectedRevision: created.revision,
    now,
    auditEventId: 'audit-player',
    actionId: 'action-player',
    clubId: 'club-a',
    name: 'Amina Cole',
    positionGroup: 'MID',
    positions: ['CM'],
    nationalityCode: null,
    birthDate: null,
    reportedAge: 21,
    ageReferenceSeasonOrdinal: 1,
    marketValueCents: null,
    attributes: { passing: 70 },
    potential: null,
    source: 'fictional',
    externalSourceId: null,
    isNewgen: false,
  })
  expect(added.ok).toBe(true)
  return added.ok ? added.revision : 0
}

function shortlistInput(revision: number, itemId = 'item-a') {
  return {
    campaignId: 'campaign-a',
    itemId,
    playerId: 'player-a',
    expectedRevision: revision,
    now,
    auditEventId: `audit-${itemId}`,
    actionId: `action-${itemId}`,
    priority: 3,
    notes: null,
    status: 'open' as const,
  }
}

describe('shortlist commands', () => {
  it('saves one row and one audit without moving the player or the ledger', async () => {
    const revision = await harbor()
    const ledger = await database().ledgerEntries.count()
    const result = await saveShortlistItem(database(), shortlistInput(revision))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.revision).toBe(revision + 1)
    expect(await listShortlist(database(), id('campaign-a'))).toHaveLength(1)
    expect((await database().players.get(id('player-a')))?.clubId).toBe(
      'club-a',
    )
    expect(await database().ledgerEntries.count()).toBe(ledger)
    expect(
      (await database().auditEvents.toArray()).some(
        (audit) =>
          audit.actionType === 'shortlist.save' &&
          audit.summary === 'Shortlisted Amina Cole',
      ),
    ).toBe(true)
  })

  it('rejects a second id for a player who is already shortlisted', async () => {
    const revision = await harbor()
    const saved = await saveShortlistItem(database(), shortlistInput(revision))
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    const again = await saveShortlistItem(
      database(),
      shortlistInput(saved.revision, 'item-b'),
    )
    expect(again).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      message: 'This player is already on the shortlist.',
    })
    expect(await database().shortlistItems.count()).toBe(1)
  })

  it('closes the stored row and keeps it', async () => {
    const revision = await harbor()
    const saved = await saveShortlistItem(database(), shortlistInput(revision))
    expect(saved.ok).toBe(true)
    if (!saved.ok) return
    const closed = await closeShortlistItem(database(), {
      campaignId: 'campaign-a',
      itemId: 'item-a',
      expectedRevision: saved.revision,
      now,
      auditEventId: 'audit-close',
      actionId: 'action-close',
    })
    expect(closed.ok).toBe(true)
    const rows = await listShortlist(database(), id('campaign-a'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('closed')
    expect(
      (await database().auditEvents.toArray()).some(
        (audit) =>
          audit.actionType === 'shortlist.close' &&
          audit.summary === 'Closed shortlist entry for Amina Cole',
      ),
    ).toBe(true)
  })

  it('returns a conflict for a stale revision and does not add a row', async () => {
    const revision = await harbor()
    const saved = await saveShortlistItem(database(), shortlistInput(revision))
    expect(saved.ok).toBe(true)
    const stale = await saveShortlistItem(
      database(),
      shortlistInput(0, 'item-stale'),
    )
    expect(stale).toMatchObject({
      ok: false,
      code: 'CONFLICT',
      message: 'Campaign revision is stale.',
    })
    expect(await database().shortlistItems.count()).toBe(1)
  })

  it('does not list another campaign shortlist row', async () => {
    const revision = await harbor()
    const saved = await saveShortlistItem(database(), shortlistInput(revision))
    expect(saved.ok).toBe(true)
    const created = await createCampaign(database(), {
      ...harborInput,
      campaignId: 'campaign-b',
      clubId: 'club-b',
      seasonId: 'season-b',
      auditEventId: 'audit-b',
      actionId: 'action-b',
      name: 'Hilltown',
      clubName: 'Hilltown',
      shortName: 'HIL',
    })
    expect(created.ok).toBe(true)
    expect(await listShortlist(database(), id('campaign-b'))).toEqual([])
    expect(await listShortlist(database(), id('campaign-a'))).toHaveLength(1)
  })

  it('rolls back a shortlist insert when the command body throws', async () => {
    await harbor()
    const campaignId = id('campaign-a')
    const revision = (await getCampaign(database(), campaignId))?.revision
    const count = await database().shortlistItems.count()
    const item = shortlistItemSchema.parse({
      id: 'item-abort',
      campaignId: 'campaign-a',
      playerId: 'player-a',
      priority: 1,
      status: 'open',
      notes: null,
      addedAt: now,
    })
    const aborted = await runCommand(
      database(),
      [database().shortlistItems, database().campaigns],
      { kind: 'update', campaignId, expectedRevision: revision ?? 0 },
      async () => {
        await insertShortlistItem(database(), campaignId, item)
        throw new Error('stop')
      },
    )
    expect(aborted).toMatchObject({ ok: false, code: 'ABORTED' })
    expect(await database().shortlistItems.count()).toBe(count)
    expect((await getCampaign(database(), campaignId))?.revision).toBe(revision)
  })
})
