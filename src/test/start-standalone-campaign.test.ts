import { afterEach, describe, expect, it } from 'vitest'
import { addPlayer } from '../data/commands/add-player'
import { createCampaign } from '../data/commands/create-campaign'
import { postLedgerEntry } from '../data/commands/post-ledger-entry'
import { recordMatch } from '../data/commands/record-match'
import { recordOffer } from '../data/commands/record-offer'
import { resetDemoCampaign } from '../data/commands/reset-demo'
import { resetStandaloneDemo } from '../data/commands/reset-standalone-demo'
import { saveConstitution } from '../data/commands/save-constitution'
import { saveContract } from '../data/commands/save-contract'
import { selectManagedClub } from '../data/commands/select-managed-club'
import { startStandaloneCampaign } from '../data/commands/start-standalone-campaign'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { unsavedRegistrationDraft } from '../domain/player/registration-draft'
import { constitutionPreset } from '../domain/rules/presets'
import {
  PLAYABLE_CLUB_COUNT,
  PLAYABLE_LEAGUE_COUNT,
  PLAYABLE_OWNED_PLAYER_COUNT,
  PLAYABLE_PLAYER_COUNT,
} from '../domain/seed/playable-world-settings'
import { invalidStartYearMessage } from '../domain/seed/generate-playable-world'
import { matchSimulationUnavailable } from '../domain/simulation/calendar'
import {
  awaitsClubChoice,
  careerIdTaken,
  challengeRulesLocked,
  clubNotInWorld,
  contractEditUnavailable,
  legacyDemoProtected,
  managedClubFixed,
  manualLedgerUnavailable,
  negotiationUnavailable,
  onlyPlayableDemoReset,
  playerEditUnavailable,
  standaloneDemoCareer,
} from '../domain/simulation/career'
import { entityIdSchema } from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'

const databaseName = 'touchline-os-test'
const now = '2026-07-01T00:00:00.000Z'
const later = '2026-07-02T00:00:00.000Z'
const key = (value: string) => entityIdSchema.parse(value)

afterEach(async () => {
  await deleteDatabaseForTests(databaseName)
})

function careerInput(prefix: string, overrides: Record<string, unknown> = {}) {
  return {
    campaignId: prefix,
    name: 'Harbor Career',
    seed: 'career-seed',
    startYear: 2026,
    clubKey: 'club:01',
    rulesMode: 'challenge',
    preset: 'balanced',
    now,
    seasonId: `${prefix}-season`,
    clockId: `${prefix}-clock`,
    constitutionId: `${prefix}-rules`,
    allocationId: `${prefix}-allocation`,
    receiptId: `${prefix}-receipt`,
    auditEventId: `${prefix}-audit`,
    actionId: `${prefix}-action`,
    ...overrides,
  }
}

describe('standalone career access', () => {
  it('keeps club choice on legacy seeded saves only', () => {
    expect(awaitsClubChoice({ mode: 'legacy', seed: 'demo' }, [])).toBe(true)
    expect(
      awaitsClubChoice({ mode: 'legacy', seed: 'demo' }, [
        { actionType: 'campaign.select-club' },
      ]),
    ).toBe(false)
    expect(awaitsClubChoice({ mode: 'legacy', seed: null }, [])).toBe(false)
    expect(awaitsClubChoice({ mode: 'standalone', seed: 'career' }, [])).toBe(
      false,
    )
  })

  it('fills generated eligibility without treating unknown age as exempt', () => {
    expect(
      unsavedRegistrationDraft(
        { reportedAge: 19 },
        { homegrownClub: true, homegrownNation: false },
      ),
    ).toEqual({
      status: 'unknown',
      homegrownClub: true,
      homegrownNation: false,
      ageExempt: true,
    })
    expect(
      unsavedRegistrationDraft(
        { reportedAge: 24 },
        { homegrownClub: false, homegrownNation: true },
      ).ageExempt,
    ).toBe(false)
    expect(
      unsavedRegistrationDraft(
        { reportedAge: null },
        { homegrownClub: true, homegrownNation: true },
      ).ageExempt,
    ).toBeNull()
    expect(unsavedRegistrationDraft({ reportedAge: null }, undefined)).toEqual({
      status: 'unknown',
      homegrownClub: null,
      homegrownNation: null,
      ageExempt: null,
    })
  })
})

describe('start standalone campaign', () => {
  it('refuses an invalid year, the legacy demo id, and a club outside the world', async () => {
    const database = getDatabase(databaseName)
    const year = await startStandaloneCampaign(
      database,
      careerInput('early', { startYear: 1800 }),
    )
    expect(year).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: invalidStartYearMessage,
    })
    const demo = await startStandaloneCampaign(
      database,
      careerInput('demo', { name: 'Replacement' }),
    )
    expect(demo).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: legacyDemoProtected,
    })
    const club = await startStandaloneCampaign(
      database,
      careerInput('missing', { clubKey: 'club:99' }),
    )
    expect(club).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: clubNotInWorld,
    })
    expect(await database.campaigns.count()).toBe(0)
    expect(await database.players.count()).toBe(0)
    expect(await database.ledgerEntries.count()).toBe(0)
  }, 120_000)

  it('starts one July career and ignores a repeat with fresh ids', async () => {
    const database = getDatabase(databaseName)
    const legacy = await createCampaign(database, harborInput)
    expect(legacy.ok).toBe(true)
    const started = await startStandaloneCampaign(
      database,
      careerInput('career'),
    )
    expect(started.ok).toBe(true)
    if (!started.ok) return
    expect(started.revision).toBe(1)
    expect(started.value).toMatchObject({
      mode: 'standalone',
      rulesMode: 'challenge',
      seed: 'career-seed',
      generatorVersion: '2',
      revision: 1,
    })
    const season = await database.seasons.get(key('career-season'))
    expect(season).toMatchObject({
      startDate: '2026-07-01',
      endDate: '2027-06-30',
      status: 'active',
    })
    const clock = await database.simulationStates.get(key('career-clock'))
    expect(clock).toMatchObject({
      currentDate: '2026-07-01',
      phase: 'preseason',
      lastBoundaryKey: null,
      rootSeed: 'career-seed',
    })
    const careerLeagues = await database.leagues
      .where('campaignId')
      .equals('career')
      .count()
    expect(careerLeagues).toBe(PLAYABLE_LEAGUE_COUNT)
    expect(
      await database.clubs.where('campaignId').equals('career').count(),
    ).toBe(PLAYABLE_CLUB_COUNT)
    expect(
      await database.players.where('campaignId').equals('career').count(),
    ).toBe(PLAYABLE_PLAYER_COUNT)
    expect(
      await database.contracts.where('campaignId').equals('career').count(),
    ).toBe(PLAYABLE_OWNED_PLAYER_COUNT)
    const clubState = await database.clubSimulationStates
      .where('campaignId')
      .equals('career')
      .filter((state) => state.clubId === started.value.managedClubId)
      .first()
    expect(clubState?.simulationKey).toBe('club:01')
    expect(clubState?.transferBalanceCents).not.toBe(500_000_000)
    expect(clubState?.transferBalanceCents).toBeGreaterThan(0)
    const entries = await database.ledgerEntries
      .where('campaignId')
      .equals('career')
      .toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      kind: 'initial_allocation',
      amountCents: 500_000_000,
      clubId: started.value.managedClubId,
    })
    const receipts = await database.simulationReceipts
      .where('campaignId')
      .equals('career')
      .toArray()
    expect(receipts).toHaveLength(1)
    expect(receipts[0]).toMatchObject({
      operationKey: 'career:initialize',
      inputRevision: 0,
    })
    expect(receipts[0]?.outcomeRefs).toHaveLength(3)
    const audits = await database.auditEvents
      .where('campaignId')
      .equals('career')
      .toArray()
    expect(audits).toHaveLength(1)
    expect(audits[0]?.actionType).toBe('simulation.initialize')

    const repeated = await startStandaloneCampaign(
      database,
      careerInput('career', {
        now: later,
        seasonId: 'career-season-2',
        clockId: 'career-clock-2',
        constitutionId: 'career-rules-2',
        allocationId: 'career-allocation-2',
        receiptId: 'career-receipt-2',
        auditEventId: 'career-audit-2',
        actionId: 'career-action-2',
      }),
    )
    expect(repeated).toMatchObject({ ok: true, revision: 1 })
    expect(
      await database.seasons.where('campaignId').equals('career').count(),
    ).toBe(1)
    expect(await database.simulationReceipts.count()).toBe(1)
    expect(
      await database.auditEvents.where('campaignId').equals('career').count(),
    ).toBe(1)
    expect(
      await database.simulationStates.get(key('career-clock-2')),
    ).toBeUndefined()

    const conflict = await startStandaloneCampaign(
      database,
      careerInput('career', {
        startYear: 2027,
        seasonId: 'career-season-b',
        clockId: 'career-clock-b',
        constitutionId: 'career-rules-b',
        allocationId: 'career-allocation-b',
        receiptId: 'career-receipt-b',
        auditEventId: 'career-audit-b',
        actionId: 'career-action-b',
      }),
    )
    expect(conflict).toEqual({
      ok: false,
      code: 'CONFLICT',
      message: careerIdTaken,
    })
    expect(started.value.revision).toBe(1)

    const player = await database.players
      .where('campaignId')
      .equals('career')
      .first()
    expect(player).toBeDefined()
    if (!player) return
    const blockedPlayer = await addPlayer(database, {
      campaignId: 'career',
      playerId: 'extra-player',
      expectedRevision: 1,
      now,
      auditEventId: 'audit-add',
      actionId: 'action-add',
      clubId: player.clubId,
      name: 'Extra Player',
      positionGroup: player.positionGroup,
      positions: player.positions,
      nationalityCode: player.nationalityCode,
      birthDate: player.birthDate,
      reportedAge: player.reportedAge,
      ageReferenceSeasonOrdinal: player.ageReferenceSeasonOrdinal,
      marketValueCents: player.marketValueCents,
      attributes: player.attributes,
      potential: player.potential,
      source: player.source,
      externalSourceId: player.externalSourceId,
      isNewgen: player.isNewgen,
    })
    expect(blockedPlayer).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: playerEditUnavailable,
    })
    const blockedContract = await saveContract(database, {
      campaignId: 'career',
      contractId: 'contract-extra',
      playerId: player.id,
      expectedRevision: 1,
      now,
      weeklyWageCents: 100_000,
      squadTier: 'rotation',
      startsOn: '2026-07-01',
      expiresOn: '2027-06-30',
      auditEventId: 'audit-contract',
      actionId: 'action-contract',
    })
    expect(blockedContract).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: contractEditUnavailable,
    })
    const blockedOffer = await recordOffer(database, {
      campaignId: 'career',
      offerId: 'offer-1',
      seasonId: 'career-season',
      playerId: player.id,
      bidderClubId: player.clubId,
      feeCents: 100,
      receivedOn: '2026-07-01',
      expectedRevision: 1,
      now,
      auditEventId: 'audit-offer',
      actionId: 'action-offer',
    })
    expect(blockedOffer).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: negotiationUnavailable,
    })
    const blockedLedger = await postLedgerEntry(database, {
      campaignId: 'career',
      entryId: 'extra-entry',
      seasonId: 'career-season',
      expectedRevision: 1,
      now,
      auditEventId: 'audit-ledger',
      actionId: 'action-ledger',
      kind: 'prize_income',
      amountCents: 100,
      effectiveOn: '2026-07-01',
      note: null,
    })
    expect(blockedLedger).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: manualLedgerUnavailable,
    })
    const blockedRules = await saveConstitution(database, {
      campaignId: 'career',
      constitutionId: 'career-rules-next',
      expectedRevision: 1,
      now,
      auditEventId: 'audit-rules',
      actionId: 'action-rules',
      ledgerEntryId: 'career-allocation-next',
      effectiveOn: '2026-07-01',
      rules: constitutionPreset('strict'),
    })
    expect(blockedRules).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: challengeRulesLocked,
    })
    const otherClub = await database.clubSimulationStates
      .where('campaignId')
      .equals('career')
      .filter((state) => state.simulationKey === 'club:02')
      .first()
    const blockedClub = await selectManagedClub(database, {
      campaignId: 'career',
      clubId: otherClub?.clubId,
      expectedRevision: 1,
      now,
      auditEventId: 'audit-club',
      actionId: 'action-club',
    })
    expect(blockedClub).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: managedClubFixed,
    })
    const blockedMatch = await recordMatch(database, {
      campaignId: 'career',
      seasonId: 'career-season',
      matchId: 'career-match',
      date: '2026-07-01',
      opponent: 'Calder Reserve',
      homeAway: 'home',
      goalsFor: 1,
      goalsAgainst: 0,
      competition: null,
      notes: null,
      xgFor: null,
      xgAgainst: null,
      appearances: [],
      expectedRevision: 1,
      now,
      auditEventId: 'audit-match-career',
      actionId: 'action-match-career',
    })
    expect(blockedMatch).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: matchSimulationUnavailable,
    })
    expect(await database.matchRecords.count()).toBe(0)
    expect(
      await database.ledgerEntries.where('campaignId').equals('career').count(),
    ).toBe(1)
    expect(
      await database.players.where('campaignId').equals('career').count(),
    ).toBe(PLAYABLE_PLAYER_COUNT)
    const current = await database.campaigns.get(key('career'))
    expect(current?.revision).toBe(1)
    expect(current?.managedClubId).toBe(started.value.managedClubId)

    const legacyMatch = await recordMatch(database, {
      campaignId: 'campaign-a',
      seasonId: 'season-a',
      matchId: 'match-a',
      date: '2026-10-19',
      opponent: 'Calder Reserve',
      homeAway: 'home',
      goalsFor: 2,
      goalsAgainst: 1,
      competition: null,
      notes: null,
      xgFor: null,
      xgAgainst: null,
      appearances: [],
      expectedRevision: 1,
      now: '2026-10-19T00:00:00.000Z',
      auditEventId: 'audit-match',
      actionId: 'action-match',
    })
    expect(legacyMatch.ok).toBe(true)
    const harbor = await database.campaigns.get(key('campaign-a'))
    expect(harbor).toMatchObject({ mode: 'legacy', revision: 2 })
    expect(await database.matchRecords.count()).toBe(1)
  }, 90_000)

  it('lets a sandbox edit change policy without a second allocation', async () => {
    const database = getDatabase(databaseName)
    const started = await startStandaloneCampaign(
      database,
      careerInput('sand', { rulesMode: 'sandbox', name: 'Sandbox Career' }),
    )
    expect(started.ok).toBe(true)
    if (!started.ok) return
    const clubBalance = (
      await database.clubSimulationStates
        .where('[campaignId+clubId]')
        .equals(['sand', started.value.managedClubId])
        .first()
    )?.transferBalanceCents
    const constitution = await database.constitutions.get(key('sand-rules'))
    expect(constitution).toBeDefined()
    if (!constitution) return
    const rules = constitution.rules.map((rule) =>
      rule.id === 'SELL_TO_BUY' ? { ...rule, salesReinvestmentPct: 60 } : rule,
    )
    const saved = await saveConstitution(database, {
      campaignId: 'sand',
      constitutionId: 'sand-rules-2',
      expectedRevision: started.revision,
      now: later,
      auditEventId: 'sand-audit-2',
      actionId: 'sand-action-2',
      ledgerEntryId: 'sand-allocation-2',
      effectiveOn: '2026-07-01',
      rules,
    })
    expect(saved.ok).toBe(true)
    const again = await saveConstitution(database, {
      campaignId: 'sand',
      constitutionId: 'sand-rules-3',
      expectedRevision: started.revision + 1,
      now: '2026-07-03T00:00:00.000Z',
      auditEventId: 'sand-audit-3',
      actionId: 'sand-action-3',
      ledgerEntryId: 'sand-allocation-3',
      effectiveOn: '2026-07-01',
      rules: rules.map((rule) =>
        rule.id === 'SELL_TO_BUY'
          ? { ...rule, salesReinvestmentPct: 55 }
          : rule,
      ),
    })
    expect(again.ok).toBe(true)
    const entries = await database.ledgerEntries
      .where('campaignId')
      .equals('sand')
      .toArray()
    expect(entries).toHaveLength(1)
    expect(entries[0]?.amountCents).toBe(500_000_000)
    expect(
      (
        await database.clubSimulationStates
          .where('[campaignId+clubId]')
          .equals(['sand', started.value.managedClubId])
          .first()
      )?.transferBalanceCents,
    ).toBe(clubBalance)
  }, 120_000)

  it('rolls a failed save back to an empty database', async () => {
    const database = getDatabase(databaseName)
    const failed = await startStandaloneCampaign(
      database,
      careerInput('roll'),
      undefined,
      {
        afterBulkWrites() {
          throw new Error('injected')
        },
      },
    )
    expect(failed).toEqual({
      ok: false,
      code: 'ABORTED',
      message: 'Command did not finish.',
    })
    expect(await database.campaigns.count()).toBe(0)
    expect(await database.players.count()).toBe(0)
    expect(await database.contracts.count()).toBe(0)
    expect(await database.ledgerEntries.count()).toBe(0)
    expect(await database.simulationReceipts.count()).toBe(0)
    expect(await database.simulationStates.count()).toBe(0)
    expect(await database.clubSimulationStates.count()).toBe(0)
  }, 120_000)

  it('resets only the playable demo', async () => {
    const database = getDatabase(databaseName)
    const legacyReset = await resetDemoCampaign(
      database,
      {
        campaignId: 'standalone-demo',
        expectedRevision: 0,
        now,
        createAuditEventId: 'demo-audit-create',
        createActionId: 'demo-action-create',
        seedAuditEventId: 'demo-audit-seed',
        seedActionId: 'demo-action-seed',
      },
      () => undefined,
    )
    expect(legacyReset).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Only the fictional demo can be reset.',
    })
    const refused = await resetStandaloneDemo(database, {
      campaignId: 'demo',
      expectedRevision: 0,
      now,
      auditEventId: 'reset-audit',
      actionId: 'reset-action',
    })
    expect(refused).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: onlyPlayableDemoReset,
    })
    const started = await startStandaloneCampaign(database, {
      ...standaloneDemoCareer,
      now,
    })
    expect(started.ok).toBe(true)
    if (!started.ok) return
    const audit = await database.auditEvents.get(key('standalone-demo-audit'))
    expect(audit).toBeDefined()
    if (!audit) return
    await database.auditEvents.add({
      ...audit,
      id: key('standalone-demo-extra'),
      actionId: key('standalone-demo-extra-action'),
      summary: 'Temporary note',
    })
    const reset = await resetStandaloneDemo(database, {
      campaignId: 'standalone-demo',
      expectedRevision: started.revision,
      now: later,
      auditEventId: 'reset-audit-2',
      actionId: 'reset-action-2',
    })
    expect(reset.ok).toBe(true)
    if (!reset.ok) return
    expect(reset.revision).toBe(1)
    expect(
      await database.auditEvents.get(key('standalone-demo-extra')),
    ).toBeUndefined()
    expect(
      await database.auditEvents
        .where('campaignId')
        .equals('standalone-demo')
        .count(),
    ).toBe(1)
    expect(
      await database.players
        .where('campaignId')
        .equals('standalone-demo')
        .count(),
    ).toBe(PLAYABLE_PLAYER_COUNT)
    expect(await database.campaigns.get(key('demo'))).toBeUndefined()
  }, 120_000)
})
