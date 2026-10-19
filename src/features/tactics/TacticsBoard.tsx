import { useEffect, useId, useMemo, useState } from 'react'
import {
  lineupDiscardWarning,
  lineupRosterMismatch,
  lineupSaved,
  lineupDeleted,
  loadingLineups,
  lineupsFailed,
  staleSave,
} from '../../app/copy'
import { useDatabase } from '../../app/providers/database'
import { systemClock } from '../../data/clock'
import { createEntityId } from '../../data/ids'
import { saveLineup } from '../../data/commands/save-lineup'
import { deleteLineup } from '../../data/commands/delete-lineup'
import { listLineups } from '../../data/repositories/lineups'
import { PitchSvg } from '../../components/graphics/PitchSvg'
import { Button } from '../../components/ui/Button'
import {
  formationSlots,
  pitchLinePaths,
  type FormationId,
} from '../../domain/graphics/pitch'
import {
  clearSlot,
  emptyDraft,
  placeOnBench,
  placeOnSlot,
  switchFormation,
  lineupProblems,
  type LineupDraft,
  type PlaceResult,
} from '../../domain/player/lineup-draft'
import { compareSquadRows } from '../../domain/player/squad-view'
import type {
  EntityId,
  Lineup,
  Player,
  Season,
} from '../../domain/validation/schemas'

function draftFromLineup(lineup: Lineup): LineupDraft {
  return {
    name: lineup.name,
    formation: lineup.formation,
    starters: lineup.starters.map((starter) => ({ ...starter })),
    benchPlayerIds: [...lineup.benchPlayerIds],
  }
}

const formations: readonly FormationId[] = [
  '4-3-3',
  '4-2-3-1',
  '4-4-2',
  '3-5-2',
]

export function TacticsBoard({
  players,
  season,
  campaignId,
  initialRevision,
}: {
  players: readonly Player[]
  season?: Season
  campaignId: EntityId
  initialRevision: number
}) {
  const database = useDatabase()
  const [draft, setDraft] = useState(emptyDraft)
  const [lineupId, setLineupId] = useState(createEntityId)
  const [lineups, setLineups] = useState<Lineup[] | null>(null)
  const [revision, setRevision] = useState(initialRevision)
  const [busy, setBusy] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [heldId, setHeldId] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const formationId = useId()
  const savedSelectId = useId()
  const nameId = useId()
  const seasonId = season?.id
  const roster = useMemo(
    () =>
      [...players].sort((left, right) =>
        compareSquadRows(
          left,
          right,
          'name',
          'asc',
          season ?? { startDate: null, ordinal: 0 },
        ),
      ),
    [players, season],
  )
  const rosterIds = roster.map((player) => player.id)
  const held = roster.find((player) => player.id === heldId)
  const slots = formationSlots(draft.formation)
  const problems = lineupProblems(draft, rosterIds)
  const savedLineup = lineups?.find((lineup) => lineup.id === lineupId)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const saved = seasonId
          ? await listLineups(database, campaignId, seasonId)
          : []
        if (!active) return
        setLineups(saved)
        if (saved[0]) {
          setDraft(draftFromLineup(saved[0]))
          setLineupId(saved[0].id)
        }
      } catch {
        if (active) setLoadFailed(true)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [database, campaignId, seasonId])

  useEffect(() => {
    function dropHold(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setHeldId(null)
        setDeleteOpen(false)
      }
    }
    window.addEventListener('keydown', dropHold)
    return () => window.removeEventListener('keydown', dropHold)
  }, [])

  function applyPlacement(result: PlaceResult) {
    if (result.ok) {
      setDraft(result.draft)
      setNotice('')
    } else {
      setNotice(
        {
          BENCH_FULL: 'The bench is full.',
          UNKNOWN_PLAYER: 'This player is not in the current roster.',
          UNKNOWN_SLOT: 'This slot is not in the current formation.',
        }[result.code],
      )
    }
    setHeldId(null)
  }

  function chooseLineup(lineup?: Lineup) {
    setDraft(lineup ? draftFromLineup(lineup) : emptyDraft())
    setLineupId(lineup?.id ?? createEntityId())
    setHeldId(null)
    setSelectedSlot(null)
    setDeleteOpen(false)
    setError('')
    setNotice('')
  }

  async function save() {
    if (busy || !seasonId || !draft.name.trim() || problems.length) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await saveLineup(database, {
        ...draft,
        campaignId,
        lineupId,
        seasonId,
        expectedRevision: revision,
        now: systemClock(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
      })
      if (!result.ok) {
        setError(result.code === 'CONFLICT' ? staleSave : result.message)
        return
      }
      setRevision(result.revision)
      setDraft(draftFromLineup(result.value))
      setLineupId(result.value.id)
      setNotice(lineupSaved(result.value.name))
      try {
        setLineups(await listLineups(database, campaignId, seasonId))
      } catch {
        setLoadFailed(true)
      }
    } catch {
      setError('This lineup could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (busy || !savedLineup || !seasonId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await deleteLineup(database, {
        campaignId,
        lineupId: savedLineup.id,
        expectedRevision: revision,
        now: systemClock(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
      })
      if (!result.ok) {
        setError(result.code === 'CONFLICT' ? staleSave : result.message)
        return
      }
      setRevision(result.revision)
      try {
        const remaining = await listLineups(database, campaignId, seasonId)
        setLineups(remaining)
        chooseLineup(remaining[0])
        setNotice(lineupDeleted(savedLineup.name))
      } catch {
        setLoadFailed(true)
      }
    } catch {
      setError('This lineup could not be deleted. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (loadFailed) return <p role="alert">{lineupsFailed}</p>
  if (!lineups) return <p>{loadingLineups}</p>

  return (
    <section aria-label="Tactical planning">
      <fieldset disabled={busy} className="min-w-0">
        <p>{lineupDiscardWarning}</p>
        <label htmlFor={savedSelectId}>Saved lineups</label>
        <select
          id={savedSelectId}
          value={savedLineup?.id ?? ''}
          onChange={(event) => {
            const chosen = lineups.find(
              (lineup) => lineup.id === event.target.value,
            )
            if (chosen) chooseLineup(chosen)
          }}
        >
          {!savedLineup && (
            <option value="" disabled>
              {lineups.length ? 'New lineup' : 'No saved lineups'}
            </option>
          )}
          {lineups.map((lineup) => (
            <option key={lineup.id} value={lineup.id}>
              {lineup.name}
            </option>
          ))}
        </select>
        <Button onClick={() => chooseLineup()}>New lineup</Button>
        <label htmlFor={nameId}>Lineup name</label>
        <input
          id={nameId}
          value={draft.name}
          maxLength={120}
          onChange={(event) => {
            const name = event.target.value
            setDraft((current) => ({ ...current, name }))
          }}
        />
        <Button
          disabled={
            busy || !seasonId || !draft.name.trim() || problems.length > 0
          }
          onClick={() => void save()}
        >
          Save lineup
        </Button>
        {savedLineup && (
          <Button onClick={() => setDeleteOpen(true)}>Delete lineup</Button>
        )}
        {deleteOpen && savedLineup && (
          <section aria-label="Delete lineup">
            <p>Delete {savedLineup.name}?</p>
            <Button onClick={() => void remove()}>
              Delete {savedLineup.name}
            </Button>
            <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          </section>
        )}
        {problems.length > 0 && <p role="alert">{lineupRosterMismatch}</p>}
        {!seasonId && <p>This campaign has no active season.</p>}
        {error && <p role="alert">{error}</p>}
        <label htmlFor={formationId}>Formation</label>
        <select
          id={formationId}
          value={draft.formation}
          onChange={(event) => {
            const formation = event.target.value as FormationId
            setDraft((current) => switchFormation(current, formation))
            setSelectedSlot(null)
            setHeldId(null)
            setNotice('Starting slots were cleared.')
          }}
        >
          {formations.map((formation) => (
            <option key={formation}>{formation}</option>
          ))}
        </select>
        <p aria-live="polite" className="min-h-6">
          {held ? `Holding ${held.name}` : ''}
        </p>
        {notice && <p role="status">{notice}</p>}
        <div className="grid items-start gap-6 xl:grid-cols-[16rem_minmax(0,1fr)]">
          <div>
            <h3>Roster</h3>
            <ul
              aria-label="Roster"
              className="max-h-[36rem] space-y-1 overflow-y-auto"
            >
              {roster.map((player) => (
                <li key={player.id}>
                  <Button
                    className="min-h-11 w-full text-left"
                    aria-label={player.name}
                    aria-pressed={heldId === player.id}
                    onClick={() => {
                      setHeldId(player.id)
                      setNotice('')
                    }}
                  >
                    {player.name}
                  </Button>
                </li>
              ))}
            </ul>
            {roster.length === 0 && <p>No players at this club.</p>}
            <Button
              className="min-h-11"
              disabled={!held}
              onClick={() => {
                if (held)
                  applyPlacement(placeOnBench(draft, held.id, rosterIds))
              }}
            >
              Send to bench
            </Button>
            <h3>Bench</h3>
            <ul aria-label="Bench">
              {draft.benchPlayerIds.map((id) => (
                <li key={id}>
                  {roster.find((player) => player.id === id)?.name ?? 'Unknown'}
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <div className="overflow-x-auto">
              <div className="relative w-[34rem] min-w-[30rem] max-w-full">
                <PitchSvg paths={pitchLinePaths()} />
                <div role="group" aria-label="Pitch slots">
                  {slots.map((slot) => {
                    const starter = draft.starters.find(
                      (starter) => starter.slot === slot.id,
                    )
                    const player = roster.find(
                      (player) => player.id === starter?.playerId,
                    )
                    const fit = player
                      ? player.positionGroup === 'UNKNOWN'
                        ? 'Unknown position'
                        : player.positionGroup === slot.group
                          ? 'Position fit'
                          : 'Different position'
                      : ''
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        aria-label={
                          player
                            ? `${slot.label}, ${player.name}, ${fit}`
                            : `${slot.label}, empty`
                        }
                        aria-pressed={selectedSlot === slot.id}
                        className="touchline-focus absolute min-h-[44px] min-w-[44px] w-[4.5rem] -translate-x-1/2 -translate-y-1/2 rounded border border-[var(--border)] bg-[var(--surface-2)] px-1 py-1 text-center text-xs aria-pressed:border-[var(--amber)]"
                        style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                        onClick={() => {
                          setSelectedSlot(slot.id)
                          if (held)
                            applyPlacement(
                              placeOnSlot(draft, held.id, slot.id, rosterIds),
                            )
                        }}
                      >
                        <span className="block font-semibold">
                          {slot.label}
                        </span>
                        {player && (
                          <>
                            <span className="block truncate">
                              {player.name}
                            </span>
                            <span className="block text-[10px]">{fit}</span>
                          </>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <Button
              className="min-h-11"
              disabled={
                !selectedSlot ||
                !draft.starters.some((starter) => starter.slot === selectedSlot)
              }
              onClick={() => {
                if (selectedSlot) {
                  setDraft((current) => clearSlot(current, selectedSlot))
                  setNotice('')
                }
              }}
            >
              Clear slot
            </Button>
          </div>
        </div>
      </fieldset>
    </section>
  )
}
