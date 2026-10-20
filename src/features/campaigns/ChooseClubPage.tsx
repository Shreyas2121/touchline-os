import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { loadingCampaign, saveFailed, staleSave } from '../../app/copy'
import { useDatabase } from '../../app/providers/database'
import { Button } from '../../components/ui/Button'
import { PageHeader } from '../../components/ui/PageHeader'
import { systemClock } from '../../data/clock'
import { createEntityId } from '../../data/ids'
import { selectManagedClub } from '../../data/commands/select-managed-club'
import { getCampaign } from '../../data/repositories/campaigns'
import { listClubs } from '../../data/repositories/clubs'
import { listLeagues } from '../../data/repositories/leagues'
import {
  entityIdSchema,
  type Campaign,
  type Club,
  type League,
} from '../../domain/validation/schemas'

type ChoiceData = {
  id: string
  campaign: Campaign | undefined
  leagues: League[]
  clubs: Club[]
}

export function ChooseClubPage() {
  const database = useDatabase()
  const { campaignId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState<ChoiceData | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let active = true
    const parsed = entityIdSchema.safeParse(campaignId)
    if (!parsed.success) return
    const id = parsed.data
    Promise.all([
      getCampaign(database, id),
      listLeagues(database, id),
      listClubs(database, id),
    ])
      .then(([campaign, leagues, clubs]) => {
        if (active)
          setData({
            id,
            campaign,
            leagues: [...leagues].sort(
              (a, b) => (a.tier ?? Infinity) - (b.tier ?? Infinity),
            ),
            clubs,
          })
      })
      .catch(() => {
        if (active) setMessage(saveFailed)
      })
    return () => {
      active = false
    }
  }, [database, campaignId])

  async function choose(club: Club) {
    if (busy || !data?.campaign) return
    setBusy(true)
    setMessage('')
    try {
      const result = await selectManagedClub(database, {
        campaignId: data.campaign.id,
        clubId: club.id,
        expectedRevision: data.campaign.revision,
        now: systemClock(),
        auditEventId: createEntityId(),
        actionId: createEntityId(),
      })
      if (!result.ok) {
        setMessage(result.code === 'CONFLICT' ? staleSave : saveFailed)
        return
      }
      navigate(`/app/${data.campaign.id}/command-center`)
    } catch {
      setMessage(saveFailed)
    } finally {
      setBusy(false)
    }
  }

  if (!data || data.id !== campaignId)
    return <p role="status">{message || loadingCampaign}</p>
  if (!data.campaign) return null
  if (data.campaign.mode === 'standalone')
    return <Navigate to={`/app/${data.campaign.id}/command-center`} replace />
  if (data.campaign.seed === null)
    return <Navigate to={`/app/${data.campaign.id}/command-center`} replace />
  return (
    <>
      <PageHeader title="Choose the club you manage" />
      <p>Nothing has been recorded as your choice yet.</p>
      {message ? <p role="alert">{message}</p> : null}
      {data.leagues.map((league) => (
        <section
          key={league.id}
          aria-labelledby={`league-${league.id}`}
          className="my-4 space-y-2"
        >
          <h2 id={`league-${league.id}`}>{league.name}</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.clubs
              .filter((club) => club.leagueId === league.id)
              .map((club) => (
                <li key={club.id} className="flex items-center gap-2">
                  <Button disabled={busy} onClick={() => void choose(club)}>
                    {club.name}
                  </Button>
                  <span className="text-[var(--text-muted)]">
                    {club.shortName}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  )
}
