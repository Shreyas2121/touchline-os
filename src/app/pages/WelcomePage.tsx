import { useState } from 'react'
import { disclaimer, importPanel, pitch } from '../copy'
import { CampaignManager } from '../../features/campaigns/CampaignManager'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'

export function WelcomePage() {
  const [panel, setPanel] = useState(false)

  return (
    <>
      <PageHeader title="Touchline OS" />
      <p>{pitch}</p>
      <p>{disclaimer}</p>
      <CampaignManager />
      <Button
        aria-expanded={panel}
        aria-controls="import-panel"
        onClick={() => setPanel(!panel)}
      >
        Import backup
      </Button>
      {panel ? <p id="import-panel">{importPanel}</p> : null}
    </>
  )
}
