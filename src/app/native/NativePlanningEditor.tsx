import { useCallback, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { text, type EditorProps } from './editor-props'
import { useNativeRead } from './useNativeRead'
import { submit } from './management-forms'

export function PlanningEditor({
  model,
  send,
  stableId,
  stamp,
  client,
  onReload,
}: EditorProps) {
  const [selected, setSelected] = useState(model.rows.players[0]?.id ?? '')
  const campaign = model.rows.campaigns[0]!
  const key = JSON.stringify([campaign.id, model.revision, selected])
  const load = useCallback(async () => {
    const data = await client.planning(campaign.id, selected)
    if (data.revision !== model.revision)
      throw {
        code: 'CONFLICT',
        message: 'The campaign changed. Reload before editing planning notes.',
      }
    return data
  }, [client, campaign.id, selected, model.revision])
  const { state } = useNativeRead(key, selected ? load : null)
  const data = state.status === 'success' ? state.data : undefined
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
          <p role={state.status === 'error' ? 'alert' : 'status'}>
            {state.status === 'error'
              ? state.error
              : 'Loading saved player planning.'}
          </p>
          {state.status === 'error' && (
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
