import type { DateOnly } from '../models/dates'
import { formatMoneyEuros, moneyCentsSchema } from '../models/money'
import { evaluateAction } from '../rules/evaluate-action'
import type { PolicyAction, PolicySnapshot, RuleReport } from '../rules/types'
import type { Constitution } from '../validation/schemas'
import { formatCapacity } from './capacity'
import { formatWageCommitment } from './wages'

export type PreviewResult = {
  report: RuleReport
  beforeCapacity: string
  afterCapacity: string
  beforeWages: string
  afterWages: string
}

export function previewAction(input: {
  action: PolicyAction
  snapshot: PolicySnapshot
  constitution: Constitution
  effectiveDate: DateOnly
  wages: { knownCents: number; unknownCount: number }
}): PreviewResult {
  const { action, snapshot, constitution, effectiveDate, wages } = input
  const beforeCapacity = formatCapacity(snapshot.remainingCapacityCents)
  const beforeWages = formatWageCommitment(wages)
  let afterCapacity = beforeCapacity
  let afterWages = beforeWages
  if (
    action.type === 'incoming-transfer' &&
    !(action.isFree && action.feeCents === 0)
  ) {
    const remaining = snapshot.remainingCapacityCents
    afterCapacity =
      remaining === null
        ? 'Unknown'
        : action.feeCents > remaining
          ? `Short by ${formatMoneyEuros(moneyCentsSchema.parse(action.feeCents - remaining))}`
          : formatCapacity(remaining - action.feeCents)
  }
  if (action.type === 'incoming-transfer' || action.type === 'wage-change') {
    afterWages =
      action.weeklyWageCents === null
        ? 'Unknown'
        : formatWageCommitment({
            knownCents: wages.knownCents + action.weeklyWageCents,
            unknownCount: wages.unknownCount,
          })
  }
  return {
    report: evaluateAction(action, snapshot, constitution, effectiveDate),
    beforeCapacity,
    afterCapacity,
    beforeWages,
    afterWages,
  }
}
