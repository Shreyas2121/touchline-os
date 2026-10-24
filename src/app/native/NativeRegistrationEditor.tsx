import { NATIVE_PAGE_SIZE } from './native-pagination'
import { useState } from 'react'
import type { GameClient } from '../../platform/game-client'
import type { ScreenModel } from '../../platform/generated/ScreenModel'
import type { RegistrationRow } from '../../platform/generated/RegistrationRow'
import { mapInvokeError } from '../../platform/errors'
import { Button } from '../../components/ui/Button'
import type { SendAction } from './management-forms'

export function RegistrationEditor({
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
    Math.max(model.totals.players ?? 0, model.totals.registrations ?? 0) /
      NATIVE_PAGE_SIZE,
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
          {players
            .slice(
              page * NATIVE_PAGE_SIZE,
              page * NATIVE_PAGE_SIZE + NATIVE_PAGE_SIZE,
            )
            .map((p) => (
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
          {players.length > NATIVE_PAGE_SIZE && (
            <div>
              <Button
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous roster page
              </Button>
              <Button
                disabled={(page + 1) * NATIVE_PAGE_SIZE >= players.length}
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
