import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router'
import type { GameClient } from '../../platform/game-client'
import type { Screen } from '../../platform/generated/Screen'
import { mapInvokeError } from '../../platform/errors'
import { workspaceSections, readOnly } from './workspace-sections'
import { CrestSvg } from '../../components/graphics/CrestSvg'
import { PolicyPreview } from './PolicyPreview'
import { NativeTactics } from './NativeTactics'
import { Button } from '../../components/ui/Button'
import { NativeScreenTables } from './NativeScreenTables'
import { NativeMatches } from './NativeMatches'
import { NativeManagementPanel } from './NativeManagementPanel'
import { NativeProgression } from './NativeProgression'
import { NativeSeasons } from './NativeLifecycle'
import { NativeTransfers } from './NativeTransfers'
import { NativeTransferPlayers } from './NativeTransferPlayers'
import { Paging } from './NativePaging'
import { useNativeRead } from './useNativeRead'

export function ScreenPage({ client }: { client: GameClient }) {
  const { campaignId = '', section = '' } = useParams()
  const screen = workspaceSections.find((s) => s.id === section)?.id
  if (!screen || !/^[A-Za-z0-9-]{1,64}$/.test(campaignId))
    return (
      <>
        <h1>Campaign or section not found</h1>
        <Link to="/">Choose a campaign</Link>
      </>
    )
  return (
    <ScreenContent
      key={`${campaignId}:${screen}`}
      client={client}
      campaignId={campaignId}
      screen={screen}
    />
  )
}
function ScreenContent({
  client,
  campaignId,
  screen,
}: {
  client: GameClient
  campaignId: string
  screen: Screen
}) {
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify([campaignId, screen, page, search, retry])
  const [notice, setNotice] = useState('')
  const load = useCallback(
    () =>
      client.screen({ campaignId, screen, page, search, allPlayers: false }),
    [client, campaignId, screen, page, search],
  )
  const { state } = useNativeRead(key, load)
  const data = state.status === 'success' ? state.data : undefined
  const campaign = data?.rows.campaigns[0]
  const club = data?.rows.clubs.find((c) => c.id === campaign?.managedClubId)
  const season = data?.rows.seasons.find(
    (s) => s.id === campaign?.activeSeasonId,
  )
  const title =
    workspaceSections.find((s) => s.id === screen)?.label ?? 'Campaign'
  const playerScreen = ['squad', 'registration', 'scouting'].includes(screen)
  async function exportSave() {
    setNotice('')
    try {
      if (await client.exportCampaign(campaignId))
        setNotice('Exported the saved campaign.')
    } catch (error) {
      setNotice(mapInvokeError(error).message)
    }
  }
  return (
    <div className="space-y-6">
      <nav aria-label="Workspace" className="flex flex-wrap gap-4">
        {workspaceSections.map((s) => (
          <Link
            aria-current={s.id === screen ? 'page' : undefined}
            key={s.id}
            to={`/app/${campaignId}/${s.segment}`}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      <h1>{title}</h1>
      {state.status === 'loading' ? (
        <p>Loading {title}.</p>
      ) : state.status === 'error' ? (
        <>
          <p role="alert">{state.error}</p>
          <Button onClick={() => setRetry((v) => v + 1)}>Retry</Button>
          <Link to="/">Choose a campaign</Link>
        </>
      ) : (
        data &&
        campaign && (
          <>
            <header className="flex flex-wrap items-center gap-4">
              {club && (
                <CrestSvg
                  mark="shield"
                  primary={club.colors?.primary ?? '#305642'}
                  secondary={club.colors?.secondary ?? '#e9e3cb'}
                  monogram={club.shortName}
                  title={`${club.name} crest`}
                />
              )}
              <div>
                <h2>{campaign.name}</h2>
                <p>
                  {club?.name ?? 'Unknown club'} ·{' '}
                  {season?.label ?? 'Unknown season'}
                </p>
                <p>
                  standalone · {campaign.rulesMode} · revision {data.revision} ·{' '}
                  {campaign.status}
                </p>
              </div>
              <Button
                onClick={() => {
                  void exportSave()
                }}
              >
                Export campaign
              </Button>
            </header>
            {notice && <p role="status">{notice}</p>}
            <p>{readOnly}</p>
            {data.finance &&
              ['command-center', 'finance', 'transfers'].includes(screen) && (
                <dl className="flex flex-wrap gap-6">
                  <div>
                    <dt>Transfer capacity</dt>
                    <dd>{data.finance.capacity}</dd>
                  </div>
                  <div>
                    <dt>Weekly wages</dt>
                    <dd>{data.finance.wages}</dd>
                  </div>
                  {screen === 'finance' &&
                    Object.entries(data.finance.tiers).map(([tier, value]) => (
                      <div key={tier}>
                        <dt>{tier} wages</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                </dl>
              )}
            {screen === 'command-center' && (
              <NativeProgression
                client={client}
                campaignId={campaignId}
                revision={data.revision}
                refresh={retry}
                onAdvanced={() => {
                  setNotice('Advanced the saved career.')
                  setRetry((value) => value + 1)
                }}
                onReload={() => setRetry((value) => value + 1)}
              />
            )}
            {playerScreen && (
              <div className="flex gap-4">
                <label>
                  Search players{' '}
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value)
                      setPage(0)
                    }}
                    maxLength={120}
                  />
                </label>
              </div>
            )}
            {screen === 'tactics' && <NativeTactics model={data} />}
            {screen === 'transfers' && (
              <NativeTransfers
                client={client}
                campaignId={campaignId}
                revision={data.revision}
                refresh={retry}
                onChanged={() => {
                  setNotice('Saved the transfer decision.')
                  setRetry((value) => value + 1)
                }}
              />
            )}
            {screen === 'seasons' && (
              <NativeSeasons
                key={data.revision}
                client={client}
                campaignId={campaignId}
                revision={data.revision}
                onSaved={() => {
                  setNotice('Started the next season.')
                  setRetry((v) => v + 1)
                }}
              />
            )}
            {screen !== 'transfers' && screen !== 'seasons' && (
              <NativeScreenTables
                client={client}
                model={data}
                screen={screen}
              />
            )}
            {screen === 'matches' && (
              <NativeMatches client={client} campaignId={campaignId} />
            )}
            {screen === 'transfers' ? (
              <NativeTransferPlayers
                client={client}
                initialModel={data}
                onSaved={() => {
                  setNotice('Saved native campaign change.')
                  setRetry((value) => value + 1)
                }}
                onReload={() => setRetry((value) => value + 1)}
              />
            ) : (
              <NativeManagementPanel
                key={data.revision}
                client={client}
                model={data}
                screen={screen}
                onSaved={() => {
                  setNotice('Saved native campaign change.')
                  setRetry((value) => value + 1)
                }}
                onReload={() => setRetry((value) => value + 1)}
              />
            )}
            {data.reports.map((report, i) => (
              <section key={i}>
                <h3>
                  {report.label}:{' '}
                  {report.allowed ? 'Passes saved checks' : 'Needs attention'}
                </h3>
                {report.verdicts.map((v, j) => (
                  <p key={j}>
                    {v.message} {v.remedy}
                  </p>
                ))}
              </section>
            ))}
            {['finance', 'transfers'].includes(screen) && (
              <PolicyPreview
                client={client}
                model={data}
                campaignId={campaignId}
              />
            )}
            {screen !== 'matches' &&
              screen !== 'transfers' &&
              screen !== 'seasons' && (
                <Paging
                  page={page}
                  total={Math.max(0, ...Object.values(data.totals))}
                  onPage={setPage}
                />
              )}
          </>
        )
      )}
    </div>
  )
}
