import { afterEach, describe, expect, it, vi } from 'vitest'
import { acceptOffer } from '../data/commands/accept-offer'
import { addPlayer } from '../data/commands/add-player'
import { createCampaign } from '../data/commands/create-campaign'
import { recordOffer } from '../data/commands/record-offer'
import { recordTransfer } from '../data/commands/record-transfer'
import { rejectOffer } from '../data/commands/reject-offer'
import { saveContract } from '../data/commands/save-contract'
import { saveLineup } from '../data/commands/save-lineup'
import { saveRegistration } from '../data/commands/save-registration'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { listAuditEvents } from '../data/repositories/audit-events'
import { getCampaign } from '../data/repositories/campaigns'
import { getClub, insertClub } from '../data/repositories/clubs'
import { getActiveConstitution } from '../data/repositories/constitutions'
import {
  insertContract,
  listContractsByClub,
} from '../data/repositories/contracts'
import { listLedgerEntries } from '../data/repositories/ledger-entries'
import { listOffers } from '../data/repositories/offers'
import { getPlayer } from '../data/repositories/players'
import { listRegistrations } from '../data/repositories/registrations'
import * as transferRepository from '../data/repositories/transfers'
import { transferCapacity } from '../domain/finance/capacity'
import { formatMoneyEuros } from '../domain/models/money'
import { offerQualifies } from '../domain/rules/qualify-offer'
import {
  clubSchema,
  contractSchema,
  entityIdSchema,
} from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'

const now = '2026-10-19T00:00:00.000Z'
const date = '2026-10-19'
const databaseName = 'touchline-os-test'
const database = () => getDatabase(databaseName)
const id = entityIdSchema.parse

afterEach(async () => {
  await deleteDatabaseForTests(databaseName)
})

function savedRevision(result: {
  ok: boolean
  revision?: number
  message?: string
}): number {
  expect(result.ok).toBe(true)
  if (!result.ok || result.revision === undefined)
    throw new Error(result.message ?? 'command')
  return result.revision
}

async function add(
  revision: number,
  playerId: string,
  clubId: string | null,
  name: string,
  marketValueCents: number | null,
): Promise<number> {
  return savedRevision(
    await addPlayer(database(), {
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
      marketValueCents,
      attributes: { passing: 70 },
      potential: null,
      source: 'fictional',
      externalSourceId: null,
      isNewgen: false,
    }),
  )
}

function transferInput(revision: number, fields: Record<string, unknown> = {}) {
  return {
    campaignId: 'campaign-a',
    expectedRevision: revision,
    now,
    seasonId: 'season-a',
    playerId: 'player-away',
    effectiveOn: date,
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

describe('market workflows', () => {
  it('controlled market workflows', async () => {
    const created = await createCampaign(database(), {
      ...harborInput,
      preset: 'balanced',
      constitutionId: 'constitution-a',
      constitutionActionId: 'action-constitution',
      ledgerEntryId: 'opening',
    })
    const campaignRevision = savedRevision(created)
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
        prestige: 80,
        academyTier: 2,
        scoutingRegion: null,
      }),
    )
    const home = await add(
      campaignRevision,
      'player-home',
      'club-a',
      'Mara Hale',
      10_000_000,
    )
    const away = await add(home, 'player-away', 'club-b', 'Owen Pike', null)
    const withFreeAgent = await add(
      away,
      'player-free',
      null,
      'Nia Shore',
      10_000_000,
    )
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
    const revision = savedRevision(
      await saveLineup(database(), {
        campaignId: 'campaign-a',
        lineupId: 'lineup-a',
        seasonId: 'season-a',
        expectedRevision: withFreeAgent,
        now,
        auditEventId: 'audit-lineup',
        actionId: 'action-lineup',
        name: 'First',
        formation: '4-3-3',
        starters: [{ playerId: 'player-home', slot: 'gk', role: null }],
        benchPlayerIds: [],
      }),
    )
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

    const ledger = await database().ledgerEntries.count()
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
    const soldRevision = savedRevision(sold)
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
    expect(
      (await getPlayer(database(), id('campaign-a'), id('player-home')))
        ?.clubId,
    ).toBe('club-b')
    expect((await database().contracts.get(id('contract-home')))?.status).toBe(
      'ended',
    )
    const lineup = await database().lineups.get(id('lineup-a'))
    expect(lineup?.starters.map((starter) => starter.playerId)).not.toContain(
      'player-home',
    )
    expect(lineup?.benchPlayerIds).not.toContain('player-home')

    const bought = savedRevision(
      await recordTransfer(database(), transferInput(soldRevision)),
    )
    expect(
      (await database().ledgerEntries.toArray()).filter(
        (entry) => entry.kind === 'incoming_fee',
      ),
    ).toHaveLength(1)
    expect(
      await recordTransfer(database(), transferInput(soldRevision)),
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

    const signed = savedRevision(
      await recordTransfer(
        database(),
        transferInput(bought, {
          playerId: 'player-free',
          direction: 'free-in',
          feeCents: 0,
          ledgerEntryId: null,
          transferId: 'transfer-free',
          contractId: 'contract-free',
          auditEventId: 'audit-free',
          actionId: 'action-free',
        }),
      ),
    )
    const constitution = await getActiveConstitution(
      database(),
      id('campaign-a'),
    )
    const rule = constitution?.rules.find(
      (item) => item.id === 'PRESTIGE_BID_SALE',
    )
    const seller = await getClub(database(), id('campaign-a'), id('club-a'))
    const bidder = await getClub(database(), id('campaign-a'), id('club-b'))
    const offeredPlayer = await getPlayer(
      database(),
      id('campaign-a'),
      id('player-free'),
    )
    if (!rule || rule.id !== 'PRESTIGE_BID_SALE' || !seller || !bidder)
      throw new Error('prestige rule')
    expect(
      offerQualifies(
        { feeCents: 15_000_000 },
        offeredPlayer?.marketValueCents ?? null,
        bidder.prestige,
        seller.prestige,
        rule,
      ),
    ).toBe('qualifies')
    const offered = savedRevision(
      await recordOffer(database(), {
        campaignId: 'campaign-a',
        offerId: 'offer-a',
        seasonId: 'season-a',
        playerId: 'player-free',
        bidderClubId: 'club-b',
        feeCents: 15_000_000,
        receivedOn: date,
        expectedRevision: signed,
        now,
        auditEventId: 'audit-offer',
        actionId: 'action-offer',
      }),
    )
    expect(
      await rejectOffer(database(), {
        campaignId: 'campaign-a',
        offerId: 'offer-a',
        resolvedOn: date,
        expectedRevision: offered,
        now,
        auditEventId: 'audit-reject',
        actionId: 'action-reject',
        acknowledgedWarnings: false,
      }),
    ).toEqual({
      ok: false,
      code: 'VALIDATION',
      message:
        'This bid qualifies and cannot be rejected while the rule is on.',
    })
    expect(
      await listOffers(database(), id('campaign-a'), id('season-a')),
    ).toMatchObject([{ id: 'offer-a', status: 'open' }])
    const transferAudits = async () =>
      (await listAuditEvents(database(), id('campaign-a'))).filter(
        (audit) => audit.actionType === 'transfer.record',
      ).length
    const recordsBeforeAccept = await transferAudits()
    const accepted = savedRevision(
      await acceptOffer(database(), {
        campaignId: 'campaign-a',
        offerId: 'offer-a',
        resolvedOn: '2026-10-20',
        effectiveOn: '2026-10-20',
        expectedRevision: offered,
        now,
        transferId: 'transfer-accept',
        ledgerEntryId: 'ledger-accept',
        auditEventId: 'audit-accept',
        actionId: 'action-accept',
      }),
    )
    expect(
      await listOffers(database(), id('campaign-a'), id('season-a')),
    ).toMatchObject([{ id: 'offer-a', status: 'accepted' }])
    expect(
      (
        await transferRepository.listTransfers(
          database(),
          id('campaign-a'),
          id('season-a'),
        )
      ).filter((transfer) => transfer.id === 'transfer-accept'),
    ).toMatchObject([{ kind: 'sale', feeCents: 15_000_000 }])
    expect(
      (await listAuditEvents(database(), id('campaign-a'))).filter(
        (audit) => audit.actionType === 'offer.accept',
      ),
    ).toHaveLength(1)
    expect(await transferAudits()).toBe(recordsBeforeAccept)

    const contractsBeforeWage = await database().contracts.count()
    expect(
      await saveContract(database(), {
        campaignId: 'campaign-a',
        contractId: 'contract-key',
        playerId: 'player-away',
        expectedRevision: accepted,
        now,
        weeklyWageCents: 4_600_000,
        squadTier: 'key',
        startsOn: null,
        expiresOn: null,
        auditEventId: 'audit-key',
        actionId: 'action-key',
      }),
    ).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'The weekly wage is above the Key cap.',
    })
    expect(await database().contracts.count()).toBe(contractsBeforeWage)
    expect((await getCampaign(database(), id('campaign-a')))?.revision).toBe(
      accepted,
    )
    const contracted = savedRevision(
      await saveContract(database(), {
        campaignId: 'campaign-a',
        contractId: 'contract-rotation',
        playerId: 'player-away',
        expectedRevision: accepted,
        now,
        weeklyWageCents: 1_000_000,
        squadTier: 'rotation',
        startsOn: null,
        expiresOn: null,
        auditEventId: 'audit-rotation',
        actionId: 'action-rotation',
      }),
    )
    const activeWage = (
      await listContractsByClub(database(), id('campaign-a'), id('club-a'))
    ).find(
      (contract) =>
        contract.playerId === 'player-away' && contract.status === 'active',
    )
    if (!activeWage?.weeklyWageCents) throw new Error('wage')
    expect(formatMoneyEuros(activeWage.weeklyWageCents)).toBe('€10,000.00')

    const unknown = await saveRegistration(
      database(),
      registrationInput(contracted, ['player-away'], {
        auditEventId: 'audit-unknown-homegrown',
        actionId: 'action-unknown-homegrown',
        homegrownClub: null,
        homegrownNation: null,
      }),
    )
    expect(unknown).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Homegrown eligibility is unknown.',
    })
    expect(await database().registrations.count()).toBe(0)
    const short = await saveRegistration(
      database(),
      registrationInput(contracted, ['player-away'], {
        auditEventId: 'audit-short-homegrown',
        actionId: 'action-short-homegrown',
        homegrownClub: true,
        homegrownNation: null,
      }),
    )
    expect(short).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Homegrown players are below the minimum of 8.',
    })
    expect(await database().registrations.count()).toBe(0)

    let squadRevision = contracted
    const registeredIds = ['player-away']
    for (let index = 1; index <= 7; index += 1) {
      const playerId = `player-${index}`
      squadRevision = await add(
        squadRevision,
        playerId,
        'club-a',
        `Squad ${index}`,
        null,
      )
      registeredIds.push(playerId)
    }
    const registered = await saveRegistration(
      database(),
      registrationInput(squadRevision, registeredIds, {
        homegrownClub: true,
        homegrownNation: false,
      }),
    )
    const registeredRevision = savedRevision(registered)
    if (!registered.ok) throw new Error(registered.message)
    expect(registered.value).toEqual({ count: 8 })
    expect(
      await listRegistrations(
        database(),
        id('campaign-a'),
        id('season-a'),
        'league',
      ),
    ).toMatchObject(
      registeredIds
        .slice()
        .sort((left, right) => (left < right ? -1 : 1))
        .map((playerId) => ({
          playerId,
          status: 'registered',
          provenance: 'user-entered',
        })),
    )

    expect(
      await transferRepository.listTransfers(
        database(),
        id('campaign-b'),
        id('season-b'),
      ),
    ).toEqual([])
    expect(
      await listOffers(database(), id('campaign-b'), id('season-b')),
    ).toEqual([])
    expect(
      await listContractsByClub(database(), id('campaign-b'), id('club-c')),
    ).toEqual([])
    expect(
      await listRegistrations(
        database(),
        id('campaign-b'),
        id('season-b'),
        'league',
      ),
    ).toEqual([])

    const beforeAbort = await getCampaign(database(), id('campaign-a'))
    const clubBeforeAbort = (
      await getPlayer(database(), id('campaign-a'), id('player-home'))
    )?.clubId
    const spy = vi
      .spyOn(transferRepository, 'insertTransfer')
      .mockRejectedValue(new Error('Abort after writes'))
    try {
      expect(
        await recordTransfer(
          database(),
          transferInput(registeredRevision, {
            playerId: 'player-home',
            feeCents: 100_000_000,
            transferId: 'transfer-abort',
            ledgerEntryId: 'ledger-abort',
            contractId: 'contract-abort',
            auditEventId: 'audit-abort',
            actionId: 'action-abort',
          }),
        ),
      ).toEqual({
        ok: false,
        code: 'ABORTED',
        message: 'Command did not finish.',
      })
    } finally {
      spy.mockRestore()
    }
    expect((await getCampaign(database(), id('campaign-a')))?.revision).toBe(
      beforeAbort?.revision,
    )
    expect(
      (await getPlayer(database(), id('campaign-a'), id('player-home')))
        ?.clubId,
    ).toBe(clubBeforeAbort)
  })
})

function registrationInput(
  revision: number,
  playerIds: readonly string[],
  fields: {
    auditEventId?: string
    actionId?: string
    homegrownClub: boolean | null
    homegrownNation: boolean | null
  },
) {
  return {
    campaignId: 'campaign-a',
    seasonId: 'season-a',
    competitionKey: 'league',
    expectedRevision: revision,
    now,
    auditEventId: fields.auditEventId ?? 'audit-registration',
    actionId: fields.actionId ?? 'action-registration',
    players: playerIds.map((playerId) => ({
      playerId,
      registrationId: `reg-${playerId}`,
      status: 'registered' as const,
      homegrownClub: fields.homegrownClub,
      homegrownNation: fields.homegrownNation,
      ageExempt: null,
    })),
  }
}
