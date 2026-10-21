import { useState } from 'react'
import type { ScreenModel } from '../../platform/generated/ScreenModel'
import { PitchSvg } from '../../components/graphics/PitchSvg'
import { formationSlots, pitchLinePaths } from '../../domain/graphics/pitch'

export function NativeTactics({ model }: { model: ScreenModel }) {
  const [selected, setSelected] = useState('')
  const lineup =
    model.rows.lineups.find((l) => l.id === selected) ?? model.rows.lineups[0]
  if (!lineup)
    return <p>No saved lineup. Lineup editing is not available yet.</p>
  return (
    <section className="space-y-3" aria-label="Saved tactics">
      <label>
        Saved lineup{' '}
        <select value={lineup.id} onChange={(e) => setSelected(e.target.value)}>
          {model.rows.lineups.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <p>{lineup.formation}</p>
      <div className="relative max-w-[34rem]">
        <PitchSvg paths={pitchLinePaths()} />
        {formationSlots(lineup.formation).map((slot) => {
          const starter = lineup.starters.find(
            (s) => s.slot.toLowerCase() === slot.id,
          )
          return (
            <div
              key={slot.id}
              className="absolute max-w-[8rem] -translate-x-1/2 -translate-y-1/2 rounded border border-[var(--border)] bg-[var(--surface-2)] p-1 text-center text-xs"
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            >
              <strong>{slot.label}</strong>
              <p>
                {starter
                  ? (model.labels[starter.playerId] ?? 'Unknown player')
                  : 'Empty'}
              </p>
              {starter?.role && <p>{starter.role}</p>}
            </div>
          )
        })}
      </div>
      <h3>Bench</h3>
      <ul>
        {lineup.benchPlayerIds.map((id) => (
          <li key={id}>{model.labels[id] ?? 'Unknown player'}</li>
        ))}
      </ul>
    </section>
  )
}
