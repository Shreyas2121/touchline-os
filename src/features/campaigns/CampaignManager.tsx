import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import * as copy from '../../app/copy'
import { useDatabase } from '../../app/providers/database'
import { Button } from '../../components/ui/Button'
import { systemClock } from '../../data/clock'
import { createEntityId } from '../../data/ids'
import { createCampaign } from '../../data/commands/create-campaign'
import { renameCampaign } from '../../data/commands/rename-campaign'
import { setCampaignArchived } from '../../data/commands/set-campaign-archived'
import { deleteCampaign } from '../../data/commands/delete-campaign'
import { resetDemoCampaign } from '../../data/commands/reset-demo'
import {
  seedDemoCampaign,
  type SeedProgress,
} from '../../data/commands/seed-demo'
import { getCampaign, listCampaigns } from '../../data/repositories/campaigns'
import type { CommandResult } from '../../domain/commands/result'
import {
  FEATURED_CAMPAIGN_ID,
  FEATURED_SEED,
  GENERATOR_VERSION,
} from '../../domain/seed/generate-world'
import { entityIdSchema, type Campaign } from '../../domain/validation/schemas'
import { NewCareerForm } from './NewCareerForm'
import type { ConstitutionPresetName } from '../../domain/rules/presets'

type Panel =
  | { kind: 'create' }
  | {
      kind: 'rename' | 'archive' | 'restore' | 'delete' | 'reset'
      campaign: Campaign
    }

const demoAuditIds = {
  createAuditEventId: 'demo-audit-create',
  createActionId: 'demo-action-create',
  seedAuditEventId: 'demo-audit-seed',
  seedActionId: 'demo-action-seed',
}

export function CampaignManager() {
  const database = useDatabase()
  const navigate = useNavigate()
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [name, setName] = useState('')
  const [clubName, setClubName] = useState('')
  const [shortName, setShortName] = useState('')
  const [preset, setPreset] = useState<ConstitutionPresetName>('balanced')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [retry, setRetry] = useState(false)
  const [showArchivedDemo, setShowArchivedDemo] = useState(false)
  const dialog = useRef<HTMLElement>(null)

  async function reload() {
    setCampaigns(await listCampaigns(database))
  }
  useEffect(() => {
    let active = true
    listCampaigns(database)
      .then((rows) => {
        if (active) setCampaigns(rows)
      })
      .catch(() => {
        if (active) setMessage(copy.saveFailed)
      })
    return () => {
      active = false
    }
  }, [database])
  useEffect(() => {
    if (panel)
      dialog.current?.querySelector<HTMLElement>('input, button')?.focus()
  }, [panel])

  function open(next: Panel) {
    setName(next.kind === 'create' ? '' : next.campaign.name)
    setClubName('')
    setShortName('')
    setPreset('balanced')
    setConfirmation('')
    setMessage('')
    setPanel(next)
  }

  async function perform(
    action: () => Promise<CommandResult<unknown>>,
    onSuccess?: () => void,
  ) {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const result = await action()
      if (!result.ok) {
        setMessage(
          result.code === 'CONFLICT' ? copy.staleSave : copy.saveFailed,
        )
        if (result.code === 'CONFLICT') {
          setPanel(null)
          await reload()
        }
        return
      }
      setPanel(null)
      await reload()
      onSuccess?.()
    } catch {
      setMessage(copy.saveFailed)
    } finally {
      setBusy(false)
    }
  }

  const reportProgress = (progress: SeedProgress) =>
    setMessage(copy.seedProgress(progress.stage, progress.done, progress.total))

  async function runDemo(resetCampaign?: Campaign) {
    if (busy) return
    setBusy(true)
    setRetry(false)
    setMessage('')
    try {
      const stored = await getCampaign(
        database,
        entityIdSchema.parse(FEATURED_CAMPAIGN_ID),
      )
      if (!resetCampaign && stored?.status === 'archived') {
        setShowArchivedDemo(true)
        setMessage(copy.archivedDemo)
        await reload()
        return
      }
      const common = {
        campaignId: FEATURED_CAMPAIGN_ID,
        now: systemClock(),
        ...demoAuditIds,
      }
      const result = resetCampaign
        ? await resetDemoCampaign(
            database,
            { ...common, expectedRevision: resetCampaign.revision },
            reportProgress,
          )
        : await seedDemoCampaign(
            database,
            {
              ...common,
              seed: FEATURED_SEED,
              generatorVersion: GENERATOR_VERSION,
              reason: 'create',
            },
            reportProgress,
          )
      if (!result.ok) {
        setMessage(
          result.code === 'CONFLICT'
            ? copy.staleSave
            : result.message === 'Demo world version does not match.'
              ? copy.seedVersionMismatch
              : copy.seedFailed,
        )
        setRetry(result.code === 'ABORTED')
        if (result.code === 'CONFLICT') setPanel(null)
        await reload()
        return
      }
      setMessage(copy.seedReady)
      setPanel(null)
      await reload()
      navigate('/app/demo/command-center')
    } catch {
      setMessage(copy.seedFailed)
      setRetry(true)
    } finally {
      setBusy(false)
    }
  }

  function submitPanel() {
    if (!panel) return
    if (panel.kind === 'create') {
      const campaignId = createEntityId()
      void perform(
        () =>
          createCampaign(database, {
            campaignId,
            clubId: createEntityId(),
            seasonId: createEntityId(),
            auditEventId: createEntityId(),
            actionId: createEntityId(),
            preset,
            constitutionId: createEntityId(),
            constitutionActionId: createEntityId(),
            ledgerEntryId: createEntityId(),
            name: name.trim(),
            clubName: clubName.trim(),
            shortName: shortName.trim(),
            kind: 'fictional',
            seed: null,
            generatorVersion: null,
            colors: { primary: '#1F2933', secondary: '#C4A35A' },
            prestige: 50,
            academyTier: 3,
            scoutingRegion: null,
            now: systemClock(),
          }),
        () => navigate(`/app/${campaignId}/command-center`),
      )
      return
    }
    const campaign = panel.campaign
    if (panel.kind === 'reset') {
      void runDemo(campaign)
      return
    }
    const common = {
      campaignId: campaign.id,
      expectedRevision: campaign.revision,
      now: systemClock(),
      auditEventId: createEntityId(),
      actionId: createEntityId(),
    }
    if (panel.kind === 'rename')
      void perform(() =>
        renameCampaign(database, { ...common, name: name.trim() }),
      )
    if (panel.kind === 'archive' || panel.kind === 'restore') {
      void perform(
        () =>
          setCampaignArchived(database, {
            ...common,
            archived: panel.kind === 'archive',
          }),
        () => {
          setShowArchivedDemo(false)
          if (panel.kind === 'archive') navigate('/')
        },
      )
    }
    if (panel.kind === 'delete')
      void perform(() => deleteCampaign(database, common))
  }

  const sorted = [...(campaigns ?? [])].sort(
    (a, b) =>
      b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  )
  const archived = sorted.filter((campaign) => campaign.status === 'archived')
  const demo = sorted.find((campaign) => campaign.id === FEATURED_CAMPAIGN_ID)
  const confirmDisabled =
    busy ||
    !panel ||
    ((panel.kind === 'create' || panel.kind === 'rename') && !name.trim()) ||
    (panel.kind === 'create' && (!clubName.trim() || !shortName.trim())) ||
    (panel.kind === 'delete' && confirmation !== panel.campaign.name) ||
    (panel.kind === 'reset' && confirmation !== copy.resetPhrase)
  const confirmLabel =
    panel?.kind === 'create'
      ? 'Save campaign'
      : panel?.kind === 'rename'
        ? 'Save name'
        : panel?.kind === 'archive'
          ? 'Archive campaign'
          : panel?.kind === 'restore'
            ? 'Restore campaign'
            : panel?.kind === 'delete'
              ? 'Delete campaign'
              : 'Reset demo'

  return (
    <div className="space-y-4">
      <NewCareerForm onStarted={() => void reload()} />
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || campaigns === null}
          onClick={() => void runDemo()}
        >
          Try fictional demo
        </Button>
        <Button disabled={busy} onClick={() => open({ kind: 'create' })}>
          Create new campaign
        </Button>
        {retry ? (
          <Button disabled={busy} onClick={() => void runDemo()}>
            Retry
          </Button>
        ) : null}
      </div>
      {message ? (
        <p role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {showArchivedDemo && demo?.status === 'archived' ? (
        <div>
          <Button
            disabled={busy}
            onClick={() => open({ kind: 'restore', campaign: demo })}
          >
            Restore
          </Button>
          <Button
            disabled={busy}
            onClick={() => open({ kind: 'reset', campaign: demo })}
          >
            Reset fictional demo
          </Button>
        </div>
      ) : null}
      <section aria-labelledby="saved-campaigns-title">
        <h2 id="saved-campaigns-title">Saved campaigns</h2>
        {campaigns === null ? <p>{copy.loadingCampaign}</p> : null}
        <ul>
          {sorted
            .filter((campaign) => campaign.status === 'active')
            .map((campaign) => (
              <li
                key={campaign.id}
                className="flex flex-wrap items-center gap-2"
              >
                <Link
                  className="touchline-focus"
                  to={`/app/${campaign.id}/command-center`}
                >
                  {campaign.name}
                </Link>
                <Button
                  disabled={busy}
                  onClick={() => open({ kind: 'rename', campaign })}
                >
                  Rename
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => open({ kind: 'archive', campaign })}
                >
                  Archive
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => open({ kind: 'delete', campaign })}
                >
                  Delete
                </Button>
                {campaign.id === FEATURED_CAMPAIGN_ID ? (
                  <Button
                    disabled={busy}
                    onClick={() => open({ kind: 'reset', campaign })}
                  >
                    Reset fictional demo
                  </Button>
                ) : null}
              </li>
            ))}
        </ul>
      </section>
      {archived.length ? (
        <section aria-labelledby="archived-campaigns-title">
          <h2 id="archived-campaigns-title">Archived</h2>
          <ul>
            {archived.map((campaign) => (
              <li
                key={campaign.id}
                className="flex flex-wrap items-center gap-2"
              >
                <span>{campaign.name}</span>
                <Button
                  disabled={busy}
                  onClick={() => open({ kind: 'restore', campaign })}
                >
                  Restore
                </Button>
                {campaign.id === FEATURED_CAMPAIGN_ID ? (
                  <Button
                    disabled={busy}
                    onClick={() => open({ kind: 'reset', campaign })}
                  >
                    Reset fictional demo
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {panel ? (
        <section
          ref={dialog}
          role="dialog"
          aria-modal="false"
          aria-labelledby="campaign-dialog-title"
          className="space-y-3 border border-[var(--border)] bg-[var(--surface-1)] p-4"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !busy) setPanel(null)
          }}
        >
          <h2 id="campaign-dialog-title">
            {panel.kind === 'create'
              ? 'Create new campaign'
              : `${panel.kind === 'reset' ? 'Reset' : panel.kind[0].toUpperCase() + panel.kind.slice(1)} ${panel.campaign.name}`}
          </h2>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!confirmDisabled) submitPanel()
            }}
          >
            {panel.kind === 'create' || panel.kind === 'rename' ? (
              <div>
                <label htmlFor="campaign-name">Campaign name</label>
                <input
                  className="touchline-focus"
                  id="campaign-name"
                  value={name}
                  maxLength={120}
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
            ) : null}
            {panel.kind === 'create' ? (
              <>
                <div>
                  <label htmlFor="club-name">Club name</label>
                  <input
                    className="touchline-focus"
                    id="club-name"
                    value={clubName}
                    maxLength={120}
                    disabled={busy}
                    onChange={(event) => setClubName(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="short-name">Short name</label>
                  <input
                    className="touchline-focus"
                    id="short-name"
                    value={shortName}
                    maxLength={16}
                    disabled={busy}
                    onChange={(event) => setShortName(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="constitution-preset">Constitution</label>
                  <select
                    id="constitution-preset"
                    className="touchline-focus"
                    disabled={busy}
                    value={preset}
                    onChange={(event) =>
                      setPreset(event.target.value as ConstitutionPresetName)
                    }
                  >
                    <option value="balanced">Balanced</option>
                    <option value="strict">Strict Moneyball</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </>
            ) : null}
            {panel.kind === 'archive' ? <p>{copy.archiveHelp}</p> : null}
            {panel.kind === 'restore' ? (
              <p>Restore this campaign to Saved campaigns.</p>
            ) : null}
            {panel.kind === 'delete' || panel.kind === 'reset' ? (
              <>
                <p>
                  {panel.kind === 'delete' ? copy.deleteHelp : copy.resetHelp}
                </p>
                <label htmlFor="campaign-confirmation">
                  {panel.kind === 'delete'
                    ? 'Type the campaign name'
                    : 'Type the confirmation phrase'}
                </label>
                {panel.kind === 'reset' ? <p>{copy.resetPhrase}</p> : null}
                <input
                  className="touchline-focus"
                  id="campaign-confirmation"
                  value={confirmation}
                  disabled={busy}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </>
            ) : null}
            <Button type="submit" variant="primary" disabled={confirmDisabled}>
              {confirmLabel}
            </Button>
            <Button disabled={busy} onClick={() => setPanel(null)}>
              Cancel
            </Button>
          </form>
        </section>
      ) : null}
    </div>
  )
}
