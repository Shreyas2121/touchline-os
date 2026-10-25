import { useCallback, useRef, useState } from 'react'
import type { GameClient } from '../../platform/game-client'
import type { LifecyclePreview } from '../../platform/generated/LifecyclePreview'
import type { LifecycleRequest } from '../../platform/generated/LifecycleRequest'
import type { PlayerAttributes } from '../../platform/generated/PlayerAttributes'
import type { DevelopmentSnapshotRow } from '../../platform/generated/DevelopmentSnapshotRow'
import { mapInvokeError } from '../../platform/errors'
import { staleSave } from '../copy'
import { Button } from '../../components/ui/Button'
import { useNativeRead } from './useNativeRead'

const money = new Intl.NumberFormat('en-IE', {
  style: 'currency',
  currency: 'EUR',
})
function euros(cents: number | null) {
  return cents === null ? 'Unknown' : money.format(cents / 100)
}
const attributes = [
  'pace',
  'finishing',
  'passing',
  'dribbling',
  'defending',
  'physical',
] as const
export const developmentHistoryEmpty =
  'Development is applied after the halfway matchday and at season review.'
function ratings(before: PlayerAttributes, after: PlayerAttributes) {
  return attributes
    .map(
      (key) =>
        `${key[0]!.toUpperCase()}${key.slice(1)} ${before[key] ?? 'Unknown'} → ${after[key] ?? 'Unknown'}`,
    )
    .join('; ')
}
function request(preview: LifecyclePreview): LifecycleRequest {
  const ids = (count: number) =>
    Array.from({ length: count }, () => crypto.randomUUID())
  return {
    campaignId: preview.campaignId,
    seasonId: preview.seasonId,
    expectedRevision: preview.revision,
    sourceDate: preview.sourceDate,
    sourceBoundaryKey: preview.sourceBoundaryKey,
    inputFingerprint: preview.inputFingerprint,
    ids: {
      players: ids(preview.idCounts.players),
      playerStates: ids(preview.idCounts.playerStates),
      contracts: ids(preview.idCounts.contracts),
      registrations: ids(preview.idCounts.registrations),
      ledger: ids(preview.idCounts.ledger),
      fixtures: ids(preview.idCounts.fixtures),
      seasons: ids(preview.idCounts.seasons),
      settlements: ids(preview.idCounts.settlements),
      objectives: ids(preview.idCounts.objectives),
      snapshots: ids(preview.idCounts.snapshots),
    },
    receiptId: crypto.randomUUID(),
    auditId: crypto.randomUUID(),
    actionId: crypto.randomUUID(),
    now: new Date().toISOString(),
  }
}
function useConfirmation(
  client: GameClient,
  onSaved: () => void,
  development: boolean,
) {
  const submitting = useRef(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  async function confirm(preview: LifecyclePreview) {
    if (submitting.current || done || !preview.allowed) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const input = request(preview)
      if (development) await client.applyDevelopment(input)
      else await client.settleSeason(input)
      setDone(true)
      onSaved()
    } catch (failure) {
      const mapped = mapInvokeError(failure)
      setError(mapped.code === 'CONFLICT' ? staleSave : mapped.message)
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  return { busy, done, error, confirm }
}
export function NativeDevelopment({
  client,
  campaignId,
  onSaved,
  onCancel,
}: {
  client: GameClient
  campaignId: string
  onSaved: () => void
  onCancel: () => void
}) {
  const load = useCallback(
    () => client.previewDevelopment(campaignId),
    [client, campaignId],
  )
  const { state, retry } = useNativeRead(campaignId, load)
  const { busy, done, error, confirm } = useConfirmation(client, onSaved, true)
  return (
    <section aria-label="Confirm development" className="space-y-3">
      <h3>Halfway development</h3>
      {state.status === 'loading' || busy ? (
        <p role="status">Calculating player development.</p>
      ) : state.status === 'error' ? (
        <p role="alert">{state.error}</p>
      ) : (
        <>
          <p>
            Review the changed ratings before applying development to the saved
            career.
          </p>
          <ul>
            {state.data.attributes.map((p) => (
              <li key={p.playerId}>
                <strong>{p.name}</strong>: {ratings(p.before, p.after)}. Value{' '}
                {euros(p.beforeValueCents)} → {euros(p.afterValueCents)}.
              </li>
            ))}
          </ul>
          {state.data.attributes.length === 0 && (
            <p>No managed player attributes change in this period.</p>
          )}
          {state.data.allowed && !done && (
            <Button
              onClick={() => {
                void confirm(state.data)
              }}
            >
              Confirm Apply Development
            </Button>
          )}
          {state.data.reason && <p>{state.data.reason}</p>}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {(error || state.status === 'error') && (
        <Button disabled={busy} onClick={retry}>
          Reload saved development
        </Button>
      )}
      <Button disabled={busy} onClick={onCancel}>
        Cancel
      </Button>
    </section>
  )
}
const objectiveNames = {
  league_title: 'League title',
  top_half: 'Top half',
  avoid_last: 'Avoid last',
}
export function NativeSeasons({
  client,
  campaignId,
  revision,
  onSaved,
}: {
  client: GameClient
  campaignId: string
  revision: number
  onSaved: () => void
}) {
  const load = useCallback(
    () => client.previewSeason(campaignId),
    [client, campaignId],
  )
  const { state, retry } = useNativeRead(`${campaignId}:${revision}`, load)
  const [confirming, setConfirming] = useState(false)
  const { busy, done, error, confirm } = useConfirmation(client, onSaved, false)
  const preview = state.status === 'success' ? state.data : null
  return (
    <section aria-label="Season review" className="space-y-3">
      {state.status === 'loading' || busy ? (
        <p role="status">Calculating the new season.</p>
      ) : state.status === 'error' ? (
        <p role="alert">{state.error}</p>
      ) : (
        preview && (
          <>
            <h2>{preview.closingLabel}</h2>
            {preview.settlement && (
              <p>
                Season settled on {preview.settlement.settledOn}. The next
                season is active.
              </p>
            )}
            {preview.managedPosition !== null && (
              <p>Final position: {preview.managedPosition}</p>
            )}
            <ul aria-label="Board objectives">
              {preview.objectives.map((o) => (
                <li key={o.kind}>
                  {objectiveNames[o.kind]}:{' '}
                  {o.outcome === 'met'
                    ? 'Met'
                    : o.outcome === 'missed'
                      ? 'Missed'
                      : 'Pending'}{' '}
                  — {euros(o.rewardCents)}
                </li>
              ))}
            </ul>
            <dl className="flex flex-wrap gap-6">
              {[
                ['League prize', preview.prizeCents],
                ['Objective bonus', preview.objectiveBonusCents],
                ['Approved carryover', preview.carryoverCents],
                ['Next board allocation', preview.allocationCents],
              ].map(([label, amount]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{euros(amount as number)}</dd>
                </div>
              ))}
            </dl>
            {preview.clubs.length > 0 && (
              <ul aria-label="Roster changes across all clubs">
                {(['renewed', 'released', 'retired', 'intake'] as const).map(
                  (kind) => (
                    <li key={kind}>
                      {kind[0]!.toUpperCase()}
                      {kind.slice(1)}:{' '}
                      {preview.clubs.reduce((sum, club) => sum + club[kind], 0)}
                    </li>
                  ),
                )}
              </ul>
            )}
            <ul>
              {preview.roster.map((p, i) => (
                <li key={`${p.name}:${i}`}>
                  {p.name}: {p.kind}
                </li>
              ))}
            </ul>
            {!preview.hasDevelopmentHistory && <p>{developmentHistoryEmpty}</p>}
            {preview.allowed && !done && !confirming && (
              <Button onClick={() => setConfirming(true)}>
                Start Next Season
              </Button>
            )}
            {preview.allowed && !done && confirming && (
              <section aria-label="Confirm next season" className="space-y-3">
                <p>
                  Settle this season and start the next season on July 1?
                  Awards, development, contracts, and academy intake will be
                  saved together.
                </p>
                <Button
                  onClick={() => {
                    void confirm(preview)
                  }}
                >
                  Confirm Start Next Season
                </Button>
                <Button onClick={() => setConfirming(false)}>Cancel</Button>
              </section>
            )}
            {preview.reason && <p>{preview.reason}</p>}
          </>
        )
      )}
      {error && <p role="alert">{error}</p>}
      {(error || state.status === 'error') && (
        <Button disabled={busy} onClick={retry}>
          Reload saved season
        </Button>
      )}
    </section>
  )
}
function historyRatings(snapshot: DevelopmentSnapshotRow) {
  const before: PlayerAttributes = {
    pace: snapshot.beforePace,
    finishing: snapshot.beforeFinishing,
    passing: snapshot.beforePassing,
    dribbling: snapshot.beforeDribbling,
    defending: snapshot.beforeDefending,
    physical: snapshot.beforePhysical,
  }
  const after: PlayerAttributes = {
    pace: snapshot.afterPace,
    finishing: snapshot.afterFinishing,
    passing: snapshot.afterPassing,
    dribbling: snapshot.afterDribbling,
    defending: snapshot.afterDefending,
    physical: snapshot.afterPhysical,
  }
  return ratings(before, after)
}
export function NativeDevelopmentHistory({
  client,
  campaignId,
  playerId,
  revision,
  fallback = [],
}: {
  client?: GameClient
  campaignId: string
  playerId: string
  revision: number
  fallback?: DevelopmentSnapshotRow[]
}) {
  const load = useCallback(async () => {
    const result = await client!.planning(campaignId, playerId)
    if (result.revision !== revision)
      throw { code: 'CONFLICT', message: staleSave }
    return result.history ?? []
  }, [client, campaignId, playerId, revision])
  const { state, retry } = useNativeRead(
    `${campaignId}:${playerId}:${revision}`,
    client ? load : null,
  )
  const history = client
    ? state.status === 'success'
      ? state.data
      : null
    : fallback
  return (
    <section aria-label="Development history">
      <h3>Development history</h3>
      {client && state.status === 'error' ? (
        <>
          <p role="alert">{state.error}</p>
          <Button onClick={retry}>Reload development history</Button>
        </>
      ) : history === null ? (
        <p>Loading development history.</p>
      ) : history.length === 0 ? (
        <p>{developmentHistoryEmpty}</p>
      ) : (
        <ul>
          {history.map((s) => (
            <li key={s.id}>
              {s.period === 'midseason' ? 'Midseason' : 'Season end'}:{' '}
              {historyRatings(s)}. Value {euros(s.beforeValueCents)} →{' '}
              {euros(s.afterValueCents)}.
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
