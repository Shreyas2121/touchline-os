import { NATIVE_PAGE_SIZE } from './native-pagination'
import { useState } from 'react'
import { Button } from '../../components/ui/Button'
import { text, type EditorProps } from './editor-props'
import { mapInvokeError } from '../../platform/errors'
import type { PlayerRow } from '../../platform/generated/PlayerRow'
import type { Formation } from '../../platform/generated/Formation'
import { formationSlots } from '../../domain/graphics/pitch'
import { submit } from './management-forms'

export function LineupEditor({
  model,
  send,
  stableId,
  stamp,
  client,
}: EditorProps) {
  const [selected, setSelected] = useState('new')
  const [formation, setFormation] = useState<Formation>('4-3-3')
  const row = model.rows.lineups.find((l) => l.id === selected)
  const campaign = model.rows.campaigns[0]!
  const [roster, setRoster] = useState(model.rows.players)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const complete =
    roster.length >= (model.totals.players ?? model.rows.players.length)
  async function loadRoster() {
    setLoading(true)
    setError('')
    try {
      const players: PlayerRow[] = []
      const pages = Math.ceil((model.totals.players ?? 0) / NATIVE_PAGE_SIZE)
      for (let page = 0; page < pages; page++) {
        const data = await client.screen({
          campaignId: campaign.id,
          screen: 'squad',
          page,
          search: '',
          allPlayers: false,
        })
        if (data.revision !== model.revision)
          throw {
            code: 'CONFLICT',
            message: 'The squad changed. Reload before editing.',
          }
        players.push(...data.rows.players)
      }
      setRoster(players)
    } catch (error) {
      setError(mapInvokeError(error).message)
    } finally {
      setLoading(false)
    }
  }
  return (
    <section className="space-y-3">
      <h2>Lineup editor</h2>
      {!complete && (
        <>
          <p>
            Load the complete managed roster before editing so saved selections
            are preserved.
          </p>
          <Button
            disabled={loading}
            onClick={() => {
              void loadRoster()
            }}
          >
            Load complete lineup roster
          </Button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <label>
        Lineup to edit{' '}
        <select
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value)
            setFormation(
              model.rows.lineups.find((l) => l.id === e.target.value)
                ?.formation ?? '4-3-3',
            )
          }}
        >
          <option value="new">New lineup</option>
          {model.rows.lineups.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <form
        key={`${selected}:${complete}`}
        className="space-y-3"
        onSubmit={(e) =>
          submit(
            e,
            (data) => ({
              type: 'save-lineup',
              lineup: {
                id: row?.id ?? stableId('lineup'),
                campaignId: campaign.id,
                seasonId: campaign.activeSeasonId,
                name: text(data, 'name'),
                formation,
                starters: formationSlots(formation)
                  .filter((slot) => text(data, slot.id))
                  .map((slot) => ({
                    slot: slot.id,
                    playerId: text(data, slot.id),
                    role: text(data, `role-${slot.id}`) || null,
                  })),
                benchPlayerIds: data.getAll('bench').map(String),
                updatedAt: stamp,
              },
            }),
            send,
          )
        }
      >
        <fieldset disabled={!complete || loading} className="space-y-3">
          <label>
            Lineup name{' '}
            <input
              name="name"
              required
              maxLength={80}
              defaultValue={row?.name}
            />
          </label>
          <label>
            Formation{' '}
            <select
              value={formation}
              onChange={(e) => setFormation(e.target.value as Formation)}
            >
              {['4-3-3', '4-2-3-1', '4-4-2', '3-5-2'].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            {formationSlots(formation).map((slot) => (
              <div key={slot.id}>
                <label>
                  {slot.label} player{' '}
                  <select
                    name={slot.id}
                    defaultValue={
                      row?.starters.find(
                        (s) => s.slot.toLowerCase() === slot.id,
                      )?.playerId ?? ''
                    }
                  >
                    <option value="">Empty</option>
                    {row?.starters
                      .filter(
                        (s) =>
                          s.slot.toLowerCase() === slot.id &&
                          !roster.some((p) => p.id === s.playerId),
                      )
                      .map((s) => (
                        <option key={s.playerId} value={s.playerId}>
                          {model.labels[s.playerId] ?? 'Former player'} (choose
                          a replacement)
                        </option>
                      ))}
                    {roster.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {slot.label} role{' '}
                  <input
                    name={`role-${slot.id}`}
                    maxLength={40}
                    defaultValue={
                      row?.starters.find(
                        (s) => s.slot.toLowerCase() === slot.id,
                      )?.role ?? ''
                    }
                  />
                </label>
              </div>
            ))}
          </div>
          <fieldset>
            <legend>Bench</legend>
            {roster.map((p) => (
              <label key={p.id} className="mr-3 inline-block">
                <input
                  type="checkbox"
                  name="bench"
                  value={p.id}
                  defaultChecked={row?.benchPlayerIds.includes(p.id)}
                />
                {p.name}
              </label>
            ))}
          </fieldset>
          {row?.benchPlayerIds
            .filter((id) => !roster.some((p) => p.id === id))
            .map((id) => (
              <label key={id}>
                <input type="checkbox" name="bench" value={id} defaultChecked />
                {model.labels[id] ?? 'Former player'} (not in current roster)
              </label>
            ))}
          <Button type="submit">Save lineup</Button>
          {row && (
            <Button
              onClick={() => {
                void send({ type: 'delete-lineup', lineupId: row.id })
              }}
            >
              Delete lineup
            </Button>
          )}
        </fieldset>
      </form>
    </section>
  )
}
