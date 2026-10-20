import { afterEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { postLedgerEntry } from '../data/commands/post-ledger-entry'
import { reverseLedgerEntry } from '../data/commands/reverse-ledger-entry'
import { saveConstitution } from '../data/commands/save-constitution'
import { saveLineup } from '../data/commands/save-lineup'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { getCampaign, updateCampaign } from '../data/repositories/campaigns'
import { getActiveConstitution } from '../data/repositories/constitutions'
import {
  getLedgerEntry,
  insertLedgerEntry,
  listLedgerEntries,
} from '../data/repositories/ledger-entries'
import { getLineup } from '../data/repositories/lineups'
import { runCommand } from '../data/transactions/run-command'
import { transferCapacity } from '../domain/finance/capacity'
import { wageCommitment } from '../domain/finance/wages'
import { dateOnlySchema } from '../domain/models/dates'
import { evaluateAction } from '../domain/rules/evaluate-action'
import { constitutionPreset } from '../domain/rules/presets'
import {
  auditEventSchema,
  campaignSchema,
  contractSchema,
  entityIdSchema,
  ledgerEntrySchema,
} from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'

const databaseName = 'touchline-os-test'
const id = entityIdSchema.parse
const campaignId = id('campaign-a')
const seasonId = id('season-a')
const clubId = id('club-a')
const now = '2026-10-19T00:00:00.000Z'
const effectiveOn = dateOnlySchema.parse('2026-10-19')
const database = () => getDatabase(databaseName)
const percents = { salesReinvestmentPct: 70, prizeReinvestmentPct: 100 }
afterEach(async () => {
  await deleteDatabaseForTests(databaseName)
})
async function state() {
  return {
    campaign: await getCampaign(database(), campaignId),
    ledger: await database().ledgerEntries.toArray(),
    audits: await database().auditEvents.toArray(),
  }
}
async function capacity() {
  return transferCapacity(
    await listLedgerEntries(database(), campaignId, seasonId, clubId),
    seasonId,
    clubId,
    percents,
  )
}

describe('phase 5 exit', () => {
  it('financial policy invariants', async () => {
    const db = database()
    expect(
      await createCampaign(db, {
        ...harborInput,
        preset: 'balanced',
        constitutionId: 'constitution-a',
        constitutionActionId: 'constitution-action-a',
        ledgerEntryId: 'opening-a',
      }),
    ).toMatchObject({ ok: true, revision: 1 })
    expect(
      await createCampaign(db, {
        ...harborInput,
        campaignId: 'campaign-b',
        clubId: 'club-b',
        seasonId: 'season-b',
        auditEventId: 'audit-b',
        actionId: 'action-b',
      }),
    ).toMatchObject({ ok: true })
    expect((await capacity()).remainingCents).toBe(500_000_000)
    expect(await getActiveConstitution(db, id('campaign-b'))).toBeUndefined()

    const sale = ledgerEntrySchema.parse({
      id: 'sale-a',
      campaignId,
      seasonId,
      clubId,
      kind: 'player_sale',
      amountCents: 1_000_000_000,
      effectiveOn,
      sourceActionId: 'sale-action',
      reversesEntryId: null,
      note: null,
    })
    expect(
      await runCommand(
        db,
        [db.ledgerEntries, db.campaigns, db.auditEvents],
        { kind: 'update', campaignId, expectedRevision: 1 },
        async (revision) => {
          await insertLedgerEntry(db, campaignId, sale)
          const campaign = (await getCampaign(db, campaignId))!
          await updateCampaign(
            db,
            campaignSchema.parse({ ...campaign, revision, updatedAt: now }),
          )
          await db.auditEvents.add(
            auditEventSchema.parse({
              id: 'sale-audit',
              campaignId,
              seasonId,
              actionId: 'sale-action',
              actionType: 'ledger.post',
              createdAt: now,
              summary: 'Test sale',
              payload: { entryId: sale.id },
            }),
          )
          return sale
        },
      ),
    ).toMatchObject({ ok: true, revision: 2 })
    expect(await capacity()).toMatchObject({
      saleCreditCents: 700_000_000,
      authorizedCents: 1_200_000_000,
      remainingCents: 1_200_000_000,
    })
    const afterSale = await state()
    expect(
      await postLedgerEntry(db, {
        campaignId,
        seasonId,
        entryId: 'forbidden-sale',
        expectedRevision: 2,
        now,
        auditEventId: 'forbidden-audit',
        actionId: 'forbidden-action',
        kind: 'player_sale',
        amountCents: 1_000_000_000,
        effectiveOn,
        note: null,
      }),
    ).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await state()).toEqual(afterSale)

    const constitution = (await getActiveConstitution(db, campaignId))!
    const snapshot = {
      revision: 2,
      remainingCapacityCents: (await capacity()).remainingCents,
    }
    const signing = {
      type: 'incoming-transfer' as const,
      feeCents: 1,
      age: 27,
      isFree: false,
      weeklyWageCents: 1_000_000,
      squadTier: 'rotation' as const,
    }
    expect(
      evaluateAction(signing, snapshot, constitution, effectiveOn),
    ).toMatchObject({ allowed: false, verdicts: [{ code: 'AGE_ABOVE_CAP' }] })
    expect(
      evaluateAction(
        { ...signing, feeCents: 0, isFree: true },
        snapshot,
        constitution,
        effectiveOn,
      ),
    ).toMatchObject({ allowed: true, verdicts: [] })
    expect(
      evaluateAction(
        { type: 'wage-change', weeklyWageCents: 4_600_000, squadTier: 'key' },
        snapshot,
        constitution,
        effectiveOn,
      ),
    ).toMatchObject({
      allowed: false,
      verdicts: [{ code: 'WAGE_ABOVE_TIER_CAP' }],
    })

    const contract = contractSchema.parse({
      id: 'contract-known',
      campaignId,
      playerId: 'player-known',
      clubId,
      weeklyWageCents: 1_050,
      squadTier: 'rotation',
      startsOn: null,
      expiresOn: null,
      status: 'active',
    })
    await db.contracts.add(contract)
    const known = wageCommitment(await db.contracts.toArray(), clubId)
    await db.contracts.add(
      contractSchema.parse({
        ...contract,
        id: 'contract-unknown',
        playerId: 'player-unknown',
        weeklyWageCents: null,
      }),
    )
    expect(wageCommitment(await db.contracts.toArray(), clubId)).toMatchObject({
      knownCents: known.knownCents,
      unknownCount: 1,
    })
    expect(known.knownCents).toBe(1_050)
    expect(
      evaluateAction(
        { type: 'wage-change', weeklyWageCents: null, squadTier: 'key' },
        snapshot,
        constitution,
        effectiveOn,
      ),
    ).toMatchObject({
      allowed: false,
      verdicts: [
        { code: 'INSUFFICIENT_DATA', evidence: { weeklyWageCents: null } },
      ],
    })

    const prizeInput = {
      campaignId,
      seasonId,
      entryId: 'prize-a',
      expectedRevision: (await getCampaign(db, campaignId))!.revision,
      now,
      auditEventId: 'prize-audit',
      actionId: 'prize-action',
      kind: 'prize_income',
      amountCents: 100_000_000,
      effectiveOn,
      note: null,
    }
    expect(await postLedgerEntry(db, prizeInput)).toMatchObject({
      ok: true,
      revision: 3,
    })
    const afterPrize = await state()
    expect(
      await postLedgerEntry(db, {
        ...prizeInput,
        entryId: 'prize-stale',
        auditEventId: 'stale-audit',
        actionId: 'stale-action',
      }),
    ).toMatchObject({ ok: false, code: 'CONFLICT' })
    expect(await state()).toEqual(afterPrize)
    expect((await capacity()).prizeCreditCents).toBe(100_000_000)

    const reversalInput = {
      campaignId,
      entryId: sale.id,
      reversalId: 'sale-reversal',
      expectedRevision: 3,
      now,
      auditEventId: 'reversal-audit',
      actionId: 'reversal-action',
      note: 'Corrected test sale',
    }
    expect(await reverseLedgerEntry(db, reversalInput)).toMatchObject({
      ok: true,
      revision: 4,
    })
    const afterReversal = await state()
    const seasonOneCapacity = await capacity()
    expect(seasonOneCapacity).toMatchObject({
      saleCreditCents: 0,
      prizeCreditCents: 100_000_000,
      remainingCents: 600_000_000,
    })
    expect(
      await reverseLedgerEntry(db, {
        ...reversalInput,
        entryId: 'sale-reversal',
        reversalId: 'forbidden-reversal',
        expectedRevision: 4,
        auditEventId: 'repeated-reversal-audit',
        actionId: 'repeated-reversal-action',
      }),
    ).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'This entry cannot be reversed.',
    })
    expect(await state()).toEqual(afterReversal)

    await db.transaction('rw', db.ledgerEntries, async () => {
      await db.ledgerEntries.add(
        ledgerEntrySchema.parse({
          ...sale,
          id: 'other-season-sale',
          seasonId: 'season-other',
          sourceActionId: 'other-season-action',
        }),
      )
    })
    expect(await capacity()).toEqual(seasonOneCapacity)
    expect(
      transferCapacity(
        await db.ledgerEntries.toArray(),
        seasonId,
        clubId,
        percents,
      ),
    ).toEqual(seasonOneCapacity)
    expect(
      await listLedgerEntries(
        db,
        id('campaign-b'),
        id('season-b'),
        id('club-b'),
      ),
    ).toEqual([])
    expect(
      await listLedgerEntries(db, id('campaign-b'), seasonId, clubId),
    ).toEqual([])
    expect(await getLedgerEntry(db, id('campaign-b'), sale.id)).toBeUndefined()
    expect(await getActiveConstitution(db, id('campaign-b'))).toBeUndefined()
  })

  it('constitution adoption preserves the stored lineup', async () => {
    const db = database()
    await createCampaign(db, harborInput)
    expect(
      await saveLineup(db, {
        campaignId,
        seasonId,
        lineupId: 'lineup-a',
        expectedRevision: 1,
        now,
        auditEventId: 'lineup-audit',
        actionId: 'lineup-action',
        name: 'League XI',
        formation: '4-3-3',
        starters: [],
        benchPlayerIds: [],
      }),
    ).toMatchObject({ ok: true, revision: 2 })
    const before = await getLineup(db, campaignId, id('lineup-a'))
    expect(before).toBeDefined()
    expect(
      await saveConstitution(db, {
        campaignId,
        constitutionId: 'constitution-a',
        expectedRevision: 2,
        now,
        auditEventId: 'constitution-audit',
        actionId: 'constitution-action',
        ledgerEntryId: 'opening-a',
        effectiveOn,
        rules: constitutionPreset('balanced'),
      }),
    ).toMatchObject({ ok: true, revision: 3 })
    expect(await getLineup(db, campaignId, id('lineup-a'))).toEqual(before)
  })
})
