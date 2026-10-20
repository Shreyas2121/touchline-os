import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { loadingCampaign } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { useDatabase } from '../../app/providers/database'
import { listAuditEvents } from '../../data/repositories/audit-events'
import { getCampaign } from '../../data/repositories/campaigns'
import { getActiveConstitution } from '../../data/repositories/constitutions'
import { listPlayersByClub } from '../../data/repositories/players'
import { listRegistrations } from '../../data/repositories/registrations'
import { getActiveSeason } from '../../data/repositories/seasons'
import {
  entityIdSchema,
  type Constitution,
  type Player,
  type Registration,
  type Season,
} from '../../domain/validation/schemas'
import { RegistrationList } from './RegistrationList'

type State = {
  campaignId: string | undefined
  revision?: number
  season?: Season
  players?: Player[]
  constitution?: Constitution
  registrations?: Registration[]
  missing?: boolean
  failed?: boolean
  chooseClub?: string
}

export function RegistrationPage() {
  const database = useDatabase()
  const { campaignId } = useParams()
  const [state, setState] = useState<State | null>(null)
  const [reload, setReload] = useState(0)
  const [notice, setNotice] = useState<{ id: string; text: string } | null>(
    null,
  )
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
        const [season, constitution, players] = await Promise.all([
          getActiveSeason(database, campaign.id),
          getActiveConstitution(database, campaign.id),
          listPlayersByClub(database, campaign.id, campaign.managedClubId),
        ])
        const rule = constitution?.rules.find(
          (item) => item.id === 'REGISTRATION_QUOTA',
        )
        const registrations =
          season && rule?.id === 'REGISTRATION_QUOTA'
            ? await listRegistrations(
                database,
                campaign.id,
                season.id,
                rule.competitionKey,
              )
            : []
        if (active)
          setState({
            campaignId,
            revision: campaign.revision,
            season,
            players,
            constitution,
            registrations,
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
        This registration could not be loaded. Reload and try again.
      </p>
    )
  return (
    <>
      <SectionPage sectionId="registration" />
      <p>
        These checks are your saved challenge rules. They do not certify a real
        competition.
      </p>
      <Link to={`/app/${campaignId}/constitution`}>
        Change a rule on Constitution.
      </Link>
      {state.season && state.revision !== undefined ? (
        <>
          <RegistrationList
            key={state.revision}
            campaignId={entityIdSchema.parse(campaignId)}
            season={state.season}
            players={state.players ?? []}
            constitution={state.constitution}
            registrations={state.registrations ?? []}
            revision={state.revision}
            onEdit={() => setNotice(null)}
            onSaved={() => {
              if (!campaignId) return
              setNotice({ id: campaignId, text: 'Saved registration.' })
              setReload((current) => current + 1)
            }}
          />
          {notice && notice.id === campaignId ? (
            <p role="status">{notice.text}</p>
          ) : null}
        </>
      ) : (
        <p>This campaign has no active season.</p>
      )}
    </>
  )
}
