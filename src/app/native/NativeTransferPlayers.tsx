import { useCallback, useState } from 'react'
import { Button } from '../../components/ui/Button'
import type { GameClient } from '../../platform/game-client'
import type { ScreenModel } from '../../platform/generated/ScreenModel'
import type { ManagementOutcome } from '../../platform/generated/ManagementOutcome'
import { useNativeRead, type NativeReadState } from './useNativeRead'
import { NativeManagementPanel } from './NativeManagementPanel'
import { Paging } from './NativePaging'

export function NativeTransferPlayers({
  client,
  initialModel,
  onSaved,
  onReload,
}: {
  client: GameClient
  initialModel: ScreenModel
  onSaved: (outcome: ManagementOutcome) => void
  onReload: () => void
}) {
  const campaignId = initialModel.rows.campaigns[0]!.id
  const revision = initialModel.revision
  const [query, setQuery] = useState({
    page: 0,
    search: '',
    allPlayers: false,
    attempt: 0,
  })
  const key = JSON.stringify([campaignId, revision, query])
  const load = useCallback(async () => {
    const data = await client.screen({
      campaignId,
      screen: 'transfers',
      page: query.page,
      search: query.search,
      allPlayers: query.allPlayers,
    })
    if (data.revision !== revision)
      throw {
        code: 'CONFLICT',
        message: 'The campaign changed. Reload before editing player planning.',
      }
    return data
  }, [client, campaignId, revision, query])
  // Reuse the screen's first page without another request. Later queries have
  // an independent lifetime, so paging never reloads the transfer board.
  const read = useNativeRead(key, query.attempt === 0 ? null : load)
  const state: NativeReadState<ScreenModel> =
    query.attempt === 0 ? { status: 'success', data: initialModel } : read.state
  const model = state.status === 'success' ? state.data : undefined
  return (
    <section aria-label="Transfer player search" className="space-y-3">
      <h2>Player search</h2>
      <div className="flex flex-wrap gap-4">
        <label>
          Search players{' '}
          <input
            type="search"
            value={query.search}
            maxLength={120}
            onChange={(event) =>
              setQuery((current) => ({
                ...current,
                search: event.target.value,
                page: 0,
                attempt: current.attempt + 1,
              }))
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={query.allPlayers}
            onChange={(event) =>
              setQuery((current) => ({
                ...current,
                allPlayers: event.target.checked,
                page: 0,
                attempt: current.attempt + 1,
              }))
            }
          />
          Search all clubs and free agents
        </label>
      </div>
      {model ? (
        <>
          <Paging
            label="Player search pagination"
            page={query.page}
            total={model.totals.players ?? 0}
            onPage={(page) =>
              setQuery((current) => ({
                ...current,
                page,
                attempt: current.attempt + 1,
              }))
            }
          />
          <NativeManagementPanel
            key={key}
            client={client}
            model={model}
            screen="transfers"
            onSaved={onSaved}
            onReload={onReload}
          />
        </>
      ) : state.status === 'error' ? (
        <>
          <p role="alert">{state.error}</p>
          <Button
            onClick={() =>
              setQuery((current) => ({
                ...current,
                attempt: current.attempt + 1,
              }))
            }
          >
            Retry player search
          </Button>
          <Button onClick={onReload}>
            Reload saved campaign (discard drafts)
          </Button>
        </>
      ) : (
        <p role="status">Loading player search.</p>
      )}
    </section>
  )
}
