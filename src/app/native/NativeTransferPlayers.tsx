import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import type { GameClient } from '../../platform/game-client'
import type { ScreenModel } from '../../platform/generated/ScreenModel'
import type { ManagementOutcome } from '../../platform/generated/ManagementOutcome'
import { mapInvokeError } from '../../platform/errors'
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
  const key = JSON.stringify(query)
  const [state, setState] = useState<{
    key: string
    data?: ScreenModel
    error?: string
  }>({ key, data: initialModel })
  useEffect(() => {
    // The first unfiltered page was already loaded with the screen. Subsequent
    // player queries have their own lifetime and never reload the transfer board.
    if (query.attempt === 0) return
    let active = true
    client
      .screen({
        campaignId,
        screen: 'transfers',
        page: query.page,
        search: query.search,
        allPlayers: query.allPlayers,
      })
      .then(
        (data) => {
          if (!active) return
          setState(
            data.revision === revision
              ? { key, data }
              : {
                  key,
                  error:
                    'The campaign changed. Reload before editing player planning.',
                },
          )
        },
        (error) => {
          if (active) setState({ key, error: mapInvokeError(error).message })
        },
      )
    return () => {
      active = false
    }
  }, [client, campaignId, revision, key, query])
  const shown = state.key === key ? state : undefined
  const model = shown?.data
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
      ) : shown?.error ? (
        <>
          <p role="alert">{shown.error}</p>
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
