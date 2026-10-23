import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NativeMatches } from '../app/native/NativeMatches'
import { NativeScreenTables } from '../app/native/NativeScreenTables'
import { createBrowserClient } from '../platform/browser-client'
import type { MatchdayView } from '../platform/generated/MatchdayView'
import type { ScreenModel } from '../platform/generated/ScreenModel'
import source from '../../src-tauri/fixtures/standalone.json'

function roundView(round = 1): MatchdayView {
  const labels: Record<string, string> = {
    scorer: 'Home scorer',
    helper: 'Home helper',
    keeper: 'Away keeper',
    'home-player': 'Home scorer',
    'away-player': 'Away keeper',
  }
  const fixtures = Array.from({ length: 36 }, (_, i) => {
    labels[`home-${i}`] = `Home club ${i}`
    labels[`away-${i}`] = `Away club ${i}`
    return {
      id: `fixture-${i}`,
      campaignId: 'career',
      seasonId: 'season',
      leagueId: `league-${Math.floor(i / 9)}`,
      round,
      matchDate: '2026-09-01',
      homeClubId: `home-${i}`,
      awayClubId: `away-${i}`,
      fixtureKey: `logical-${i}`,
      status: i === 0 ? ('played' as const) : ('scheduled' as const),
    }
  })
  const appearance = {
    campaignId: 'career',
    fixtureId: 'fixture-0',
    started: true,
    minutes: 90,
    goals: 0,
    assists: 0,
    rating: 60,
    yellowCards: 0,
    redCards: 0,
  }
  return {
    campaignId: 'career',
    round,
    calendarExists: true,
    fixtures,
    labels,
    matches: [
      {
        id: 'match',
        campaignId: 'career',
        fixtureId: 'fixture-0',
        homeGoals: 1,
        awayGoals: 0,
        homeXgMilli: 1234,
        awayXgMilli: 56,
        timeline: [
          {
            minute: 10,
            kind: 'goal',
            simulationKey: 'scorer',
            assistKey: 'helper',
            side: 'home',
          },
        ],
        inputSnapshot: {},
        eventSeed: 123,
        engineVersion: '1',
      },
    ],
    appearances: [
      {
        ...appearance,
        id: 'home-appearance',
        playerId: 'home-player',
        clubId: 'home-0',
        goals: 1,
      },
      {
        ...appearance,
        id: 'away-appearance',
        playerId: 'away-player',
        clubId: 'away-0',
      },
    ],
    leagues: Array.from({ length: 4 }, (_, i) => ({
      name: `League ${i + 1}`,
      rows: Array.from({ length: 18 }, (_, j) => ({
        clubId: `club-${i}-${j}`,
        clubName: `Table club ${i}-${j}`,
        simulationKey: `club:${i}:${j}`,
        played: 1,
        won: 0,
        drawn: 1,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 1,
      })),
    })),
  }
}
describe('native persisted match reports', () => {
  it('reads all 36 fixtures, milli-unit xG, events, both squads, and four complete tables', async () => {
    const client = {
      ...createBrowserClient(),
      matchdayView: vi.fn().mockResolvedValue(roundView()),
      simMatchday: vi.fn(),
    }
    render(<NativeMatches client={client} campaignId="career" />)
    expect(
      await screen.findByRole('heading', {
        name: 'Home club 35 v Away club 35',
      }),
    ).toBeInTheDocument()
    expect(client.matchdayView).toHaveBeenCalledWith('career', null)
    expect(screen.getByText('Score: 1–0 · xG: 1.234–0.056')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Match report'))
    const events = screen.getByRole('list', { name: 'Match events' })
    expect(events).toHaveTextContent(
      '10′ goal — Home scorer, assist: Home helper',
    )
    expect(
      screen.getByRole('table', {
        name: 'Home club 0 appearances — ratings out of 100',
      }),
    ).toHaveTextContent('Home scorer')
    expect(
      screen.getByRole('table', {
        name: 'Away club 0 appearances — ratings out of 100',
      }),
    ).toHaveTextContent('Away keeper')
    for (let i = 1; i <= 4; i++)
      expect(
        screen.getByRole('table', {
          name: `League ${i} standings through round 1`,
        }),
      ).toBeInTheDocument()
    expect(screen.getByText('Table club 3-17')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Order: points, goal difference, goals scored, then club simulation key.',
      ),
    ).toBeInTheDocument()
    expect(client.simMatchday).not.toHaveBeenCalled()
    client.matchdayView.mockResolvedValue(roundView(2))
    fireEvent.change(screen.getByRole('combobox', { name: 'Round' }), {
      target: { value: '2' },
    })
    await waitFor(() =>
      expect(client.matchdayView).toHaveBeenLastCalledWith('career', 2),
    )
    expect(
      await screen.findByRole('table', {
        name: 'League 1 standings through round 2',
      }),
    ).toBeInTheDocument()
  })

  it('distinguishes unknown performance from zero after a calendar is saved', () => {
    const model: ScreenModel = {
      revision: 2,
      page: 0,
      totals: { players: 1 },
      finance: null,
      activeConstitution: null,
      reports: [],
      labels: {},
      rows: {
        ...source.tables,
        fixtures: [],
        simulatedMatches: [],
        simulatedAppearances: [],
      } as ScreenModel['rows'],
      playerFacts: [
        {
          playerId: source.tables.players[0]!.id,
          age: 'Unknown',
          availability: 'Available',
          homegrownClub: null,
          homegrownNation: null,
        },
      ],
    }
    const view = render(<NativeScreenTables screen="squad" model={model} />)
    const cell = (name: string) => {
      const table = screen.getByRole('table', { name: /Players/ })
      const headers = within(table).getAllByRole('columnheader')
      const index = headers.findIndex((h) => h.textContent === name)
      return within(within(table).getAllByRole('row')[1]!).getAllByRole('cell')[
        index
      ]
    }
    for (const field of ['Minutes', 'Goals', 'Assists'])
      expect(cell(field)).toHaveTextContent('Unknown')
    view.rerender(
      <NativeScreenTables
        screen="squad"
        model={{
          ...model,
          playerFacts: model.playerFacts.map((f) => ({
            ...f,
            minutes: 0,
            goals: 0,
            assists: 0,
          })),
        }}
      />,
    )
    for (const field of ['Minutes', 'Goals', 'Assists'])
      expect(cell(field)).toHaveTextContent('0')
  })
})
