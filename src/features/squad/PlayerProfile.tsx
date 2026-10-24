import { loadPlayerProfile } from '../../data/queries/player-profile'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { staleSave } from '../../app/copy'
import { useDatabase } from '../../app/providers/database'
import { Button } from '../../components/ui/Button'
import { systemClock } from '../../data/clock'
import { createEntityId } from '../../data/ids'
import { saveContract } from '../../data/commands/save-contract'
import { saveShortlistItem } from '../../data/commands/save-shortlist-item'
import { updatePlayer } from '../../data/commands/update-player'
import { saveDevelopmentNote } from '../../data/commands/save-development-note'
import { parseDateOnly } from '../../domain/models/dates'
import { formatMoneyUnknown, parseMoneyCents } from '../../domain/models/money'
import { positions } from '../../domain/models/positions'
import {
  ageText,
  displayAge,
  sourceLabel,
} from '../../domain/player/squad-view'
import {
  contractEditUnavailable,
  playerEditUnavailable,
} from '../../domain/simulation/career'
import type {
  AuditEvent,
  Contract,
  DevelopmentPlan,
  Player,
  Season,
  ShortlistItem,
} from '../../domain/validation/schemas'

function tierText(tier: Contract['squadTier']): string {
  if (tier === 'key') return 'Key'
  if (tier === 'rotation') return 'Rotation'
  if (tier === 'youth') return 'Youth'
  return 'Unknown'
}

function compareContracts(left: Contract, right: Contract): number {
  if (left.status !== right.status) return left.status === 'active' ? -1 : 1
  if (left.startsOn === right.startsOn) return 0
  if (left.startsOn === null) return 1
  if (right.startsOn === null) return -1
  return left.startsOn < right.startsOn ? 1 : -1
}

const attributes = [
  ['pace', 'Pace'],
  ['finishing', 'Finishing'],
  ['passing', 'Passing'],
  ['dribbling', 'Dribbling'],
  ['defending', 'Defending'],
  ['physical', 'Physical'],
] as const
const ratingMessage = 'Enter a rating from 0 to 100, or leave it blank.'
type ProfileProps = {
  player: Player
  season?: Season
  revision: number
  readOnly?: boolean
  refreshing?: boolean
  onSaved: (revision: number) => void
}

export function PlayerProfile({
  player,
  season,
  revision,
  readOnly = false,
  refreshing = false,
  onSaved,
}: ProfileProps) {
  const database = useDatabase()
  const [details, setDetails] = useState<{
    revision: number
    plan?: DevelopmentPlan
    history: AuditEvent[]
    shortlist?: ShortlistItem
    contracts: Contract[]
    failed?: boolean
  } | null>(null)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    async function load() {
      try {
        const snapshot = await loadPlayerProfile(
          database,
          player.campaignId,
          player.id,
          season?.id,
          revision,
        )
        if (active) setDetails(snapshot)
      } catch {
        if (active)
          setDetails({ revision, history: [], contracts: [], failed: true })
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [database, player.campaignId, player.id, season, revision])
  return (
    <section aria-label="Selected player">
      <fieldset disabled={refreshing}>
        <h2>{player.name}</h2>
        <p>{player.positions.join(', ')}</p>
        <p>{player.nationalityCode ?? 'Unknown'}</p>
        <p>{player.birthDate ?? 'No birth date recorded.'}</p>
        <p>
          {ageText(season ? displayAge(player, season) : { kind: 'unknown' })}
        </p>
        <p>{formatMoneyUnknown(player.marketValueCents)}</p>
        <p>
          {readOnly
            ? `${playerEditUnavailable} ${contractEditUnavailable}`
            : `Source stays ${sourceLabel(player.source)}. This correction is recorded in activity.`}
        </p>
        {player.isNewgen && <p>Newgen</p>}
        <dl aria-label="Attributes">
          {attributes.map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{player.attributes[key] ?? 'Missing'}</dd>
            </div>
          ))}
        </dl>
        {details && details.revision === revision && !details.failed && (
          <ShortlistButton
            player={player}
            revision={revision}
            item={details.shortlist}
            onSaved={onSaved}
          />
        )}
        {readOnly ? null : (
          <ContractForm
            player={player}
            revision={revision}
            onSaved={onSaved}
            setMessage={setMessage}
          />
        )}
        {details && details.revision === revision && !details.failed && (
          <ContractList contracts={details.contracts} />
        )}
        {readOnly ? null : (
          <CorrectionForm
            key={JSON.stringify(player)}
            player={player}
            revision={revision}
            onSaved={onSaved}
            setMessage={setMessage}
          />
        )}
        {message && <p role="status">{message}</p>}
        {refreshing || !details || details.revision !== revision ? (
          <p>Loading player details.</p>
        ) : details.failed ? (
          <p role="alert">
            Player details could not be loaded. Reload and try again.
          </p>
        ) : (
          <>
            {season ? (
              <NoteForm
                key={JSON.stringify(details.plan ?? null)}
                player={player}
                season={season}
                revision={revision}
                plan={details.plan}
                onSaved={onSaved}
                setMessage={setMessage}
              />
            ) : (
              <p>This campaign has no active season.</p>
            )}
            <ul aria-label="History">
              {details.history.map((audit) => (
                <li key={audit.id}>{audit.summary}</li>
              ))}
            </ul>
            {details.history.length === 0 && (
              <p>No individual history for this player.</p>
            )}
          </>
        )}
      </fieldset>
    </section>
  )
}

function ShortlistButton({
  player,
  revision,
  item,
  onSaved,
}: {
  player: Player
  revision: number
  item?: ShortlistItem
  onSaved: (revision: number) => void
}) {
  const database = useDatabase()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const open = item?.status === 'open'
  async function add() {
    if (busy || open) return
    setBusy(true)
    setError('')
    try {
      const result = await saveShortlistItem(database, {
        campaignId: player.campaignId,
        itemId: item?.id ?? createEntityId(),
        playerId: player.id,
        expectedRevision: revision,
        now: systemClock(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
        priority: 3,
        notes: null,
        status: 'open',
      })
      if (!result.ok) {
        setError(result.code === 'CONFLICT' ? staleSave : result.message)
        return
      }
      onSaved(result.revision)
    } catch {
      setError('The shortlist could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div>
      <Button
        disabled={busy || open}
        onClick={() => {
          void add()
        }}
      >
        {open
          ? 'On the shortlist'
          : item
            ? 'Reopen shortlist'
            : 'Add to shortlist'}
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

function ContractList({ contracts }: { contracts: readonly Contract[] }) {
  const rows = [...contracts].sort(compareContracts)
  if (rows.length === 0) return <p>No contracts are recorded.</p>
  return (
    <ul aria-label="Contracts">
      {rows.map((contract) => (
        <li key={contract.id}>
          {contract.status === 'active' ? 'Active' : 'Ended'}{' '}
          {formatMoneyUnknown(contract.weeklyWageCents)}{' '}
          {tierText(contract.squadTier)} {contract.startsOn ?? 'Unknown'}{' '}
          {contract.expiresOn ?? 'Unknown'}
        </li>
      ))}
    </ul>
  )
}

function ContractForm({
  player,
  revision,
  onSaved,
  setMessage,
}: Omit<ProfileProps, 'season'> & { setMessage: (message: string) => void }) {
  const database = useDatabase()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    const text = (key: string) => String(form.get(key) ?? '').trim()
    const wageText = text('weeklyWage')
    const wage = wageText ? parseMoneyCents(wageText) : null
    if (wage && !wage.ok) {
      setError(wage.message)
      return
    }
    const startsText = text('startsOn')
    const starts = startsText ? parseDateOnly(startsText) : null
    if (starts && !starts.ok) {
      setError(starts.message)
      return
    }
    const expiresText = text('expiresOn')
    const expires = expiresText ? parseDateOnly(expiresText) : null
    if (expires && !expires.ok) {
      setError(expires.message)
      return
    }
    const tier = text('tier')
    const squadTier =
      tier === 'key' || tier === 'rotation' || tier === 'youth' ? tier : null
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const result = await saveContract(database, {
        campaignId: player.campaignId,
        contractId: createEntityId(),
        playerId: player.id,
        expectedRevision: revision,
        now: systemClock(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
        weeklyWageCents: wage?.ok ? wage.value : null,
        squadTier,
        startsOn: starts?.ok ? starts.value : null,
        expiresOn: expires?.ok ? expires.value : null,
      })
      if (!result.ok) {
        setError(result.code === 'CONFLICT' ? staleSave : result.message)
        return
      }
      setMessage('Saved the contract.')
      onSaved(result.revision)
    } catch {
      setError('The contract could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      aria-label="Contract"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <label>
        Weekly wage
        <input name="weeklyWage" inputMode="decimal" />
      </label>
      <label>
        Tier
        <select name="tier" defaultValue="">
          <option value="">Unknown</option>
          <option value="key">Key</option>
          <option value="rotation">Rotation</option>
          <option value="youth">Youth</option>
        </select>
      </label>
      <label>
        Starts on
        <input name="startsOn" placeholder="YYYY-MM-DD" />
      </label>
      <label>
        Expires on
        <input name="expiresOn" placeholder="YYYY-MM-DD" />
      </label>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={busy}>
        Save contract
      </Button>
    </form>
  )
}

function CorrectionForm({
  player,
  revision,
  onSaved,
  setMessage,
}: Omit<ProfileProps, 'season'> & { setMessage: (message: string) => void }) {
  const database = useDatabase()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    const text = (key: string) => String(form.get(key) ?? '').trim()
    const name = text('name')
    const nationality = text('nationality').toUpperCase()
    if (!name) {
      setError('Enter a player name.')
      return
    }
    if (nationality && !/^[A-Z]{2}$/.test(nationality)) {
      setError('Enter a two-letter code or leave nationality blank.')
      return
    }
    const birth = text('birthDate') ? parseDateOnly(text('birthDate')) : null
    if (birth && !birth.ok) {
      setError(birth.message)
      return
    }
    const age = text('reportedAge')
    if (age && (!/^\d+$/.test(age) || Number(age) > 99)) {
      setError('Enter an age from 0 to 99, or leave it blank.')
      return
    }
    const money = text('marketValue')
      ? parseMoneyCents(text('marketValue'))
      : null
    if (money && !money.ok) {
      setError(money.message)
      return
    }
    const ratings: Player['attributes'] = {}
    for (const [key] of attributes) {
      const value = text(key)
      if (value && (!/^\d+$/.test(value) || Number(value) > 100)) {
        setError(ratingMessage)
        return
      }
      if (value) ratings[key] = Number(value)
    }
    const potential = text('potential')
    if (potential && (!/^\d+$/.test(potential) || Number(potential) > 100)) {
      setError(ratingMessage)
      return
    }
    setError('')
    setMessage('')
    setBusy(true)
    try {
      const result = await updatePlayer(database, {
        campaignId: player.campaignId,
        playerId: player.id,
        expectedRevision: revision,
        now: systemClock(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
        name,
        positions: [text('position')],
        nationalityCode: nationality || null,
        birthDate: birth?.ok ? birth.value : null,
        reportedAge: age ? Number(age) : null,
        marketValueCents: money?.ok ? money.value : null,
        attributes: ratings,
        potential: potential ? Number(potential) : null,
      })
      if (!result.ok) {
        setError(result.code === 'CONFLICT' ? staleSave : result.message)
        return
      }
      setMessage('Player updated.')
      onSaved(result.revision)
    } catch {
      setError('Player could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      aria-label="Player correction"
      noValidate
      onSubmit={(event) => void submit(event)}
    >
      <label>
        Name
        <input
          name="name"
          defaultValue={player.name}
          maxLength={120}
          required
        />
      </label>
      <label>
        Position
        <select name="position" defaultValue={player.positions[0]}>
          {positions.map((position) => (
            <option key={position}>{position}</option>
          ))}
        </select>
      </label>
      <label>
        Nationality
        <input name="nationality" defaultValue={player.nationalityCode ?? ''} />
      </label>
      <label>
        Birth date
        <input
          name="birthDate"
          placeholder="YYYY-MM-DD"
          defaultValue={player.birthDate ?? ''}
        />
      </label>
      <label>
        Reported age
        <input
          name="reportedAge"
          inputMode="numeric"
          defaultValue={player.reportedAge ?? ''}
        />
      </label>
      <label>
        Market value
        <input
          name="marketValue"
          inputMode="decimal"
          defaultValue={
            player.marketValueCents === null
              ? ''
              : (player.marketValueCents / 100).toFixed(2)
          }
        />
      </label>
      {attributes.map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            name={key}
            inputMode="numeric"
            defaultValue={player.attributes[key] ?? ''}
          />
        </label>
      ))}
      <label>
        Potential
        <input
          name="potential"
          inputMode="numeric"
          defaultValue={player.potential ?? ''}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={busy}>
        Save player
      </Button>
    </form>
  )
}

function NoteForm({
  player,
  season,
  revision,
  plan,
  onSaved,
  setMessage,
}: ProfileProps & {
  season: Season
  plan?: DevelopmentPlan
  setMessage: (message: string) => void
}) {
  const database = useDatabase()
  const notesId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [planId, setPlanId] = useState(plan?.id)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await saveDevelopmentNote(database, {
        campaignId: player.campaignId,
        playerId: player.id,
        seasonId: season.id,
        planId: planId ?? createEntityId(),
        expectedRevision: revision,
        now: systemClock(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
        notes: String(form.get('notes') ?? ''),
        targetRole: String(form.get('targetRole') ?? '').trim() || null,
      })
      if (!result.ok) {
        setError(result.code === 'CONFLICT' ? staleSave : result.message)
        return
      }
      setPlanId(result.value.id)
      setMessage('Development note saved.')
      onSaved(result.revision)
    } catch {
      setError('Development note could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form
      aria-label="Development note"
      onSubmit={(event) => void submit(event)}
    >
      <label htmlFor={notesId}>Development notes</label>
      <textarea
        id={notesId}
        name="notes"
        maxLength={4000}
        defaultValue={plan?.notes ?? ''}
        aria-describedby={`${notesId}-help`}
      />
      <p id={`${notesId}-help`}>
        Notes stay in this companion. They do not change the player's
        attributes.
      </p>
      <label>
        Target role
        <input
          name="targetRole"
          maxLength={40}
          defaultValue={plan?.targetRole ?? ''}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <Button type="submit" disabled={busy}>
        Save note
      </Button>
    </form>
  )
}
