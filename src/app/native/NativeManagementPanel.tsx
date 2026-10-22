import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { GameClient } from '../../platform/game-client'
import type { ScreenModel } from '../../platform/generated/ScreenModel'
import type { Screen } from '../../platform/generated/Screen'
import type { ManagementCommand } from '../../platform/generated/ManagementCommand'
import type { ManagementOutcome } from '../../platform/generated/ManagementOutcome'
import type { CreationRequest } from '../../platform/generated/CreationRequest'
import type { RegistrationRow } from '../../platform/generated/RegistrationRow'
import { mapInvokeError } from '../../platform/errors'
import { Button } from '../../components/ui/Button'
import { makeCareerRequest, submit, type SendAction } from './management-forms'
import {
  ConstitutionEditor,
  LineupEditor,
  PlanningEditor,
} from './NativeEditors'

export function NativeManagementPanel({
  client,
  model,
  screen,
  onSaved,
  onReload,
}: {
  client: GameClient
  model: ScreenModel
  screen: Screen
  onSaved: (outcome: ManagementOutcome) => void
  onReload: () => void
}) {
  const campaign = model.rows.campaigns[0]!
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<'delete' | 'reset' | null>(null)
  const [stamp] = useState(() => new Date().toISOString())
  const ids = useRef(new Map<string, string>())
  const pending = useRef<ManagementCommand | null>(null)
  const pendingReset = useRef<CreationRequest | null>(null)
  function stableId(key: string) {
    let id = ids.current.get(key)
    if (!id) {
      id = crypto.randomUUID()
      ids.current.set(key, id)
    }
    return id
  }
  const send: SendAction = async (action) => {
    if (busy) return
    setBusy(true)
    setError('')
    if (
      !pending.current ||
      JSON.stringify(pending.current.action) !== JSON.stringify(action)
    )
      pending.current = {
        campaignId: campaign.id,
        expectedRevision: model.revision,
        actionId: crypto.randomUUID(),
        auditId: crypto.randomUUID(),
        now: stamp,
        action,
      }
    try {
      const result = await client.manage(pending.current)
      pending.current = null
      onSaved(result)
      if (result.deleted) navigate('/')
    } catch (error) {
      setError(mapInvokeError(error).message)
    } finally {
      setBusy(false)
    }
  }
  async function reset() {
    setBusy(true)
    setError('')
    const request =
      pendingReset.current ?? makeCareerRequest('standalone-demo', campaign.id)
    request.resetRevision = model.revision
    pendingReset.current = request
    try {
      const result = await client.createCareer(request)
      pendingReset.current = null
      onSaved(result)
      setConfirm(null)
    } catch (error) {
      setError(mapInvokeError(error).message)
    } finally {
      setBusy(false)
    }
  }
  const props = { model, send, stableId, stamp, client, onReload }
  return (
    <section
      aria-label="Career management"
      className="space-y-4 rounded-lg border border-[var(--border)] p-4"
    >
      <fieldset disabled={busy} className="space-y-4">
        <h2>Campaign management</h2>
        {
          <>
            <form
              className="flex flex-wrap gap-3"
              onSubmit={(e) =>
                submit(
                  e,
                  (data) => ({
                    type: 'rename',
                    name: String(data.get('name') ?? ''),
                  }),
                  send,
                )
              }
            >
              <label>
                Campaign name{' '}
                <input
                  name="name"
                  defaultValue={campaign.name}
                  required
                  maxLength={120}
                />
              </label>
              <Button type="submit">Rename campaign</Button>
            </form>
            <Button
              onClick={() => {
                void send({
                  type: 'archive',
                  archived: campaign.status !== 'archived',
                })
              }}
            >
              {campaign.status === 'archived'
                ? 'Restore campaign'
                : 'Archive campaign'}
            </Button>
          </>
        }
        <Button onClick={() => setConfirm('delete')}>Delete campaign</Button>
        {campaign.id === 'native-standalone-demo' && (
          <Button onClick={() => setConfirm('reset')}>Reset this demo</Button>
        )}
        {confirm && (
          <section role="region" aria-label="Confirm campaign action">
            <p>
              {confirm === 'delete'
                ? 'Delete this native campaign and all its saved history?'
                : 'Replace only this demo with its default seeded world?'}{' '}
              Other campaigns remain untouched.
            </p>
            <Button
              onClick={() => {
                if (confirm === 'delete') void send({ type: 'delete' })
                else void reset()
              }}
            >
              {confirm === 'delete' ? 'Confirm deletion' : 'Confirm demo reset'}
            </Button>
            <Button onClick={() => setConfirm(null)}>
              Cancel campaign action
            </Button>
          </section>
        )}
        {campaign.status === 'active' && (
          <>
            {screen === 'tactics' && <LineupEditor {...props} />}
            {screen === 'constitution' && <ConstitutionEditor {...props} />}
            {['scouting', 'transfers'].includes(screen) && (
              <PlanningEditor {...props} />
            )}
            {screen === 'registration' && <RegistrationEditor {...props} />}
          </>
        )}
      </fieldset>
      {error && (
        <>
          <p role="alert">{error}</p>
          <Button onClick={onReload}>
            Reload saved campaign (discard drafts)
          </Button>
        </>
      )}
      {busy && <p role="status">Saving to the native campaign…</p>}
    </section>
  )
}

function RegistrationEditor({
  client,
  model,
  send,
  stableId,
}: {
  client: GameClient
  model: ScreenModel
  send: SendAction
  stableId: (key: string) => string
}) {
  const campaign = model.rows.campaigns[0]!
  const rule = (
    model.activeConstitution?.rules ??
    model.rows.constitutions.flatMap((c) => c.rules)
  ).find((r) => r.id === 'REGISTRATION_QUOTA')
  const key = rule?.id === 'REGISTRATION_QUOTA' ? rule.competitionKey : 'league'
  const [loaded, setLoaded] = useState([model])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState(
    new Set(
      model.rows.registrations
        .filter((r) => r.competitionKey === key && r.status === 'registered')
        .map((r) => r.playerId),
    ),
  )
  const players = [
    ...new Map(
      loaded.flatMap((m) => m.rows.players).map((p) => [p.id, p]),
    ).values(),
  ]
  const saved = loaded.flatMap((m) => m.rows.registrations)
  const pages = Math.ceil(
    Math.max(model.totals.players ?? 0, model.totals.registrations ?? 0) / 50,
  )
  const complete = loaded.length >= pages && loaded.some((m) => m.page === 0)
  async function load() {
    setLoading(true)
    setError('')
    try {
      const models: ScreenModel[] = []
      // Explicit editing loads bounded pages; normal screen renders never fetch a world.
      for (let page = 0; page < pages; page++) {
        const m = await client.screen({
          campaignId: campaign.id,
          screen: 'registration',
          page,
          search: '',
          allPlayers: false,
        })
        if (m.revision !== model.revision)
          throw {
            code: 'CONFLICT',
            message: 'The registration changed. Reload before editing.',
          }
        models.push(m)
      }
      setLoaded(models)
      setSelected(
        new Set(
          models
            .flatMap((m) => m.rows.registrations)
            .filter(
              (r) => r.competitionKey === key && r.status === 'registered',
            )
            .map((r) => r.playerId),
        ),
      )
    } catch (error) {
      setError(mapInvokeError(error).message)
    } finally {
      setLoading(false)
    }
  }
  return (
    <section className="space-y-3">
      <h2>Registration editor</h2>
      <p>
        Choose the registered squad and confirm replacement. Unselected managed
        players become ineligible for this competition. No draft is saved
        automatically.
      </p>
      {!complete && (
        <Button
          disabled={loading}
          onClick={() => {
            void load()
          }}
        >
          Load complete registration roster
        </Button>
      )}
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const rows: RegistrationRow[] = players
            .filter((p) => selected.has(p.id))
            .map((p) => {
              const old = saved.find(
                (r) => r.playerId === p.id && r.competitionKey === key,
              )
              return {
                id: old?.id ?? stableId(`registration-${p.id}`),
                campaignId: campaign.id,
                seasonId: campaign.activeSeasonId,
                playerId: p.id,
                competitionKey: key,
                status: 'registered',
                homegrownClub: old?.homegrownClub ?? null,
                homegrownNation: old?.homegrownNation ?? null,
                ageExempt: old?.ageExempt ?? null,
                provenance: 'user-entered',
              }
            })
          void send({
            type: 'save-registration',
            competitionKey: key,
            players: rows,
          })
        }}
      >
        <fieldset disabled={!complete || loading} className="space-y-3">
          <legend>{key} squad</legend>
          <Button
            onClick={() =>
              setSelected(new Set(players.slice(0, 20).map((p) => p.id)))
            }
          >
            Select first 20 players
          </Button>
          {players.slice(page * 50, page * 50 + 50).map((p) => (
            <div key={p.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={(e) =>
                    setSelected((old) => {
                      const next = new Set(old)
                      if (e.target.checked) next.add(p.id)
                      else next.delete(p.id)
                      return next
                    })
                  }
                />
                {p.name}
              </label>
            </div>
          ))}
          {players.length > 50 && (
            <div>
              <Button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous roster page
              </Button>
              <Button
                disabled={(page + 1) * 50 >= players.length}
                onClick={() => setPage((p) => p + 1)}
              >
                Next roster page
              </Button>
            </div>
          )}
          <label>
            <input type="checkbox" required />I confirm this replaces the saved
            registration for the managed club.
          </label>
          <Button type="submit">Save registration</Button>
        </fieldset>
      </form>
    </section>
  )
}
