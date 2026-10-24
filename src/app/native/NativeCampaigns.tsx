import { useCallback, useState } from 'react'
import { Link } from 'react-router'
import type { GameClient } from '../../platform/game-client'
import { useNativeRead } from './useNativeRead'
import { NativeCareerForm } from './NativeCareerForm'
import { Paging } from './NativePaging'
import { readOnly } from './workspace-sections'

export function Campaigns({ client }: { client: GameClient }) {
  const [page, setPage] = useState(0)
  const load = useCallback(() => client.campaigns(page), [client, page])
  const { state } = useNativeRead(JSON.stringify(['campaigns', page]), load)
  return (
    <section className="space-y-4">
      <h1>Your campaigns</h1>
      <p>{readOnly}</p>
      {state.status === 'loading' ? (
        <p>Loading campaigns.</p>
      ) : state.status === 'error' ? (
        <p role="alert">{state.error}</p>
      ) : (
        <>
          {state.data.campaigns.length === 0 && (
            <p>
              No saved careers. Create a career or import a standalone snapshot.
            </p>
          )}
          <ul>
            {state.data.campaigns.map((c) => (
              <li key={c.id}>
                <Link to={`/app/${c.id}/command-center`}>{c.name}</Link> ·{' '}
                standalone · {c.rulesMode} · {c.status} · revision {c.revision}
              </li>
            ))}
          </ul>
          <Paging page={page} total={state.data.total} onPage={setPage} />
        </>
      )}
      <NativeCareerForm client={client} />
    </section>
  )
}
