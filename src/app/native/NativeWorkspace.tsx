import { useEffect, useState, type ReactNode } from 'react'
import {
  HashRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router'
import type { GameClient } from '../../platform/game-client'
import type { CampaignPage } from '../../platform/generated/CampaignPage'
import type { MigrationSummary } from '../../platform/generated/MigrationSummary'
import type { ScreenModel } from '../../platform/generated/ScreenModel'
import type { Screen } from '../../platform/generated/Screen'
import type { NativePreview } from '../../platform/generated/NativePreview'
import { mapInvokeError } from '../../platform/errors'
import { workspaceSections } from '../routes'
import { CrestSvg } from '../../components/graphics/CrestSvg'
import { NativeTactics } from './NativeTactics'
import { Button } from '../../components/ui/Button'
import { NativeScreenTables } from './NativeScreenTables'
import { NativeCareerForm } from './NativeCareerForm'
import { NativeManagementPanel } from './NativeManagementPanel'
import { NativeProgression } from './NativeProgression'

const readOnly =
  'Standalone career management is available. Continue on the Command Center advances the foundation calendar. Match simulation and negotiations arrive in later phases. Manual campaign gameplay is retired.'

export function NativeWorkspace({ client }: { client: GameClient }) {
  return (
    <HashRouter>
      <NativeRoutes client={client} />
    </HashRouter>
  )
}

export function NativeRoutes({ client }: { client: GameClient }) {
  const [refresh, setRefresh] = useState(0)
  return (
    <div className="min-h-screen bg-[var(--surface-0)] text-[var(--text)]">
      <header className="flex flex-wrap items-center gap-4 border-b border-[var(--border)] p-4">
        <Link to="/">Touchline OS</Link>
        <Link to="/settings">Settings</Link>
        <Link to="/help">Help</Link>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <MigrationTools
          client={client}
          onImported={() => setRefresh((v) => v + 1)}
        />
        <Routes>
          <Route
            path="/"
            element={<Campaigns key={refresh} client={client} />}
          />
          <Route
            path="/settings"
            element={
              <>
                <h1>Settings</h1>
                <p>
                  Saves use native SQLite storage. Use the migration controls
                  above to import, export or back up saves.
                </p>
                <p>{readOnly}</p>
              </>
            }
          />
          <Route
            path="/help"
            element={
              <>
                <h1>Help</h1>
                <p>
                  Export a save from the original browser address using Export
                  for desktop. Import that JSON file here, review its summary,
                  then confirm. Your original browser data remains untouched.
                </p>
                <p>
                  Challenge rules describe this fictional simulation. They do
                  not certify a real competition.
                </p>
                <p>
                  Continue on the Command Center advances a standalone career
                  from July 1 to the summer deadline and then to league kickoff.
                  Match simulation arrives in Phase 8.
                </p>
              </>
            }
          />
          <Route
            path="/app/:campaignId"
            element={<Navigate to="command-center" replace />}
          />
          <Route
            path="/app/:campaignId/:section"
            element={<ScreenPage key={refresh} client={client} />}
          />
          <Route
            path="*"
            element={
              <>
                <h1>Page not found</h1>
                <Link to="/">Choose a campaign</Link>
              </>
            }
          />
        </Routes>
      </main>
    </div>
  )
}

function MigrationTools({
  client,
  onImported,
}: {
  client: GameClient
  onImported: () => void
}) {
  const [summary, setSummary] = useState<MigrationSummary | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)
  const navigate = useNavigate()
  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setMessage('')
    setFailed(false)
    try {
      await work()
    } catch (error) {
      setMessage(mapInvokeError(error).message)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      aria-label="Save migration"
      className="space-y-3 rounded-lg border border-[var(--border)] p-4"
    >
      <div className="flex flex-wrap gap-3">
        <Button
          disabled={busy}
          onClick={() => {
            void run(async () => {
              setSummary(null)
              setSummary(await client.selectImport())
            })
          }}
        >
          Import save
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            void run(async () => {
              if (await client.backupDatabase())
                setMessage('Created and verified a database backup.')
            })
          }}
        >
          Back up database
        </Button>
      </div>
      {summary && (
        <section aria-label="Review import" className="space-y-3">
          <h2>Review import: {summary.campaign.name}</h2>
          <p>
            {summary.campaign.mode} · {summary.campaign.rulesMode} · revision{' '}
            {summary.campaign.revision} · {summary.sourceStorage} schema{' '}
            {summary.sourceSchemaVersion}
          </p>
          <dl className="grid grid-cols-2 gap-1">
            {Object.entries(summary.counts).map(([key, count]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{count}</dd>
              </div>
            ))}
          </dl>
          <p>
            IDs and saved history are preserved. A different save with the same
            campaign ID is refused. Import leaves your source browser data
            untouched. Importing the same file again does not overwrite later
            play.
          </p>
          <Button
            disabled={busy}
            onClick={() => {
              void run(async () => {
                const result = await client.confirmImport(summary.token)
                setSummary(null)
                onImported()
                navigate(`/app/${result.campaignId}/command-center`)
                setMessage('Save imported. Loaded the persisted campaign.')
              })
            }}
          >
            Confirm import
          </Button>
          <Button
            disabled={busy}
            onClick={() => {
              void run(async () => {
                await client.cancelImport()
                setSummary(null)
              })
            }}
          >
            Cancel import
          </Button>
        </section>
      )}
      {message && <p role={failed ? 'alert' : 'status'}>{message}</p>}
    </section>
  )
}

function Campaigns({ client }: { client: GameClient }) {
  const [page, setPage] = useState(0)
  const [state, setState] = useState<{
    key: number
    data?: CampaignPage
    error?: string
  }>()
  useEffect(() => {
    let active = true
    client.campaigns(page).then(
      (data) => {
        if (active) setState({ key: page, data })
      },
      (error) => {
        if (active)
          setState({ key: page, error: mapInvokeError(error).message })
      },
    )
    return () => {
      active = false
    }
  }, [client, page])
  return (
    <section className="space-y-4">
      <h1>Your campaigns</h1>
      <p>{readOnly}</p>
      {!state || state.key !== page ? (
        <p>Loading campaigns.</p>
      ) : state.error ? (
        <p role="alert">{state.error}</p>
      ) : (
        state.data && (
          <>
            {state.data.campaigns.length === 0 && (
              <p>No native saves. Export a browser save and import it above.</p>
            )}
            <ul>
              {state.data.campaigns.map((c) => (
                <li key={c.id}>
                  <Link to={`/app/${c.id}/command-center`}>{c.name}</Link> ·{' '}
                  {c.mode === 'legacy'
                    ? 'Historical · read-only'
                    : 'standalone'}{' '}
                  · {c.rulesMode} · {c.status} · revision {c.revision}
                </li>
              ))}
            </ul>
            <Paging page={page} total={state.data.total} onPage={setPage} />
          </>
        )
      )}
      <NativeCareerForm client={client} />
    </section>
  )
}

function Paging({
  page,
  total,
  onPage,
}: {
  page: number
  total: number
  onPage: (page: number) => void
}) {
  return (
    <nav aria-label="Pagination" className="flex gap-3">
      <Button disabled={page === 0} onClick={() => onPage(page - 1)}>
        Previous page
      </Button>
      <span>
        Page {page + 1} · {total} records
      </span>
      <Button
        disabled={(page + 1) * 50 >= total}
        onClick={() => onPage(page + 1)}
      >
        Next page
      </Button>
    </nav>
  )
}

function ScreenPage({ client }: { client: GameClient }) {
  const { campaignId = '', section = '' } = useParams()
  const screen =
    section === 'choose-club'
      ? 'choose-club'
      : workspaceSections.find((s) => s.id === section)?.id
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
  const [allPlayers, setAllPlayers] = useState(false)
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify([
    campaignId,
    screen,
    page,
    search,
    allPlayers,
    retry,
  ])
  const [state, setState] = useState<{
    key: string
    data?: ScreenModel
    error?: string
  }>()
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    client.screen({ campaignId, screen, page, search, allPlayers }).then(
      (data) => {
        if (active) setState({ key, data })
      },
      (error) => {
        if (active) setState({ key, error: mapInvokeError(error).message })
      },
    )
    return () => {
      active = false
    }
  }, [client, campaignId, screen, page, search, allPlayers, key])
  const data = state?.key === key ? state.data : undefined
  const campaign = data?.rows.campaigns[0]
  const club = data?.rows.clubs.find((c) => c.id === campaign?.managedClubId)
  const season = data?.rows.seasons.find(
    (s) => s.id === campaign?.activeSeasonId,
  )
  const title =
    workspaceSections.find((s) => s.id === screen)?.label ?? 'Choose club'
  const playerScreen = [
    'squad',
    'transfers',
    'registration',
    'scouting',
  ].includes(screen)
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
      {!state || state.key !== key ? (
        <p>Loading {title}.</p>
      ) : state.error ? (
        <>
          <p role="alert">{state.error}</p>
          <Button onClick={() => setRetry((v) => v + 1)}>Retry</Button>
          <Link to="/">Choose a campaign</Link>
        </>
      ) : (
        data &&
        campaign && (
          <>
            {campaign.mode === 'standalone' &&
              data.chooseClubRequired &&
              screen !== 'choose-club' && (
                <Navigate to={`/app/${campaignId}/choose-club`} replace />
              )}
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
                  {campaign.mode === 'legacy'
                    ? 'Historical · read-only'
                    : 'standalone'}{' '}
                  · {campaign.rulesMode} · revision {data.revision} ·{' '}
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
            {campaign.mode === 'standalone' && screen === 'command-center' && (
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
                {screen === 'transfers' && (
                  <label>
                    <input
                      type="checkbox"
                      checked={allPlayers}
                      onChange={(e) => {
                        setAllPlayers(e.target.checked)
                        setPage(0)
                      }}
                    />
                    Search all clubs and free agents
                  </label>
                )}
              </div>
            )}
            {screen === 'tactics' && <NativeTactics model={data} />}
            <NativeScreenTables model={data} screen={screen} />
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
            {campaign.mode === 'standalone' &&
              ['finance', 'transfers'].includes(screen) && (
                <PolicyPreview
                  client={client}
                  model={data}
                  campaignId={campaignId}
                />
              )}
            <Paging
              page={page}
              total={Math.max(0, ...Object.values(data.totals))}
              onPage={setPage}
            />
          </>
        )
      )}
    </div>
  )
}
function PolicyPreview({
  client,
  model,
  campaignId,
}: {
  client: GameClient
  model: ScreenModel
  campaignId: string
}) {
  const [fee, setFee] = useState('0')
  const [wage, setWage] = useState('0')
  const [age, setAge] = useState('')
  const [date, setDate] = useState(
    model.rows.simulationStates[0]?.currentDate ??
      model.rows.seasons[0]?.startDate ??
      '',
  )
  const [tier, setTier] = useState<'key' | 'rotation' | 'youth'>('rotation')
  const [state, setState] = useState<NativePreview | string | null>(null)
  const [busy, setBusy] = useState(false)
  async function submit() {
    setBusy(true)
    setState(null)
    try {
      setState(
        await client.previewPolicy({
          campaignId,
          expectedRevision: model.revision,
          effectiveDate: date,
          action: {
            type: 'incoming-transfer',
            feeCents: Number(fee),
            weeklyWageCents: wage === '' ? null : Number(wage),
            age: age === '' ? null : Number(age),
            isFree: Number(fee) === 0,
            squadTier: tier,
          },
        }),
      )
    } catch (error) {
      setState(mapInvokeError(error).message)
    } finally {
      setBusy(false)
    }
  }
  const field = (label: string, node: ReactNode) => (
    <label className="flex flex-col gap-1">
      {label}
      {node}
    </label>
  )
  return (
    <section className="space-y-3">
      <h2>Action preview</h2>
      <p>
        Checks the saved constitution in Rust. This preview does not record a
        transfer.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        {field(
          'Fee (cents)',
          <input
            type="number"
            min="0"
            max={Number.MAX_SAFE_INTEGER}
            step="1"
            required
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />,
        )}
        {field(
          'Weekly wage (cents)',
          <input
            type="number"
            min="0"
            max={Number.MAX_SAFE_INTEGER}
            step="1"
            value={wage}
            onChange={(e) => setWage(e.target.value)}
          />,
        )}
        {field(
          'Age (blank means unknown)',
          <input
            type="number"
            min="0"
            max="99"
            step="1"
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />,
        )}
        {field(
          'Tier',
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as typeof tier)}
          >
            <option value="key">Key</option>
            <option value="rotation">Rotation</option>
            <option value="youth">Youth</option>
          </select>,
        )}
        {field(
          'Effective date',
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />,
        )}
        <Button
          type="submit"
          disabled={busy || !model.rows.constitutions.length}
        >
          Preview action
        </Button>
      </form>
      {typeof state === 'string' ? (
        <p role="alert">{state}</p>
      ) : (
        state && (
          <div role="status">
            <p>
              {state.report.allowed
                ? 'Allowed by saved rules'
                : 'Blocked by saved rules'}{' '}
              · revision {state.revision}
            </p>
            <p>
              Capacity: {state.beforeCapacity} → {state.afterCapacity}
            </p>
            <p>
              Wages: {state.beforeWages} → {state.afterWages}
            </p>
            {state.report.verdicts.map((v, i) => (
              <p key={i}>
                {v.message} {v.remedy}
              </p>
            ))}
          </div>
        )
      )}
    </section>
  )
}
