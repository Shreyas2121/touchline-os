import { useEffect, useId, useMemo, useState } from 'react'
import { lineupOnScreenOnly } from '../../app/copy'
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
  type PlaceResult,
} from '../../domain/player/lineup-draft'
import { compareSquadRows } from '../../domain/player/squad-view'
import type { Player, Season } from '../../domain/validation/schemas'

const formations: readonly FormationId[] = [
  '4-3-3',
  '4-2-3-1',
  '4-4-2',
  '3-5-2',
]

export function TacticsBoard({
  players,
  season,
}: {
  players: readonly Player[]
  season?: Pick<Season, 'startDate' | 'ordinal'>
}) {
  const [draft, setDraft] = useState(emptyDraft)
  const [heldId, setHeldId] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const formationId = useId()
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

  useEffect(() => {
    function dropHold(event: KeyboardEvent) {
      if (event.key === 'Escape') setHeldId(null)
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

  return (
    <section aria-label="Tactical planning">
      <p>{lineupOnScreenOnly}</p>
      <label htmlFor={formationId}>Formation</label>
      <select
        id={formationId}
        value={draft.formation}
        onChange={(event) => {
          setDraft((current) =>
            switchFormation(current, event.target.value as FormationId),
          )
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
              if (held) applyPlacement(placeOnBench(draft, held.id, rosterIds))
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
                      <span className="block font-semibold">{slot.label}</span>
                      {player && (
                        <>
                          <span className="block truncate">{player.name}</span>
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
    </section>
  )
}
