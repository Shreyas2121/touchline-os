import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import type { GameClient } from '../../platform/game-client'
import type { ScreenModel } from '../../platform/generated/ScreenModel'
import type { Screen } from '../../platform/generated/Screen'
import type { ManagementCommand } from '../../platform/generated/ManagementCommand'
import type { ManagementOutcome } from '../../platform/generated/ManagementOutcome'
import type { CreationRequest } from '../../platform/generated/CreationRequest'
import { mapInvokeError } from '../../platform/errors'
import { Button } from '../../components/ui/Button'
import { makeCareerRequest, submit, type SendAction } from './management-forms'
import { RegistrationEditor } from './NativeRegistrationEditor'
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
      if (result.deleted) await navigate('/')
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
