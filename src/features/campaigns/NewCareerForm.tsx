import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { careerProgress, careerRefreshFailed, saveFailed } from '../../app/copy'
import { useDatabase } from '../../app/providers/database'
import { Button } from '../../components/ui/Button'
import { systemClock } from '../../data/clock'
import { createEntityId } from '../../data/ids'
import { resetStandaloneDemo } from '../../data/commands/reset-standalone-demo'
import { startStandaloneCampaign } from '../../data/commands/start-standalone-campaign'
import { getCampaign } from '../../data/repositories/campaigns'
import {
  PLAYABLE_GENERATOR_VERSION,
  generatePlayableWorld,
} from '../../domain/seed/generate-playable-world'
import {
  DEFAULT_START_YEAR,
  resetPlayablePhrase,
  standaloneDemoCareer,
  STANDALONE_DEMO_ID,
} from '../../domain/simulation/career'
import type { Campaign } from '../../domain/validation/schemas'

type ClubOption = { key: string; label: string }

const fieldClass =
  'touchline-focus rounded border border-[var(--border)] bg-[var(--surface-1)] px-2 py-1'

export function NewCareerForm({
  onStarted,
}: {
  onStarted: () => Promise<void>
}) {
  const database = useDatabase()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [seed, setSeed] = useState('')
  const [year, setYear] = useState(String(DEFAULT_START_YEAR))
  const [rulesMode, setRulesMode] = useState<'challenge' | 'sandbox'>(
    'challenge',
  )
  const [preset, setPreset] = useState<'balanced' | 'strict'>('balanced')
  const [clubs, setClubs] = useState<ClubOption[]>([])
  const [clubKey, setClubKey] = useState('')
  const [demo, setDemo] = useState<Campaign | null>(null)
  const [phrase, setPhrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [savedCampaignId, setSavedCampaignId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getCampaign(database, STANDALONE_DEMO_ID)
      .then((campaign) => {
        if (active) setDemo(campaign ?? null)
      })
      .catch(() => {
        if (active) setError(saveFailed)
      })
    return () => {
      active = false
    }
  }, [database])

  async function listClubs() {
    setBusy(true)
    setError('')
    setStatus(careerProgress('generate'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    try {
      const result = generatePlayableWorld({
        seed: seed.trim(),
        generatorVersion: PLAYABLE_GENERATOR_VERSION,
        campaignId: 'club-preview',
        startYear: Number(year),
      })
      if (!result.ok) {
        setClubs([])
        setClubKey('')
        setError(result.message)
        setStatus('')
        return
      }
      const options = result.value.clubs
        .map((club) => {
          const state = result.value.clubSimulationStates.find(
            (item) => item.clubId === club.id,
          )
          const league = result.value.leagues.find(
            (item) => item.id === club.leagueId,
          )
          return state
            ? {
                key: state.simulationKey,
                label: `${league?.name ?? 'League'} — ${club.name}`,
              }
            : null
        })
        .filter((option): option is ClubOption => option !== null)
        .sort((left, right) => left.label.localeCompare(right.label, 'en'))
      setClubs(options)
      setClubKey('')
      setStatus(`${options.length} clubs are ready to choose.`)
    } catch {
      setError('The world could not be built. Try again.')
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  async function openSavedCareer(campaignId: string) {
    setSavedCampaignId(campaignId)
    setBusy(true)
    setError('')
    setStatus(careerProgress('ready'))
    try {
      await onStarted()
    } catch {
      setError(careerRefreshFailed)
      return
    } finally {
      setBusy(false)
    }
    navigate(`/app/${campaignId}/command-center`)
  }

  async function startCareer() {
    if (busy || savedCampaignId) return
    if (!clubKey) {
      setError('Choose a club from this world.')
      return
    }
    setBusy(true)
    setError('')
    setStatus(careerProgress('generate'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    try {
      const result = await startStandaloneCampaign(
        database,
        {
          campaignId: createEntityId(),
          name: name.trim(),
          seed: seed.trim(),
          startYear: Number(year),
          clubKey,
          rulesMode,
          preset,
          now: systemClock(),
          seasonId: createEntityId(),
          clockId: createEntityId(),
          constitutionId: createEntityId(),
          allocationId: createEntityId(),
          receiptId: createEntityId(),
          auditEventId: createEntityId(),
          actionId: createEntityId(),
        },
        (progress) => setStatus(careerProgress(progress.stage)),
      )
      if (!result.ok) {
        setError(result.message)
        setStatus('')
        return
      }
      await openSavedCareer(result.value.id)
    } catch {
      setError(saveFailed)
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  async function openDemo() {
    if (busy || savedCampaignId) return
    setBusy(true)
    setError('')
    setStatus(careerProgress('generate'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    try {
      const result = await startStandaloneCampaign(
        database,
        { ...standaloneDemoCareer, now: systemClock() },
        (progress) => setStatus(careerProgress(progress.stage)),
      )
      if (!result.ok) {
        setError(result.message)
        setStatus('')
        return
      }
      setDemo(result.value)
      await openSavedCareer(result.value.id)
    } catch {
      setError(saveFailed)
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  async function resetDemo() {
    if (busy || savedCampaignId || !demo || phrase !== resetPlayablePhrase)
      return
    setBusy(true)
    setError('')
    setStatus(careerProgress('generate'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    try {
      const result = await resetStandaloneDemo(
        database,
        {
          campaignId: demo.id,
          expectedRevision: demo.revision,
          now: systemClock(),
          auditEventId: createEntityId(),
          actionId: createEntityId(),
        },
        (progress) => setStatus(careerProgress(progress.stage)),
      )
      if (!result.ok) {
        setError(result.message)
        setStatus('')
        return
      }
      setDemo(result.value)
      setPhrase('')
      await openSavedCareer(result.value.id)
    } catch {
      setError(saveFailed)
      setStatus('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="new-career-title" className="space-y-3">
      <h2 id="new-career-title">New standalone career</h2>
      <p>Match simulation and negotiation are not available yet.</p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          void startCareer()
        }}
      >
        <div>
          <label htmlFor="career-name">Career name</label>
          <input
            className={fieldClass}
            id="career-name"
            value={name}
            maxLength={120}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="career-seed">Seed</label>
          <input
            className={fieldClass}
            id="career-seed"
            value={seed}
            maxLength={120}
            disabled={busy}
            onChange={(event) => {
              setSeed(event.target.value)
              setClubs([])
              setClubKey('')
            }}
          />
        </div>
        <div>
          <label htmlFor="start-year">Start year</label>
          <input
            className={fieldClass}
            id="start-year"
            type="number"
            min={1900}
            max={2198}
            value={year}
            disabled={busy}
            onChange={(event) => setYear(event.target.value)}
          />
        </div>
        <fieldset className="space-y-1">
          <legend>Board mode</legend>
          <label>
            <input
              type="radio"
              name="rules-mode"
              checked={rulesMode === 'challenge'}
              disabled={busy}
              onChange={() => setRulesMode('challenge')}
            />{' '}
            Challenge
          </label>
          <label>
            <input
              type="radio"
              name="rules-mode"
              checked={rulesMode === 'sandbox'}
              disabled={busy}
              onChange={() => setRulesMode('sandbox')}
            />{' '}
            Sandbox
          </label>
        </fieldset>
        <div>
          <label htmlFor="board-preset">Board preset</label>
          <select
            id="board-preset"
            className={fieldClass}
            value={preset}
            disabled={busy}
            onChange={(event) =>
              setPreset(event.target.value as 'balanced' | 'strict')
            }
          >
            <option value="balanced">Balanced</option>
            <option value="strict">Strict</option>
          </select>
        </div>
        <Button
          disabled={busy || !!savedCampaignId || !seed.trim()}
          onClick={() => void listClubs()}
        >
          List clubs
        </Button>
        <div>
          <label htmlFor="career-club">Club</label>
          <select
            id="career-club"
            className={fieldClass}
            value={clubKey}
            disabled={busy || clubs.length === 0}
            onChange={(event) => setClubKey(event.target.value)}
          >
            <option value="">Choose a club</option>
            {clubs.map((club) => (
              <option key={club.key} value={club.key}>
                {club.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={
            busy ||
            !!savedCampaignId ||
            !name.trim() ||
            !seed.trim() ||
            !clubKey
          }
        >
          Start career
        </Button>
      </form>
      <Button
        disabled={busy || !!savedCampaignId}
        onClick={() => void openDemo()}
      >
        Open playable demo
      </Button>
      {demo ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            void resetDemo()
          }}
        >
          <p>Reset replaces the playable demo. Other saves stay.</p>
          <label htmlFor="reset-playable">Type {resetPlayablePhrase}</label>
          <input
            className={fieldClass}
            id="reset-playable"
            value={phrase}
            disabled={busy}
            onChange={(event) => setPhrase(event.target.value)}
          />
          <Button
            type="submit"
            disabled={
              busy || !!savedCampaignId || phrase !== resetPlayablePhrase
            }
          >
            Reset playable demo
          </Button>
        </form>
      ) : null}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {savedCampaignId ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={busy}
            onClick={() => void openSavedCareer(savedCampaignId)}
          >
            Retry refresh
          </Button>
          <Link
            className="touchline-focus"
            to={`/app/${savedCampaignId}/command-center`}
          >
            Open saved career
          </Link>
        </div>
      ) : null}
    </section>
  )
}
