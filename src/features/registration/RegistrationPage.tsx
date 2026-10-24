import { loadRegistrationScreen } from '../../data/queries/registration-screen'
import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import { loadingCampaign } from '../../app/copy'
import { SectionPage } from '../../app/pages/SectionPage'
import { useDatabase } from '../../app/providers/database'
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
  eligibility?: ReadonlyMap<
    string,
    { homegrownClub: boolean; homegrownNation: boolean }
  >
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
        const snapshot = await loadRegistrationScreen(database, id.data)
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
            eligibility={state.eligibility}
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
