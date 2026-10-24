import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { GameClient } from '../../platform/game-client'
import type { MigrationSummary } from '../../platform/generated/MigrationSummary'
import { mapInvokeError } from '../../platform/errors'
import { Button } from '../../components/ui/Button'

export function MigrationTools({
  client,
  onImported,
}: {
  client: GameClient
  onImported: () => void
}) {
  const [summary, setSummary] = useState<MigrationSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const navigate = useNavigate()
  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      await work()
    } catch (error) {
      setMessage(mapInvokeError(error).message)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      aria-label="Save migration"
      className="space-y-3 rounded-lg border border-[var(--border)] p-4"
    >
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy}
          onClick={() => {
            void run(async () => {
              setSummary(null)
              setSummary(await client.selectImport())
            })
          }}
        >
          Import save
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            void run(async () => {
              if (await client.backupDatabase())
                setMessage('Created and verified a database backup.')
            })
          }}
        >
          Back up database
        </Button>
      </div>
      {summary && (
        <section aria-label="Review import" className="space-y-3">
          <h2>Review import: {summary.campaign.name}</h2>
          <p>
            {summary.campaign.mode} · {summary.campaign.rulesMode} · revision{' '}
            {summary.campaign.revision} · {summary.sourceStorage} schema{' '}
            {summary.sourceSchemaVersion}
          </p>
          <dl className="grid grid-cols-2 gap-1">
            {Object.entries(summary.counts).map(([key, count]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
          <p>
            IDs and saved history are preserved. A different save with the same
            campaign ID is refused. Import leaves your source file untouched.
            Importing the same file again does not overwrite later play.
          </p>
          <Button
            disabled={busy}
            onClick={() => {
              void run(async () => {
                const result = await client.confirmImport(summary.token)
                setSummary(null)
                onImported()
                navigate(`/app/${result.campaignId}/command-center`)
                setMessage('Save imported. Loaded the persisted campaign.')
              })
            }}
          >
            Confirm import
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void run(async () => {
                await client.cancelImport()
                setSummary(null)
              })
            }}
          >
            Cancel import
          </Button>
        </section>
      )}
      {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
    </section>
  )
}
