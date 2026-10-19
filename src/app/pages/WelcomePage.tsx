import { useState } from 'react'
import { Link } from 'react-router'
import { createPanel, disclaimer, importPanel, pitch } from '../copy'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'

export function WelcomePage() {
  const [panel, setPanel] = useState<'create' | 'import' | null>(null)

  return (
    <>
      <PageHeader title="Touchline OS" />
      <p>{pitch}</p>
      <p>{disclaimer}</p>
      <p>
        <Link className="touchline-focus" to="/app/demo/command-center">
          Try fictional demo
        </Link>
      </p>
      <Button
        aria-expanded={panel === 'create'}
        aria-controls="create-panel"
        onClick={() => setPanel(panel === 'create' ? null : 'create')}
      >
        Create new campaign
      </Button>
      <Button
        aria-expanded={panel === 'import'}
        aria-controls="import-panel"
        onClick={() => setPanel(panel === 'import' ? null : 'import')}
      >
        Import backup
      </Button>
      {panel === 'create' ? <p id="create-panel">{createPanel}</p> : null}
      {panel === 'import' ? <p id="import-panel">{importPanel}</p> : null}
    </>
  )
}
