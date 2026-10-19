import { Link } from 'react-router'
import { Button } from './Button'

export function TopBar({ campaignId }: { campaignId?: string }) {
  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-[var(--border)] bg-[var(--surface-1)] px-4 py-2">
      {campaignId ? <p>{campaignId}</p> : null}
      <Button>Search</Button>
      <Button>Backup</Button>
      <Link className="touchline-focus" to="/settings">
        Settings
      </Link>
      <Link className="touchline-focus" to="/help">
        Help
      </Link>
    </header>
  )
}
