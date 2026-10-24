import { loadMatchJournalScreen } from '../../data/queries/match-journal-screen'
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router'
import { loadingCampaign } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { useDatabase } from '../../app/providers/database'
import { matchSimulationUnavailable } from '../../domain/simulation/calendar'
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
        const snapshot = await loadMatchJournalScreen(database, id.data)
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
