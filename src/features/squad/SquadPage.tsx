import { loadSquadScreen } from '../../data/queries/squad-screen'
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { loadingSquad, squadFailed } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { useDatabase } from '../../app/providers/database'
import {
  entityIdSchema,
  type Contract,
  type Player,
  type Season,
} from '../../domain/validation/schemas'
import { SquadBrowser } from './SquadBrowser'
import { CrestSvg } from '../../components/graphics/CrestSvg'
import { crestSpec } from '../../domain/graphics/crest'
import type { Club } from '../../domain/validation/schemas'
type SquadState = {
  campaignId: string | undefined
  players?: Player[]
  contracts?: Contract[]
  season?: Season
  missing?: boolean
  failed?: boolean
  chooseClub?: string
  revision?: number
  readOnly?: boolean
  refreshing?: boolean
  club?: Club
}
export function SquadPage() {
  const database = useDatabase()
  const { campaignId } = useParams()
  const [state, setState] = useState<SquadState | null>(null)
  const [reload, setReload] = useState(0)
  function onSaved() {
    setState((current) =>
      current && current.campaignId === campaignId
        ? { ...current, refreshing: true }
        : current,
    )
    setReload((current) => current + 1)
  }
  useEffect(() => {
    let active = true
    async function load() {
      const id = entityIdSchema.safeParse(campaignId)
      if (!id.success) return
      try {
        const snapshot = await loadSquadScreen(database, id.data)
        if (active) setState({ campaignId, ...snapshot })
      } catch {
        if (active) setState({ campaignId, failed: true })
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [database, campaignId, reload])
  if (!entityIdSchema.safeParse(campaignId).success) return null
  if (!state || state.campaignId !== campaignId) return <p>{loadingSquad}</p>
  if (state.missing) return null
  if (state.chooseClub)
    return <Navigate to={`/app/${state.chooseClub}/choose-club`} replace />
  if (state.failed) return <p role="alert">{squadFailed}</p>
  return (
    <>
      <SectionPage sectionId="squad" />
      {state.club && (
        <div className="flex items-center gap-3">
          <CrestSvg
            {...crestSpec(state.club)}
            title={`${state.club.name} crest`}
          />
          <h2>{state.club.name}</h2>
        </div>
      )}
      <SquadBrowser
        key={campaignId}
        players={state.players ?? []}
        contracts={state.contracts ?? []}
        season={state.season}
        revision={state.revision ?? 0}
        readOnly={state.readOnly === true}
        refreshing={state.refreshing === true}
        onSaved={onSaved}
      />
    </>
  )
}
