import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { loadingCampaign } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { useDatabase } from '../../app/providers/database'
import { listAuditEvents } from '../../data/repositories/audit-events'
import { awaitsClubChoice } from '../../domain/simulation/career'
import { matchSimulationUnavailable } from '../../domain/simulation/calendar'
import { getCampaign } from '../../data/repositories/campaigns'
import { listLineups } from '../../data/repositories/lineups'
import { listMatches } from '../../data/repositories/matches'
import { listPlayersByClub } from '../../data/repositories/players'
import { getActiveSeason } from '../../data/repositories/seasons'
import { matchResult } from '../../domain/matches/result'
import {
  entityIdSchema,
  type Lineup,
  type MatchRecord,
  type Player,
  type Season,
} from '../../domain/validation/schemas'
import { MatchForm } from './MatchForm'

type State = {
  campaignId: string | undefined
  revision?: number
  season?: Season
  players?: Player[]
  lineups?: Lineup[]
  matches?: MatchRecord[]
  missing?: boolean
  failed?: boolean
  standalone?: boolean
  chooseClub?: string
}

export function MatchJournalPage() {
  const database = useDatabase()
  const { campaignId } = useParams()
  const [state, setState] = useState<State | null>(null)
  const [reload, setReload] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
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
        if (awaitsClubChoice(campaign, audits)) {
          if (active) setState({ campaignId, chooseClub: campaign.id })
          return
        }
        const season = await getActiveSeason(database, campaign.id)
        const [players, lineups, matches] = await Promise.all([
          listPlayersByClub(database, campaign.id, campaign.managedClubId),
          season
            ? listLineups(database, campaign.id, season.id)
            : Promise.resolve([]),
          season
            ? listMatches(database, campaign.id, season.id)
            : Promise.resolve([]),
        ])
        if (active)
          setState({
            campaignId,
            revision: campaign.revision,
            season,
            players,
            lineups,
            matches,
            standalone: campaign.mode === 'standalone',
          })
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
  if (!state || state.campaignId !== campaignId) return <p>{loadingCampaign}</p>
  if (state.missing) return null
  if (state.chooseClub)
    return <Navigate to={`/app/${state.chooseClub}/choose-club`} replace />
  if (state.failed)
    return (
      <p role="alert">
        This match journal could not be loaded. Reload and try again.
      </p>
    )
  return (
    <>
      <SectionPage sectionId="matches" />
      {state.season && state.revision !== undefined ? (
        <>
          {state.standalone ? (
            <p>{matchSimulationUnavailable}</p>
          ) : (
            <MatchForm
              key={state.revision}
              campaignId={entityIdSchema.parse(campaignId)}
              seasonId={state.season.id}
              revision={state.revision}
              players={state.players ?? []}
              lineups={state.lineups ?? []}
              onSaved={() => {
                setNotice('Recorded the match.')
                setReload((current) => current + 1)
              }}
            />
          )}
          {notice ? <p role="status">{notice}</p> : null}
          {(state.matches ?? []).length === 0 ? (
            <p>No matches are recorded.</p>
          ) : (
            <ul aria-label="Recorded matches" className="space-y-2">
              {(state.matches ?? []).map((match) => (
                <li key={match.id}>
                  <span>{match.date}</span> <span>{match.opponent}</span>{' '}
                  <span>{match.homeAway === 'home' ? 'Home' : 'Away'}</span>{' '}
                  <span>{`${match.goalsFor}\u2013${match.goalsAgainst}`}</span>{' '}
                  <span>{matchResult(match.goalsFor, match.goalsAgainst)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p>This campaign has no active season.</p>
      )}
    </>
  )
}
