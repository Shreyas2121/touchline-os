import { useState } from 'react'
import { Link } from 'react-router'
import { backupPanel, searchPanel } from '../../app/copy'
import { Button } from './Button'

export function TopBar({ campaignId }: { campaignId?: string }) {
  const [panel, setPanel] = useState<'search' | 'backup' | null>(null)

  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-2">
      {campaignId ? <p>{campaignId}</p> : null}
      <Button
        aria-expanded={panel === 'search'}
        aria-controls="search-panel"
        onClick={() => setPanel(panel === 'search' ? null : 'search')}
      >
        Search
      </Button>
      <Button
        aria-expanded={panel === 'backup'}
        aria-controls="backup-panel"
        onClick={() => setPanel(panel === 'backup' ? null : 'backup')}
      >
        Backup
      </Button>
      <Link className="touchline-focus" to="/settings">
        Settings
      </Link>
      <Link className="touchline-focus" to="/help">
        Help
      </Link>
      {panel === 'search' ? <p id="search-panel">{searchPanel}</p> : null}
      {panel === 'backup' ? <p id="backup-panel">{backupPanel}</p> : null}
    </header>
  )
}
