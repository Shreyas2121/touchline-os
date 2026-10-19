import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { loadingSquad, squadFailed } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { useDatabase } from '../../app/providers/database'
import { getCampaign } from '../../data/repositories/campaigns'
import { getClub } from '../../data/repositories/clubs'
import { listAuditEvents } from '../../data/repositories/audit-events'
import { listPlayersByClub } from '../../data/repositories/players'
import { getActiveSeason } from '../../data/repositories/seasons'
import {
  entityIdSchema,
  type Player,
  type Season,
} from '../../domain/validation/schemas'
import { SquadBrowser } from './SquadBrowser'
type SquadState = {
  campaignId: string | undefined
  players?: Player[]
  season?: Season
  missing?: boolean
  failed?: boolean
  chooseClub?: string
}
export function SquadPage() {
  const database = useDatabase()
  const { campaignId } = useParams()
  const [state, setState] = useState<SquadState | null>(null)
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
          setState({ campaignId, season, players: club ? players : [] })
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
  if (!state || state.campaignId !== campaignId) return <p>{loadingSquad}</p>
  if (state.missing) return null
  if (state.chooseClub)
    return <Navigate to={`/app/${state.chooseClub}/choose-club`} replace />
  if (state.failed) return <p role="alert">{squadFailed}</p>
  return (
    <>
      <SectionPage sectionId="squad" />
      <SquadBrowser
        key={campaignId}
        players={state.players ?? []}
        season={state.season}
      />
    </>
  )
}
