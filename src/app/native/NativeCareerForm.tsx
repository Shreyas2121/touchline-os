import { useState } from 'react'
import { useNavigate } from 'react-router'
import type { GameClient } from '../../platform/game-client'
import type { CreationRequest } from '../../platform/generated/CreationRequest'
import type { CreationKind } from '../../platform/generated/CreationKind'
import type { ClubChoices } from '../../platform/generated/ClubChoices'
import { mapInvokeError } from '../../platform/errors'
import { Button } from '../../components/ui/Button'
import { CrestSvg } from '../../components/graphics/CrestSvg'

import { makeCareerRequest } from './management-forms'

export function NativeCareerForm({ client }: { client: GameClient }) {
  const navigate = useNavigate()
  const [request, setRequest] = useState(() => makeCareerRequest('career'))
  const [choices, setChoices] = useState<ClubChoices | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  function change(values: Partial<CreationRequest['career']>) {
    setChoices(null)
    setRequest((r) => ({ ...r, career: { ...r.career, ...values } }))
  }
  async function run(create: boolean) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (create) {
        const result = await client.createCareer(request)
        navigate(`/app/${result.campaignId}/command-center`)
        setOpen(false)
      } else setChoices(await client.previewCreation(request))
    } catch (error) {
      setError(mapInvokeError(error).message)
    } finally {
      setBusy(false)
    }
  }
  const club = choices?.clubs.find((c) =>
    c.id.endsWith(`-club-${request.career.clubKey.slice(5)}`),
  )
  return (
    <section className="space-y-3">
      <Button onClick={() => setOpen((v) => !v)}>Create career</Button>
      {open && (
        <form
          className="space-y-3 rounded-lg border border-[var(--border)] p-4"
          onSubmit={(e) => {
            e.preventDefault()
            void run(Boolean(choices))
          }}
        >
          <h2>New campaign</h2>
          {request.kind === 'legacy' && (
            <fieldset disabled={busy} className="space-y-3">
              <legend>Legacy club customization</legend>
              <label>
                <input
                  type="checkbox"
                  checked={request.club !== null}
                  onChange={(e) => {
                    setChoices(null)
                    setRequest((r) => ({
                      ...r,
                      club: e.target.checked
                        ? {
                            name: 'My club',
                            shortName: 'MYC',
                            colors: {
                              primary: '#245342',
                              secondary: '#e9e3cb',
                            },
                            prestige: 50,
                            academyTier: 3,
                            scoutingRegion: null,
                          }
                        : null,
                    }))
                  }}
                />
                Customize the selected club
              </label>
              {request.club && (
                <div className="flex flex-wrap gap-3">
                  {(['name', 'shortName'] as const).map((field) => (
                    <label key={field}>
                      {field === 'name' ? 'Club name' : 'Club short name'}{' '}
                      <input
                        required
                        maxLength={field === 'name' ? 120 : 8}
                        value={request.club![field]}
                        onChange={(e) => {
                          setChoices(null)
                          setRequest((r) => ({
                            ...r,
                            club: { ...r.club!, [field]: e.target.value },
                          }))
                        }}
                      />
                    </label>
                  ))}
                  {(['primary', 'secondary'] as const).map((field) => (
                    <label key={field}>
                      {field} color{' '}
                      <input
                        type="color"
                        value={request.club!.colors[field]}
                        onChange={(e) => {
                          setChoices(null)
                          setRequest((r) => ({
                            ...r,
                            club: {
                              ...r.club!,
                              colors: {
                                ...r.club!.colors,
                                [field]: e.target.value,
                              },
                            },
                          }))
                        }}
                      />
                    </label>
                  ))}
                  {(['prestige', 'academyTier'] as const).map((field) => (
                    <label key={field}>
                      {field}{' '}
                      <input
                        type="number"
                        min={0}
                        max={field === 'prestige' ? 100 : 5}
                        required
                        value={request.club![field]}
                        onChange={(e) => {
                          setChoices(null)
                          setRequest((r) => ({
                            ...r,
                            club: {
                              ...r.club!,
                              [field]: Number(e.target.value),
                            },
                          }))
                        }}
                      />
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
          )}
          <fieldset disabled={busy} className="flex flex-wrap gap-4">
            <label>
              Campaign type{' '}
              <select
                value={request.kind}
                onChange={(e) => {
                  setRequest(makeCareerRequest(e.target.value as CreationKind))
                  setChoices(null)
                }}
              >
                <option value="career">Standalone career</option>
                <option value="legacy">Legacy campaign</option>
                <option value="standalone-demo">Standalone demo</option>
                <option value="legacy-demo">Legacy demo</option>
              </select>
            </label>
            <label>
              Career name{' '}
              <input
                required
                maxLength={120}
                value={request.career.name}
                onChange={(e) => change({ name: e.target.value })}
              />
            </label>
            <label>
              World seed{' '}
              <input
                required
                maxLength={120}
                disabled={request.kind.endsWith('demo')}
                value={request.career.seed}
                onChange={(e) => change({ seed: e.target.value })}
              />
            </label>
            <label>
              Start year{' '}
              <input
                type="number"
                required
                min={1900}
                max={2198}
                value={request.career.startYear}
                onChange={(e) => change({ startYear: Number(e.target.value) })}
              />
            </label>
            <label>
              Rules mode{' '}
              <select
                disabled={request.kind.startsWith('legacy')}
                value={request.career.rulesMode}
                onChange={(e) =>
                  change({
                    rulesMode: e.target.value as 'challenge' | 'sandbox',
                  })
                }
              >
                <option value="challenge">Challenge</option>
                <option value="sandbox">Sandbox</option>
              </select>
            </label>
            <label>
              Board preset{' '}
              <select
                value={request.career.preset}
                onChange={(e) =>
                  change({
                    preset: e.target.value as 'balanced' | 'strict' | 'custom',
                  })
                }
              >
                <option value="balanced">Balanced</option>
                <option value="strict">Strict</option>
                {request.kind === 'legacy' && (
                  <option value="custom">Custom (rules disabled)</option>
                )}
              </select>
            </label>
            {choices && (
              <label>
                Managed club{' '}
                <select
                  value={request.career.clubKey}
                  onChange={(e) =>
                    setRequest((r) => ({
                      ...r,
                      career: { ...r.career, clubKey: e.target.value },
                    }))
                  }
                >
                  {choices.clubs.map((club, i) => (
                    <option
                      key={club.id}
                      value={`club:${String(i + 1).padStart(2, '0')}`}
                    >
                      {club.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </fieldset>
          {club && (
            <div className="flex items-center gap-3">
              <CrestSvg
                mark="shield"
                primary={club.colors.primary}
                secondary={club.colors.secondary}
                monogram={club.shortName}
                title={`${club.name} crest`}
              />
              <p>
                {club.name} · prestige {club.prestige}
              </p>
            </div>
          )}
          <p>
            Preview the seeded clubs, choose your club and confirm creation.
            Standalone careers begin on July 1; Continue is unavailable.
          </p>
          <Button type="submit" disabled={busy}>
            {busy
              ? 'Preparing world…'
              : choices
                ? 'Start campaign'
                : 'Preview clubs'}
          </Button>
          <Button disabled={busy} onClick={() => setOpen(false)}>
            Cancel creation
          </Button>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </section>
  )
}
