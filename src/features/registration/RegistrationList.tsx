import { useState, type FormEvent } from 'react'
import { staleSave } from '../../app/copy'
import { useDatabase } from '../../app/providers/database'
import { Button } from '../../components/ui/Button'
import { StatusPill } from '../../components/ui/StatusPill'
import { systemClock } from '../../data/clock'
import { saveRegistration } from '../../data/commands/save-registration'
import { createEntityId } from '../../data/ids'
import { dateOnlySchema } from '../../domain/models/dates'
import { displayAge } from '../../domain/player/squad-view'
import { evaluateAction } from '../../domain/rules/evaluate-action'
import type { RuleReport } from '../../domain/rules/types'
import type {
  Constitution,
  EntityId,
  Player,
  Registration,
  Season,
} from '../../domain/validation/schemas'

const controlClass =
  'touchline-focus rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1'

type Status = Registration['status']
type Draft = {
  status: Status
  homegrownClub: boolean | null
  homegrownNation: boolean | null
  ageExempt: boolean | null
}

function emptyDraft(): Draft {
  return {
    status: 'unknown',
    homegrownClub: null,
    homegrownNation: null,
    ageExempt: null,
  }
}

function draftFor(player: Player, rows: readonly Registration[]): Draft {
  const row = rows.find((item) => item.playerId === player.id)
  if (!row) return emptyDraft()
  return {
    status: row.status,
    homegrownClub: row.homegrownClub,
    homegrownNation: row.homegrownNation,
    ageExempt: row.ageExempt,
  }
}

function draftsFor(
  players: readonly Player[],
  rows: readonly Registration[],
): Record<string, Draft> {
  return Object.fromEntries(
    players.map((player) => [player.id, draftFor(player, rows)]),
  )
}

export function RegistrationList({
  campaignId,
  season,
  players,
  constitution,
  registrations,
  revision,
  onSaved,
  onEdit,
}: {
  campaignId: EntityId
  season: Season
  players: readonly Player[]
  constitution?: Constitution
  registrations: readonly Registration[]
  revision: number
  onSaved: (revision: number) => void
  onEdit: () => void
}) {
  const database = useDatabase()
  const squad = [...players].sort((left, right) =>
    left.name.localeCompare(right.name, 'en'),
  )
  const [drafts, setDrafts] = useState(() => draftsFor(players, registrations))
  const [report, setReport] = useState<RuleReport | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const rule = constitution?.rules.find(
    (item) => item.id === 'REGISTRATION_QUOTA',
  )
  const blocked =
    !report || report.verdicts.some((verdict) => verdict.severity === 'BLOCK')

  function edit(playerId: string, patch: Partial<Draft>) {
    setReport(null)
    setError('')
    onEdit()
    setDrafts((current) => ({
      ...current,
      [playerId]: { ...(current[playerId] ?? emptyDraft()), ...patch },
    }))
  }

  function preview(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!constitution || !rule || rule.id !== 'REGISTRATION_QUOTA') {
      setReport(null)
      setError('Save a constitution before registering a squad.')
      return
    }
    const quota = rule
    const effectiveDate =
      season.startDate ?? dateOnlySchema.parse(systemClock().slice(0, 10))
    setReport(
      evaluateAction(
        {
          type: 'registration',
          competitionKey: quota.competitionKey,
          players: squad.map((player) => {
            const draft = drafts[player.id] ?? emptyDraft()
            const age = displayAge(player, season)
            return {
              playerId: player.id,
              status: draft.status,
              homegrownClub: draft.homegrownClub,
              homegrownNation: draft.homegrownNation,
              ageExempt: draft.ageExempt,
              age: age.kind === 'unknown' ? null : age.years,
            }
          }),
        },
        { revision, remainingCapacityCents: null },
        constitution,
        effectiveDate,
      ),
    )
  }

  async function confirm() {
    if (
      blocked ||
      busy ||
      !constitution ||
      !rule ||
      rule.id !== 'REGISTRATION_QUOTA'
    )
      return
    const quota = rule
    setBusy(true)
    setError('')
    try {
      const outcome = await saveRegistration(database, {
        campaignId,
        seasonId: season.id,
        competitionKey: quota.competitionKey,
        expectedRevision: revision,
        now: systemClock(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
        players: squad.map((player) => {
          const draft = drafts[player.id] ?? emptyDraft()
          const stored = registrations.find((row) => row.playerId === player.id)
          return {
            playerId: player.id,
            registrationId: stored?.id ?? createEntityId(),
            status: draft.status,
            homegrownClub: draft.homegrownClub,
            homegrownNation: draft.homegrownNation,
            ageExempt: draft.ageExempt,
          }
        }),
      })
      if (!outcome.ok) {
        setError(outcome.code === 'CONFLICT' ? staleSave : outcome.message)
        return
      }
      onSaved(outcome.revision)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The registration could not be saved.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <form noValidate className="space-y-4" onSubmit={preview}>
        {squad.map((player) => {
          const draft = drafts[player.id] ?? emptyDraft()
          return (
            <fieldset key={player.id} className="space-y-2">
              <legend>{player.name}</legend>
              <div>
                <label htmlFor={`status-${player.id}`}>
                  Status for {player.name}
                </label>{' '}
                <select
                  id={`status-${player.id}`}
                  className={controlClass}
                  value={draft.status}
                  onChange={(event) =>
                    edit(player.id, { status: event.target.value as Status })
                  }
                >
                  <option value="registered">Registered</option>
                  <option value="ineligible">Ineligible</option>
                  <option value="unknown">Unknown</option>
                </select>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={draft.homegrownClub === true}
                  onChange={(event) =>
                    edit(player.id, { homegrownClub: event.target.checked })
                  }
                />{' '}
                Homegrown at club
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.homegrownNation === true}
                  onChange={(event) =>
                    edit(player.id, { homegrownNation: event.target.checked })
                  }
                />{' '}
                Homegrown in nation
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.ageExempt === true}
                  onChange={(event) =>
                    edit(player.id, { ageExempt: event.target.checked })
                  }
                />{' '}
                Age exempt
              </label>
            </fieldset>
          )
        })}
        {error && <p role="alert">{error}</p>}
        <Button type="submit" variant="primary" disabled={busy}>
          Preview registration
        </Button>
      </form>
      {report && (
        <div
          role="region"
          aria-label="Preview result"
          className="touchline-focus space-y-3"
          tabIndex={-1}
        >
          <p>Preview only — no changes recorded.</p>
          {!report.verdicts.some((verdict) => verdict.severity === 'BLOCK') && (
            <p>No rule blocked this action.</p>
          )}
          {report.verdicts.length > 0 && (
            <ul className="space-y-3">
              {report.verdicts.map((verdict, index) => (
                <li key={`${verdict.code}-${index}`}>
                  <StatusPill
                    tone={
                      verdict.severity === 'BLOCK'
                        ? 'blocked'
                        : verdict.severity === 'WARN'
                          ? 'warning'
                          : 'informational'
                    }
                  />
                  <p>{verdict.message}</p>
                  <p>{verdict.remedy}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Button
        type="button"
        variant="primary"
        disabled={busy || blocked}
        onClick={() => void confirm()}
      >
        Confirm registration
      </Button>
    </div>
  )
}
