import { describe, expect, it } from 'vitest'
import {
  commandFailureCodes,
  type CommandResult,
} from '../domain/commands/result'
import {
  appearanceSchema,
  auditEventSchema,
  campaignSchema,
  clubSchema,
  constitutionSchema,
  contractSchema,
  developmentPlanSchema,
  importReceiptSchema,
  leagueSchema,
  ledgerEntrySchema,
  lineupSchema,
  matchRecordSchema,
  offerSchema,
  playerSchema,
  registrationSchema,
  scoutingReportSchema,
  seasonSchema,
  shortlistItemSchema,
  transferSchema,
} from '../domain/validation/schemas'

const timestamp = '2026-10-19T00:00:00.000Z'
const date = '2026-10-19'

const campaign = {
  id: 'campaign-a',
  name: 'Riverside',
  kind: 'fictional',
  seed: null,
  generatorVersion: null,
  managedClubId: 'club-a',
  activeSeasonId: 'season-a',
  currency: 'EUR',
  createdAt: timestamp,
  updatedAt: timestamp,
  revision: 0,
}

const season = {
  id: 'season-a',
  campaignId: 'campaign-a',
  label: 'Season 1',
  ordinal: 1,
  status: 'active',
  startDate: date,
  endDate: null,
  openedAt: timestamp,
  closedAt: null,
}

const league = {
  id: 'league-a',
  campaignId: 'campaign-a',
  name: 'North Counties',
  countryCode: 'GB',
  tier: 1,
}

const club = {
  id: 'club-a',
  campaignId: 'campaign-a',
  leagueId: null,
  name: 'Riverside Athletic',
  shortName: 'RIV',
  colors: { primary: '#113355', secondary: '#D4A017' },
  prestige: 40,
  academyTier: 3,
  scoutingRegion: null,
}

const player = {
  id: 'player-a',
  campaignId: 'campaign-a',
  clubId: 'club-a',
  name: 'Amina Cole',
  positionGroup: 'MID',
  positions: ['CM'],
  nationalityCode: null,
  birthDate: null,
  reportedAge: 18,
  ageReferenceSeasonOrdinal: 1,
  marketValueCents: null,
  attributes: { passing: 70 },
  potential: null,
  source: 'fictional',
  externalSourceId: null,
  isNewgen: false,
}

const contract = {
  id: 'contract-a',
  campaignId: 'campaign-a',
  playerId: 'player-a',
  clubId: 'club-a',
  weeklyWageCents: null,
  squadTier: null,
  startsOn: null,
  expiresOn: null,
  status: 'active',
}

const constitution = {
  id: 'constitution-a',
  campaignId: 'campaign-a',
  version: 1,
  updatedAt: timestamp,
  rules: [
    {
      id: 'SELL_TO_BUY',
      enabled: false,
      salesReinvestmentPct: 70,
      prizeReinvestmentPct: 100,
      carryoverPct: 0,
      initialAllocationCents: 0,
    },
    {
      id: 'MAX_SIGNING_AGE',
      enabled: false,
      maxAge: 26,
      freeTransfersExempt: true,
    },
    {
      id: 'WAGE_TIER_CAP',
      enabled: false,
      keyWeeklyCapCents: 4_500_000,
      rotationWeeklyCapCents: 2_000_000,
      youthWeeklyCapCents: 500_000,
    },
    {
      id: 'PRESTIGE_BID_SALE',
      enabled: false,
      requiredFeeNumerator: 3,
      requiredFeeDenominator: 2,
      requireHigherPrestige: true,
    },
    {
      id: 'REGISTRATION_QUOTA',
      enabled: false,
      rosterLimit: 25,
      minimumHomegrown: 8,
      ageExemptionUnder: 21,
      competitionKey: 'league',
    },
  ],
}

const ledger = {
  id: 'ledger-a',
  campaignId: 'campaign-a',
  seasonId: 'season-a',
  clubId: 'club-a',
  kind: 'initial_allocation',
  amountCents: 0,
  effectiveOn: date,
  sourceActionId: 'action-a',
  reversesEntryId: null,
  note: null,
}

const transfer = {
  id: 'transfer-a',
  campaignId: 'campaign-a',
  seasonId: 'season-a',
  playerId: 'player-a',
  fromClubId: 'club-b',
  toClubId: null,
  feeCents: 0,
  kind: 'free',
  effectiveOn: date,
  sourceActionId: 'action-a',
}

const offer = {
  id: 'offer-a',
  campaignId: 'campaign-a',
  seasonId: 'season-a',
  playerId: 'player-a',
  bidderClubId: 'club-a',
  feeCents: 0,
  status: 'open',
  receivedOn: date,
  resolvedOn: null,
}

const lineup = {
  id: 'lineup-a',
  campaignId: 'campaign-a',
  seasonId: 'season-a',
  name: 'Riverside',
  formation: '4-3-3',
  starters: [{ playerId: 'player-a', slot: 'cm', role: null }],
  benchPlayerIds: [],
  updatedAt: timestamp,
}

const registration = {
  id: 'registration-a',
  campaignId: 'campaign-a',
  seasonId: 'season-a',
  playerId: 'player-a',
  competitionKey: 'league',
  status: 'unknown',
  homegrownClub: null,
  homegrownNation: null,
  ageExempt: null,
  provenance: 'user-entered',
}

const matchRecord = {
  id: 'match-a',
  campaignId: 'campaign-a',
  seasonId: 'season-a',
  date,
  opponent: 'Hilltown',
  homeAway: 'home',
  goalsFor: 0,
  goalsAgainst: 0,
  competition: null,
  notes: null,
  xgFor: null,
  xgAgainst: null,
}

const appearance = {
  id: 'appearance-a',
  campaignId: 'campaign-a',
  seasonId: 'season-a',
  matchId: 'match-a',
  playerId: 'player-a',
  minutes: 90,
  started: true,
  goals: null,
  assists: null,
  rating: null,
}

const shortlistItem = {
  id: 'shortlist-a',
  campaignId: 'campaign-a',
  playerId: 'player-a',
  priority: 1,
  status: 'open',
  notes: null,
  addedAt: timestamp,
}

const scoutingReport = {
  id: 'report-a',
  campaignId: 'campaign-a',
  playerId: 'player-a',
  seasonId: 'season-a',
  archetype: 'Box-to-Box',
  observations: '',
  confidence: 'low',
  source: 'estimated',
  createdAt: timestamp,
}

const developmentPlan = {
  id: 'plan-a',
  campaignId: 'campaign-a',
  playerId: 'player-a',
  seasonId: 'season-a',
  targetRole: null,
  notes: '',
  status: 'open',
}

const auditEvent = {
  id: 'audit-a',
  campaignId: 'campaign-a',
  seasonId: null,
  actionId: 'action-a',
  actionType: 'campaign.create',
  createdAt: timestamp,
  summary: 'Created campaign Riverside',
  payload: { name: 'Riverside' },
}

const importReceipt = {
  id: 'receipt-a',
  campaignId: null,
  sourceName: 'local.csv',
  sourceType: 'csv',
  importedAt: timestamp,
  rowCounts: { players: 0 },
  mappingVersion: '1',
  warnings: [],
  provenance: 'imported',
}

function without(value: object, key: string): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (entryKey !== key) next[entryKey] = entryValue
  }
  return next
}

describe('entity schemas', () => {
  it('parses a campaign', () => {
    expect(campaignSchema.safeParse(campaign).success).toBe(true)
  })

  it('parses a season', () => {
    expect(seasonSchema.safeParse(season).success).toBe(true)
  })

  it('parses a league', () => {
    expect(leagueSchema.safeParse(league).success).toBe(true)
  })

  it('parses a club', () => {
    expect(clubSchema.safeParse(club).success).toBe(true)
  })

  it('keeps omitted player attributes omitted', () => {
    const parsed = playerSchema.safeParse(player)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.attributes.passing).toBe(70)
    expect(parsed.data.attributes.pace).toBeUndefined()
    expect(parsed.data.marketValueCents).toBeNull()
  })

  it('parses a contract with an unknown wage', () => {
    const parsed = contractSchema.safeParse(contract)
    expect(parsed.success).toBe(true)
    if (!parsed.success) return
    expect(parsed.data.weeklyWageCents).toBeNull()
  })

  it('parses a constitution with five disabled rules', () => {
    expect(constitutionSchema.safeParse(constitution).success).toBe(true)
  })

  it('parses an opening ledger entry and a reversal', () => {
    expect(ledgerEntrySchema.safeParse(ledger).success).toBe(true)
    expect(
      ledgerEntrySchema.safeParse({
        ...ledger,
        id: 'ledger-rev',
        kind: 'reversal',
        reversesEntryId: 'ledger-a',
      }).success,
    ).toBe(true)
  })

  it('parses a free transfer', () => {
    expect(transferSchema.safeParse(transfer).success).toBe(true)
  })

  it('parses an open offer', () => {
    expect(offerSchema.safeParse(offer).success).toBe(true)
  })

  it('parses a lineup', () => {
    expect(lineupSchema.safeParse(lineup).success).toBe(true)
  })

  it('parses a registration', () => {
    expect(registrationSchema.safeParse(registration).success).toBe(true)
  })

  it('parses a match record', () => {
    expect(matchRecordSchema.safeParse(matchRecord).success).toBe(true)
  })

  it('parses an appearance', () => {
    expect(appearanceSchema.safeParse(appearance).success).toBe(true)
  })

  it('parses a shortlist item', () => {
    expect(shortlistItemSchema.safeParse(shortlistItem).success).toBe(true)
  })

  it('parses a scouting report with empty observations', () => {
    expect(scoutingReportSchema.safeParse(scoutingReport).success).toBe(true)
  })

  it('parses a development plan with empty notes', () => {
    expect(developmentPlanSchema.safeParse(developmentPlan).success).toBe(true)
  })

  it('parses an audit event', () => {
    expect(auditEventSchema.safeParse(auditEvent).success).toBe(true)
    expect(
      auditEventSchema.safeParse({ ...auditEvent, actionType: 'campaign.seed' })
        .success,
    ).toBe(true)
    expect(
      auditEventSchema.safeParse({
        ...auditEvent,
        actionType: 'campaign.unknown',
      }).success,
    ).toBe(false)
  })

  it('parses an import receipt', () => {
    expect(importReceiptSchema.safeParse(importReceipt).success).toBe(true)
  })

  it('rejects a contract that omits weeklyWageCents', () => {
    expect(
      contractSchema.safeParse(without(contract, 'weeklyWageCents')).success,
    ).toBe(false)
  })

  it('rejects a player that omits source', () => {
    expect(playerSchema.safeParse(without(player, 'source')).success).toBe(
      false,
    )
  })

  it('rejects an unknown attribute key', () => {
    expect(
      playerSchema.safeParse({
        ...player,
        attributes: { passing: 70, speed: 10 },
      }).success,
    ).toBe(false)
  })

  it('rejects a player that omits marketValueCents', () => {
    expect(
      playerSchema.safeParse(without(player, 'marketValueCents')).success,
    ).toBe(false)
  })

  it('rejects a reported age without a reference season', () => {
    expect(
      playerSchema.safeParse({
        ...player,
        reportedAge: 18,
        ageReferenceSeasonOrdinal: null,
      }).success,
    ).toBe(false)
  })

  it('rejects a reference season without a reported age', () => {
    expect(
      playerSchema.safeParse({
        ...player,
        reportedAge: null,
        ageReferenceSeasonOrdinal: 1,
      }).success,
    ).toBe(false)
  })

  it('rejects a position outside its group', () => {
    expect(
      playerSchema.safeParse({
        ...player,
        positionGroup: 'FWD',
        positions: ['CM'],
      }).success,
    ).toBe(false)
  })

  it('rejects a repeated position', () => {
    expect(
      playerSchema.safeParse({ ...player, positions: ['CM', 'CM'] }).success,
    ).toBe(false)
  })

  it('rejects a currency other than EUR', () => {
    expect(
      campaignSchema.safeParse({ ...campaign, currency: 'GBP' }).success,
    ).toBe(false)
  })

  it('rejects an unknown campaign key', () => {
    expect(
      campaignSchema.safeParse({ ...campaign, nickname: 'Riv' }).success,
    ).toBe(false)
  })

  it('rejects a lowercase country code', () => {
    expect(
      leagueSchema.safeParse({ ...league, countryCode: 'gb' }).success,
    ).toBe(false)
  })

  it('rejects a constitution missing a rule', () => {
    expect(
      constitutionSchema.safeParse({
        ...constitution,
        rules: constitution.rules.filter(
          (rule) => rule.id !== 'REGISTRATION_QUOTA',
        ),
      }).success,
    ).toBe(false)
  })

  it('rejects a constitution with a repeated rule id', () => {
    const sellToBuy = constitution.rules[0]
    expect(
      constitutionSchema.safeParse({
        ...constitution,
        rules: constitution.rules.map((rule, index) =>
          index === constitution.rules.length - 1 ? sellToBuy : rule,
        ),
      }).success,
    ).toBe(false)
  })

  it('rejects a reversal link on an opening allocation', () => {
    expect(
      ledgerEntrySchema.safeParse({
        ...ledger,
        reversesEntryId: 'ledger-a',
      }).success,
    ).toBe(false)
  })

  it('rejects a reversal without a target', () => {
    expect(
      ledgerEntrySchema.safeParse({
        ...ledger,
        id: 'ledger-rev',
        kind: 'reversal',
        reversesEntryId: null,
      }).success,
    ).toBe(false)
  })

  it('rejects a free transfer with a fee', () => {
    expect(transferSchema.safeParse({ ...transfer, feeCents: 1 }).success).toBe(
      false,
    )
  })

  it('rejects an open offer that already has a resolved date', () => {
    expect(offerSchema.safeParse({ ...offer, resolvedOn: date }).success).toBe(
      false,
    )
  })
})

describe('CommandResult', () => {
  it('lists the failure codes in order', () => {
    const failure: CommandResult<null> = {
      ok: false,
      code: 'CONFLICT',
      message: 'Stale revision',
    }
    expect(commandFailureCodes).toContain(failure.code)
    expect([...commandFailureCodes]).toEqual([
      'VALIDATION',
      'CONFLICT',
      'NOT_FOUND',
      'DUPLICATE',
      'ABORTED',
    ])
  })
})
