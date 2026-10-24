import { useEffect, useState } from 'react'
import type { GameClient } from '../../platform/game-client'
import type { PlayerPlanning } from '../../platform/generated/PlayerPlanning'
import { mapInvokeError } from '../../platform/errors'
import type { ScreenModel } from '../../platform/generated/ScreenModel'
import { submit, type SendAction } from './management-forms'
import { ruleFields, serializeRule } from './constitution-form'
import type { PlayerRow } from '../../platform/generated/PlayerRow'
import type { Formation } from '../../platform/generated/Formation'
import { formationSlots } from '../../domain/graphics/pitch'
import { Button } from '../../components/ui/Button'

type Props = {
  client: GameClient
  onReload: () => void
  model: ScreenModel
  send: SendAction
  stableId: (key: string) => string
  stamp: string
}
const text = (data: FormData, key: string) => String(data.get(key) ?? '').trim()

export function LineupEditor({ model, send, stableId, stamp, client }: Props) {
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
      const pages = Math.ceil((model.totals.players ?? 0) / 50)
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

export function ConstitutionEditor({ model, send, stableId, stamp }: Props) {
  const [error, setError] = useState('')
  const campaign = model.rows.campaigns[0]!
  const current =
    model.activeConstitution ??
    model.rows.constitutions.reduce<
      (typeof model.rows.constitutions)[number] | undefined
    >((a, b) => (!a || b.version > a.version ? b : a), undefined)
  if (!current)
    return (
      <p>
        This save has no constitution. Create a native career with a board
        preset to initialize one.
      </p>
    )
  const locked = campaign.rulesMode === 'challenge'
  return (
    <section className="space-y-3">
      <h2>Edit board rules</h2>
      <p>
        {locked
          ? 'Challenge rules are locked.'
          : 'Rules change prospectively. Editing the opening allocation does not add money to an existing allocation.'}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (locked) return
          setError('')
          try {
            const data = new FormData(e.currentTarget)
            const rules = current.rules.map((rule) => serializeRule(rule, data))
            void send({
              type: 'save-constitution',
              allocationId: stableId('allocation'),
              constitution: {
                id: stableId('constitution'),
                campaignId: campaign.id,
                version: 0,
                updatedAt: stamp,
                rules,
              },
            })
          } catch (error) {
            setError(
              error instanceof Error ? error.message : 'Check the rule fields.',
            )
          }
        }}
      >
        <fieldset disabled={locked} className="space-y-4">
          {current.rules.map((rule) => (
            <fieldset
              key={rule.id}
              className="flex flex-wrap gap-4 border border-[var(--border)] p-3"
            >
              <legend>{rule.id.replaceAll('_', ' ')}</legend>
              {ruleFields(rule).map(({ key, label, kind, value }) => (
                <label key={key}>
                  {label}{' '}
                  <input
                    name={`${rule.id}.${key}`}
                    type={
                      kind === 'checkbox'
                        ? 'checkbox'
                        : kind === 'text'
                          ? 'text'
                          : 'number'
                    }
                    min={
                      kind === 'integer' || kind === 'nullable' ? 0 : undefined
                    }
                    step={
                      kind === 'integer' || kind === 'nullable' ? 1 : undefined
                    }
                    required={kind === 'integer' || kind === 'text'}
                    defaultChecked={
                      kind === 'checkbox' ? value === true : undefined
                    }
                    defaultValue={
                      typeof value === 'boolean' ? undefined : (value ?? '')
                    }
                  />
                </label>
              ))}
            </fieldset>
          ))}
          <Button type="submit">Save constitution</Button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  )
}

export function PlanningEditor({
  model,
  send,
  stableId,
  stamp,
  client,
  onReload,
}: Props) {
  const [selected, setSelected] = useState(model.rows.players[0]?.id ?? '')
  const campaign = model.rows.campaigns[0]!
  const [state, setState] = useState<{
    id: string
    data?: PlayerPlanning
    error?: string
  }>()
  useEffect(() => {
    if (!selected) return
    let active = true
    client.planning(campaign.id, selected).then(
      (data) => {
        if (active)
          setState(
            data.revision === model.revision
              ? { id: selected, data }
              : {
                  id: selected,
                  error:
                    'The campaign changed. Reload before editing planning notes.',
                },
          )
      },
      (error) => {
        if (active)
          setState({ id: selected, error: mapInvokeError(error).message })
      },
    )
    return () => {
      active = false
    }
  }, [client, campaign.id, selected, model.revision])
  const data = state?.id === selected ? state.data : undefined
  const note = data?.note
  const short = data?.shortlist
  if (!selected)
    return <p>Search a player to add a shortlist item or development note.</p>
  return (
    <section className="space-y-3">
      <h2>Player planning</h2>
      <label>
        Planning player{' '}
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {model.rows.players.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {!data ? (
        <>
          <p role={state?.error ? 'alert' : 'status'}>
            {state?.id === selected && state.error
              ? state.error
              : 'Loading saved player planning.'}
          </p>
          {state?.error && (
            <Button onClick={onReload}>Reload saved planning</Button>
          )}
        </>
      ) : (
        <>
          <form
            key={`note-${selected}`}
            onSubmit={(e) =>
              submit(
                e,
                (data) => ({
                  type: 'save-note',
                  plan: {
                    id: note?.id ?? stableId(`note-${selected}`),
                    campaignId: campaign.id,
                    seasonId: campaign.activeSeasonId,
                    playerId: selected,
                    targetRole: text(data, 'role') || null,
                    notes: text(data, 'notes'),
                    status: 'open',
                  },
                }),
                send,
              )
            }
          >
            <label>
              Target role{' '}
              <input
                name="role"
                maxLength={40}
                defaultValue={note?.targetRole ?? ''}
              />
            </label>
            <label>
              Development notes{' '}
              <textarea
                name="notes"
                maxLength={4000}
                defaultValue={note?.notes ?? ''}
              />
            </label>
            <p>Planning notes do not change attributes or ownership.</p>
            <Button type="submit">Save development note</Button>
          </form>
          <form
            key={`short-${selected}`}
            onSubmit={(e) =>
              submit(
                e,
                (data) => ({
                  type: 'save-shortlist',
                  item: {
                    id: short?.id ?? stableId(`short-${selected}`),
                    campaignId: campaign.id,
                    playerId: selected,
                    priority: Number(text(data, 'priority')),
                    status: 'open',
                    notes: text(data, 'notes') || null,
                    addedAt: short?.addedAt ?? stamp,
                  },
                }),
                send,
              )
            }
          >
            <label>
              Priority{' '}
              <input
                name="priority"
                type="number"
                min={1}
                max={5}
                required
                defaultValue={short?.priority ?? 3}
              />
            </label>
            <label>
              Shortlist notes{' '}
              <textarea
                name="notes"
                maxLength={4000}
                defaultValue={short?.notes ?? ''}
              />
            </label>
            <Button type="submit">Save shortlist item</Button>
            {short?.status === 'open' && (
              <Button
                onClick={() => {
                  void send({ type: 'close-shortlist', itemId: short.id })
                }}
              >
                Close shortlist item
              </Button>
            )}
          </form>
        </>
      )}
    </section>
  )
}
