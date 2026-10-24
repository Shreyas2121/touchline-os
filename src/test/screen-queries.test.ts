import { moneyCentsSchema } from '../domain/models/money'
import { dateOnlySchema } from '../domain/models/dates'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import {
  TouchlineDatabase,
  deleteDatabaseForTests,
  getDatabase,
} from '../data/db'
import { loadSquadScreen } from '../data/queries/squad-screen'
import { loadFinanceScreen } from '../data/queries/finance-screen'
import { loadTransfersScreen } from '../data/queries/transfers-screen'
import { loadCommandCenterScreen } from '../data/queries/command-center-screen'
import { loadConstitutionScreen } from '../data/queries/constitution-screen'
import { loadRegistrationScreen } from '../data/queries/registration-screen'
import { loadTacticsScreen } from '../data/queries/tactics-screen'
import { loadMatchJournalScreen } from '../data/queries/match-journal-screen'
import { loadClubChoiceScreen } from '../data/queries/club-choice-screen'
import { loadPlayerProfile } from '../data/queries/player-profile'
import { loadLineupsAtRevision } from '../data/queries/lineups'
import {
  contractSchema,
  developmentPlanSchema,
  entityIdSchema,
  leagueSchema,
  lineupSchema,
  matchRecordSchema,
  offerSchema,
  registrationSchema,
  shortlistItemSchema,
  transferSchema,
  type Campaign,
} from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'
import {
  simulationPlayer,
  simulationState,
  playerSimulationState,
} from './fixtures/simulation'

const databaseName = 'screen-query-test'
const campaignId = entityIdSchema.parse('campaign-a')
const seasonId = entityIdSchema.parse('season-a')
let writer: TouchlineDatabase | undefined

afterEach(async () => {
  writer?.close()
  writer = undefined
  await deleteDatabaseForTests(databaseName)
})

async function setup() {
  const database = getDatabase(databaseName)
  expect(
    await createCampaign(database, {
      ...harborInput,
      preset: 'balanced',
      constitutionId: 'rules-a',
      constitutionActionId: 'rules-action',
      ledgerEntryId: 'allocation-a',
    }),
  ).toMatchObject({ ok: true })
  await database.transaction('rw', database.tables, async () => {
    await database.campaigns.update(campaignId, { mode: 'standalone' })
    await database.leagues.add(
      leagueSchema.parse({
        id: 'league-a',
        campaignId,
        name: 'Old league',
        countryCode: null,
        tier: 1,
      }),
    )
    await database.players.add(simulationPlayer)
    await database.contracts.add(
      contractSchema.parse({
        id: 'contract-a',
        campaignId,
        playerId: simulationPlayer.id,
        clubId: 'club-a',
        weeklyWageCents: 100,
        squadTier: 'key',
        startsOn: null,
        expiresOn: null,
        status: 'active',
      }),
    )
    await database.lineups.add(
      lineupSchema.parse({
        id: 'lineup-a',
        campaignId,
        seasonId,
        name: 'Old lineup',
        formation: '4-3-3',
        starters: [],
        benchPlayerIds: [simulationPlayer.id],
        updatedAt: harborInput.now,
      }),
    )
    await database.offers.add(
      offerSchema.parse({
        id: 'offer-a',
        campaignId,
        seasonId,
        playerId: simulationPlayer.id,
        bidderClubId: 'club-a',
        feeCents: 100,
        status: 'open',
        receivedOn: '2026-10-19',
        resolvedOn: null,
      }),
    )
    await database.transfers.add(
      transferSchema.parse({
        id: 'transfer-a',
        campaignId,
        seasonId,
        playerId: simulationPlayer.id,
        fromClubId: null,
        toClubId: 'club-a',
        feeCents: 100,
        kind: 'purchase',
        effectiveOn: '2026-10-19',
        sourceActionId: 'transfer-action',
      }),
    )
    await database.shortlistItems.add(
      shortlistItemSchema.parse({
        id: 'shortlist-a',
        campaignId,
        playerId: simulationPlayer.id,
        priority: 1,
        status: 'open',
        notes: 'Old shortlist',
        addedAt: harborInput.now,
      }),
    )
    await database.registrations.add(
      registrationSchema.parse({
        id: 'registration-a',
        campaignId,
        seasonId,
        playerId: simulationPlayer.id,
        competitionKey: 'league',
        status: 'registered',
        homegrownClub: true,
        homegrownNation: true,
        ageExempt: false,
        provenance: 'user-entered',
      }),
    )
    await database.matchRecords.add(
      matchRecordSchema.parse({
        id: 'match-a',
        campaignId,
        seasonId,
        date: '2026-10-19',
        opponent: 'Old opponent',
        homeAway: 'home',
        goalsFor: 1,
        goalsAgainst: 0,
        competition: 'league',
        notes: null,
        xgFor: null,
        xgAgainst: null,
      }),
    )
    await database.developmentPlans.add(
      developmentPlanSchema.parse({
        id: 'plan-a',
        campaignId,
        seasonId,
        playerId: simulationPlayer.id,
        targetRole: null,
        notes: 'Old plan',
        status: 'open',
      }),
    )
    await database.simulationStates.add(simulationState)
    await database.playerSimulationStates.add(playerSimulationState)
  })
  writer = new TouchlineDatabase(databaseName)
  await writer.open()
  return { database, writer }
}

function writeNext(database: TouchlineDatabase) {
  return database.transaction('rw', database.tables, async () => {
    await database.campaigns.update(campaignId, {
      revision: 2,
      name: 'New campaign',
    })
    await database.leagues.update(entityIdSchema.parse('league-a'), {
      name: 'New league',
    })
    await database.clubs.update(entityIdSchema.parse('club-a'), {
      name: 'New club',
    })
    await database.seasons.update(seasonId, { label: 'New season' })
    await database.players.update(simulationPlayer.id, { name: 'New player' })
    await database.contracts
      .toCollection()
      .modify({ weeklyWageCents: moneyCentsSchema.parse(200) })
    await database.constitutions.toCollection().modify({ version: 2 })
    await database.ledgerEntries
      .toCollection()
      .modify({ amountCents: moneyCentsSchema.parse(200) })
    await database.lineups.toCollection().modify({ name: 'New lineup' })
    await database.offers
      .toCollection()
      .modify({ feeCents: moneyCentsSchema.parse(200) })
    await database.transfers
      .toCollection()
      .modify({ feeCents: moneyCentsSchema.parse(200) })
    await database.shortlistItems
      .toCollection()
      .modify({ notes: 'New shortlist' })
    await database.registrations
      .toCollection()
      .modify({ homegrownNation: false })
    await database.matchRecords
      .toCollection()
      .modify({ opponent: 'New opponent' })
    await database.developmentPlans.toCollection().modify({ notes: 'New plan' })
    await database.auditEvents
      .toCollection()
      .modify({ summary: 'New activity' })
    await database.simulationStates
      .toCollection()
      .modify({ currentDate: dateOnlySchema.parse('2026-07-02') })
    await database.playerSimulationStates
      .toCollection()
      .modify({ homegrownNation: false })
  })
}

const screens = [
  ['squad', loadSquadScreen],
  ['finance', loadFinanceScreen],
  ['transfers', loadTransfersScreen],
  ['command center', loadCommandCenterScreen],
  ['constitution', loadConstitutionScreen],
  ['registration', loadRegistrationScreen],
  ['tactics', loadTacticsScreen],
  ['matches', loadMatchJournalScreen],
  ['club choice', loadClubChoiceScreen],
] as const

describe('consistent browser screen queries across connections', () => {
  it.each(screens)(
    '%s returns the complete old snapshot when a write starts after its campaign read',
    async (_name, query) => {
      const { database, writer } = await setup()
      const before = await query(database, campaignId)
      let write: Promise<void> | undefined
      const overlap = (campaign: Campaign) => {
        if (campaign.id === campaignId && !write) {
          // Queue a real writer on another connection between the campaign read
          // and the dependent reads. No timer or external await enters the query.
          write = Dexie.ignoreTransaction(() => writeNext(writer))
        }
        return campaign
      }
      database.campaigns.hook('reading', overlap)
      let during
      try {
        during = await query(database, campaignId)
      } finally {
        database.campaigns.hook('reading').unsubscribe(overlap)
        await write
      }
      expect(write).toBeDefined()
      expect(during).toEqual(before)
      const after = await query(database, campaignId)
      expect(after).not.toEqual(before)
      expect(after.revision).toBe(2)
    },
  )

  it.each(screens)(
    '%s returns the complete new snapshot when a write is queued first',
    async (_name, query) => {
      const { database, writer } = await setup()
      const write = writeNext(writer)
      const read = query(database, campaignId)
      await write
      expect(await read).toEqual(await query(database, campaignId))
      expect((await read).revision).toBe(2)
    },
  )

  it.each(screens.filter(([name]) => name !== 'club choice'))(
    '%s includes missing/club-choice prerequisites in the read',
    async (_name, query) => {
      const { database } = await setup()
      expect(
        await query(database, entityIdSchema.parse('missing')),
      ).toMatchObject({ missing: true })
      await database.campaigns.update(campaignId, {
        mode: 'legacy',
        seed: 'seed',
        generatorVersion: '1',
      })
      expect(await query(database, campaignId)).toMatchObject({
        chooseClub: campaignId,
      })
    },
  )

  it('rejects profile and lineup reads belonging to an obsolete parent revision', async () => {
    const { database, writer } = await setup()
    expect(
      await loadPlayerProfile(
        database,
        campaignId,
        simulationPlayer.id,
        seasonId,
        1,
      ),
    ).toMatchObject({
      revision: 1,
      plan: { notes: 'Old plan' },
      contracts: [{ weeklyWageCents: 100 }],
    })
    expect(
      await loadLineupsAtRevision(database, campaignId, seasonId, 1),
    ).toMatchObject([{ name: 'Old lineup' }])
    await writeNext(writer)
    await expect(
      loadPlayerProfile(database, campaignId, simulationPlayer.id, seasonId, 1),
    ).rejects.toThrow('campaign changed')
    await expect(
      loadLineupsAtRevision(database, campaignId, seasonId, 1),
    ).rejects.toThrow('campaign changed')
    expect(
      await loadPlayerProfile(
        database,
        campaignId,
        simulationPlayer.id,
        seasonId,
        2,
      ),
    ).toMatchObject({
      revision: 2,
      plan: { notes: 'New plan' },
      contracts: [{ weeklyWageCents: moneyCentsSchema.parse(200) }],
    })
  })
})
