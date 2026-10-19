import type { DateOnly } from '../models/dates'
import type { Constitution } from '../validation/schemas'
import type {
  PolicyAction,
  PolicySnapshot,
  RuleReport,
  RuleVerdict,
} from './types'

export function evaluateAction(
  action: PolicyAction,
  snapshot: PolicySnapshot,
  constitution: Constitution,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- The policy API reserves the date; these rules use the supplied age.
  _effectiveDate: DateOnly,
): RuleReport {
  const verdicts: RuleVerdict[] = []
  function block(
    ruleId: RuleVerdict['ruleId'],
    code: string,
    message: string,
    evidence: RuleVerdict['evidence'],
    remedy: string,
  ) {
    verdicts.push({
      ruleId,
      severity: 'BLOCK',
      code,
      message,
      evidence,
      remedy,
    })
  }

  const capacityRule = constitution.rules.find(
    (rule) => rule.id === 'SELL_TO_BUY',
  )
  const ageRule = constitution.rules.find(
    (rule) => rule.id === 'MAX_SIGNING_AGE',
  )
  const wageRule = constitution.rules.find(
    (rule) => rule.id === 'WAGE_TIER_CAP',
  )
  const prestigeRule = constitution.rules.find(
    (rule) => rule.id === 'PRESTIGE_BID_SALE',
  )

  if (action.type === 'incoming-transfer') {
    const isFree = action.isFree && action.feeCents === 0
    if (capacityRule?.enabled && !isFree) {
      const evidence = {
        feeCents: action.feeCents,
        remainingCapacityCents: snapshot.remainingCapacityCents,
      }
      if (snapshot.remainingCapacityCents === null) {
        block(
          'SELL_TO_BUY',
          'INSUFFICIENT_DATA',
          'Transfer capacity is unknown, so this fee cannot be checked.',
          evidence,
          'Save a constitution that posts an opening allocation.',
        )
      } else if (action.feeCents > snapshot.remainingCapacityCents) {
        block(
          'SELL_TO_BUY',
          'FEE_EXCEEDS_CAPACITY',
          'The fee is above the remaining transfer capacity.',
          evidence,
          'Record a completed sale, raise the allocation, or lower the fee.',
        )
      }
    }
    if (ageRule?.enabled) {
      const evidence = { age: action.age, maxAge: ageRule.maxAge }
      if (action.age === null) {
        block(
          'MAX_SIGNING_AGE',
          'INSUFFICIENT_DATA',
          'Age is unknown, so this signing cannot be checked.',
          evidence,
          'Enter a birth date or an estimated age on the player.',
        )
      } else if (
        action.age > ageRule.maxAge &&
        !(isFree && ageRule.freeTransfersExempt)
      ) {
        block(
          'MAX_SIGNING_AGE',
          'AGE_ABOVE_CAP',
          `Age ${action.age} is above the cap of ${ageRule.maxAge}.`,
          evidence,
          'Choose a younger player, use an exempt free transfer, or change the constitution.',
        )
      }
    }
  }

  if (
    wageRule?.enabled &&
    (action.type === 'incoming-transfer' || action.type === 'wage-change')
  ) {
    const caps = {
      key: wageRule.keyWeeklyCapCents,
      rotation: wageRule.rotationWeeklyCapCents,
      youth: wageRule.youthWeeklyCapCents,
    }
    const capCents =
      action.squadTier === null ? undefined : caps[action.squadTier]
    const evidence = {
      weeklyWageCents: action.weeklyWageCents,
      squadTier: action.squadTier,
      ...(capCents === undefined ? {} : { capCents }),
    }
    if (action.weeklyWageCents === null) {
      block(
        'WAGE_TIER_CAP',
        'INSUFFICIENT_DATA',
        'Weekly wage is unknown, so the tier cap cannot be checked.',
        evidence,
        'Enter a weekly wage.',
      )
    } else if (action.squadTier === null) {
      block(
        'WAGE_TIER_CAP',
        'INSUFFICIENT_DATA',
        'Squad tier is unknown, so the wage cap cannot be checked.',
        evidence,
        'Choose Key, Rotation, or Youth.',
      )
    } else if (capCents !== undefined && action.weeklyWageCents > capCents) {
      const tier = { key: 'Key', rotation: 'Rotation', youth: 'Youth' }[
        action.squadTier
      ]
      block(
        'WAGE_TIER_CAP',
        'WAGE_ABOVE_TIER_CAP',
        `The weekly wage is above the ${tier} cap.`,
        evidence,
        'Lower the wage, change the tier, or change the constitution.',
      )
    }
  }

  if (prestigeRule?.enabled && action.type === 'reject-offer') {
    const evidence = {
      feeCents: action.feeCents,
      marketValueCents: action.marketValueCents,
      bidderPrestige: action.bidderPrestige,
      sellerPrestige: action.sellerPrestige,
    }
    if (
      action.marketValueCents === null ||
      action.bidderPrestige === null ||
      action.sellerPrestige === null
    ) {
      verdicts.push({
        ruleId: 'PRESTIGE_BID_SALE',
        severity: 'WARN',
        code: 'UNKNOWN_VALUATION',
        message:
          'Valuation or prestige is unknown, so this bid needs a manual review.',
        evidence,
        remedy: 'Enter the market value and both prestige figures.',
      })
    } else if (
      BigInt(action.feeCents) * BigInt(prestigeRule.requiredFeeDenominator) >=
        BigInt(action.marketValueCents) *
          BigInt(prestigeRule.requiredFeeNumerator) &&
      (!prestigeRule.requireHigherPrestige ||
        action.bidderPrestige > action.sellerPrestige)
    ) {
      block(
        'PRESTIGE_BID_SALE',
        'QUALIFYING_OFFER',
        'This bid qualifies and cannot be rejected while the rule is on.',
        {
          ...evidence,
          requiredFeeNumerator: prestigeRule.requiredFeeNumerator,
          requiredFeeDenominator: prestigeRule.requiredFeeDenominator,
        },
        'Accept the bid, or change the constitution in an audited update.',
      )
    }
  }
  if (
    prestigeRule?.enabled &&
    action.type === 'season-rollover' &&
    action.unresolvedQualifyingOffers > 0
  ) {
    block(
      'PRESTIGE_BID_SALE',
      'UNRESOLVED_QUALIFYING_OFFER',
      'A qualifying offer is still unresolved.',
      { unresolvedQualifyingOffers: action.unresolvedQualifyingOffers },
      'Accept the qualifying offer, or change the constitution in an audited update.',
    )
  }

  return {
    allowed: !verdicts.some((verdict) => verdict.severity === 'BLOCK'),
    verdicts,
    snapshotRevision: snapshot.revision,
  }
}
