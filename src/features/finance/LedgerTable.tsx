import { useRef, useState } from 'react'
import { staleSave } from '../../app/copy'
import { useDatabase } from '../../app/providers/database'
import { Button } from '../../components/ui/Button'
import { systemClock } from '../../data/clock'
import { createEntityId } from '../../data/ids'
import { reverseLedgerEntry } from '../../data/commands/reverse-ledger-entry'
import { displayLedgerKind } from '../../domain/finance/capacity'
import { formatMoneyEuros } from '../../domain/models/money'
import type { Campaign, LedgerEntry } from '../../domain/validation/schemas'

export function LedgerTable({
  entries,
  campaign,
  allowReverse = true,
  onSaved,
}: {
  entries: readonly LedgerEntry[]
  campaign: Campaign
  allowReverse?: boolean
  onSaved: () => void
}) {
  const database = useDatabase()
  const [target, setTarget] = useState<LedgerEntry | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const reversed = new Set(
    entries
      .filter((entry) => entry.kind === 'reversal')
      .map((entry) => entry.reversesEntryId),
  )
  function close() {
    setTarget(null)
    trigger.current?.focus()
  }
  async function reverse() {
    if (!target || busy) return
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      const result = await reverseLedgerEntry(database, {
        campaignId: campaign.id,
        entryId: target.id,
        reversalId: createEntityId(),
        expectedRevision: campaign.revision,
        now: systemClock(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
        note,
      })
      if (!result.ok) {
        setFailed(true)
        setMessage(result.code === 'CONFLICT' ? staleSave : result.message)
      } else {
        close()
        setMessage('Reversed ledger entry.')
        onSaved()
      }
    } catch {
      setFailed(true)
      setMessage('The ledger entry could not be reversed. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-3">
      <table className="w-full text-left">
        <caption className="text-left">Ledger</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Kind</th>
            <th>Amount</th>
            <th>Note</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{entry.effectiveOn}</td>
              <td>{displayLedgerKind(entry.kind)}</td>
              <td>{formatMoneyEuros(entry.amountCents)}</td>
              <td>{entry.note ?? '—'}</td>
              <td>
                {allowReverse &&
                  entry.kind !== 'reversal' &&
                  !reversed.has(entry.id) && (
                    <Button
                      disabled={busy}
                      onClick={(event) => {
                        trigger.current = event.currentTarget
                        setTarget(entry)
                        setNote('')
                        setMessage('')
                      }}
                    >
                      Reverse {displayLedgerKind(entry.kind)}
                    </Button>
                  )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length === 0 && <p>No ledger entries for this season.</p>}
      {allowReverse && target && (
        <section
          role="region"
          aria-label="Reverse ledger entry"
          className="border border-[var(--border)] p-4"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) {
              event.preventDefault()
              close()
            }
          }}
        >
          <h2>Reverse {displayLedgerKind(target.kind)}</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void reverse()
            }}
          >
            <label htmlFor="reversal-note">Reversal note</label>
            <textarea
              id="reversal-note"
              className="touchline-focus rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1"
              autoFocus
              value={note}
              maxLength={4_000}
              disabled={busy}
              onChange={(event) => setNote(event.target.value)}
            />
            <Button type="submit" disabled={busy || !note.trim()}>
              Reverse entry
            </Button>
            <Button disabled={busy} onClick={close}>
              Cancel
            </Button>
          </form>
        </section>
      )}
      {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
    </section>
  )
}
