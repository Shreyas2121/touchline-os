import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { listLedgerEntries } from '../data/repositories/ledger-entries'
import { previewAction } from '../domain/finance/preview'
import { dateOnlySchema } from '../domain/models/dates'
import { invalidMoneyMessage } from '../domain/models/money'
import { evaluateAction } from '../domain/rules/evaluate-action'
import { constitutionPreset } from '../domain/rules/presets'
import type { PolicyAction } from '../domain/rules/types'
import {
  constitutionSchema,
  entityIdSchema,
} from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'

const constitution = constitutionSchema.parse({
  id: 'constitution-a',
  campaignId: 'campaign-a',
  version: 1,
  updatedAt: harborInput.now,
  rules: constitutionPreset('balanced'),
})
const base = {
  snapshot: { revision: 4, remainingCapacityCents: 500_000_000 },
  constitution,
  effectiveDate: dateOnlySchema.parse('2026-10-19'),
  wages: { knownCents: 0, unknownCount: 0 },
}
const incoming: Extract<PolicyAction, { type: 'incoming-transfer' }> = {
  type: 'incoming-transfer',
  feeCents: 600_000_000,
  age: 24,
  isFree: false,
  weeklyWageCents: 1_000_000,
  squadTier: 'rotation',
}

describe('pure action preview', () => {
  it('explains the shortfall and returns the evaluator report unchanged', () => {
    const result = previewAction({ ...base, action: incoming })
    expect(result).toMatchObject({
      beforeCapacity: '€5,000,000.00',
      afterCapacity: 'Short by €1,000,000.00',
      beforeWages: '€0.00',
      afterWages: '€10,000.00',
      report: {
        allowed: false,
        snapshotRevision: 4,
        verdicts: [{ code: 'FEE_EXCEEDS_CAPACITY' }],
      },
    })
    expect(result.report).toEqual(
      evaluateAction(incoming, base.snapshot, constitution, base.effectiveDate),
    )
  })
  it('shows paid fees and wages without mutating its inputs', () => {
    const input = { ...base, action: { ...incoming, feeCents: 100_000_000 } }
    const before = structuredClone(input)
    expect(previewAction(input)).toEqual({
      report: { allowed: true, verdicts: [], snapshotRevision: 4 },
      beforeCapacity: '€5,000,000.00',
      afterCapacity: '€4,000,000.00',
      beforeWages: '€0.00',
      afterWages: '€10,000.00',
    })
    expect(input).toEqual(before)
  })
  it('keeps null capacity unknown and formats an exactly exhausted capacity as zero', () => {
    expect(
      previewAction({
        ...base,
        action: incoming,
        snapshot: { ...base.snapshot, remainingCapacityCents: null },
      }),
    ).toMatchObject({ beforeCapacity: 'Unknown', afterCapacity: 'Unknown' })
    expect(
      previewAction({ ...base, action: { ...incoming, feeCents: 500_000_000 } })
        .afterCapacity,
    ).toBe('€0.00')
  })
  it('reports a shortfall against negative remaining capacity without creating negative money', () => {
    expect(
      previewAction({
        ...base,
        action: { ...incoming, feeCents: 100 },
        snapshot: { ...base.snapshot, remainingCapacityCents: -100 },
      }).afterCapacity,
    ).toBe('Short by €2.00')
  })
  it('leaves true free-signing capacity unchanged but charges a nonzero fee with a free flag', () => {
    expect(
      previewAction({
        ...base,
        action: { ...incoming, feeCents: 0, isFree: true, age: 27 },
      }),
    ).toMatchObject({
      afterCapacity: '€5,000,000.00',
      afterWages: '€10,000.00',
      report: { allowed: true },
    })
    expect(
      previewAction({ ...base, action: { ...incoming, isFree: true } })
        .afterCapacity,
    ).toBe('Short by €1,000,000.00')
  })
  it('preserves unknown wages and adds only the known proposed wage', () => {
    expect(
      previewAction({
        ...base,
        action: {
          type: 'wage-change',
          weeklyWageCents: null,
          squadTier: 'key',
        },
      }),
    ).toMatchObject({ afterWages: 'Unknown', afterCapacity: '€5,000,000.00' })
    expect(
      previewAction({ ...base, action: { ...incoming, weeklyWageCents: null } })
        .afterWages,
    ).toBe('Unknown')
    expect(
      previewAction({
        ...base,
        wages: { knownCents: 1_050, unknownCount: 1 },
        action: { type: 'wage-change', weeklyWageCents: 100, squadTier: 'key' },
      }),
    ).toMatchObject({
      beforeWages: '€10.50 · 1 unknown',
      afterWages: '€11.50 · 1 unknown',
    })
  })
  it.each<PolicyAction>([
    {
      type: 'reject-offer',
      feeCents: 15_000_000,
      marketValueCents: null,
      bidderPrestige: 80,
      sellerPrestige: 50,
    },
    { type: 'season-rollover', unresolvedQualifyingOffers: 1 },
  ])('$type leaves capacity and wages unchanged', (action) => {
    const result = previewAction({
      ...base,
      action,
      wages: { knownCents: 1_050, unknownCount: 1 },
    })
    expect(result.afterCapacity).toBe(result.beforeCapacity)
    expect(result.afterWages).toBe(result.beforeWages)
    if (action.type === 'reject-offer')
      expect(result.report).toMatchObject({
        allowed: true,
        verdicts: [{ severity: 'WARN' }],
      })
  })
})

const databaseName = 'touchline-os-test'
const database = () => getDatabase(databaseName)
const id = entityIdSchema.parse
afterEach(async () => {
  cleanup()
  await deleteDatabaseForTests(databaseName)
})
async function setup(prestige = 50) {
  expect(
    await createCampaign(database(), {
      ...harborInput,
      prestige,
      preset: 'balanced',
      constitutionId: 'constitution-a',
      constitutionActionId: 'constitution-action',
      ledgerEntryId: 'opening',
    }),
  ).toMatchObject({ ok: true })
  const rendered = renderAt('/app/campaign-a/finance')
  await screen.findByRole('region', { name: 'Action preview' })
  return rendered
}
async function storedState() {
  return {
    campaign: await database().campaigns.get(id('campaign-a')),
    ledger: await listLedgerEntries(
      database(),
      id('campaign-a'),
      id('season-a'),
      id('club-a'),
    ),
    transfers: await database().transfers.toArray(),
    contracts: await database().contracts.toArray(),
    audits: await database().auditEvents.toArray(),
  }
}
function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), {
    target: { value },
  })
}
function preview() {
  fireEvent.click(screen.getByRole('button', { name: 'Preview action' }))
}
function fillPaid() {
  fill('Fee', '6000000')
  fill('Age', '24')
  fill('Weekly wage', '10000')
  fill('Tier', 'rotation')
}

describe('Finance action preview', () => {
  it('previews a blocked signing without writes, focuses the explanation, and stays unrecorded after reload', async () => {
    const { unmount } = await setup()
    const before = await storedState()
    fillPaid()
    preview()
    const result = screen.getByRole('region', { name: 'Preview result' })
    expect(result).toHaveFocus()
    expect(within(result).getByText('Blocked')).toBeInTheDocument()
    expect(
      within(result).getByText(
        'The fee is above the remaining transfer capacity.',
      ),
    ).toBeInTheDocument()
    expect(
      within(result).getByText(
        'Record a completed sale, raise the allocation, or lower the fee.',
      ),
    ).toBeInTheDocument()
    expect(
      within(result).getByText('Preview only — no changes recorded.'),
    ).toBeInTheDocument()
    expect(
      within(result).getByText('Transfer capacity: Short by €1,000,000.00'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Record this action' }),
    ).toBeDisabled()
    expect(
      screen.getByText('Choose a player on Transfers to record a move.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('region', { name: 'Action preview' }).textContent,
    ).not.toContain('transfer-')
    expect(await storedState()).toEqual(before)
    expect(before.ledger).toHaveLength(1)
    unmount()
    renderAt('/app/campaign-a/finance')
    await screen.findByRole('region', { name: 'Action preview' })
    expect(screen.queryByRole('region', { name: 'Preview result' })).toBeNull()
    expect(await storedState()).toEqual(before)
  })
  it('renders a warning for unknown value and a blocker for a qualifying offer using the managed club prestige', async () => {
    await setup()
    const before = await storedState()
    fill('Action', 'reject-offer')
    fill('Bid', '150000')
    fill('Bidder prestige', '80')
    preview()
    let result = screen.getByRole('region', { name: 'Preview result' })
    expect(within(result).getByText('Warning')).toBeInTheDocument()
    expect(
      within(result).getByText(
        'Valuation or prestige is unknown, so this bid needs a manual review.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Seller prestige')).toBeNull()
    fill('Market value', '100000')
    preview()
    result = screen.getByRole('region', { name: 'Preview result' })
    expect(within(result).getByText('Blocked')).toBeInTheDocument()
    expect(
      within(result).getByText(
        'This bid qualifies and cannot be rejected while the rule is on.',
      ),
    ).toBeInTheDocument()
    expect(await storedState()).toEqual(before)
  })
  it('does not qualify a bidder below the managed club’s stored prestige', async () => {
    await setup(90)
    fill('Action', 'reject-offer')
    fill('Bid', '150000')
    fill('Market value', '100000')
    fill('Bidder prestige', '80')
    preview()
    expect(screen.getByText('No rule blocked this action.')).toBeInTheDocument()
    expect(screen.queryByText('Blocked')).toBeNull()
  })
  it('allows an exempt free signing, hides the fee, and shows unchanged capacity', async () => {
    await setup()
    fill('Action', 'free-signing')
    fill('Age', '27')
    fill('Weekly wage', '10000')
    fill('Tier', 'rotation')
    preview()
    expect(screen.queryByLabelText('Fee', { exact: true })).toBeNull()
    expect(screen.getByText('No rule blocked this action.')).toBeInTheDocument()
    const after = screen.getByRole('region', { name: 'After' })
    expect(
      within(after).getByText('Transfer capacity: €5,000,000.00'),
    ).toBeInTheDocument()
    expect(
      within(after).getByText('Weekly wages: €10,000.00'),
    ).toBeInTheDocument()
  })
  it('keeps blank wages and missing tiers unknown rather than silently treating them as zero', async () => {
    await setup()
    fill('Action', 'wage-change')
    fill('Tier', 'key')
    preview()
    expect(
      screen.getByText(
        'Weekly wage is unknown, so the tier cap cannot be checked.',
      ),
    ).toBeInTheDocument()
    const after = screen.getByRole('region', { name: 'After' })
    expect(within(after).getByText('Weekly wages: Unknown')).toBeInTheDocument()
    expect(within(after).queryByText('Weekly wages: €0.00')).toBeNull()
    fill('Weekly wage', '0')
    fill('Tier', '')
    preview()
    expect(
      screen.getByText(
        'Squad tier is unknown, so the wage cap cannot be checked.',
      ),
    ).toBeInTheDocument()
  })
  it.each([
    ['Fee', '1.001', invalidMoneyMessage],
    ['Fee', '', invalidMoneyMessage],
    ['Weekly wage', '-1', invalidMoneyMessage],
    ['Age', '24.5', 'Enter a whole number of years or leave age blank.'],
    ['Age', '100', 'Enter a whole number of years or leave age blank.'],
  ])(
    'validates %s=%s without replacing the previous result',
    async (label, value, message) => {
      await setup()
      fillPaid()
      preview()
      const previous = screen.getByRole('region', {
        name: 'Preview result',
      }).textContent
      const before = await storedState()
      fill(label, value)
      preview()
      expect(screen.getByRole('alert')).toHaveTextContent(message)
      expect(
        screen.getByRole('region', { name: 'Preview result' }).textContent,
      ).toBe(previous)
      expect(await storedState()).toEqual(before)
    },
  )
  it.each([
    ['Bid', '', invalidMoneyMessage],
    ['Market value', '-1', invalidMoneyMessage],
    [
      'Bidder prestige',
      '80.5',
      'Enter a prestige from 0 to 100 or leave it blank.',
    ],
    [
      'Bidder prestige',
      '101',
      'Enter a prestige from 0 to 100 or leave it blank.',
    ],
  ])('validates offer %s=%s without writing', async (label, value, message) => {
    await setup()
    fill('Action', 'reject-offer')
    fill('Bid', '150000')
    fill('Market value', '100000')
    fill('Bidder prestige', '80')
    fill(label, value)
    preview()
    expect(screen.getByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByRole('region', { name: 'Preview result' })).toBeNull()
    expect((await storedState()).ledger).toHaveLength(1)
  })
  it('does not render the preview without a constitution', async () => {
    await createCampaign(database(), harborInput)
    renderAt('/app/campaign-a/finance')
    await screen.findByRole('table', { name: 'Ledger' })
    expect(screen.queryByRole('region', { name: 'Action preview' })).toBeNull()
  })
})
