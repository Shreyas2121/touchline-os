import { useRef, useState, type FormEvent } from 'react'
import { staleSave } from '../../app/copy'
import { useDatabase } from '../../app/providers/database'
import { Button } from '../../components/ui/Button'
import { systemClock } from '../../data/clock'
import { recordMatch } from '../../data/commands/record-match'
import { createEntityId } from '../../data/ids'
import { parseDateOnly } from '../../domain/models/dates'
import { appearancesFromLineup } from '../../domain/matches/from-lineup'
import { parseXgMilli } from '../../domain/matches/xg'
import { limits } from '../../domain/validation/limits'
import type { EntityId, Lineup, Player } from '../../domain/validation/schemas'

const controlClass =
  'touchline-focus rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1'

type DraftSource = 'starter' | 'bench' | 'added'

type AppearanceDraft = {
  key: string
  playerId: string
  minutes: string
  started: boolean
  played: boolean
  goals: string
  assists: string
  source: DraftSource
}

type SheetAppearance = {
  playerId: string
  minutes: number
  started: boolean
  goals: number | null
  assists: number | null
}

type Sheet = {
  date: string
  opponent: string
  homeAway: 'home' | 'away'
  goalsFor: number
  goalsAgainst: number
  competition: string | null
  notes: string | null
  xgFor: number | null
  xgAgainst: number | null
  appearances: SheetAppearance[]
}

function parseWhole(value: string, max: number): number | undefined {
  const text = value.trim()
  if (!/^(0|[1-9]\d*)$/.test(text)) return undefined
  const parsed = Number(text)
  if (parsed > max) return undefined
  return parsed
}

function parseOptionalWhole(
  value: string,
  max: number,
): number | null | undefined {
  if (value.trim() === '') return null
  return parseWhole(value, max)
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function sheetFrom(input: {
  date: string
  opponent: string
  homeAway: string
  goalsFor: string
  goalsAgainst: string
  competition: string
  notes: string
  xgFor: string
  xgAgainst: string
  drafts: readonly AppearanceDraft[]
}): Sheet | null {
  const date = parseDateOnly(input.date)
  const opponent = input.opponent.trim()
  const goalsFor = parseWhole(input.goalsFor, limits.goalsMax)
  const goalsAgainst = parseWhole(input.goalsAgainst, limits.goalsMax)
  const xgFor = parseXgMilli(input.xgFor)
  const xgAgainst = parseXgMilli(input.xgAgainst)
  const competition = blankToNull(input.competition)
  const notes = blankToNull(input.notes)
  if (
    !date.ok ||
    opponent.length < 1 ||
    opponent.length > limits.nameMax ||
    (input.homeAway !== 'home' && input.homeAway !== 'away') ||
    goalsFor === undefined ||
    goalsAgainst === undefined ||
    !xgFor.ok ||
    !xgAgainst.ok ||
    (competition !== null && competition.length > limits.competitionKeyMax) ||
    (notes !== null && notes.length > limits.noteMax)
  )
    return null
  const appearances: SheetAppearance[] = []
  for (const draft of input.drafts) {
    if (!draft.played) continue
    const minutesText = draft.minutes.trim()
    const goalsText = draft.goals.trim()
    const assistsText = draft.assists.trim()
    if (
      draft.playerId === '' &&
      minutesText === '' &&
      goalsText === '' &&
      assistsText === '' &&
      !draft.started
    )
      continue
    const minutes = parseWhole(minutesText, limits.minutesMax)
    const goals = parseOptionalWhole(goalsText, limits.goalsMax)
    const assists = parseOptionalWhole(assistsText, limits.goalsMax)
    if (
      draft.playerId === '' ||
      minutes === undefined ||
      goals === undefined ||
      assists === undefined
    )
      return null
    appearances.push({
      playerId: draft.playerId,
      minutes,
      started: draft.started,
      goals,
      assists,
    })
  }
  const playerIds = appearances.map((appearance) => appearance.playerId)
  if (new Set(playerIds).size !== playerIds.length) return null
  return {
    date: date.value,
    opponent,
    homeAway: input.homeAway,
    goalsFor,
    goalsAgainst,
    competition,
    notes,
    xgFor: xgFor.value,
    xgAgainst: xgAgainst.value,
    appearances,
  }
}

export function MatchForm({
  campaignId,
  seasonId,
  revision,
  players,
  lineups,
  onSaved,
}: {
  campaignId: EntityId
  seasonId: EntityId
  revision: number
  players: readonly Player[]
  lineups: readonly Lineup[]
  onSaved: () => void
}) {
  const database = useDatabase()
  const saving = useRef(false)
  const [date, setDate] = useState('')
  const [opponent, setOpponent] = useState('')
  const [homeAway, setHomeAway] = useState('')
  const [goalsFor, setGoalsFor] = useState('')
  const [goalsAgainst, setGoalsAgainst] = useState('')
  const [competition, setCompetition] = useState('')
  const [notes, setNotes] = useState('')
  const [xgForText, setXgForText] = useState('')
  const [xgAgainstText, setXgAgainstText] = useState('')
  const [lineupId, setLineupId] = useState('')
  const [drafts, setDrafts] = useState<AppearanceDraft[]>([])
  const [leftOff, setLeftOff] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const squad = [...players].sort((left, right) =>
    left.name.localeCompare(right.name, 'en'),
  )
  const used = new Set(
    drafts.map((draft) => draft.playerId).filter((id) => id !== ''),
  )
  const xgFor = parseXgMilli(xgForText)
  const xgAgainst = parseXgMilli(xgAgainstText)
  const xgMessage = !xgFor.ok
    ? xgFor.message
    : !xgAgainst.ok
      ? xgAgainst.message
      : ''
  const sheet = sheetFrom({
    date,
    opponent,
    homeAway,
    goalsFor,
    goalsAgainst,
    competition,
    notes,
    xgFor: xgForText,
    xgAgainst: xgAgainstText,
    drafts,
  })
  const openRow = drafts.some((draft) => draft.played && draft.playerId === '')
  const remaining = squad.some((player) => !used.has(player.id))

  function edit(key: string, patch: Partial<AppearanceDraft>) {
    setError('')
    setDrafts((current) =>
      current.map((draft) =>
        draft.key === key ? { ...draft, ...patch } : draft,
      ),
    )
  }

  function fill() {
    const lineup = lineups.find((item) => item.id === lineupId)
    if (!lineup) return
    const result = appearancesFromLineup(
      lineup,
      new Set(squad.map((player) => player.id)),
    )
    setError('')
    setLeftOff(result.skipped > 0)
    setDrafts(
      result.drafts.map((draft) => ({
        key: draft.playerId,
        playerId: draft.playerId,
        minutes: draft.minutes === null ? '' : String(draft.minutes),
        started: draft.started,
        played: draft.played,
        goals: '',
        assists: '',
        source: draft.played ? 'starter' : 'bench',
      })),
    )
  }

  function addAppearance() {
    setError('')
    setDrafts((current) => [
      ...current,
      {
        key: createEntityId(),
        playerId: '',
        minutes: '',
        started: false,
        played: true,
        goals: '',
        assists: '',
        source: 'added',
      },
    ])
  }

  async function record(event: FormEvent) {
    event.preventDefault()
    const current = sheetFrom({
      date,
      opponent,
      homeAway,
      goalsFor,
      goalsAgainst,
      competition,
      notes,
      xgFor: xgForText,
      xgAgainst: xgAgainstText,
      drafts,
    })
    if (!current || saving.current) return
    saving.current = true
    setBusy(true)
    setError('')
    try {
      const outcome = await recordMatch(database, {
        campaignId,
        seasonId,
        matchId: createEntityId(),
        date: current.date,
        opponent: current.opponent,
        homeAway: current.homeAway,
        goalsFor: current.goalsFor,
        goalsAgainst: current.goalsAgainst,
        competition: current.competition,
        notes: current.notes,
        xgFor: current.xgFor,
        xgAgainst: current.xgAgainst,
        appearances: current.appearances.map((appearance) => ({
          appearanceId: createEntityId(),
          playerId: appearance.playerId,
          minutes: appearance.minutes,
          started: appearance.started,
          goals: appearance.goals,
          assists: appearance.assists,
        })),
        expectedRevision: revision,
        now: systemClock(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
      })
      if (!outcome.ok) {
        setError(outcome.code === 'CONFLICT' ? staleSave : outcome.message)
        return
      }
      onSaved()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The match could not be recorded.',
      )
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(event) => void record(event)}
    >
      <label>
        Date{' '}
        <input
          className={controlClass}
          type="date"
          value={date}
          onChange={(event) => {
            setDate(event.target.value)
            setError('')
          }}
        />
      </label>
      <label>
        Opponent{' '}
        <input
          className={controlClass}
          value={opponent}
          maxLength={limits.nameMax}
          onChange={(event) => {
            setOpponent(event.target.value)
            setError('')
          }}
        />
      </label>
      <label>
        Home or away{' '}
        <select
          className={controlClass}
          value={homeAway}
          onChange={(event) => {
            setHomeAway(event.target.value)
            setError('')
          }}
        >
          <option value=""> </option>
          <option value="home">Home</option>
          <option value="away">Away</option>
        </select>
      </label>
      <label>
        Goals for{' '}
        <input
          className={controlClass}
          inputMode="numeric"
          value={goalsFor}
          onChange={(event) => {
            setGoalsFor(event.target.value)
            setError('')
          }}
        />
      </label>
      <label>
        Goals against{' '}
        <input
          className={controlClass}
          inputMode="numeric"
          value={goalsAgainst}
          onChange={(event) => {
            setGoalsAgainst(event.target.value)
            setError('')
          }}
        />
      </label>
      <label>
        Competition{' '}
        <input
          className={controlClass}
          value={competition}
          maxLength={limits.competitionKeyMax}
          onChange={(event) => {
            setCompetition(event.target.value)
            setError('')
          }}
        />
      </label>
      <label>
        Notes{' '}
        <textarea
          className={controlClass}
          value={notes}
          maxLength={limits.noteMax}
          onChange={(event) => {
            setNotes(event.target.value)
            setError('')
          }}
        />
      </label>
      <label>
        xG for{' '}
        <input
          className={controlClass}
          inputMode="decimal"
          value={xgForText}
          onChange={(event) => {
            setXgForText(event.target.value)
            setError('')
          }}
        />
      </label>
      <label>
        xG against{' '}
        <input
          className={controlClass}
          inputMode="decimal"
          value={xgAgainstText}
          onChange={(event) => {
            setXgAgainstText(event.target.value)
            setError('')
          }}
        />
      </label>
      {xgMessage ? <p role="alert">{xgMessage}</p> : null}
      {lineups.length === 0 ? (
        <p>Save a lineup on Tactics to fill a match from it.</p>
      ) : (
        <div className="space-y-2">
          <label>
            Lineup{' '}
            <select
              className={controlClass}
              value={lineupId}
              onChange={(event) => {
                setLineupId(event.target.value)
                setError('')
              }}
            >
              <option value="">Choose a lineup</option>
              {lineups.map((lineup) => (
                <option key={lineup.id} value={lineup.id}>
                  {lineup.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            disabled={lineupId === '' || busy}
            onClick={fill}
          >
            Fill from lineup
          </Button>
        </div>
      )}
      {leftOff ? (
        <p>
          Some players on this lineup are no longer at the club and were left
          off.
        </p>
      ) : null}
      {drafts.map((draft) => {
        const options = squad.filter(
          (player) => player.id === draft.playerId || !used.has(player.id),
        )
        const name =
          squad.find((player) => player.id === draft.playerId)?.name ??
          'Appearance'
        return (
          <fieldset key={draft.key} className="space-y-2">
            <legend>{name}</legend>
            <label>
              Player{' '}
              <select
                className={controlClass}
                value={draft.playerId}
                onChange={(event) =>
                  edit(draft.key, { playerId: event.target.value })
                }
              >
                {draft.playerId === '' ? (
                  <option value="">Choose</option>
                ) : null}
                {options.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Minutes{' '}
              <input
                className={controlClass}
                inputMode="numeric"
                value={draft.minutes}
                onChange={(event) =>
                  edit(draft.key, { minutes: event.target.value })
                }
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={draft.started}
                onChange={(event) =>
                  edit(draft.key, { started: event.target.checked })
                }
              />{' '}
              Started
            </label>
            {draft.source === 'bench' ? (
              <label>
                <input
                  type="checkbox"
                  checked={draft.played}
                  onChange={(event) =>
                    edit(draft.key, { played: event.target.checked })
                  }
                />{' '}
                Played
              </label>
            ) : null}
            <label>
              Goals{' '}
              <input
                className={controlClass}
                inputMode="numeric"
                value={draft.goals}
                onChange={(event) =>
                  edit(draft.key, { goals: event.target.value })
                }
              />
            </label>
            <label>
              Assists{' '}
              <input
                className={controlClass}
                inputMode="numeric"
                value={draft.assists}
                onChange={(event) =>
                  edit(draft.key, { assists: event.target.value })
                }
              />
            </label>
            {draft.source === 'bench' &&
            draft.played &&
            draft.minutes.trim() === '' ? (
              <p>Enter minutes for this substitute.</p>
            ) : null}
          </fieldset>
        )
      })}
      <Button
        type="button"
        disabled={!remaining || openRow || busy}
        onClick={addAppearance}
      >
        Add appearance
      </Button>
      {error ? <p role="alert">{error}</p> : null}
      <Button type="submit" variant="primary" disabled={sheet === null || busy}>
        Record match
      </Button>
    </form>
  )
}
