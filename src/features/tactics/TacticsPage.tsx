import { loadTacticsScreen } from '../../data/queries/tactics-screen'
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { loadingTactics, tacticsFailed } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { useDatabase } from '../../app/providers/database'
import { CrestSvg } from '../../components/graphics/CrestSvg'
import { crestSpec } from '../../domain/graphics/crest'
import {
  entityIdSchema,
  type Lineup,
  type Club,
  type Player,
  type Season,
} from '../../domain/validation/schemas'
import { TacticsBoard } from './TacticsBoard'

type TacticsState = {
  campaignId: string | undefined
  club?: Club
  lineups?: Lineup[]
  players?: Player[]
  season?: Season
  revision?: number
  missing?: boolean
  failed?: boolean
  chooseClub?: string
}

export function TacticsPage() {
  const database = useDatabase()
  const { campaignId } = useParams()
  const [state, setState] = useState<TacticsState | null>(null)
  useEffect(() => {
    let active = true
    async function load() {
      const id = entityIdSchema.safeParse(campaignId)
      if (!id.success) return
      try {
        const snapshot = await loadTacticsScreen(database, id.data)
        if (active) setState({ campaignId, ...snapshot })
      } catch {
        if (active) setState({ campaignId, failed: true })
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [database, campaignId])
  if (!entityIdSchema.safeParse(campaignId).success) return null
  if (!state || state.campaignId !== campaignId) return <p>{loadingTactics}</p>
  if (state.missing) return null
  if (state.chooseClub)
    return <Navigate to={`/app/${state.chooseClub}/choose-club`} replace />
  if (state.failed) return <p role="alert">{tacticsFailed}</p>
  return (
    <>
      <SectionPage sectionId="tactics" />
      {state.club && (
        <div className="flex items-center gap-3">
          <CrestSvg
            {...crestSpec(state.club)}
            title={`${state.club.name} crest`}
          />
          <h2>{state.club.name}</h2>
        </div>
      )}
      <TacticsBoard
        key={`${campaignId}:${state.club?.id ?? 'missing'}:${state.season?.id ?? 'missing'}`}
        campaignId={entityIdSchema.parse(campaignId)}
        initialRevision={state.revision ?? 0}
        initialLineups={state.lineups ?? []}
        players={state.players ?? []}
        season={state.season}
      />
    </>
  )
}
