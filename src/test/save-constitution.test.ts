import { afterEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { saveConstitution } from '../data/commands/save-constitution'
import { saveLineup } from '../data/commands/save-lineup'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import {
  getActiveConstitution,
  listConstitutions,
} from '../data/repositories/constitutions'
import { listLedgerEntries } from '../data/repositories/ledger-entries'
import { constitutionPreset } from '../domain/rules/presets'
import { entityIdSchema } from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'

const databaseName = 'touchline-os-test'
const id = entityIdSchema.parse
const campaignId = id('campaign-a')
const database = () => getDatabase(databaseName)
let sequence = 0
afterEach(async () => {
  await deleteDatabaseForTests(databaseName)
})
async function save(fields: Record<string, unknown> = {}) {
  sequence += 1
  return saveConstitution(database(), {
    campaignId,
    constitutionId: `constitution-${sequence}`,
    expectedRevision: (await database().campaigns.get(campaignId))!.revision,
    now: harborInput.now,
    auditEventId: `constitution-audit-${sequence}`,
    actionId: `constitution-action-${sequence}`,
    ledgerEntryId: `opening-${sequence}`,
    effectiveOn: '2026-10-19',
    rules: constitutionPreset('balanced'),
    ...fields,
  })
}
async function snapshot() {
  return {
    campaigns: await database().campaigns.toArray(),
    constitutions: await database().constitutions.toArray(),
    ledger: await database().ledgerEntries.toArray(),
    audits: await database().auditEvents.toArray(),
  }
}

describe('constitution persistence', () => {
  it('preserves the no-preset create contract', async () => {
    expect(await createCampaign(database(), harborInput)).toMatchObject({
      ok: true,
      revision: 1,
    })
    expect(await getActiveConstitution(database(), campaignId)).toBeUndefined()
    expect(await database().ledgerEntries.count()).toBe(0)
    expect(await database().auditEvents.count()).toBe(1)
  })
  it('saves successive immutable versions, posts once and increments revision once per save', async () => {
    await createCampaign(database(), harborInput)
    const first = await save()
    expect(first).toMatchObject({
      ok: true,
      revision: 2,
      value: { version: 1 },
    })
    const opening = await listLedgerEntries(
      database(),
      campaignId,
      id('season-a'),
      id('club-a'),
    )
    expect(opening).toHaveLength(1)
    expect(opening[0]).toMatchObject({
      kind: 'initial_allocation',
      amountCents: 500_000_000,
      effectiveOn: '2026-10-19',
      note: null,
    })
    const audits = (await database().auditEvents.toArray()).filter(
      (row) => row.actionType === 'constitution.save',
    )
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      summary: 'Saved constitution version 1',
      actionId: opening[0].sourceActionId,
    })
    expect(await save({ rules: constitutionPreset('strict') })).toMatchObject({
      ok: true,
      revision: 3,
      value: { version: 2 },
    })
    const versions = await listConstitutions(database(), campaignId)
    expect(versions.map((row) => row.version)).toEqual([1, 2])
    if (first.ok) expect(versions[0]).toEqual(first.value)
    expect(await database().ledgerEntries.toArray()).toEqual(opening)
    expect((await database().campaigns.get(campaignId))!.revision).toBe(3)
    expect(await database().auditEvents.count()).toBe(3)
  })
  it('stores Custom without allocation and can adopt Balanced later', async () => {
    await createCampaign(database(), harborInput)
    expect(await save({ rules: constitutionPreset('custom') })).toMatchObject({
      ok: true,
      value: { version: 1 },
    })
    expect(await database().ledgerEntries.count()).toBe(0)
    expect(await save()).toMatchObject({ ok: true, value: { version: 2 } })
    expect(await database().ledgerEntries.count()).toBe(1)
  })
  it.each([
    ['balanced', 500_000_000],
    ['strict', 200_000_000],
    ['custom', null],
  ] as const)(
    'creates %s in the original transaction at revision 1',
    async (preset, allocation) => {
      expect(
        await createCampaign(database(), {
          ...harborInput,
          preset,
          constitutionId: 'constitution-a',
          constitutionActionId: 'constitution-action',
          ledgerEntryId: 'opening',
        }),
      ).toMatchObject({ ok: true, revision: 1 })
      expect(await getActiveConstitution(database(), campaignId)).toMatchObject(
        { version: 1, rules: constitutionPreset(preset) },
      )
      const ledger = await database().ledgerEntries.toArray()
      expect(ledger).toHaveLength(allocation === null ? 0 : 1)
      if (allocation !== null)
        expect(ledger[0]).toMatchObject({
          amountCents: allocation,
          sourceActionId: 'constitution-action',
          effectiveOn: '2026-10-19',
        })
      const audits = await database().auditEvents.toArray()
      expect(audits).toHaveLength(2)
      expect(audits.map((row) => row.actionType).sort()).toEqual([
        'campaign.create',
        'constitution.save',
      ])
      expect(
        audits.find((row) => row.actionType === 'constitution.save')?.summary,
      ).toBe('Saved constitution version 1')
    },
  )
  it('rejects stale revisions and invalid rule arrays without any writes', async () => {
    await createCampaign(database(), harborInput)
    await save()
    const before = await snapshot()
    expect(await save({ expectedRevision: 1 })).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    })
    const rules = constitutionPreset('balanced')
    for (const invalid of [
      rules.slice(1),
      [...rules.slice(0, 4), rules[0]],
      rules.map((rule) =>
        rule.id === 'MAX_SIGNING_AGE' ? { ...rule, maxAge: 100 } : rule,
      ),
    ]) {
      expect(await save({ rules: invalid })).toEqual({
        ok: false,
        code: 'VALIDATION',
        message: 'Command input is not valid.',
      })
    }
    expect(await snapshot()).toEqual(before)
  })
  it('rolls back allocation and constitution if their audit collides', async () => {
    await createCampaign(database(), harborInput)
    const before = await snapshot()
    expect(await save({ auditEventId: 'audit-a' })).toMatchObject({
      ok: false,
      code: 'DUPLICATE',
    })
    expect(await snapshot()).toEqual(before)
  })
  it('requires the active season', async () => {
    await createCampaign(database(), harborInput)
    await database().seasons.delete(id('season-a'))
    const before = await snapshot()
    expect(await save()).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await snapshot()).toEqual(before)
  })
  it('requires all preset ids and rolls back the entire create on a constitution audit collision', async () => {
    expect(
      await createCampaign(database(), { ...harborInput, preset: 'balanced' }),
    ).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(
      await createCampaign(database(), {
        ...harborInput,
        preset: 'balanced',
        constitutionId: 'constitution-a',
        constitutionActionId: harborInput.auditEventId,
        ledgerEntryId: 'opening',
      }),
    ).toMatchObject({ ok: false, code: 'DUPLICATE' })
    expect(await database().campaigns.count()).toBe(0)
    expect(await database().clubs.count()).toBe(0)
    expect(await database().seasons.count()).toBe(0)
    expect(await database().constitutions.count()).toBe(0)
    expect(await database().ledgerEntries.count()).toBe(0)
    expect(await database().auditEvents.count()).toBe(0)
  })
  it('leaves an existing lineup unchanged', async () => {
    await createCampaign(database(), harborInput)
    const lineup = await saveLineup(database(), {
      campaignId,
      lineupId: 'lineup-a',
      seasonId: 'season-a',
      expectedRevision: 1,
      now: harborInput.now,
      auditEventId: 'audit-lineup',
      actionId: 'action-lineup',
      name: 'League XI',
      formation: '4-3-3',
      starters: [],
      benchPlayerIds: [],
    })
    expect(lineup.ok).toBe(true)
    const before = await database().lineups.toArray()
    expect(await save()).toMatchObject({ ok: true, revision: 3 })
    expect(await database().lineups.toArray()).toEqual(before)
  })
})
