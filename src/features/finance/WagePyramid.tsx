import { StatusPill } from '../../components/ui/StatusPill'
import {
  formatWageCommitment,
  wageCommitment,
  type WageTier,
} from '../../domain/finance/wages'
import { formatMoneyEuros } from '../../domain/models/money'
import type { Constitution, Contract } from '../../domain/validation/schemas'

export function WagePyramid({
  contracts,
  clubId,
  constitution,
}: {
  contracts: readonly Contract[]
  clubId: string
  constitution?: Constitution
}) {
  const active = contracts.filter(
    (contract) => contract.status === 'active' && contract.clubId === clubId,
  )
  const commitment = wageCommitment(active, clubId)
  const rule = constitution?.rules.find((item) => item.id === 'WAGE_TIER_CAP')
  const caps = rule?.enabled
    ? {
        key: rule.keyWeeklyCapCents,
        rotation: rule.rotationWeeklyCapCents,
        youth: rule.youthWeeklyCapCents,
      }
    : undefined
  const tiers: [WageTier, string][] = [
    ['key', 'Key'],
    ['rotation', 'Rotation'],
    ['youth', 'Youth'],
    ['unknown', 'Unknown tier'],
  ]
  return (
    <section className="space-y-2">
      <table className="w-full text-left">
        <caption className="text-left">Wage pyramid</caption>
        <thead>
          <tr>
            <th>Tier</th>
            <th>Players</th>
            <th>Weekly wages</th>
            <th>Cap</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {tiers.map(([tier, label]) => {
            const cap = tier === 'unknown' ? undefined : caps?.[tier]
            const blocked =
              rule?.enabled &&
              active.some(
                (contract) =>
                  (contract.squadTier ?? 'unknown') === tier &&
                  (contract.weeklyWageCents === null ||
                    (cap !== undefined && contract.weeklyWageCents > cap)),
              )
            return (
              <tr key={tier}>
                <th scope="row">{label}</th>
                <td>{commitment.byTier[tier].count}</td>
                <td>{formatWageCommitment(commitment.byTier[tier])}</td>
                <td>
                  {cap === undefined
                    ? 'Cap not set'
                    : `Cap ${formatMoneyEuros(cap)}`}
                </td>
                <td>{blocked && <StatusPill tone="blocked" />}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {active.length === 0 && <p>No active contracts are recorded.</p>}
    </section>
  )
}
