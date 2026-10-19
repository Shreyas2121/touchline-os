import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { postLedgerEntry } from '../data/commands/post-ledger-entry'
import { reverseLedgerEntry } from '../data/commands/reverse-ledger-entry'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import {
  getActiveConstitution,
  insertConstitution,
  listConstitutions,
} from '../data/repositories/constitutions'
import { listContractsByClub } from '../data/repositories/contracts'
import {
  getLedgerEntry,
  insertLedgerEntry,
  listLedgerEntries,
} from '../data/repositories/ledger-entries'
import { runCommand } from '../data/transactions/run-command'
import { transferCapacity } from '../domain/finance/capacity'
import { constitutionPreset } from '../domain/rules/presets'
import {
  campaignSchema,
  constitutionSchema,
  contractSchema,
  entityIdSchema,
  ledgerEntrySchema,
} from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'

const databaseName = 'touchline-os-test'
const id = entityIdSchema.parse
const now = '2026-10-19T00:00:00.000Z'
const effectiveOn = '2026-10-19'
const database = () => getDatabase(databaseName)
let sequence = 0
function commandIds() {
  sequence += 1
  return {
    auditEventId: `ledger-audit-${sequence}`,
    actionId: `ledger-action-${sequence}`,
  }
}
async function revision(campaignId = 'campaign-a') {
  return (await database().campaigns.get(id(campaignId)))!.revision
}
async function post(fields: Record<string, unknown> = {}) {
  return postLedgerEntry(database(), {
    campaignId: 'campaign-a',
    entryId: `entry-${sequence + 1}`,
    seasonId: 'season-a',
    expectedRevision: await revision(),
    now,
    ...commandIds(),
    kind: 'initial_allocation',
    amountCents: 500_000_000,
    effectiveOn,
    note: null,
    ...fields,
  })
}
async function reverse(entryId: string, fields: Record<string, unknown> = {}) {
  return reverseLedgerEntry(database(), {
    campaignId: 'campaign-a',
    entryId,
    reversalId: `reversal-${sequence + 1}`,
    expectedRevision: await revision(),
    now,
    ...commandIds(),
    note: '  Correction  ',
    ...fields,
  })
}
async function entries(
  campaignId = 'campaign-a',
  seasonId = 'season-a',
  clubId = 'club-a',
) {
  return listLedgerEntries(database(), id(campaignId), id(seasonId), id(clubId))
}
async function snapshot() {
  return {
    campaigns: await database().campaigns.toArray(),
    ledger: await database().ledgerEntries.toArray(),
    audits: await database().auditEvents.toArray(),
  }
}
function ledger(entryId: string, fields: Record<string, unknown> = {}) {
  return ledgerEntrySchema.parse({
    id: entryId,
    campaignId: 'campaign-a',
    seasonId: 'season-a',
    clubId: 'club-a',
    kind: 'player_sale',
    amountCents: 100,
    effectiveOn,
    sourceActionId: `action-${entryId}`,
    reversesEntryId: null,
    note: null,
    ...fields,
  })
}

beforeEach(async () => {
  expect(await createCampaign(database(), harborInput)).toMatchObject({
    ok: true,
  })
})
afterEach(async () => {
  await deleteDatabaseForTests(databaseName)
})

describe('ledger commands', () => {
  it('posts one opening allocation, increments revision and records one audit', async () => {
    const previous = await revision()
    expect(
      await post({ entryId: 'opening', note: '  Initial budget  ' }),
    ).toMatchObject({
      ok: true,
      revision: previous + 1,
      value: {
        id: 'opening',
        clubId: 'club-a',
        kind: 'initial_allocation',
        amountCents: 500_000_000,
        reversesEntryId: null,
        note: 'Initial budget',
      },
    })
    expect(await revision()).toBe(previous + 1)
    const rows = await entries()
    expect(rows).toHaveLength(1)
    expect(
      await database()
        .auditEvents.where('campaignId')
        .equals('campaign-a')
        .toArray(),
    ).toMatchObject([
      { actionType: 'campaign.create' },
      {
        actionType: 'ledger.post',
        summary: 'Posted opening allocation of €5,000,000.00',
        seasonId: 'season-a',
        actionId: rows[0].sourceActionId,
      },
    ])
    const before = await snapshot()
    expect(await post()).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'An opening allocation is already posted.',
    })
    expect(await snapshot()).toEqual(before)
  })

  it.each(['player_sale', 'incoming_fee', 'approved_carryover', 'reversal'])(
    'refuses public posts of %s without writes',
    async (kind) => {
      const before = await snapshot()
      expect(await post({ kind })).toEqual({
        ok: false,
        code: 'VALIDATION',
        message: 'Command input is not valid.',
      })
      expect(await snapshot()).toEqual(before)
    },
  )

  it('allows repeated prize income and reverses a prize without changing its original row', async () => {
    expect(
      await post({
        entryId: 'prize',
        kind: 'prize_income',
        amountCents: 100_000_000,
      }),
    ).toMatchObject({ ok: true })
    expect(
      await post({
        entryId: 'other-prize',
        kind: 'prize_income',
        amountCents: 0,
      }),
    ).toMatchObject({ ok: true })
    const original = await getLedgerEntry(
      database(),
      id('campaign-a'),
      id('prize'),
    )
    const previous = await revision()
    expect(await reverse('prize', { reversalId: 'prize-rev' })).toMatchObject({
      ok: true,
      revision: previous + 1,
      value: {
        id: 'prize-rev',
        kind: 'reversal',
        amountCents: 100_000_000,
        seasonId: 'season-a',
        clubId: 'club-a',
        effectiveOn,
        reversesEntryId: 'prize',
        note: 'Correction',
      },
    })
    expect(
      await getLedgerEntry(database(), id('campaign-a'), id('prize')),
    ).toEqual(original)
    expect(
      transferCapacity(await entries(), 'season-a', 'club-a', {
        salesReinvestmentPct: 70,
        prizeReinvestmentPct: 100,
      }).prizeCreditCents,
    ).toBe(0)
    const audits = await database().auditEvents.toArray()
    expect(
      audits.filter((audit) => audit.actionType === 'ledger.reverse'),
    ).toMatchObject([
      {
        summary: 'Reversed prize income',
        payload: { entryId: 'prize', note: 'Correction' },
      },
    ])
    expect(
      audits.filter((audit) => audit.actionType === 'ledger.post')[0].summary,
    ).toBe('Posted prize income of €1,000,000.00')
    const before = await snapshot()
    for (const target of ['prize', 'prize-rev']) {
      expect(await reverse(target)).toEqual({
        ok: false,
        code: 'VALIDATION',
        message: 'This entry cannot be reversed.',
      })
      expect(await snapshot()).toEqual(before)
    }
  })

  it('allows a new opening allocation after its previous row is reversed', async () => {
    await post({ entryId: 'opening' })
    expect(await reverse('opening')).toMatchObject({ ok: true })
    expect(
      await post({ entryId: 'replacement', amountCents: 200_000_000 }),
    ).toMatchObject({ ok: true })
    expect(
      transferCapacity(await entries(), 'season-a', 'club-a', {
        salesReinvestmentPct: 70,
        prizeReinvestmentPct: 100,
      }).initialAllocationCents,
    ).toBe(200_000_000)
  })

  it('rejects stale posts and reversals without ledger, audit or revision changes', async () => {
    const stale = await revision()
    await post({ entryId: 'prize', kind: 'prize_income' })
    const before = await snapshot()
    expect(
      await post({ kind: 'prize_income', expectedRevision: stale }),
    ).toEqual({
      ok: false,
      code: 'CONFLICT',
      message: 'Campaign revision is stale.',
    })
    expect(await reverse('prize', { expectedRevision: stale })).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    })
    expect(await snapshot()).toEqual(before)
  })

  it('requires the active season and rejects missing campaigns and targets', async () => {
    const before = await snapshot()
    expect(await post({ seasonId: 'season-other' })).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Season is not the active season.',
    })
    expect(await post({ campaignId: 'missing' })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: 'Campaign not found.',
    })
    expect(await reverse('missing')).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: 'Ledger entry not found.',
    })
    expect(await snapshot()).toEqual(before)
  })

  it('isolates campaign reads and prevents reversal of another campaign’s entry', async () => {
    await post({ entryId: 'opening' })
    expect(
      await createCampaign(database(), {
        ...harborInput,
        campaignId: 'campaign-b',
        clubId: 'club-b',
        seasonId: 'season-b',
        auditEventId: 'audit-b',
        actionId: 'action-b',
      }),
    ).toMatchObject({ ok: true })
    expect(await entries('campaign-b', 'season-b', 'club-b')).toEqual([])
    expect(await entries('campaign-b', 'season-a', 'club-a')).toEqual([])
    expect(
      await getLedgerEntry(database(), id('campaign-b'), id('opening')),
    ).toBeUndefined()
    const before = await snapshot()
    expect(
      await reverse('opening', {
        campaignId: 'campaign-b',
        expectedRevision: await revision('campaign-b'),
      }),
    ).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: 'Ledger entry not found.',
    })
    expect(await snapshot()).toEqual(before)
  })

  it('rolls back ledger and revision changes if the body throws', async () => {
    const before = await snapshot()
    expect(
      await runCommand(
        database(),
        [
          database().ledgerEntries,
          database().seasons,
          database().campaigns,
          database().auditEvents,
        ],
        {
          kind: 'update',
          campaignId: id('campaign-a'),
          expectedRevision: await revision(),
        },
        async (nextRevision) => {
          await insertLedgerEntry(
            database(),
            id('campaign-a'),
            ledger('aborted'),
          )
          const campaign = (await database().campaigns.get(id('campaign-a')))!
          await database().campaigns.put(
            campaignSchema.parse({ ...campaign, revision: nextRevision }),
          )
          throw new Error('Abort after writes')
        },
      ),
    ).toEqual({
      ok: false,
      code: 'ABORTED',
      message: 'Command did not finish.',
    })
    expect(await snapshot()).toEqual(before)
  })

  it('rolls back both commands if the audit insert fails', async () => {
    const before = await snapshot()
    expect(
      await post({ entryId: 'opening', auditEventId: 'audit-a' }),
    ).toMatchObject({ ok: false, code: 'DUPLICATE' })
    expect(await snapshot()).toEqual(before)
    await post({ entryId: 'opening' })
    const saved = await snapshot()
    expect(await reverse('opening', { auditEventId: 'audit-a' })).toMatchObject(
      { ok: false, code: 'DUPLICATE' },
    )
    expect(await snapshot()).toEqual(saved)
  })

  it.each([
    { amountCents: -1 },
    { amountCents: 0.5 },
    { amountCents: '100' },
    { effectiveOn: '2026-02-30' },
    { note: '' },
    { note: '   ' },
    { note: 'x'.repeat(4_001) },
    { clubId: 'club-b' },
    { expectedRevision: -1 },
  ])('refuses invalid post input %# without writes', async (fields) => {
    const before = await snapshot()
    expect(await post(fields)).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    })
    expect(await snapshot()).toEqual(before)
  })
  it.each([null, '', '   ', 'x'.repeat(4_001), undefined])(
    'requires a valid reversal note %#',
    async (note) => {
      await post({ entryId: 'opening' })
      const before = await snapshot()
      expect(await reverse('opening', { note })).toMatchObject({
        ok: false,
        code: 'VALIDATION',
      })
      expect(await snapshot()).toEqual(before)
    },
  )
})

describe('finance repositories', () => {
  it('sorts the scoped ledger by effective date and then id and enforces insertion scope', async () => {
    for (const row of [
      ledger('z'),
      ledger('b', { effectiveOn: '2026-10-18' }),
      ledger('a'),
      ledger('other-club', { clubId: 'club-other' }),
      ledger('other-season', { seasonId: 'season-other' }),
    ])
      await insertLedgerEntry(database(), id('campaign-a'), row)
    expect((await entries()).map((row) => row.id)).toEqual(['b', 'a', 'z'])
    await expect(
      insertLedgerEntry(database(), id('campaign-b'), ledger('foreign')),
    ).rejects.toMatchObject({ code: 'SCOPE' })
  })
  it('keeps constitution versions immutable, ordered and scoped', async () => {
    expect(
      await getActiveConstitution(database(), id('campaign-a')),
    ).toBeUndefined()
    for (const version of [2, 1]) {
      await insertConstitution(
        database(),
        id('campaign-a'),
        constitutionSchema.parse({
          id: `constitution-${version}`,
          campaignId: 'campaign-a',
          version,
          updatedAt: now,
          rules: constitutionPreset('balanced'),
        }),
      )
    }
    expect(
      (await listConstitutions(database(), id('campaign-a'))).map(
        (row) => row.version,
      ),
    ).toEqual([1, 2])
    expect(
      await getActiveConstitution(database(), id('campaign-a')),
    ).toMatchObject({ version: 2 })
    expect(await listConstitutions(database(), id('campaign-b'))).toEqual([])
    const row = (await getActiveConstitution(database(), id('campaign-a')))!
    await expect(
      insertConstitution(database(), id('campaign-b'), row),
    ).rejects.toMatchObject({ code: 'SCOPE' })
    await expect(
      insertConstitution(database(), id('campaign-a'), row),
    ).rejects.toBeDefined()
    expect(
      (await listConstitutions(database(), id('campaign-a'))).map(
        (entry) => entry.version,
      ),
    ).toEqual([1, 2])
  })
  it('reads contracts only from the requested campaign and club', async () => {
    for (const [contractId, campaignId, clubId] of [
      ['a', 'campaign-a', 'club-a'],
      ['b', 'campaign-b', 'club-a'],
      ['c', 'campaign-a', 'club-b'],
    ]) {
      await database().contracts.add(
        contractSchema.parse({
          id: contractId,
          campaignId,
          clubId,
          playerId: 'player-a',
          weeklyWageCents: null,
          squadTier: null,
          startsOn: null,
          expiresOn: null,
          status: 'active',
        }),
      )
    }
    expect(
      (
        await listContractsByClub(database(), id('campaign-a'), id('club-a'))
      ).map((row) => row.id),
    ).toEqual(['a'])
  })
})
