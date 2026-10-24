import type { ConstitutionRule } from '../../domain/validation/schemas'
import {
  formText,
  formInteger,
  formNullableInteger,
  formCompetition,
  unreachableRule,
  type RuleField,
} from '../../components/forms/rule-inputs'
import { parseMoneyCents, invalidMoneyMessage } from '../../domain/models/money'

function money(data: FormData, name: string) {
  const parsed = parseMoneyCents(formText(data, name))
  if (!parsed.ok) throw new Error(invalidMoneyMessage)
  return parsed.value
}

export function serializeRule(
  rule: ConstitutionRule,
  data: FormData,
): ConstitutionRule {
  const name = (key: string) => `${rule.id}-${key}`
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
        initialAllocationCents: money(data, name('initialAllocationCents')),
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
        keyWeeklyCapCents: money(data, name('keyWeeklyCapCents')),
        rotationWeeklyCapCents: money(data, name('rotationWeeklyCapCents')),
        youthWeeklyCapCents: money(data, name('youthWeeklyCapCents')),
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
          key: 'salesReinvestmentPct',
          label: 'Sales percent',
          kind: 'integer',
          value: rule.salesReinvestmentPct,
        },
        {
          key: 'prizeReinvestmentPct',
          label: 'Prize percent',
          kind: 'integer',
          value: rule.prizeReinvestmentPct,
        },
        {
          key: 'carryoverPct',
          label: 'Carryover percent',
          kind: 'integer',
          value: rule.carryoverPct,
        },
        {
          key: 'initialAllocationCents',
          label: 'Opening allocation',
          kind: 'money',
          value: rule.initialAllocationCents,
        },
      ]
    case 'MAX_SIGNING_AGE':
      return [
        {
          key: 'maxAge',
          label: 'Age cap',
          kind: 'integer',
          value: rule.maxAge,
        },
        {
          key: 'freeTransfersExempt',
          label: 'Free transfers are exempt',
          kind: 'checkbox',
          value: rule.freeTransfersExempt,
        },
      ]
    case 'WAGE_TIER_CAP':
      return [
        {
          key: 'keyWeeklyCapCents',
          label: 'Key cap',
          kind: 'money',
          value: rule.keyWeeklyCapCents,
        },
        {
          key: 'rotationWeeklyCapCents',
          label: 'Rotation cap',
          kind: 'money',
          value: rule.rotationWeeklyCapCents,
        },
        {
          key: 'youthWeeklyCapCents',
          label: 'Youth cap',
          kind: 'money',
          value: rule.youthWeeklyCapCents,
        },
      ]
    case 'PRESTIGE_BID_SALE':
      return [
        {
          key: 'requiredFeeNumerator',
          label: 'Required fee numerator',
          kind: 'integer',
          value: rule.requiredFeeNumerator,
        },
        {
          key: 'requiredFeeDenominator',
          label: 'Required fee denominator',
          kind: 'integer',
          value: rule.requiredFeeDenominator,
        },
        {
          key: 'requireHigherPrestige',
          label: 'Require higher prestige',
          kind: 'checkbox',
          value: rule.requireHigherPrestige,
        },
      ]
    case 'REGISTRATION_QUOTA':
      return [
        {
          key: 'rosterLimit',
          label: 'Roster limit',
          kind: 'integer',
          value: rule.rosterLimit,
        },
        {
          key: 'minimumHomegrown',
          label: 'Minimum homegrown',
          kind: 'integer',
          value: rule.minimumHomegrown,
        },
        {
          key: 'ageExemptionUnder',
          label: 'Age exemption',
          kind: 'nullable',
          value: rule.ageExemptionUnder,
        },
        {
          key: 'competitionKey',
          label: 'Competition',
          kind: 'text',
          value: rule.competitionKey,
        },
      ]
    default:
      return unreachableRule(rule)
  }
}
