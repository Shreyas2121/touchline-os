import { useState } from 'react'
import { staleSave } from '../../app/copy'
import { useDatabase } from '../../app/providers/database'
import { Button } from '../../components/ui/Button'
import { systemClock } from '../../data/clock'
import { closeShortlistItem } from '../../data/commands/close-shortlist-item'
import { saveShortlistItem } from '../../data/commands/save-shortlist-item'
import { createEntityId } from '../../data/ids'
import type {
  Club,
  EntityId,
  Player,
  ShortlistItem,
} from '../../domain/validation/schemas'

const controlClass =
  'touchline-focus rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1'

function clubName(player: Player, clubs: readonly Club[]): string {
  if (player.clubId === null) return 'Free agent'
  return clubs.find((club) => club.id === player.clubId)?.name ?? 'Free agent'
}

function notesOrNull(text: string): string | null {
  const trimmed = text.trim()
  return trimmed.length === 0 ? null : trimmed
}

function ShortlistRow({
  item,
  player,
  campaignId,
  revision,
  onSaved,
  onPreview,
}: {
  item: ShortlistItem
  player: Player
  campaignId: EntityId
  revision: number
  onSaved: () => void
  onPreview: (playerId: EntityId) => void
}) {
  const database = useDatabase()
  const [priority, setPriority] = useState(item.priority)
  const [notes, setNotes] = useState(item.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function persist(next: {
    priority: number
    notes: string | null
    status: ShortlistItem['status']
  }) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await saveShortlistItem(database, {
        campaignId,
        itemId: item.id,
        playerId: item.playerId,
        expectedRevision: revision,
        now: systemClock(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
        priority: next.priority,
        notes: next.notes,
        status: next.status,
      })
      if (!result.ok) {
        setError(result.code === 'CONFLICT' ? staleSave : result.message)
        return
      }
      onSaved()
    } catch {
      setError('The shortlist could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }
  async function close() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await closeShortlistItem(database, {
        campaignId,
        itemId: item.id,
        expectedRevision: revision,
        now: systemClock(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
      })
      if (!result.ok) {
        setError(result.code === 'CONFLICT' ? staleSave : result.message)
        return
      }
      onSaved()
    } catch {
      setError('The shortlist could not be saved. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="space-y-2 border border-[var(--border)] p-3">
      <p>{player.name}</p>
      <label>
        {`Priority for ${player.name}`}{' '}
        <select
          className={controlClass}
          value={priority}
          disabled={busy}
          onChange={(event) => {
            const next = Number(event.target.value)
            setPriority(next)
            void persist({
              priority: next,
              notes: notesOrNull(notes),
              status: item.status,
            })
          }}
        >
          {[1, 2, 3, 4, 5].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label>
        {`Notes for ${player.name}`}{' '}
        <textarea
          className={controlClass}
          maxLength={4_000}
          value={notes}
          disabled={busy}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => {
            const next = notesOrNull(notes)
            if (next === item.notes) return
            void persist({ priority, notes: next, status: item.status })
          }}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <Button disabled={busy} onClick={() => onPreview(item.playerId)}>
          Preview scenario
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            void close()
          }}
        >
          Close shortlist entry
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </li>
  )
}

export function PlayerSearch({
  players,
  clubs,
  shortlist,
  campaignId,
  revision,
  onSaved,
  onPreview,
}: {
  players: readonly Player[]
  clubs: readonly Club[]
  shortlist: readonly ShortlistItem[]
  campaignId: EntityId
  revision: number
  onSaved: () => void
  onPreview: (playerId: EntityId) => void
}) {
  const database = useDatabase()
  const [query, setQuery] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const byPlayer = new Map(shortlist.map((item) => [item.playerId, item]))
  const needle = query.trim().toLocaleLowerCase('en')
  const matches =
    needle.length < 2
      ? []
      : players
          .filter((player) =>
            player.name.toLocaleLowerCase('en').includes(needle),
          )
          .sort((left, right) => left.name.localeCompare(right.name, 'en'))
  const shown = matches.slice(0, 50)
  async function add(player: Player) {
    if (busyId) return
    const existing = byPlayer.get(player.id)
    setBusyId(player.id)
    setError('')
    try {
      const result = await saveShortlistItem(database, {
        campaignId,
        itemId: existing?.id ?? createEntityId(),
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
      onSaved()
    } catch {
      setError('The shortlist could not be saved. Try again.')
    } finally {
      setBusyId(null)
    }
  }
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label>
          Player search{' '}
          <input
            className={controlClass}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {needle.length < 2 ? (
          <p>Search the player pool to plan a move.</p>
        ) : (
          <>
            <ul aria-label="Search results" className="space-y-2">
              {shown.map((player) => {
                const item = byPlayer.get(player.id)
                const open = item?.status === 'open'
                return (
                  <li key={player.id} className="flex flex-wrap gap-3">
                    <span>{player.name}</span>
                    <span>{clubName(player, clubs)}</span>
                    <Button
                      disabled={open || busyId === player.id}
                      onClick={() => {
                        void add(player)
                      }}
                    >
                      {open
                        ? 'On the shortlist'
                        : item
                          ? 'Reopen shortlist'
                          : 'Add to shortlist'}
                    </Button>
                  </li>
                )
              })}
            </ul>
            {matches.length > 50 && (
              <p>Showing 50 matches. Narrow the search.</p>
            )}
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      <section aria-label="Shortlist" className="space-y-3">
        <h2>Shortlist</h2>
        {shortlist.length === 0 ? (
          <p>No players are shortlisted.</p>
        ) : (
          <ul className="space-y-3">
            {shortlist.map((item) => {
              const player = players.find(
                (candidate) => candidate.id === item.playerId,
              )
              if (!player) return null
              return (
                <ShortlistRow
                  key={`${item.id}-${item.status}-${item.priority}-${item.notes ?? ''}`}
                  item={item}
                  player={player}
                  campaignId={campaignId}
                  revision={revision}
                  onSaved={onSaved}
                  onPreview={onPreview}
                />
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
