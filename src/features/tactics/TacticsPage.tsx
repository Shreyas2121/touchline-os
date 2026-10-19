import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { loadingTactics, tacticsFailed } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { useDatabase } from '../../app/providers/database'
import { CrestSvg } from '../../components/graphics/CrestSvg'
import { getCampaign } from '../../data/repositories/campaigns'
import { getClub } from '../../data/repositories/clubs'
import { listAuditEvents } from '../../data/repositories/audit-events'
import { crestSpec } from '../../domain/graphics/crest'
import { listPlayersByClub } from '../../data/repositories/players'
import { getActiveSeason } from '../../data/repositories/seasons'
import {
  entityIdSchema,
  type Club,
  type Player,
  type Season,
} from '../../domain/validation/schemas'
import { TacticsBoard } from './TacticsBoard'

type TacticsState = {
  campaignId: string | undefined
  club?: Club
  players?: Player[]
  season?: Season
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
        const campaign = await getCampaign(database, id.data)
        if (!campaign) {
          if (active) setState({ campaignId, missing: true })
          return
        }
        const audits = await listAuditEvents(database, campaign.id)
        if (
          campaign.seed !== null &&
          !audits.some((audit) => audit.actionType === 'campaign.select-club')
        ) {
          if (active) setState({ campaignId, chooseClub: campaign.id })
          return
        }
        const [club, season, players] = await Promise.all([
          getClub(database, campaign.id, campaign.managedClubId),
          getActiveSeason(database, campaign.id),
          listPlayersByClub(database, campaign.id, campaign.managedClubId),
        ])
        if (active)
          setState({ campaignId, club, season, players: club ? players : [] })
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
        key={`${campaignId}:${state.club?.id ?? 'missing'}`}
        players={state.players ?? []}
        season={state.season}
      />
    </>
  )
}
