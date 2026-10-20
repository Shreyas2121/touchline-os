import { afterEach, describe, expect, it } from 'vitest'
import { addPlayer } from '../data/commands/add-player'
import { createCampaign } from '../data/commands/create-campaign'
import { postLedgerEntry } from '../data/commands/post-ledger-entry'
import { recordTransfer } from '../data/commands/record-transfer'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { listAuditEvents } from '../data/repositories/audit-events'
import { getCampaign } from '../data/repositories/campaigns'
import { insertClub } from '../data/repositories/clubs'
import { insertContract } from '../data/repositories/contracts'
import { listLedgerEntries } from '../data/repositories/ledger-entries'
import { insertLineup } from '../data/repositories/lineups'
import { getPlayer, updateStoredPlayer } from '../data/repositories/players'
import { insertTransfer, listTransfers } from '../data/repositories/transfers'
import { runCommand } from '../data/transactions/run-command'
import { transferCapacity } from '../domain/finance/capacity'
import {
  clubSchema,
  contractSchema,
  entityIdSchema,
  lineupSchema,
  playerSchema,
  transferSchema,
} from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'

const now = '2026-10-19T00:00:00.000Z'
const databaseName = 'touchline-os-test'
const database = () => getDatabase(databaseName)
const id = entityIdSchema.parse

afterEach(async () => {
  await deleteDatabaseForTests(databaseName)
})

async function add(
  revision: number,
  playerId: string,
  clubId: string | null,
  name: string,
): Promise<number> {
  const added = await addPlayer(database(), {
    campaignId: 'campaign-a',
    playerId,
    expectedRevision: revision,
    now,
    auditEventId: `audit-${playerId}`,
    actionId: `action-${playerId}`,
    clubId,
    name,
    positionGroup: 'MID',
    positions: ['CM'],
    nationalityCode: null,
    birthDate: '2002-01-01',
    reportedAge: null,
    ageReferenceSeasonOrdinal: null,
    marketValueCents: null,
    attributes: { passing: 70 },
    potential: null,
    source: 'fictional',
    externalSourceId: null,
    isNewgen: false,
  })
  expect(added.ok).toBe(true)
  if (!added.ok) throw new Error('player')
  return added.revision
}

async function world(): Promise<number> {
  const created = await createCampaign(database(), {
    ...harborInput,
    preset: 'balanced',
    constitutionId: 'constitution-a',
    constitutionActionId: 'action-constitution',
    ledgerEntryId: 'opening',
  })
  expect(created.ok).toBe(true)
  if (!created.ok) throw new Error('campaign')
  await insertClub(
    database(),
    id('campaign-a'),
    clubSchema.parse({
      id: 'club-b',
      campaignId: 'campaign-a',
      leagueId: null,
      name: 'Hilltown',
      shortName: 'HIL',
      colors: { primary: '#224466', secondary: '#88AACC' },
      prestige: 20,
      academyTier: 2,
      scoutingRegion: null,
    }),
  )
  const home = await add(created.revision, 'player-home', 'club-a', 'Mara Hale')
  const revision = await add(home, 'player-away', 'club-b', 'Owen Pike')
  await insertContract(
    database(),
    id('campaign-a'),
    contractSchema.parse({
      id: 'contract-home',
      campaignId: 'campaign-a',
      playerId: 'player-home',
      clubId: 'club-a',
      weeklyWageCents: 500_000,
      squadTier: 'rotation',
      startsOn: null,
      expiresOn: null,
      status: 'active',
    }),
  )
  await insertLineup(
    database(),
    id('campaign-a'),
    lineupSchema.parse({
      id: 'lineup-a',
      campaignId: 'campaign-a',
      seasonId: 'season-a',
      name: 'First',
      formation: '4-3-3',
      starters: [{ playerId: 'player-home', slot: 'gk', role: null }],
      benchPlayerIds: ['player-home'],
      updatedAt: now,
    }),
  )
  return revision
}

function transferInput(revision: number, fields: Record<string, unknown> = {}) {
  return {
    campaignId: 'campaign-a',
    expectedRevision: revision,
    now,
    seasonId: 'season-a',
    playerId: 'player-away',
    effectiveOn: '2026-10-19',
    direction: 'purchase',
    feeCents: 600_000_000,
    weeklyWageCents: 1_000_000,
    squadTier: 'rotation',
    startsOn: null,
    expiresOn: null,
    destinationClubId: null,
    transferId: 'transfer-buy',
    ledgerEntryId: 'ledger-buy',
    contractId: 'contract-buy',
    auditEventId: 'audit-buy',
    actionId: 'action-buy',
    acknowledgedWarnings: false,
    ...fields,
  }
}

describe('recordTransfer', () => {
  it('blocks an unaffordable purchase, then records the sale and the same purchase', async () => {
    const revision = await world()
    const ledger = await database().ledgerEntries.count()
    const contracts = await database().contracts.count()
    const lineupSaves = (
      await listAuditEvents(database(), id('campaign-a'))
    ).filter((audit) => audit.actionType === 'lineup.save').length
    const blocked = await recordTransfer(database(), transferInput(revision))
    expect(blocked).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'The fee is above the remaining transfer capacity.',
    })
    expect(
      (await getPlayer(database(), id('campaign-a'), id('player-away')))
        ?.clubId,
    ).toBe('club-b')
    expect(await database().ledgerEntries.count()).toBe(ledger)
    expect(await database().contracts.count()).toBe(contracts)
    expect((await getCampaign(database(), id('campaign-a')))?.revision).toBe(
      revision,
    )

    const sold = await recordTransfer(
      database(),
      transferInput(revision, {
        playerId: 'player-home',
        direction: 'sale',
        feeCents: 1_000_000_000,
        weeklyWageCents: null,
        squadTier: null,
        destinationClubId: 'club-b',
        transferId: 'transfer-sale',
        ledgerEntryId: 'ledger-sale',
        contractId: null,
        auditEventId: 'audit-sale',
        actionId: 'action-sale',
      }),
    )
    expect(sold.ok).toBe(true)
    if (!sold.ok) return
    const entries = await listLedgerEntries(
      database(),
      id('campaign-a'),
      id('season-a'),
      id('club-a'),
    )
    expect(entries.find((entry) => entry.kind === 'player_sale')).toMatchObject(
      { amountCents: 1_000_000_000 },
    )
    expect(
      transferCapacity(entries, 'season-a', 'club-a', {
        salesReinvestmentPct: 70,
        prizeReinvestmentPct: 100,
      }).saleCreditCents,
    ).toBe(700_000_000)
    const soldPlayer = await getPlayer(
      database(),
      id('campaign-a'),
      id('player-home'),
    )
    expect(soldPlayer).toMatchObject({
      clubId: 'club-b',
      source: 'fictional',
      isNewgen: false,
      marketValueCents: null,
    })
    expect((await database().contracts.get(id('contract-home')))?.status).toBe(
      'ended',
    )
    const lineup = await database().lineups.get(id('lineup-a'))
    expect(lineup?.starters).toEqual([])
    expect(lineup?.benchPlayerIds).toEqual([])
    expect(
      (await listAuditEvents(database(), id('campaign-a'))).filter(
        (audit) => audit.actionType === 'lineup.save',
      ),
    ).toHaveLength(lineupSaves)
    expect(
      (await listAuditEvents(database(), id('campaign-a'))).find(
        (audit) => audit.actionType === 'transfer.record',
      )?.summary,
    ).toBe('Recorded sale of Mara Hale for €10,000,000.00')

    const bought = await recordTransfer(
      database(),
      transferInput(sold.revision),
    )
    expect(bought.ok).toBe(true)
    const after = await listLedgerEntries(
      database(),
      id('campaign-a'),
      id('season-a'),
      id('club-a'),
    )
    expect(
      after.filter((entry) => entry.kind === 'incoming_fee'),
    ).toMatchObject([{ amountCents: 600_000_000 }])
    expect(
      (await listTransfers(database(), id('campaign-a'), id('season-a'))).find(
        (transfer) => transfer.kind === 'purchase',
      ),
    ).toMatchObject({ feeCents: 600_000_000, playerId: 'player-away' })
    expect(
      (await database().contracts.toArray()).filter(
        (contract) =>
          contract.status === 'active' && contract.clubId === 'club-a',
      ),
    ).toMatchObject([{ playerId: 'player-away' }])
    expect(
      await recordTransfer(database(), transferInput(sold.revision)),
    ).toEqual({
      ok: false,
      code: 'CONFLICT',
      message: 'Campaign revision is stale.',
    })
    expect(
      (await database().ledgerEntries.toArray()).filter(
        (entry) => entry.kind === 'incoming_fee',
      ),
    ).toHaveLength(1)

    expect(
      await createCampaign(database(), {
        ...harborInput,
        campaignId: 'campaign-b',
        clubId: 'club-c',
        seasonId: 'season-b',
        auditEventId: 'audit-b',
        actionId: 'action-b',
        name: 'Northend',
        clubName: 'Northend Town',
        shortName: 'NOR',
      }),
    ).toMatchObject({ ok: true })
    expect(
      await listTransfers(database(), id('campaign-b'), id('season-b')),
    ).toEqual([])
  })

  it('records a free signing without a fee row', async () => {
    const revision = await add(await world(), 'player-free', null, 'Nia Shore')
    const ledger = await database().ledgerEntries.count()
    const signed = await recordTransfer(
      database(),
      transferInput(revision, {
        playerId: 'player-free',
        direction: 'free-in',
        feeCents: 0,
        ledgerEntryId: null,
        transferId: 'transfer-free',
        contractId: 'contract-free',
        auditEventId: 'audit-free',
        actionId: 'action-free',
      }),
    )
    expect(signed.ok).toBe(true)
    expect(await database().ledgerEntries.count()).toBe(ledger)
    expect(await database().contracts.get(id('contract-free'))).toMatchObject({
      playerId: 'player-free',
      clubId: 'club-a',
      status: 'active',
    })
    expect(
      (await listAuditEvents(database(), id('campaign-a'))).find(
        (audit) => audit.actionId === 'action-free',
      )?.summary,
    ).toBe('Recorded free signing of Nia Shore')
  })

  it('records a free departure without a fee row', async () => {
    const revision = await world()
    const ledger = await database().ledgerEntries.count()
    const left = await recordTransfer(
      database(),
      transferInput(revision, {
        playerId: 'player-home',
        direction: 'free-out',
        feeCents: 0,
        weeklyWageCents: null,
        squadTier: null,
        ledgerEntryId: null,
        contractId: null,
        transferId: 'transfer-out',
        auditEventId: 'audit-out',
        actionId: 'action-out',
      }),
    )
    expect(left.ok).toBe(true)
    expect(await database().ledgerEntries.count()).toBe(ledger)
    expect(
      (await getPlayer(database(), id('campaign-a'), id('player-home')))
        ?.clubId,
    ).toBeNull()
    expect((await database().contracts.get(id('contract-home')))?.status).toBe(
      'ended',
    )
    expect((await database().lineups.get(id('lineup-a')))?.starters).toEqual([])
  })

  it('writes nothing when a departing player has two active contracts', async () => {
    const revision = await world()
    await insertContract(
      database(),
      id('campaign-a'),
      contractSchema.parse({
        id: 'contract-second',
        campaignId: 'campaign-a',
        playerId: 'player-home',
        clubId: 'club-a',
        weeklyWageCents: 400_000,
        squadTier: 'youth',
        startsOn: null,
        expiresOn: null,
        status: 'active',
      }),
    )
    const before = {
      clubId: (await getPlayer(database(), id('campaign-a'), id('player-home')))
        ?.clubId,
      revision: (await getCampaign(database(), id('campaign-a')))?.revision,
      ledger: await database().ledgerEntries.count(),
      transfers: await database().transfers.count(),
      audits: await database().auditEvents.count(),
    }
    expect(
      await recordTransfer(
        database(),
        transferInput(revision, {
          playerId: 'player-home',
          direction: 'sale',
          feeCents: 1_000_000_000,
          weeklyWageCents: null,
          squadTier: null,
          destinationClubId: 'club-b',
          transferId: 'transfer-sale',
          ledgerEntryId: 'ledger-sale',
          contractId: null,
          auditEventId: 'audit-sale',
          actionId: 'action-sale',
        }),
      ),
    ).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'More than one active contract exists for this player.',
    })
    expect({
      clubId: (await getPlayer(database(), id('campaign-a'), id('player-home')))
        ?.clubId,
      revision: (await getCampaign(database(), id('campaign-a')))?.revision,
      ledger: await database().ledgerEntries.count(),
      transfers: await database().transfers.count(),
      audits: await database().auditEvents.count(),
    }).toEqual(before)
    expect(
      (await database().contracts.toArray())
        .filter((contract) => contract.playerId === 'player-home')
        .map((contract) => contract.status),
    ).toEqual(['active', 'active'])
  })

  it('still refuses a public player_sale post', async () => {
    const revision = await world()
    const ledger = await database().ledgerEntries.count()
    expect(
      await postLedgerEntry(database(), {
        campaignId: 'campaign-a',
        entryId: 'entry-sale',
        seasonId: 'season-a',
        expectedRevision: revision,
        now,
        auditEventId: 'audit-post',
        actionId: 'action-post',
        kind: 'player_sale',
        amountCents: 1_000_000_000,
        effectiveOn: '2026-10-19',
        note: null,
      }),
    ).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    })
    expect(await database().ledgerEntries.count()).toBe(ledger)
  })

  it('rejects a transfer that names another campaign', async () => {
    await expect(
      insertTransfer(
        database(),
        id('campaign-b'),
        transferSchema.parse({
          id: 'transfer-foreign',
          campaignId: 'campaign-a',
          seasonId: 'season-a',
          playerId: 'player-a',
          fromClubId: 'club-a',
          toClubId: 'club-b',
          feeCents: 1,
          kind: 'sale',
          effectiveOn: '2026-10-19',
          sourceActionId: 'action-foreign',
        }),
      ),
    ).rejects.toMatchObject({ code: 'SCOPE' })
  })

  it('rolls back a club change when the command body throws', async () => {
    await world()
    const player = await getPlayer(
      database(),
      id('campaign-a'),
      id('player-home'),
    )
    const campaign = await getCampaign(database(), id('campaign-a'))
    if (!player || !campaign) throw new Error('missing')
    const aborted = await runCommand(
      database(),
      [database().players, database().campaigns],
      {
        kind: 'update',
        campaignId: id('campaign-a'),
        expectedRevision: campaign.revision,
      },
      async () => {
        await updateStoredPlayer(
          database(),
          id('campaign-a'),
          playerSchema.parse({ ...player, clubId: 'club-b' }),
        )
        throw new Error('stop')
      },
    )
    expect(aborted).toMatchObject({ ok: false, code: 'ABORTED' })
    expect(
      (await getPlayer(database(), id('campaign-a'), id('player-home')))
        ?.clubId,
    ).toBe(player.clubId)
    expect((await getCampaign(database(), id('campaign-a')))?.revision).toBe(
      campaign.revision,
    )
  })
})
