import { useCallback, useState } from 'react'
import type { GameClient } from '../../platform/game-client'
import type { SimulatedAppearanceRow } from '../../platform/generated/SimulatedAppearanceRow'
import { useNativeRead } from './useNativeRead'
import { formatXg } from '../../domain/matches/xg'
import { Button } from '../../components/ui/Button'

function Event({
  event,
  labels,
}: {
  event: unknown
  labels: Record<string, string>
}) {
  if (typeof event !== 'object' || event === null) return <li>Unknown event</li>
  const e = event as Record<string, unknown>
  const name = (key: unknown) =>
    typeof key === 'string' ? (labels[key] ?? key) : 'Unknown player'
  return (
    <li>
      {typeof e.minute === 'number' ? `${e.minute}′` : ''}{' '}
      {typeof e.kind === 'string' ? e.kind : 'Event'} — {name(e.simulationKey)}
      {typeof e.assistKey === 'string' && `, assist: ${name(e.assistKey)}`}
      {typeof e.incomingSimulationKey === 'string' &&
        `, on: ${name(e.incomingSimulationKey)}`}
    </li>
  )
}
function Appearances({
  name,
  rows,
  labels,
}: {
  name: string
  rows: SimulatedAppearanceRow[]
  labels: Record<string, string>
}) {
  return (
    <table className="w-full text-left">
      <caption>{name} appearances — ratings out of 100</caption>
      <thead>
        <tr>
          {[
            'Player',
            'Started',
            'Minutes',
            'Goals',
            'Assists',
            'Rating',
            'Yellow cards',
            'Red cards',
          ].map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id}>
            <th scope="row">{labels[a.playerId] ?? 'Unknown player'}</th>
            <td>{a.started ? 'Yes' : 'No'}</td>
            <td>{a.minutes}</td>
            <td>{a.goals}</td>
            <td>{a.assists}</td>
            <td>{a.rating}</td>
            <td>{a.yellowCards}</td>
            <td>{a.redCards}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
export function NativeMatches({
  client,
  campaignId,
}: {
  client: GameClient
  campaignId: string
}) {
  const [round, setRound] = useState<number | null>(null)
  const key = JSON.stringify([campaignId, round])
  const load = useCallback(
    () => client.matchdayView(campaignId, round),
    [client, campaignId, round],
  )
  const { state, retry } = useNativeRead(key, load)
  if (state.status === 'loading')
    return <p role="status">Loading fixtures and results.</p>
  if (state.status === 'error')
    return (
      <>
        <p role="alert">{state.error}</p>
        <Button onClick={retry}>Retry fixtures</Button>
      </>
    )
  const data = state.data
  const name = (id: string) => data.labels[id] ?? 'Unknown club'
  return (
    <section aria-label="Fixtures and results" className="space-y-6">
      <label>
        Round{' '}
        <select
          value={round ?? data.round}
          onChange={(e) => setRound(Number(e.target.value))}
        >
          {Array.from({ length: 34 }, (_, i) => (
            <option key={i} value={i + 1}>
              {i + 1}
            </option>
          ))}
        </select>
      </label>
      {!data.calendarExists && (
        <p>The calendar will be saved with the first matchday.</p>
      )}
      {data.fixtures.map((f) => {
        const result = data.matches.find((m) => m.fixtureId === f.id)
        const appearances = data.appearances.filter((a) => a.fixtureId === f.id)
        return (
          <section
            key={f.id}
            aria-label={`${name(f.homeClubId)} v ${name(f.awayClubId)}`}
          >
            <h2>
              {name(f.homeClubId)} v {name(f.awayClubId)}
            </h2>
            <p>{f.matchDate}</p>
            {result ? (
              <>
                <p>
                  Score: {result.homeGoals}–{result.awayGoals} · xG:{' '}
                  {formatXg(result.homeXgMilli)}–{formatXg(result.awayXgMilli)}
                </p>
                <details>
                  <summary>Match report</summary>
                  <h3>Events</h3>
                  {Array.isArray(result.timeline) &&
                  result.timeline.length > 0 ? (
                    <ol aria-label="Match events">
                      {result.timeline.map((event: unknown, i: number) => (
                        <Event key={i} event={event} labels={data.labels} />
                      ))}
                    </ol>
                  ) : (
                    <p>No events.</p>
                  )}
                  <Appearances
                    name={name(f.homeClubId)}
                    rows={appearances.filter((a) => a.clubId === f.homeClubId)}
                    labels={data.labels}
                  />
                  <Appearances
                    name={name(f.awayClubId)}
                    rows={appearances.filter((a) => a.clubId === f.awayClubId)}
                    labels={data.labels}
                  />
                </details>
              </>
            ) : (
              <p>Scheduled</p>
            )}
          </section>
        )
      })}
      <p>
        Order: points, goal difference, goals scored, then club simulation key.
      </p>
      {data.leagues.map((league, i) => (
        <table key={i} className="w-full text-left">
          <caption>
            {league.name} standings through round {data.round}
          </caption>
          <thead>
            <tr>
              {[
                'Club',
                'Played',
                'Won',
                'Drawn',
                'Lost',
                'Goals for',
                'Goals against',
                'Goal difference',
                'Points',
              ].map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {league.rows.map((r) => (
              <tr key={r.clubId}>
                <th scope="row">{r.clubName}</th>
                <td>{r.played}</td>
                <td>{r.won}</td>
                <td>{r.drawn}</td>
                <td>{r.lost}</td>
                <td>{r.goalsFor}</td>
                <td>{r.goalsAgainst}</td>
                <td>{r.goalDifference}</td>
                <td>{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </section>
  )
}
