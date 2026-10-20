import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { noRecords, previewBanner } from '../app/copy'
import { recordMatch } from '../data/commands/record-match'
import { createCampaign } from '../data/commands/create-campaign'
import { saveLineup } from '../data/commands/save-lineup'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { listAppearances } from '../data/repositories/appearances'
import { listMatches } from '../data/repositories/matches'
import { appearancesFromLineup } from '../domain/matches/from-lineup'
import { matchResult } from '../domain/matches/result'
import { formatXg, parseXgMilli } from '../domain/matches/xg'
import {
  clubSchema,
  entityIdSchema,
  playerSchema,
} from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'

const databaseName = 'touchline-os-test'
const id = entityIdSchema.parse
const xgMessage =
  'Enter xG as a number from 0 to 20 with at most three decimal places.'

afterEach(async () => {
  cleanup()
  await deleteDatabaseForTests(databaseName)
})

async function setup() {
  const database = getDatabase(databaseName)
  await createCampaign(database, harborInput)
  await createCampaign(database, {
    ...harborInput,
    campaignId: 'campaign-b',
    clubId: 'club-b',
    seasonId: 'season-b',
    auditEventId: 'audit-b',
    actionId: 'action-b',
  })
  const club = (await database.clubs.get(id('club-a')))!
  await database.clubs.add(
    clubSchema.parse({ ...club, id: 'club-a-other', name: 'Another club' }),
  )
  for (const [playerId, campaignId, clubId] of [
    ['p1', 'campaign-a', 'club-a'],
    ['p2', 'campaign-a', 'club-a'],
    ['p3', 'campaign-a', 'club-a'],
    ['other-club', 'campaign-a', 'club-a-other'],
  ] as const) {
    await database.players.add(
      playerSchema.parse({
        id: playerId,
        campaignId,
        clubId,
        name: playerId,
        positionGroup: 'MID',
        positions: ['CM'],
        nationalityCode: null,
        birthDate: null,
        reportedAge: null,
        ageReferenceSeasonOrdinal: null,
        marketValueCents: null,
        attributes: {},
        potential: null,
        source: 'fictional',
        externalSourceId: null,
        isNewgen: false,
      }),
    )
  }
  return database
}

async function record(overrides: Record<string, unknown> = {}) {
  const database = getDatabase(databaseName)
  const campaign = await database.campaigns.get(id('campaign-a'))
  return recordMatch(database, {
    campaignId: 'campaign-a',
    seasonId: 'season-a',
    matchId: 'match-1',
    date: '2026-10-19',
    opponent: 'Calder Reserve',
    homeAway: 'home',
    goalsFor: 2,
    goalsAgainst: 1,
    competition: null,
    notes: null,
    xgFor: null,
    xgAgainst: null,
    appearances: [
      {
        appearanceId: 'app-1',
        playerId: 'p1',
        minutes: 90,
        started: true,
        goals: 1,
        assists: null,
      },
      {
        appearanceId: 'app-2',
        playerId: 'p2',
        minutes: 45,
        started: false,
        goals: null,
        assists: 1,
      },
    ],
    expectedRevision: campaign?.revision ?? 0,
    now: harborInput.now,
    auditEventId: 'audit-match-1',
    actionId: 'action-match-1',
    ...overrides,
  })
}

async function snapshot() {
  const database = getDatabase(databaseName)
  return {
    matches: await database.matchRecords.toArray(),
    appearances: await database.appearances.toArray(),
    campaigns: await database.campaigns.toArray(),
    audits: await database.auditEvents.toArray(),
    players: await database.players.toArray(),
  }
}

function fillScore() {
  fireEvent.change(screen.getByLabelText('Date'), {
    target: { value: '2026-10-19' },
  })
  fireEvent.change(screen.getByLabelText('Opponent'), {
    target: { value: 'Calder Reserve' },
  })
  fireEvent.change(screen.getByLabelText('Home or away'), {
    target: { value: 'home' },
  })
  fireEvent.change(screen.getByLabelText('Goals for'), {
    target: { value: '2' },
  })
  fireEvent.change(screen.getByLabelText('Goals against'), {
    target: { value: '1' },
  })
}

describe('xG and match result', () => {
  it('parses milli-units with integer math and derives the result word', () => {
    expect(parseXgMilli('')).toEqual({ ok: true, value: null })
    expect(parseXgMilli('1')).toEqual({ ok: true, value: 1000 })
    expect(parseXgMilli('1.8')).toEqual({ ok: true, value: 1800 })
    expect(parseXgMilli('1.840')).toEqual({ ok: true, value: 1840 })
    expect(parseXgMilli('1.8400')).toEqual({ ok: false, message: xgMessage })
    expect(formatXg(1840)).toBe('1.840')
    expect(formatXg(null)).toBe('')
    expect(matchResult(2, 1)).toBe('Win')
    expect(matchResult(1, 1)).toBe('Draw')
    expect(matchResult(0, 2)).toBe('Loss')
  })
})

describe('appearancesFromLineup', () => {
  it('puts managed starters at 90 and leaves the bench off the sheet', () => {
    expect(
      appearancesFromLineup(
        {
          starters: [{ playerId: 'a' }, { playerId: 'b' }],
          benchPlayerIds: ['c'],
        },
        new Set(['a', 'b', 'c']),
      ),
    ).toEqual({
      drafts: [
        { playerId: 'a', minutes: 90, started: true, played: true },
        { playerId: 'b', minutes: 90, started: true, played: true },
        { playerId: 'c', minutes: null, started: false, played: false },
      ],
      skipped: 0,
    })
  })

  it('skips a departed starter and does not repeat a starter on the bench', () => {
    expect(
      appearancesFromLineup(
        {
          starters: [{ playerId: 'a' }, { playerId: 'gone' }],
          benchPlayerIds: ['c', 'a', 'left'],
        },
        new Set(['a', 'c']),
      ),
    ).toEqual({
      drafts: [
        { playerId: 'a', minutes: 90, started: true, played: true },
        { playerId: 'c', minutes: null, started: false, played: false },
      ],
      skipped: 2,
    })
  })
})

describe('recordMatch', () => {
  it('writes one match, two appearances, and one audit without moving players', async () => {
    const database = await setup()
    const playersBefore = await database.players.toArray()
    const before = (await database.campaigns.get(id('campaign-a')))!.revision
    expect(await record()).toMatchObject({
      ok: true,
      revision: before + 1,
      value: { matchId: 'match-1' },
    })
    expect(await database.matchRecords.count()).toBe(1)
    expect(await database.appearances.count()).toBe(2)
    expect(
      (await database.auditEvents.toArray()).filter(
        (audit) => audit.actionType === 'match.record',
      ),
    ).toEqual([
      expect.objectContaining({
        summary: 'Recorded match against Calder Reserve',
        seasonId: 'season-a',
      }),
    ])
    expect((await database.campaigns.get(id('campaign-a')))!.revision).toBe(
      before + 1,
    )
    expect(await database.players.toArray()).toEqual(playersBefore)
    expect(
      (await database.players.toArray()).find((player) => player.id === 'p1')
        ?.clubId,
    ).toBe('club-a')
    expect(
      (await database.players.toArray()).find((player) => player.id === 'p2')
        ?.clubId,
    ).toBe('club-a')
  })

  it('rejects a repeated player and writes nothing', async () => {
    await setup()
    const before = await snapshot()
    expect(
      await record({
        appearances: [
          {
            appearanceId: 'app-1',
            playerId: 'p1',
            minutes: 90,
            started: true,
            goals: null,
            assists: null,
          },
          {
            appearanceId: 'app-2',
            playerId: 'p1',
            minutes: 10,
            started: false,
            goals: null,
            assists: null,
          },
        ],
      }),
    ).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'This match lists a player twice.',
    })
    expect(await getDatabase(databaseName).matchRecords.count()).toBe(0)
    expect(await snapshot()).toEqual(before)
  })

  it('rejects a player at another club and writes nothing', async () => {
    await setup()
    const before = await snapshot()
    expect(
      await record({
        appearances: [
          {
            appearanceId: 'app-1',
            playerId: 'other-club',
            minutes: 90,
            started: true,
            goals: null,
            assists: null,
          },
        ],
      }),
    ).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'That player is not at the managed club.',
    })
    expect(await snapshot()).toEqual(before)
  })

  it('stores blank xG as null and 1840 as milli-units', async () => {
    const database = await setup()
    expect(await record()).toMatchObject({ ok: true })
    expect(await database.matchRecords.get(id('match-1'))).toMatchObject({
      xgFor: null,
      xgAgainst: null,
    })
    expect(
      await record({
        matchId: 'match-2',
        auditEventId: 'audit-match-2',
        actionId: 'action-match-2',
        appearances: [],
        xgFor: 1840,
        xgAgainst: null,
      }),
    ).toMatchObject({ ok: true })
    expect(await database.matchRecords.get(id('match-2'))).toMatchObject({
      xgFor: 1840,
      xgAgainst: null,
    })
  })

  it('returns CONFLICT for a stale revision and does not insert another match', async () => {
    const database = await setup()
    expect(await record()).toMatchObject({ ok: true })
    const before = await snapshot()
    const campaign = await database.campaigns.get(id('campaign-a'))
    expect(
      await record({
        matchId: 'match-2',
        auditEventId: 'audit-match-2',
        actionId: 'action-match-2',
        expectedRevision: (campaign?.revision ?? 1) - 1,
      }),
    ).toMatchObject({ ok: false, code: 'CONFLICT' })
    expect(await database.matchRecords.count()).toBe(1)
    expect(await snapshot()).toEqual(before)
  })

  it('hides campaign A from campaign B', async () => {
    const database = await setup()
    await record()
    expect(
      await listMatches(database, id('campaign-b'), id('season-b')),
    ).toEqual([])
    expect(
      await listMatches(database, id('campaign-b'), id('season-a')),
    ).toEqual([])
    expect(
      await listAppearances(database, id('campaign-b'), id('season-b')),
    ).toEqual([])
    expect(
      (await listMatches(database, id('campaign-a'), id('season-a'))).map(
        (match) => match.opponent,
      ),
    ).toEqual(['Calder Reserve'])
  })
})

describe('match journal', () => {
  it('rejects a fourth xG decimal in the form and does not record', async () => {
    await setup()
    renderAt('/app/campaign-a/matches')
    await screen.findByLabelText('Opponent')
    fillScore()
    expect(screen.getByRole('button', { name: 'Record match' })).toBeEnabled()
    fireEvent.change(screen.getByLabelText('xG for'), {
      target: { value: '1.8400' },
    })
    expect(screen.getByRole('alert')).toHaveTextContent(xgMessage)
    expect(screen.getByRole('button', { name: 'Record match' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Record match' }))
    expect(await getDatabase(databaseName).matchRecords.count()).toBe(0)
  })

  it('fills starters from a lineup without saving, then records only those starters', async () => {
    const database = await setup()
    const campaign = await database.campaigns.get(id('campaign-a'))
    expect(
      await saveLineup(database, {
        campaignId: 'campaign-a',
        lineupId: 'league',
        seasonId: 'season-a',
        expectedRevision: campaign?.revision ?? 0,
        now: harborInput.now,
        auditEventId: 'lineup-audit',
        actionId: 'lineup-action',
        name: 'League XI',
        formation: '4-3-3',
        starters: [
          { playerId: 'p1', slot: 'gk', role: null },
          { playerId: 'p2', slot: 'st', role: null },
        ],
        benchPlayerIds: ['p3'],
      }),
    ).toMatchObject({ ok: true })
    renderAt('/app/campaign-a/matches')
    await screen.findByLabelText('Lineup')
    fillScore()
    expect(
      screen.getByRole('button', { name: 'Fill from lineup' }),
    ).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Lineup'), {
      target: { value: 'league' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Fill from lineup' }))
    const minutes = screen.getAllByLabelText('Minutes')
    expect(minutes.map((input) => (input as HTMLInputElement).value)).toEqual([
      '90',
      '90',
      '',
    ])
    const started = screen.getAllByRole('checkbox', { name: 'Started' })
    expect(started[0]).toBeChecked()
    expect(started[1]).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Played' })).not.toBeChecked()
    expect(screen.getByLabelText('Goals for')).toHaveValue('2')
    expect(await database.matchRecords.count()).toBe(0)
    expect(screen.getByRole('button', { name: 'Record match' })).toBeEnabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Played' }))
    expect(
      screen.getByText('Enter minutes for this substitute.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Record match' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Played' }))
    expect(screen.getByRole('button', { name: 'Record match' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Record match' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Recorded the match.',
    )
    const appearances = await database.appearances.toArray()
    expect(appearances.map((row) => row.playerId).sort()).toEqual(['p1', 'p2'])
    expect(appearances.every((row) => row.minutes === 90)).toBe(true)
    expect(await database.matchRecords.count()).toBe(1)
  })

  it('renders a stored win and a stored draw', async () => {
    await setup()
    await record({ appearances: [] })
    await record({
      matchId: 'match-2',
      auditEventId: 'audit-match-2',
      actionId: 'action-match-2',
      goalsFor: 1,
      goalsAgainst: 1,
      appearances: [],
    })
    renderAt('/app/campaign-a/matches')
    const list = await screen.findByRole('list', { name: 'Recorded matches' })
    expect(within(list).getByText('2\u20131')).toBeInTheDocument()
    expect(within(list).getByText('Win')).toBeInTheDocument()
    expect(within(list).getByText('1\u20131')).toBeInTheDocument()
    expect(within(list).getByText('Draw')).toBeInTheDocument()
    expect(within(list).getAllByText('Home')).toHaveLength(2)
  })

  it('hides the preview banner on matches and keeps it on seasons', async () => {
    await createCampaign(getDatabase(databaseName), {
      ...harborInput,
      campaignId: 'demo',
      clubId: 'club-demo',
      seasonId: 'season-demo',
      auditEventId: 'audit-demo',
      actionId: 'action-demo',
    })
    const { router } = renderAt('/app/demo/matches')
    await screen.findByRole('heading', { name: 'Match Journal' })
    expect(screen.queryByText(previewBanner)).toBeNull()
    expect(screen.queryByText(noRecords)).toBeNull()
    expect(screen.getByText('No matches are recorded.')).toBeInTheDocument()
    expect(
      screen.getByText('Save a lineup on Tactics to fill a match from it.'),
    ).toBeInTheDocument()
    await act(async () => {
      await router.navigate('/app/demo/seasons')
    })
    await screen.findByRole('heading', { name: 'Seasons' })
    expect(screen.getByText(previewBanner)).toBeInTheDocument()
  })
})
