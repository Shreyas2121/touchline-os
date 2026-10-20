import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { previewBanner } from '../app/copy'
import { addPlayer } from '../data/commands/add-player'
import { createCampaign } from '../data/commands/create-campaign'
import { recordTransfer } from '../data/commands/record-transfer'
import { saveConstitution } from '../data/commands/save-constitution'
import { saveRegistration } from '../data/commands/save-registration'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { listAuditEvents } from '../data/repositories/audit-events'
import { getCampaign } from '../data/repositories/campaigns'
import { insertClub } from '../data/repositories/clubs'
import { getActiveConstitution } from '../data/repositories/constitutions'
import { listRegistrations } from '../data/repositories/registrations'
import { dateOnlySchema } from '../domain/models/dates'
import { evaluateAction } from '../domain/rules/evaluate-action'
import { constitutionPreset } from '../domain/rules/presets'
import { parsePolicyAction, type PolicyAction } from '../domain/rules/types'
import {
  clubSchema,
  constitutionSchema,
  entityIdSchema,
  type Constitution,
} from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'

const databaseName = 'touchline-os-test'
const database = () => getDatabase(databaseName)
const id = entityIdSchema.parse
const now = harborInput.now
const effectiveDate = dateOnlySchema.parse('2026-10-19')
const snapshot = { revision: 1, remainingCapacityCents: null }

afterEach(async () => {
  cleanup()
  await deleteDatabaseForTests(databaseName)
})

function balancedConstitution(
  patch: Partial<
    Extract<Constitution['rules'][number], { id: 'REGISTRATION_QUOTA' }>
  > = {},
) {
  return constitutionSchema.parse({
    id: 'constitution-a',
    campaignId: 'campaign-a',
    version: 1,
    updatedAt: now,
    rules: constitutionPreset('balanced').map((rule) =>
      rule.id === 'REGISTRATION_QUOTA' ? { ...rule, ...patch } : rule,
    ),
  })
}

function draft(
  playerId: string,
  fields: Partial<
    Extract<PolicyAction, { type: 'registration' }>['players'][number]
  > = {},
): Extract<PolicyAction, { type: 'registration' }>['players'][number] {
  return {
    playerId,
    status: 'registered',
    homegrownClub: true,
    homegrownNation: false,
    ageExempt: null,
    age: 24,
    ...fields,
  }
}

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

async function addAged(
  revision: number,
  playerId: string,
  age: number,
  clubId: string | null = 'club-a',
): Promise<number> {
  const added = await addPlayer(database(), {
    campaignId: 'campaign-a',
    playerId,
    expectedRevision: revision,
    now,
    auditEventId: `audit-${playerId}`,
    actionId: `action-${playerId}`,
    clubId,
    name: `Player ${playerId}`,
    positionGroup: 'MID',
    positions: ['CM'],
    nationalityCode: null,
    birthDate: `${2026 - age}-10-19`,
    reportedAge: null,
    ageReferenceSeasonOrdinal: null,
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

async function addSquad(
  revision: number,
  count: number,
  age = 24,
): Promise<{ revision: number; playerIds: string[] }> {
  const playerIds: string[] = []
  let next = revision
  for (let index = 1; index <= count; index += 1) {
    const playerId = `player-${index}`
    next = await addAged(next, playerId, age)
    playerIds.push(playerId)
  }
  return { revision: next, playerIds }
}

function registrationInput(
  revision: number,
  playerIds: readonly string[],
  fields: {
    auditEventId?: string
    actionId?: string
    competitionKey?: string
    status?: 'registered' | 'ineligible' | 'unknown'
    homegrownClub?: boolean | null
    homegrownNation?: boolean | null
    ageExempt?: boolean | null
    registrationIdFor?: (playerId: string) => string
  } = {},
) {
  return {
    campaignId: 'campaign-a',
    seasonId: 'season-a',
    competitionKey: fields.competitionKey ?? 'league',
    expectedRevision: revision,
    now,
    auditEventId: fields.auditEventId ?? 'audit-registration',
    actionId: fields.actionId ?? 'action-registration',
    players: playerIds.map((playerId) => ({
      playerId,
      registrationId: fields.registrationIdFor?.(playerId) ?? `reg-${playerId}`,
      status: fields.status ?? 'registered',
      homegrownClub:
        fields.homegrownClub === undefined ? true : fields.homegrownClub,
      homegrownNation:
        fields.homegrownNation === undefined ? false : fields.homegrownNation,
      ageExempt: fields.ageExempt === undefined ? null : fields.ageExempt,
    })),
  }
}

function kpi(label: string): string | null | undefined {
  return screen.getByText(label, { selector: 'p', exact: true })
    .nextElementSibling?.textContent
}

describe('registration rules', () => {
  it('parses a registration list and the paid incoming fixture', () => {
    const registration = {
      type: 'registration' as const,
      competitionKey: 'league',
      players: [],
    }
    expect(parsePolicyAction(registration)).toEqual({
      ok: true,
      value: registration,
    })
    const incoming = {
      type: 'incoming-transfer' as const,
      feeCents: 100,
      age: 24,
      isFree: false,
      weeklyWageCents: null,
      squadTier: 'rotation' as const,
    }
    expect(parsePolicyAction(incoming)).toEqual({ ok: true, value: incoming })
    expect(
      parsePolicyAction({
        type: 'registration',
        competitionKey: 'league',
        players: [
          {
            playerId: 'player a',
            status: 'registered',
            homegrownClub: null,
            homegrownNation: null,
            ageExempt: null,
            age: 24,
          },
        ],
      }).ok,
    ).toBe(false)
  })

  it('collects quota blocks before the list totals', () => {
    const report = evaluateAction(
      {
        type: 'registration',
        competitionKey: 'league',
        players: [
          draft('player-a', {
            status: 'unknown',
            age: null,
            homegrownClub: null,
          }),
          draft('player-a', {
            homegrownClub: null,
            homegrownNation: null,
            age: null,
          }),
          draft('player-b', { homegrownClub: null, homegrownNation: null }),
        ],
      },
      snapshot,
      balancedConstitution(),
      effectiveDate,
    )
    expect(report.allowed).toBe(false)
    expect(report.verdicts.map((verdict) => verdict.message)).toEqual([
      'This registration list names a player twice.',
      'Registration status is unknown.',
      'Age is unknown, so this registration cannot be checked.',
      'Homegrown eligibility is unknown.',
      'Homegrown players are below the minimum of 8.',
    ])
    expect(report.verdicts.map((verdict) => verdict.ruleId)).toEqual([
      'REGISTRATION_QUOTA',
      'REGISTRATION_QUOTA',
      'REGISTRATION_QUOTA',
      'REGISTRATION_QUOTA',
      'REGISTRATION_QUOTA',
    ])
    expect(
      evaluateAction(
        {
          type: 'registration',
          competitionKey: 'cup',
          players: [draft('player-a', { status: 'unknown' })],
        },
        snapshot,
        balancedConstitution(),
        effectiveDate,
      ).verdicts,
    ).toEqual([])
    expect(
      evaluateAction(
        {
          type: 'registration',
          competitionKey: 'league',
          players: [draft('player-a', { status: 'unknown' })],
        },
        snapshot,
        balancedConstitution({ enabled: false }),
        effectiveDate,
      ).verdicts,
    ).toEqual([])
  })

  it('treats age 20 as exempt and counts age 21 and an explicit exemption refusal', () => {
    const limit = balancedConstitution({ rosterLimit: 1, minimumHomegrown: 1 })
    const older = draft('player-older')
    expect(
      evaluateAction(
        {
          type: 'registration',
          competitionKey: 'league',
          players: [older, draft('player-young', { age: 20 })],
        },
        snapshot,
        limit,
        effectiveDate,
      ),
    ).toMatchObject({ allowed: true, verdicts: [] })
    expect(
      evaluateAction(
        {
          type: 'registration',
          competitionKey: 'league',
          players: [draft('player-young', { age: 20 })],
        },
        snapshot,
        balancedConstitution({ minimumHomegrown: 1 }),
        effectiveDate,
      ).verdicts.map((verdict) => verdict.code),
    ).toEqual(['HOMEGROWN_BELOW_MINIMUM'])
    expect(
      evaluateAction(
        {
          type: 'registration',
          competitionKey: 'league',
          players: [older, draft('player-young', { age: 21 })],
        },
        snapshot,
        limit,
        effectiveDate,
      ).verdicts.map((verdict) => verdict.code),
    ).toEqual(['ROSTER_ABOVE_LIMIT'])
    expect(
      evaluateAction(
        {
          type: 'registration',
          competitionKey: 'league',
          players: [
            older,
            draft('player-young', { age: 18, ageExempt: false }),
          ],
        },
        snapshot,
        limit,
        effectiveDate,
      ).verdicts.map((verdict) => verdict.code),
    ).toEqual(['ROSTER_ABOVE_LIMIT'])
  })
})

describe('saveRegistration', () => {
  it('stores eight homegrown players and one audit', async () => {
    const squad = await addSquad(await balanced(), 8)
    const players = squad.playerIds.map((playerId) => draft(playerId))
    expect(
      evaluateAction(
        { type: 'registration', competitionKey: 'league', players },
        snapshot,
        balancedConstitution(),
        effectiveDate,
      ),
    ).toEqual({ allowed: true, verdicts: [], snapshotRevision: 1 })
    const saved = await saveRegistration(
      database(),
      registrationInput(squad.revision, squad.playerIds),
    )
    expect(saved).toMatchObject({ ok: true, value: { count: 8 } })
    const rows = await listRegistrations(
      database(),
      id('campaign-a'),
      id('season-a'),
      'league',
    )
    expect(rows).toHaveLength(8)
    expect(
      rows.every(
        (row) =>
          row.provenance === 'user-entered' && row.status === 'registered',
      ),
    ).toBe(true)
    const audits = (await listAuditEvents(database(), id('campaign-a'))).filter(
      (audit) => audit.actionType === 'registration.save',
    )
    expect(audits).toHaveLength(1)
    expect(audits[0]?.summary).toBe('Saved registration for league')
  })

  it('writes nothing when nine players exceed a stored roster limit of 8', async () => {
    let revision = await balanced()
    const turned = await saveConstitution(database(), {
      campaignId: 'campaign-a',
      constitutionId: 'constitution-b',
      expectedRevision: revision,
      now,
      auditEventId: 'audit-limit',
      actionId: 'action-limit',
      ledgerEntryId: 'opening-unused',
      effectiveOn: '2026-10-19',
      rules: constitutionPreset('balanced').map((rule) =>
        rule.id === 'REGISTRATION_QUOTA' ? { ...rule, rosterLimit: 8 } : rule,
      ),
    })
    expect(turned.ok).toBe(true)
    if (!turned.ok) throw new Error(turned.message)
    revision = turned.revision
    const squad = await addSquad(revision, 9)
    const constitution = await getActiveConstitution(
      database(),
      id('campaign-a'),
    )
    if (!constitution) throw new Error('constitution')
    expect(
      evaluateAction(
        {
          type: 'registration',
          competitionKey: 'league',
          players: squad.playerIds.map((playerId) => draft(playerId)),
        },
        snapshot,
        constitution,
        effectiveDate,
      ).verdicts.map((verdict) => verdict.code),
    ).toEqual(['ROSTER_ABOVE_LIMIT'])
    const saved = await saveRegistration(
      database(),
      registrationInput(squad.revision, squad.playerIds),
    )
    expect(saved).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'The registered list is above the roster limit of 8.',
    })
    expect(await database().registrations.count()).toBe(0)
    expect(
      (await listAuditEvents(database(), id('campaign-a'))).some(
        (audit) => audit.actionType === 'registration.save',
      ),
    ).toBe(false)
    expect((await getCampaign(database(), id('campaign-a')))?.revision).toBe(
      squad.revision,
    )
  })

  it('writes nothing when homegrown players are below the minimum', async () => {
    const squad = await addSquad(await balanced(), 7)
    const saved = await saveRegistration(
      database(),
      registrationInput(squad.revision, squad.playerIds),
    )
    expect(saved).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Homegrown players are below the minimum of 8.',
    })
    expect(await database().registrations.count()).toBe(0)
  })

  it('blocks an unknown homegrown pair, then saves once the club flag is set', async () => {
    const squad = await addSquad(await balanced(), 8)
    const unknown = registrationInput(squad.revision, squad.playerIds)
    const last = unknown.players[7]
    if (!last) throw new Error('player')
    last.homegrownClub = null
    last.homegrownNation = null
    const blocked = await saveRegistration(database(), unknown)
    expect(blocked).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Homegrown eligibility is unknown.',
    })
    expect(await database().registrations.count()).toBe(0)
    last.homegrownClub = true
    const saved = await saveRegistration(database(), unknown)
    expect(saved.ok).toBe(true)
    expect(await database().registrations.count()).toBe(8)
  })

  it('does not count a stored age of 20 toward the homegrown minimum', async () => {
    let revision = await balanced()
    for (let index = 1; index <= 7; index += 1)
      revision = await addAged(revision, `player-${index}`, 24)
    revision = await addAged(revision, 'player-young', 20)
    const saved = await saveRegistration(
      database(),
      registrationInput(revision, [
        ...Array.from({ length: 7 }, (_, index) => `player-${index + 1}`),
        'player-young',
      ]),
    )
    expect(saved).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Homegrown players are below the minimum of 8.',
    })
    expect(await database().registrations.count()).toBe(0)
  })

  it('counts age 21 and an age-18 player whose exemption is false', async () => {
    let revision = await balanced()
    for (let index = 1; index <= 7; index += 1)
      revision = await addAged(revision, `player-${index}`, 24)
    revision = await addAged(revision, 'player-young', 21)
    const counted = await saveRegistration(
      database(),
      registrationInput(revision, [
        ...Array.from({ length: 7 }, (_, index) => `player-${index + 1}`),
        'player-young',
      ]),
    )
    expect(counted.ok).toBe(true)
    expect(await database().registrations.count()).toBe(8)
    await deleteDatabaseForTests(databaseName)
    let again = await balanced()
    for (let index = 1; index <= 7; index += 1)
      again = await addAged(again, `player-${index}`, 24)
    again = await addAged(again, 'player-young', 18)
    const refused = await saveRegistration(
      database(),
      registrationInput(
        again,
        [
          ...Array.from({ length: 7 }, (_, index) => `player-${index + 1}`),
          'player-young',
        ],
        { ageExempt: false },
      ),
    )
    expect(refused.ok).toBe(true)
    expect(
      (
        await listRegistrations(
          database(),
          id('campaign-a'),
          id('season-a'),
          'league',
        )
      ).find((row) => row.playerId === 'player-young'),
    ).toMatchObject({ ageExempt: false, status: 'registered' })
  })

  it('stores rows when the registration rule is disabled and adds no verdict', async () => {
    let revision = await balanced()
    const turned = await saveConstitution(database(), {
      campaignId: 'campaign-a',
      constitutionId: 'constitution-b',
      expectedRevision: revision,
      now,
      auditEventId: 'audit-off',
      actionId: 'action-off',
      ledgerEntryId: 'opening-unused',
      effectiveOn: '2026-10-19',
      rules: constitutionPreset('balanced').map((rule) =>
        rule.id === 'REGISTRATION_QUOTA' ? { ...rule, enabled: false } : rule,
      ),
    })
    expect(turned.ok).toBe(true)
    if (!turned.ok) throw new Error(turned.message)
    revision = await addAged(turned.revision, 'player-1', 24)
    const constitution = await getActiveConstitution(
      database(),
      id('campaign-a'),
    )
    if (!constitution) throw new Error('constitution')
    expect(
      evaluateAction(
        {
          type: 'registration',
          competitionKey: 'league',
          players: [draft('player-1', { status: 'unknown' })],
        },
        snapshot,
        constitution,
        effectiveDate,
      ).verdicts,
    ).toEqual([])
    const saved = await saveRegistration(
      database(),
      registrationInput(revision, ['player-1'], { status: 'unknown' }),
    )
    expect(saved.ok).toBe(true)
    expect(
      await listRegistrations(
        database(),
        id('campaign-a'),
        id('season-a'),
        'league',
      ),
    ).toMatchObject([
      { playerId: 'player-1', status: 'unknown', provenance: 'user-entered' },
    ])
  })

  it('does not count a sold player toward the command-center figure', async () => {
    const squad = await addSquad(await balanced(), 8)
    const saved = await saveRegistration(
      database(),
      registrationInput(squad.revision, squad.playerIds),
    )
    expect(saved.ok).toBe(true)
    if (!saved.ok) throw new Error(saved.message)
    const { unmount } = renderAt('/app/campaign-a/command-center')
    await screen.findByRole('heading', { level: 2, name: 'Harbor Athletic' })
    expect(kpi('Registration')).toBe('8 / 25')
    unmount()
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
        prestige: 20,
        academyTier: 2,
        scoutingRegion: null,
      }),
    )
    const sold = await recordTransfer(database(), {
      campaignId: 'campaign-a',
      expectedRevision: saved.revision,
      now,
      seasonId: 'season-a',
      playerId: 'player-1',
      effectiveOn: '2026-10-19',
      direction: 'sale',
      feeCents: 1_000_000_000,
      weeklyWageCents: null,
      squadTier: null,
      startsOn: null,
      expiresOn: null,
      destinationClubId: 'club-b',
      transferId: 'transfer-sale',
      ledgerEntryId: 'ledger-sale',
      contractId: null,
      auditEventId: 'audit-sale',
      actionId: 'action-sale',
      acknowledgedWarnings: true,
    })
    expect(sold.ok).toBe(true)
    const rows = await listRegistrations(
      database(),
      id('campaign-a'),
      id('season-a'),
      'league',
    )
    expect(rows.find((row) => row.playerId === 'player-1')?.status).toBe(
      'registered',
    )
    renderAt('/app/campaign-a/command-center')
    await screen.findByRole('heading', { level: 2, name: 'Harbor Athletic' })
    expect(kpi('Registration')).toBe('7 / 25')
  })

  it('marks a still-rostered player ineligible when a later confirm omits them', async () => {
    const squad = await addSquad(await balanced(), 9)
    const first = await saveRegistration(
      database(),
      registrationInput(squad.revision, squad.playerIds),
    )
    expect(first.ok).toBe(true)
    if (!first.ok) throw new Error(first.message)
    const second = await saveRegistration(
      database(),
      registrationInput(first.revision, squad.playerIds.slice(0, 8), {
        auditEventId: 'audit-second',
        actionId: 'action-second',
      }),
    )
    expect(second.ok).toBe(true)
    const rows = await listRegistrations(
      database(),
      id('campaign-a'),
      id('season-a'),
      'league',
    )
    expect(rows.find((row) => row.playerId === 'player-9')).toMatchObject({
      status: 'ineligible',
      provenance: 'user-entered',
    })
    expect(rows.filter((row) => row.status === 'registered')).toHaveLength(8)
  })

  it('keeps another campaign from reading these rows', async () => {
    const squad = await addSquad(await balanced(), 8)
    const saved = await saveRegistration(
      database(),
      registrationInput(squad.revision, squad.playerIds),
    )
    expect(saved.ok).toBe(true)
    await createCampaign(database(), {
      ...harborInput,
      campaignId: 'campaign-b',
      clubId: 'club-b',
      seasonId: 'season-b',
      auditEventId: 'audit-b',
      actionId: 'action-b',
      name: 'Other',
    })
    expect(
      await listRegistrations(
        database(),
        id('campaign-b'),
        id('season-b'),
        'league',
      ),
    ).toEqual([])
    expect(
      await listRegistrations(
        database(),
        id('campaign-a'),
        id('season-a'),
        'league',
      ),
    ).toHaveLength(8)
  })
})

describe('registration screen', () => {
  it('shows the challenge-rules sentence and blocks an empty Balanced preview', async () => {
    await createCampaign(database(), {
      ...harborInput,
      preset: 'balanced',
      constitutionId: 'constitution-a',
      constitutionActionId: 'action-constitution',
      ledgerEntryId: 'opening',
    })
    renderAt('/app/campaign-a/registration')
    expect(
      await screen.findByText(
        'These checks are your saved challenge rules. They do not certify a real competition.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Change a rule on Constitution.' }),
    ).toHaveAttribute('href', '/app/campaign-a/constitution')
    fireEvent.click(
      screen.getByRole('button', { name: 'Preview registration' }),
    )
    expect(
      await screen.findByText('Homegrown players are below the minimum of 8.'),
    ).toBeInTheDocument()
    expect(screen.getByText('Blocked')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Confirm registration' }),
    ).toBeDisabled()
    expect(
      screen.getByText('Preview only — no changes recorded.'),
    ).toBeInTheDocument()
  })

  it('blocks an unknown status and leaves the registration count at zero', async () => {
    const revision = await balanced()
    await addAged(revision, 'player-1', 24)
    renderAt('/app/campaign-a/registration')
    await screen.findByRole('heading', { name: 'Registration' })
    expect(screen.getByLabelText('Status for Player player-1')).toHaveValue(
      'unknown',
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'Preview registration' }),
    )
    expect(screen.getAllByText('Blocked').length).toBeGreaterThan(0)
    expect(
      screen.getByText('Registration status is unknown.'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Confirm registration' }),
    ).toBeDisabled()
    expect(await database().registrations.count()).toBe(0)
  })

  it('submits an untouched homegrown checkbox as unknown', async () => {
    const revision = await balanced()
    await addAged(revision, 'player-1', 24)
    renderAt('/app/campaign-a/registration')
    await screen.findByLabelText('Status for Player player-1')
    fireEvent.change(screen.getByLabelText('Status for Player player-1'), {
      target: { value: 'registered' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'Preview registration' }),
    )
    expect(
      await screen.findByText('Homegrown eligibility is unknown.'),
    ).toBeInTheDocument()
  })

  it('hides the preview banner on Registration and shows it on Scouting', async () => {
    await createCampaign(database(), harborInput)
    const { router } = renderAt('/app/campaign-a/registration')
    await screen.findByRole('heading', { name: 'Registration' })
    expect(screen.queryByText(previewBanner)).toBeNull()
    await act(async () => {
      await router.navigate('/app/campaign-a/scouting')
    })
    await screen.findByRole('heading', { name: 'Scouting' })
    expect(screen.getByText(previewBanner)).toBeInTheDocument()
  })

  it('shows 0 / 25 on Balanced Harbor before any registration row', async () => {
    await createCampaign(database(), {
      ...harborInput,
      preset: 'balanced',
      constitutionId: 'constitution-a',
      constitutionActionId: 'action-constitution',
      ledgerEntryId: 'opening',
    })
    const { container } = renderAt('/app/campaign-a/command-center')
    await screen.findByRole('heading', { level: 2, name: 'Harbor Athletic' })
    expect(kpi('Registration')).toBe('0 / 25')
    expect(container.textContent).not.toMatch(/Blocked/)
  })
})
