import { useRef, useState } from 'react'
import * as copy from '../../app/copy'
import { useDatabase } from '../../app/providers/database'
import { Button } from '../../components/ui/Button'
import { systemClock } from '../../data/clock'
import { exportCampaign } from '../../data/exports/export-campaign'
import { createEntityId } from '../../data/ids'
import type { Campaign } from '../../domain/validation/schemas'

function downloadLocalJson(filename: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function ExportForDesktop({
  campaigns,
}: {
  campaigns: Campaign[] | null
}) {
  const database = useDatabase()
  const abort = useRef<AbortController | null>(null)
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState('')

  async function exportForDesktop(campaign: Campaign) {
    if (exporting) return
    const controller = new AbortController()
    abort.current = controller
    setExporting(true)
    setMessage(copy.exportReading)
    try {
      const result = await exportCampaign(database, campaign.id, {
        exportId: createEntityId(),
        exportedAt: systemClock(),
        signal: controller.signal,
        onProgress: (stage) => {
          if (stage === 'read') setMessage(copy.exportReading)
          if (stage === 'validate') setMessage(copy.exportPreparing)
        },
      })
      if (!result.ok) {
        setMessage(
          result.code === 'MISSING'
            ? copy.exportMissing
            : result.code === 'CANCELLED'
              ? copy.exportCancelled
              : `${copy.exportFailed} ${result.message}`,
        )
        return
      }
      downloadLocalJson(`touchline-${campaign.id}-desktop.json`, result.json)
      setMessage(copy.exportStarted)
    } catch {
      setMessage(copy.exportFailed)
    } finally {
      abort.current = null
      setExporting(false)
    }
  }

  return (
    <section aria-labelledby="export-desktop-title" className="space-y-3">
      <h2 id="export-desktop-title">Export for Desktop</h2>
      <p id="export-origin">{copy.exportOrigin(window.location.origin)}</p>
      <p>{copy.exportLocal}</p>
      {campaigns !== null && campaigns.length === 0 ? (
        <p>{copy.exportEmpty}</p>
      ) : null}
      {campaigns !== null && campaigns.length > 0 ? (
        <ul>
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <Button
                disabled={exporting}
                aria-describedby="export-origin"
                onClick={() => void exportForDesktop(campaign)}
              >
                {`Export ${campaign.name} for Desktop`}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <p role="status" aria-live="polite">
        {message}
      </p>
      {exporting ? (
        <Button onClick={() => abort.current?.abort()}>Cancel export</Button>
      ) : null}
    </section>
  )
}
