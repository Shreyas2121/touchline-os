import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { addPlayer } from '../data/commands/add-player'
import { createCampaign } from '../data/commands/create-campaign'
import { saveConstitution } from '../data/commands/save-constitution'
import { saveContract } from '../data/commands/save-contract'
import { updatePlayer } from '../data/commands/update-player'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { listAuditEvents } from '../data/repositories/audit-events'
import { getCampaign } from '../data/repositories/campaigns'
import { insertClub } from '../data/repositories/clubs'
import {
  insertContract,
  listContractsByPlayer,
} from '../data/repositories/contracts'
import { wageCommitment } from '../domain/finance/wages'
import { constitutionPreset } from '../domain/rules/presets'
import {
  clubSchema,
  contractSchema,
  entityIdSchema,
} from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'

const databaseName = 'touchline-os-test'
const database = () => getDatabase(databaseName)
const id = entityIdSchema.parse

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
  return created.revision
}

async function addManaged(
  revision: number,
  playerId: string,
  name: string,
  clubId: string | null = 'club-a',
): Promise<number> {
  const added = await addPlayer(database(), {
    campaignId: 'campaign-a',
    playerId,
    expectedRevision: revision,
    now: harborInput.now,
    auditEventId: `audit-${playerId}`,
    actionId: `action-${playerId}`,
    clubId,
    name,
    positionGroup: 'MID',
    positions: ['CM'],
    nationalityCode: null,
    birthDate: null,
    reportedAge: 21,
    ageReferenceSeasonOrdinal: 1,
    marketValueCents: null,
    attributes: {},
    potential: null,
    source: 'user-entered',
    externalSourceId: null,
    isNewgen: false,
  })
  expect(added.ok).toBe(true)
  if (!added.ok) throw new Error(added.message)
  return added.revision
}

function contractInput(
  revision: number,
  playerId: string,
  contractId: string,
  fields: {
    weeklyWageCents: number | null
    squadTier: 'key' | 'rotation' | 'youth' | null
    startsOn?: string | null
    expiresOn?: string | null
  },
) {
  return {
    campaignId: 'campaign-a',
    contractId,
    playerId,
    expectedRevision: revision,
    now: harborInput.now,
    auditEventId: `audit-${contractId}`,
    actionId: `action-${contractId}`,
    weeklyWageCents: fields.weeklyWageCents,
    squadTier: fields.squadTier,
    startsOn: fields.startsOn ?? null,
    expiresOn: fields.expiresOn ?? null,
  }
}

function kpi(label: string): string | null | undefined {
  return screen.getByText(label, { selector: 'p', exact: true })
    .nextElementSibling?.textContent
}

describe('saveContract', () => {
  it('inserts one active contract and one audit', async () => {
    const revision = await addManaged(await balanced(), 'player-a', 'Nia Costa')
    const saved = await saveContract(
      database(),
      contractInput(revision, 'player-a', 'contract-a', {
        weeklyWageCents: 1_000_000,
        squadTier: 'rotation',
        expiresOn: '2027-06-30',
      }),
    )
    expect(saved.ok).toBe(true)
    if (!saved.ok) throw new Error(saved.message)
    expect(saved.revision).toBe(revision + 1)
    expect(
      await listContractsByPlayer(database(), id('campaign-a'), id('player-a')),
    ).toMatchObject([
      {
        status: 'active',
        weeklyWageCents: 1_000_000,
        squadTier: 'rotation',
        expiresOn: '2027-06-30',
        clubId: 'club-a',
      },
    ])
    const audits = (await listAuditEvents(database(), id('campaign-a'))).filter(
      (audit) => audit.actionType === 'contract.save',
    )
    expect(audits).toHaveLength(1)
    expect(audits[0]?.summary).toBe('Saved contract for Nia Costa')
    expect(audits[0]?.seasonId).toBe('season-a')
  })

  it('ends the previous contract and counts only the new wage', async () => {
    let revision = await addManaged(await balanced(), 'player-a', 'Nia Costa')
    const first = await saveContract(
      database(),
      contractInput(revision, 'player-a', 'contract-a', {
        weeklyWageCents: 1_000_000,
        squadTier: 'rotation',
        expiresOn: '2027-06-30',
      }),
    )
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error(first.message)
    revision = first.revision
    const second = await saveContract(
      database(),
      contractInput(revision, 'player-a', 'contract-b', {
        weeklyWageCents: 2_000_000,
        squadTier: 'rotation',
        expiresOn: '2028-06-30',
      }),
    )
    expect(second.ok).toBe(true)
    const rows = await listContractsByPlayer(
      database(),
      id('campaign-a'),
      id('player-a'),
    )
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'contract-a',
          status: 'ended',
          weeklyWageCents: 1_000_000,
        }),
        expect.objectContaining({
          id: 'contract-b',
          status: 'active',
          weeklyWageCents: 2_000_000,
        }),
      ]),
    )
    expect(wageCommitment(rows, 'club-a').knownCents).toBe(2_000_000)
  })

  it('writes nothing for a Key wage above the Balanced cap', async () => {
    const revision = await addManaged(await balanced(), 'player-a', 'Nia Costa')
    expect(
      await saveContract(
        database(),
        contractInput(revision, 'player-a', 'contract-a', {
          weeklyWageCents: 4_600_000,
          squadTier: 'key',
        }),
      ),
    ).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'The weekly wage is above the Key cap.',
    })
    expect(await database().contracts.count()).toBe(0)
    expect((await getCampaign(database(), id('campaign-a')))?.revision).toBe(
      revision,
    )
  })

  it('refuses a null wage while the wage rule is enabled', async () => {
    let revision = await addManaged(await balanced(), 'player-a', 'Nia Costa')
    const saved = await saveContract(
      database(),
      contractInput(revision, 'player-a', 'contract-a', {
        weeklyWageCents: 1_000_000,
        squadTier: 'rotation',
      }),
    )
    expect(saved.ok).toBe(true)
    if (!saved.ok) throw new Error(saved.message)
    revision = saved.revision
    expect(
      await saveContract(
        database(),
        contractInput(revision, 'player-a', 'contract-b', {
          weeklyWageCents: null,
          squadTier: 'key',
        }),
      ),
    ).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Weekly wage is unknown, so the tier cap cannot be checked.',
    })
    const rows = await listContractsByPlayer(
      database(),
      id('campaign-a'),
      id('player-a'),
    )
    expect(rows).toMatchObject([
      { status: 'active', weeklyWageCents: 1_000_000 },
    ])
    expect(rows.some((row) => row.weeklyWageCents === 0)).toBe(false)
    expect((await getCampaign(database(), id('campaign-a')))?.revision).toBe(
      revision,
    )
  })

  it('rejects a player who is not at the managed club', async () => {
    const created = await balanced()
    await insertClub(
      database(),
      id('campaign-a'),
      clubSchema.parse({
        id: 'club-away',
        campaignId: 'campaign-a',
        leagueId: null,
        name: 'Away Athletic',
        shortName: 'AWY',
        colors: { primary: '#224466', secondary: '#88AACC' },
        prestige: 20,
        academyTier: 2,
        scoutingRegion: null,
      }),
    )
    const revision = await addManaged(
      created,
      'player-away',
      'Away Player',
      'club-away',
    )
    expect(
      await saveContract(
        database(),
        contractInput(revision, 'player-away', 'contract-away', {
          weeklyWageCents: 1_000_000,
          squadTier: 'rotation',
        }),
      ),
    ).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'That player is not at the managed club.',
    })
    expect(await database().contracts.count()).toBe(0)
  })

  it('writes nothing when two active contracts already exist', async () => {
    const revision = await addManaged(await balanced(), 'player-a', 'Nia Costa')
    for (const contractId of ['contract-1', 'contract-2']) {
      await insertContract(
        database(),
        id('campaign-a'),
        contractSchema.parse({
          id: contractId,
          campaignId: 'campaign-a',
          playerId: 'player-a',
          clubId: 'club-a',
          weeklyWageCents: 100_000,
          squadTier: 'youth',
          startsOn: null,
          expiresOn: null,
          status: 'active',
        }),
      )
    }
    expect(
      await saveContract(
        database(),
        contractInput(revision, 'player-a', 'contract-3', {
          weeklyWageCents: 1_000_000,
          squadTier: 'rotation',
        }),
      ),
    ).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'More than one active contract exists for this player.',
    })
    const rows = await listContractsByPlayer(
      database(),
      id('campaign-a'),
      id('player-a'),
    )
    expect(rows).toHaveLength(2)
    expect(rows.every((row) => row.status === 'active')).toBe(true)
  })

  it('shows the stored wage, tier, end date, and an unknown null wage', async () => {
    let revision = await addManaged(await balanced(), 'player-a', 'Nia Costa')
    revision = await addManaged(revision, 'player-b', 'Ivo Lane')
    const paid = await saveContract(
      database(),
      contractInput(revision, 'player-a', 'contract-a', {
        weeklyWageCents: 1_000_000,
        squadTier: 'rotation',
        expiresOn: '2027-06-30',
      }),
    )
    expect(paid.ok).toBe(true)
    if (!paid.ok) throw new Error(paid.message)
    const turnedOff = await saveConstitution(database(), {
      campaignId: 'campaign-a',
      constitutionId: 'constitution-b',
      expectedRevision: paid.revision,
      now: harborInput.now,
      auditEventId: 'audit-constitution-off',
      actionId: 'action-constitution-off',
      ledgerEntryId: 'opening-unused',
      effectiveOn: '2026-10-19',
      rules: constitutionPreset('balanced').map((rule) =>
        rule.id === 'WAGE_TIER_CAP' ? { ...rule, enabled: false } : rule,
      ),
    })
    expect(turnedOff.ok).toBe(true)
    if (!turnedOff.ok) throw new Error(turnedOff.message)
    const unknown = await saveContract(
      database(),
      contractInput(turnedOff.revision, 'player-b', 'contract-b', {
        weeklyWageCents: null,
        squadTier: null,
      }),
    )
    expect(unknown.ok).toBe(true)
    renderAt('/app/campaign-a/squad')
    const paidRow = (
      await screen.findByRole('button', { name: 'Select Nia Costa' })
    ).closest('tr')
    const paidCells = within(paidRow!).getAllByRole('cell')
    expect(paidCells[3]).toHaveTextContent('€10,000.00')
    expect(paidCells[5]).toHaveTextContent('Rotation')
    expect(paidCells[6]).toHaveTextContent('2027-06-30')
    expect(paidCells[7]).toHaveTextContent(/^Unknown$/)
    const openRow = screen
      .getByRole('button', { name: 'Select Ivo Lane' })
      .closest('tr')
    const openCells = within(openRow!).getAllByRole('cell')
    expect(openCells[3]).toHaveTextContent(/^Unknown$/)
    expect(openCells[7]).toHaveTextContent(/^Unknown$/)
    expect(openRow?.textContent).not.toMatch(/€0\.00/)
  })

  it('rejects a wage or club id on updatePlayer', async () => {
    await addManaged(await balanced(), 'player-a', 'Nia Costa')
    const correction = {
      campaignId: 'campaign-a',
      playerId: 'player-a',
      expectedRevision: 2,
      now: harborInput.now,
      auditEventId: 'audit-update',
      actionId: 'action-update',
      name: 'Nia Costa',
      positions: ['CM'],
      nationalityCode: null,
      birthDate: null,
      reportedAge: 21,
      marketValueCents: null,
      attributes: {},
      potential: null,
    }
    expect(
      await updatePlayer(database(), { ...correction, weeklyWageCents: 100 }),
    ).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    })
    expect(
      await updatePlayer(database(), { ...correction, clubId: 'club-b' }),
    ).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    })
  })

  it('counts dated contracts, including zero, and shows the registration quota', async () => {
    await createCampaign(database(), {
      ...harborInput,
      preset: 'balanced',
      constitutionId: 'constitution-a',
      constitutionActionId: 'action-constitution',
      ledgerEntryId: 'opening',
    })
    const { unmount } = renderAt('/app/campaign-a/command-center')
    await screen.findByRole('heading', { level: 2, name: 'Harbor Athletic' })
    expect(kpi('Expiring contracts')).toBe('0')
    expect(kpi('Registration')).toBe('0 / 25')
    expect(screen.getAllByText('Unknown', { exact: true })).toHaveLength(1)
    unmount()
    const revision = await addManaged(1, 'player-a', 'Nia Costa')
    const saved = await saveContract(
      database(),
      contractInput(revision, 'player-a', 'contract-a', {
        weeklyWageCents: 1_000_000,
        squadTier: 'rotation',
        expiresOn: '2027-06-30',
      }),
    )
    expect(saved.ok).toBe(true)
    renderAt('/app/campaign-a/command-center')
    await screen.findByRole('heading', { level: 2, name: 'Harbor Athletic' })
    expect(kpi('Expiring contracts')).toBe('1')
    expect(kpi('Registration')).toBe('0 / 25')
  })

  it('shows zero bids and expiring contracts without a euro sign when Harbor has no preset', async () => {
    await createCampaign(database(), harborInput)
    const { container } = renderAt('/app/campaign-a/command-center')
    await screen.findByRole('heading', { level: 2, name: 'Harbor Athletic' })
    expect(kpi('Active bids')).toBe('0')
    expect(kpi('Expiring contracts')).toBe('0')
    expect(container.textContent).not.toMatch(/€/)
  })
})
