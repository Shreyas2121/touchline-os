import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { acceptOffer } from '../data/commands/accept-offer'
import { addPlayer } from '../data/commands/add-player'
import { createCampaign } from '../data/commands/create-campaign'
import { recordOffer } from '../data/commands/record-offer'
import { rejectOffer } from '../data/commands/reject-offer'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { listAuditEvents } from '../data/repositories/audit-events'
import { getCampaign } from '../data/repositories/campaigns'
import { insertClub, listClubs } from '../data/repositories/clubs'
import { getActiveConstitution } from '../data/repositories/constitutions'
import { insertContract } from '../data/repositories/contracts'
import { listLedgerEntries } from '../data/repositories/ledger-entries'
import { insertLineup } from '../data/repositories/lineups'
import { listOffers } from '../data/repositories/offers'
import { getPlayer, listPlayers } from '../data/repositories/players'
import { listTransfers } from '../data/repositories/transfers'
import {
  countUnresolvedQualifyingOffers,
  offerQualifies,
} from '../domain/rules/qualify-offer'
import {
  clubSchema,
  contractSchema,
  entityIdSchema,
  lineupSchema,
} from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'

const now = '2026-10-19T00:00:00.000Z'
const databaseName = 'touchline-os-test'
const database = () => getDatabase(databaseName)
const id = entityIdSchema.parse
const qualifyingMessage =
  'This bid qualifies and cannot be rejected while the rule is on.'

afterEach(async () => {
  cleanup()
  await deleteDatabaseForTests(databaseName)
})

async function balanced(): Promise<number> {
  const created = await createCampaign(database(), {
    ...harborInput,
    preset: 'balanced',
    constitutionId: 'constitution-a',
    constitutionActionId: 'action-constitution',
    ledgerEntryId: 'opening',
  })
  expect(created.ok).toBe(true)
  if (!created.ok) throw new Error(created.message)
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
  return created.revision
}

async function addManaged(
  revision: number,
  playerId: string,
  name: string,
  marketValueCents: number | null,
): Promise<number> {
  const added = await addPlayer(database(), {
    campaignId: 'campaign-a',
    playerId,
    expectedRevision: revision,
    now,
    auditEventId: `audit-${playerId}`,
    actionId: `action-${playerId}`,
    clubId: 'club-a',
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
  })
  expect(added.ok).toBe(true)
  if (!added.ok) throw new Error(added.message)
  return added.revision
}

async function prestigeRule() {
  const constitution = await getActiveConstitution(database(), id('campaign-a'))
  const rule = constitution?.rules.find(
    (item) => item.id === 'PRESTIGE_BID_SALE',
  )
  if (!rule) throw new Error('prestige rule')
  return rule
}

function offerInput(revision: number, fields: Record<string, unknown> = {}) {
  return {
    campaignId: 'campaign-a',
    offerId: 'offer-a',
    seasonId: 'season-a',
    playerId: 'player-home',
    bidderClubId: 'club-b',
    feeCents: 15_000_000,
    receivedOn: '2026-10-19',
    expectedRevision: revision,
    now,
    auditEventId: 'audit-offer',
    actionId: 'action-offer',
    ...fields,
  }
}

function rejectInput(revision: number, fields: Record<string, unknown> = {}) {
  return {
    campaignId: 'campaign-a',
    offerId: 'offer-a',
    resolvedOn: '2026-10-19',
    expectedRevision: revision,
    now,
    auditEventId: 'audit-reject',
    actionId: 'action-reject',
    acknowledgedWarnings: false,
    ...fields,
  }
}

function acceptInput(revision: number, fields: Record<string, unknown> = {}) {
  return {
    campaignId: 'campaign-a',
    offerId: 'offer-a',
    resolvedOn: '2026-10-20',
    effectiveOn: '2026-10-20',
    expectedRevision: revision,
    now,
    transferId: 'transfer-sale',
    ledgerEntryId: 'ledger-sale',
    auditEventId: 'audit-accept',
    actionId: 'action-accept',
    ...fields,
  }
}

describe('external transfer offers', () => {
  it('keeps a qualifying bid open and rejects a bid under the fee ratio', async () => {
    const revision = await addManaged(
      await balanced(),
      'player-home',
      'Mara Hale',
      10_000_000,
    )
    const rule = await prestigeRule()
    expect(rule).toMatchObject({
      enabled: true,
      requiredFeeNumerator: 3,
      requiredFeeDenominator: 2,
      requireHigherPrestige: true,
    })
    expect(
      offerQualifies({ feeCents: 15_000_000 }, 10_000_000, 80, 50, rule),
    ).toBe('qualifies')
    expect(
      offerQualifies({ feeCents: 15_000_000 }, 10_000_000, 50, 50, rule),
    ).toBe('does-not-qualify')
    const ledger = await database().ledgerEntries.count()
    const recorded = await recordOffer(database(), offerInput(revision))
    expect(recorded.ok).toBe(true)
    if (!recorded.ok) throw new Error(recorded.message)
    expect(
      (await listAuditEvents(database(), id('campaign-a'))).find(
        (audit) => audit.actionType === 'offer.record',
      )?.summary,
    ).toBe('Recorded offer for Mara Hale')
    expect(await database().ledgerEntries.count()).toBe(ledger)
    expect(
      (await getPlayer(database(), id('campaign-a'), id('player-home')))
        ?.clubId,
    ).toBe('club-a')
    const blocked = await rejectOffer(
      database(),
      rejectInput(recorded.revision),
    )
    expect(blocked).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: qualifyingMessage,
    })
    expect(
      await listOffers(database(), id('campaign-a'), id('season-a')),
    ).toMatchObject([
      { status: 'open', resolvedOn: null, feeCents: 15_000_000 },
    ])
    expect(
      await listTransfers(database(), id('campaign-a'), id('season-a')),
    ).toEqual([])
    expect((await getCampaign(database(), id('campaign-a')))?.revision).toBe(
      recorded.revision,
    )

    const withLow = await addManaged(
      recorded.revision,
      'player-low',
      'Nia Costa',
      10_000_000,
    )
    const recordedLow = await recordOffer(
      database(),
      offerInput(withLow, {
        offerId: 'offer-low',
        playerId: 'player-low',
        feeCents: 14_999_999,
        auditEventId: 'audit-low',
        actionId: 'action-low',
      }),
    )
    expect(recordedLow.ok).toBe(true)
    if (!recordedLow.ok) throw new Error(recordedLow.message)
    const rejected = await rejectOffer(
      database(),
      rejectInput(recordedLow.revision, {
        offerId: 'offer-low',
        auditEventId: 'audit-reject-low',
        actionId: 'action-reject-low',
      }),
    )
    expect(rejected.ok).toBe(true)
    expect(
      (await listOffers(database(), id('campaign-a'), id('season-a'))).find(
        (offer) => offer.id === 'offer-low',
      ),
    ).toMatchObject({ status: 'rejected', resolvedOn: '2026-10-19' })
    expect(
      await listTransfers(database(), id('campaign-a'), id('season-a')),
    ).toEqual([])
    expect(
      (await listAuditEvents(database(), id('campaign-a'))).find(
        (audit) => audit.actionType === 'offer.reject',
      )?.summary,
    ).toBe('Rejected offer for Nia Costa')
  })

  it('rejects an unknown valuation only after the warning is acknowledged', async () => {
    const revision = await addManaged(
      await balanced(),
      'player-home',
      'Mara Hale',
      null,
    )
    const rule = await prestigeRule()
    expect(offerQualifies({ feeCents: 15_000_000 }, null, 80, 50, rule)).toBe(
      'unknown',
    )
    const recorded = await recordOffer(database(), offerInput(revision))
    expect(recorded.ok).toBe(true)
    if (!recorded.ok) throw new Error(recorded.message)
    const blocked = await rejectOffer(
      database(),
      rejectInput(recorded.revision, { acknowledgedWarnings: false }),
    )
    expect(blocked).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Acknowledge the warning before recording.',
    })
    expect(
      await listOffers(database(), id('campaign-a'), id('season-a')),
    ).toMatchObject([{ status: 'open', resolvedOn: null }])
    expect((await getCampaign(database(), id('campaign-a')))?.revision).toBe(
      recorded.revision,
    )
    const rejected = await rejectOffer(
      database(),
      rejectInput(recorded.revision, { acknowledgedWarnings: true }),
    )
    expect(rejected.ok).toBe(true)
    expect(
      await listOffers(database(), id('campaign-a'), id('season-a')),
    ).toMatchObject([{ status: 'rejected', resolvedOn: '2026-10-19' }])
  })

  it('accepts an offer as one sale without a transfer audit', async () => {
    const revision = await addManaged(
      await balanced(),
      'player-home',
      'Mara Hale',
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
    const recorded = await recordOffer(database(), offerInput(revision))
    expect(recorded.ok).toBe(true)
    if (!recorded.ok) throw new Error(recorded.message)
    const accepted = await acceptOffer(
      database(),
      acceptInput(recorded.revision),
    )
    expect(accepted.ok).toBe(true)
    const transfers = await listTransfers(
      database(),
      id('campaign-a'),
      id('season-a'),
    )
    expect(transfers).toMatchObject([
      {
        kind: 'sale',
        feeCents: 15_000_000,
        toClubId: 'club-b',
        fromClubId: 'club-a',
        sourceActionId: 'action-accept',
      },
    ])
    expect(
      (
        await listLedgerEntries(
          database(),
          id('campaign-a'),
          id('season-a'),
          id('club-a'),
        )
      ).filter((entry) => entry.kind === 'player_sale'),
    ).toMatchObject([
      { amountCents: 15_000_000, sourceActionId: 'action-accept' },
    ])
    const offers = await listOffers(
      database(),
      id('campaign-a'),
      id('season-a'),
    )
    expect(offers).toMatchObject([
      { status: 'accepted', resolvedOn: '2026-10-20' },
    ])
    const audits = await listAuditEvents(database(), id('campaign-a'))
    expect(
      audits.filter((audit) => audit.actionType === 'offer.accept'),
    ).toMatchObject([{ summary: 'Accepted offer for Mara Hale' }])
    expect(
      audits.filter((audit) => audit.actionType === 'transfer.record'),
    ).toEqual([])
    expect(
      audits.filter((audit) => audit.actionType === 'lineup.save'),
    ).toEqual([])
    expect(
      (await getPlayer(database(), id('campaign-a'), id('player-home')))
        ?.clubId,
    ).toBe('club-b')
    expect((await database().contracts.get(id('contract-home')))?.status).toBe(
      'ended',
    )
    const lineup = await database().lineups.get(id('lineup-a'))
    expect(lineup?.starters).toEqual([])
    expect(lineup?.benchPlayerIds).toEqual([])
    const rule = await prestigeRule()
    expect(
      countUnresolvedQualifyingOffers(
        offers,
        new Map([['player-home', 10_000_000]]),
        new Map([['club-b', 80]]),
        50,
        rule,
      ),
    ).toBe(0)
  })

  it('refuses a second open offer from the same bidder', async () => {
    const revision = await addManaged(
      await balanced(),
      'player-home',
      'Mara Hale',
      10_000_000,
    )
    const recorded = await recordOffer(database(), offerInput(revision))
    expect(recorded.ok).toBe(true)
    if (!recorded.ok) throw new Error(recorded.message)
    const duplicate = await recordOffer(
      database(),
      offerInput(recorded.revision, {
        offerId: 'offer-b',
        auditEventId: 'audit-offer-b',
        actionId: 'action-offer-b',
      }),
    )
    expect(duplicate).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'That club already has an open offer for this player.',
    })
    expect(
      await listOffers(database(), id('campaign-a'), id('season-a')),
    ).toHaveLength(1)
    expect((await getCampaign(database(), id('campaign-a')))?.revision).toBe(
      recorded.revision,
    )
  })

  it('rejects a zero fee before writing an offer', async () => {
    const revision = await addManaged(
      await balanced(),
      'player-home',
      'Mara Hale',
      10_000_000,
    )
    const result = await recordOffer(
      database(),
      offerInput(revision, { feeCents: 0 }),
    )
    expect(result).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    })
    expect(
      await listOffers(database(), id('campaign-a'), id('season-a')),
    ).toEqual([])
  })

  it('counts a qualifying open offer and ignores an unknown valuation', async () => {
    let revision = await addManaged(
      await balanced(),
      'player-home',
      'Mara Hale',
      10_000_000,
    )
    revision = await addManaged(revision, 'player-unknown', 'Nia Costa', null)
    const known = await recordOffer(database(), offerInput(revision))
    expect(known.ok).toBe(true)
    if (!known.ok) throw new Error(known.message)
    const unknown = await recordOffer(
      database(),
      offerInput(known.revision, {
        offerId: 'offer-unknown',
        playerId: 'player-unknown',
        auditEventId: 'audit-unknown',
        actionId: 'action-unknown',
      }),
    )
    expect(unknown.ok).toBe(true)
    const offers = await listOffers(
      database(),
      id('campaign-a'),
      id('season-a'),
    )
    const players = await listPlayers(database(), id('campaign-a'))
    const clubs = await listClubs(database(), id('campaign-a'))
    const rule = await prestigeRule()
    expect(
      countUnresolvedQualifyingOffers(
        offers,
        new Map<string, number | null>(
          players.map((player) => [player.id, player.marketValueCents]),
        ),
        new Map<string, number | null>(
          clubs.map((club) => [club.id, club.prestige]),
        ),
        50,
        rule,
      ),
    ).toBe(1)
  })

  it('leaves a second offer open after the player has left', async () => {
    const revision = await addManaged(
      await balanced(),
      'player-home',
      'Mara Hale',
      10_000_000,
    )
    await insertClub(
      database(),
      id('campaign-a'),
      clubSchema.parse({
        id: 'club-c',
        campaignId: 'campaign-a',
        leagueId: null,
        name: 'Westmere',
        shortName: 'WES',
        colors: { primary: '#336644', secondary: '#AACC88' },
        prestige: 70,
        academyTier: 2,
        scoutingRegion: null,
      }),
    )
    const first = await recordOffer(database(), offerInput(revision))
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error(first.message)
    const second = await recordOffer(
      database(),
      offerInput(first.revision, {
        offerId: 'offer-c',
        bidderClubId: 'club-c',
        auditEventId: 'audit-offer-c',
        actionId: 'action-offer-c',
      }),
    )
    expect(second.ok).toBe(true)
    if (!second.ok) throw new Error(second.message)
    const accepted = await acceptOffer(database(), acceptInput(second.revision))
    expect(accepted.ok).toBe(true)
    if (!accepted.ok) throw new Error(accepted.message)
    const blocked = await acceptOffer(
      database(),
      acceptInput(accepted.revision, {
        offerId: 'offer-c',
        transferId: 'transfer-second',
        ledgerEntryId: 'ledger-second',
        auditEventId: 'audit-accept-c',
        actionId: 'action-accept-c',
      }),
    )
    expect(blocked).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'That player cannot take this move.',
    })
    expect(
      (await listOffers(database(), id('campaign-a'), id('season-a'))).find(
        (offer) => offer.id === 'offer-c',
      ),
    ).toMatchObject({ status: 'open', resolvedOn: null })
    expect(
      await listTransfers(database(), id('campaign-a'), id('season-a')),
    ).toHaveLength(1)
  })

  it('does not let campaign B read campaign A offers', async () => {
    const revision = await addManaged(
      await balanced(),
      'player-home',
      'Mara Hale',
      10_000_000,
    )
    const recorded = await recordOffer(database(), offerInput(revision))
    expect(recorded.ok).toBe(true)
    const other = await createCampaign(database(), {
      ...harborInput,
      campaignId: 'campaign-b',
      clubId: 'club-other',
      seasonId: 'season-b',
      auditEventId: 'audit-b',
      actionId: 'action-b',
      name: 'Other',
      clubName: 'Other Athletic',
      shortName: 'OTH',
    })
    expect(other.ok).toBe(true)
    expect(
      await listOffers(database(), id('campaign-b'), id('season-b')),
    ).toEqual([])
    expect(
      await listOffers(database(), id('campaign-a'), id('season-a')),
    ).toHaveLength(1)
  })

  it('leaves the offer open when two active contracts exist', async () => {
    const revision = await addManaged(
      await balanced(),
      'player-home',
      'Mara Hale',
      10_000_000,
    )
    for (const contractId of ['contract-1', 'contract-2']) {
      await insertContract(
        database(),
        id('campaign-a'),
        contractSchema.parse({
          id: contractId,
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
    }
    const recorded = await recordOffer(database(), offerInput(revision))
    expect(recorded.ok).toBe(true)
    if (!recorded.ok) throw new Error(recorded.message)
    const accepted = await acceptOffer(
      database(),
      acceptInput(recorded.revision),
    )
    expect(accepted).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'More than one active contract exists for this player.',
    })
    expect(
      await listOffers(database(), id('campaign-a'), id('season-a')),
    ).toMatchObject([{ status: 'open', resolvedOn: null }])
    expect(
      await listTransfers(database(), id('campaign-a'), id('season-a')),
    ).toEqual([])
    expect(
      (await getPlayer(database(), id('campaign-a'), id('player-home')))
        ?.clubId,
    ).toBe('club-a')
  })

  it('shows zero active bids before any offer on Balanced Harbor', async () => {
    await createCampaign(database(), {
      ...harborInput,
      preset: 'balanced',
      constitutionId: 'constitution-a',
      constitutionActionId: 'constitution-action-a',
      ledgerEntryId: 'opening-a',
    })
    renderAt('/app/campaign-a/command-center')
    await screen.findByRole('heading', { level: 2, name: 'Harbor Athletic' })
    const label = screen.getByText('Active bids', {
      selector: 'p',
      exact: true,
    })
    expect(label.nextElementSibling?.textContent).toBe('0')
    const ribbon = label.parentElement?.parentElement?.textContent ?? ''
    expect(ribbon).toMatch(
      /Weekly wages€0\.00Active bids0Expiring contracts0Registration0 \/ 25/,
    )
  })

  it('shows a blocked qualifying offer and keeps the row', async () => {
    const revision = await addManaged(
      await balanced(),
      'player-home',
      'Mara Hale',
      10_000_000,
    )
    const recorded = await recordOffer(database(), offerInput(revision))
    expect(recorded.ok).toBe(true)
    renderAt('/app/campaign-a/transfers')
    const offers = await screen.findByRole('region', { name: 'Offers' })
    const row = within(offers).getByRole('listitem')
    expect(row).toHaveTextContent('Mara Hale')
    expect(row).toHaveTextContent('Hilltown')
    expect(row).toHaveTextContent('€150,000.00')
    expect(row).toHaveTextContent('Blocked')
    expect(row).toHaveTextContent(qualifyingMessage)
    expect(row).toHaveTextContent(
      'Accept the bid, or change the constitution in an audited update.',
    )
    expect(
      within(offers).queryByRole('checkbox', {
        name: 'I have reviewed this warning.',
      }),
    ).toBeNull()
    expect(
      screen.getByRole('link', { name: 'Change a rule on Constitution.' }),
    ).toHaveAttribute('href', '/app/campaign-a/constitution')
    fireEvent.click(within(row).getByRole('button', { name: 'Reject offer' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      qualifyingMessage,
    )
    expect(within(offers).getByRole('listitem')).toHaveTextContent('Mara Hale')
    expect(screen.queryByText('Rejected the offer.')).toBeNull()
    await waitFor(async () => {
      expect(
        await listOffers(database(), id('campaign-a'), id('season-a')),
      ).toMatchObject([{ status: 'open', resolvedOn: null }])
    })
    expect(
      await listTransfers(database(), id('campaign-a'), id('season-a')),
    ).toEqual([])
  })
})
