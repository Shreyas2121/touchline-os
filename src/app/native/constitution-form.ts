import type { ConstitutionRule } from '../../platform/generated/ConstitutionRule'
import {
  formInteger,
  formNullableInteger,
  formCompetition,
  unreachableRule,
  type RuleField,
} from '../../components/forms/rule-inputs'

export function serializeRule(
  rule: ConstitutionRule,
  data: FormData,
): ConstitutionRule {
  const name = (key: string) => `${rule.id}.${key}`
  const enabled = data.has(name('enabled'))
  switch (rule.id) {
    case 'SELL_TO_BUY':
      return {
        id: rule.id,
        enabled,
        salesReinvestmentPct: formInteger(
          data,
          name('salesReinvestmentPct'),
          0,
          100,
        ),
        prizeReinvestmentPct: formInteger(
          data,
          name('prizeReinvestmentPct'),
          0,
          100,
        ),
        carryoverPct: formInteger(data, name('carryoverPct'), 0, 100),
        initialAllocationCents: formInteger(
          data,
          name('initialAllocationCents'),
        ),
      }
    case 'MAX_SIGNING_AGE':
      return {
        id: rule.id,
        enabled,
        maxAge: formInteger(data, name('maxAge'), 15, 50),
        freeTransfersExempt: data.has(name('freeTransfersExempt')),
      }
    case 'WAGE_TIER_CAP':
      return {
        id: rule.id,
        enabled,
        keyWeeklyCapCents: formInteger(data, name('keyWeeklyCapCents')),
        rotationWeeklyCapCents: formInteger(
          data,
          name('rotationWeeklyCapCents'),
        ),
        youthWeeklyCapCents: formInteger(data, name('youthWeeklyCapCents')),
      }
    case 'PRESTIGE_BID_SALE':
      return {
        id: rule.id,
        enabled,
        requiredFeeNumerator: formInteger(
          data,
          name('requiredFeeNumerator'),
          1,
        ),
        requiredFeeDenominator: formInteger(
          data,
          name('requiredFeeDenominator'),
          1,
        ),
        requireHigherPrestige: data.has(name('requireHigherPrestige')),
      }
    case 'REGISTRATION_QUOTA':
      return {
        id: rule.id,
        enabled,
        rosterLimit: formInteger(data, name('rosterLimit'), 1),
        minimumHomegrown: formInteger(data, name('minimumHomegrown'), 0),
        ageExemptionUnder: formNullableInteger(data, name('ageExemptionUnder')),
        competitionKey: formCompetition(data, name('competitionKey')),
      }
    default:
      return unreachableRule(rule)
  }
}

export function ruleFields(rule: ConstitutionRule): RuleField[] {
  switch (rule.id) {
    case 'SELL_TO_BUY':
      return [
        {
          key: 'enabled',
          label: 'enabled',
          kind: 'checkbox',
          value: rule.enabled,
        },
        {
          key: 'salesReinvestmentPct',
          label: 'sales Reinvestment Pct',
          kind: 'integer',
          value: rule.salesReinvestmentPct,
        },
        {
          key: 'prizeReinvestmentPct',
          label: 'prize Reinvestment Pct',
          kind: 'integer',
          value: rule.prizeReinvestmentPct,
        },
        {
          key: 'carryoverPct',
          label: 'carryover Pct',
          kind: 'integer',
          value: rule.carryoverPct,
        },
        {
          key: 'initialAllocationCents',
          label: 'initial Allocation Cents',
          kind: 'integer',
          value: rule.initialAllocationCents,
        },
      ]
    case 'MAX_SIGNING_AGE':
      return [
        {
          key: 'enabled',
          label: 'enabled',
          kind: 'checkbox',
          value: rule.enabled,
        },
        {
          key: 'maxAge',
          label: 'max Age',
          kind: 'integer',
          value: rule.maxAge,
        },
        {
          key: 'freeTransfersExempt',
          label: 'free Transfers Exempt',
          kind: 'checkbox',
          value: rule.freeTransfersExempt,
        },
      ]
    case 'WAGE_TIER_CAP':
      return [
        {
          key: 'enabled',
          label: 'enabled',
          kind: 'checkbox',
          value: rule.enabled,
        },
        {
          key: 'keyWeeklyCapCents',
          label: 'key Weekly Cap Cents',
          kind: 'integer',
          value: rule.keyWeeklyCapCents,
        },
        {
          key: 'rotationWeeklyCapCents',
          label: 'rotation Weekly Cap Cents',
          kind: 'integer',
          value: rule.rotationWeeklyCapCents,
        },
        {
          key: 'youthWeeklyCapCents',
          label: 'youth Weekly Cap Cents',
          kind: 'integer',
          value: rule.youthWeeklyCapCents,
        },
      ]
    case 'PRESTIGE_BID_SALE':
      return [
        {
          key: 'enabled',
          label: 'enabled',
          kind: 'checkbox',
          value: rule.enabled,
        },
        {
          key: 'requiredFeeNumerator',
          label: 'required Fee Numerator',
          kind: 'integer',
          value: rule.requiredFeeNumerator,
        },
        {
          key: 'requiredFeeDenominator',
          label: 'required Fee Denominator',
          kind: 'integer',
          value: rule.requiredFeeDenominator,
        },
        {
          key: 'requireHigherPrestige',
          label: 'require Higher Prestige',
          kind: 'checkbox',
          value: rule.requireHigherPrestige,
        },
      ]
    case 'REGISTRATION_QUOTA':
      return [
        {
          key: 'enabled',
          label: 'enabled',
          kind: 'checkbox',
          value: rule.enabled,
        },
        {
          key: 'rosterLimit',
          label: 'roster Limit',
          kind: 'integer',
          value: rule.rosterLimit,
        },
        {
          key: 'minimumHomegrown',
          label: 'minimum Homegrown',
          kind: 'integer',
          value: rule.minimumHomegrown,
        },
        {
          key: 'ageExemptionUnder',
          label: 'age Exemption Under',
          kind: 'nullable',
          value: rule.ageExemptionUnder,
        },
        {
          key: 'competitionKey',
          label: 'competition Key',
          kind: 'text',
          value: rule.competitionKey,
        },
      ]
    default:
      return unreachableRule(rule)
  }
}
