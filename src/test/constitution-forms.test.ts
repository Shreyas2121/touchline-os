import { describe, expect, it } from 'vitest'
import { constitutionPreset } from '../domain/rules/presets'
import { moneyCentsSchema } from '../domain/models/money'
import type { ConstitutionRule } from '../domain/validation/schemas'
import {
  serializeRule as nativeRule,
  ruleFields as nativeFields,
} from '../app/native/constitution-form'
import {
  serializeRule as browserRule,
  ruleFields as browserFields,
} from '../features/constitution/constitution-form'

for (const adapter of [
  {
    name: 'native',
    separator: '.',
    serialize: nativeRule,
    fields: nativeFields,
  },
  {
    name: 'browser',
    separator: '-',
    serialize: browserRule,
    fields: browserFields,
  },
]) {
  function form(rule: ConstitutionRule) {
    const data = new FormData()
    for (const [key, value] of Object.entries(rule)) {
      if (key === 'id' || value === false || value === null) continue
      data.set(
        `${rule.id}${adapter.separator}${key}`,
        adapter.name === 'browser' &&
          key.endsWith('Cents') &&
          typeof value === 'number'
          ? (value / 100).toFixed(2)
          : String(value),
      )
    }
    return data
  }
  describe(`${adapter.name} constitution form`, () => {
    for (const preset of ['balanced', 'strict', 'custom'] as const) {
      for (const rule of constitutionPreset(preset)) {
        it(`round-trips ${preset} ${rule.id} without losing fields`, () => {
          expect(adapter.serialize(rule, form(rule))).toEqual(rule)
          const fields = adapter.fields(rule)
          const expected = Object.entries(rule).filter(
            ([key]) =>
              key !== 'id' && (adapter.name === 'native' || key !== 'enabled'),
          )
          expect(
            Object.fromEntries(fields.map((field) => [field.key, field.value])),
          ).toEqual(Object.fromEntries(expected))
        })
      }
    }

    it('preserves a blank nullable age as null and a supplied age as an integer', () => {
      const rule = constitutionPreset('balanced').find(
        (rule) => rule.id === 'REGISTRATION_QUOTA',
      )!
      const data = form(rule)
      const name = `REGISTRATION_QUOTA${adapter.separator}ageExemptionUnder`
      data.set(name, '   ')
      expect(adapter.serialize(rule, data)).toMatchObject({
        ageExemptionUnder: null,
      })
      data.set(name, '21')
      expect(adapter.serialize(rule, data)).toMatchObject({
        ageExemptionUnder: 21,
      })
      for (const value of [
        '0',
        '-1',
        '1.5',
        'NaN',
        'Infinity',
        '9007199254740992',
      ]) {
        data.set(name, value)
        expect(() => adapter.serialize(rule, data), value).toThrow()
      }
    })

    it('round-trips saved nulls and zero money without using runtime value types', () => {
      for (const rule of constitutionPreset('custom')) {
        const changed =
          rule.id === 'REGISTRATION_QUOTA'
            ? { ...rule, ageExemptionUnder: null }
            : rule.id === 'SELL_TO_BUY'
              ? { ...rule, initialAllocationCents: moneyCentsSchema.parse(0) }
              : rule
        expect(adapter.serialize(changed, form(changed))).toEqual(changed)
      }
    })

    it('rejects missing, fractional, non-finite and unsafe required numbers', () => {
      for (const rule of constitutionPreset('balanced')) {
        for (const field of adapter
          .fields(rule)
          .filter(
            (field) => field.kind === 'integer' || field.kind === 'money',
          )) {
          for (const value of [
            '',
            ' ',
            '-1',
            'NaN',
            'Infinity',
            '9007199254740992',
            ...(field.kind === 'integer' ? ['1.5'] : ['1.234']),
          ]) {
            const data = form(rule)
            data.set(`${rule.id}${adapter.separator}${field.key}`, value)
            expect(
              () => adapter.serialize(rule, data),
              `${field.key}=${value}`,
            ).toThrow()
          }
        }
      }
    })

    it('distinguishes valid zero values from blank required fields and preserves checkboxes', () => {
      const rule = constitutionPreset('balanced')[0]!
      const data = form(rule)
      for (const field of [
        'salesReinvestmentPct',
        'prizeReinvestmentPct',
        'carryoverPct',
        'initialAllocationCents',
      ])
        data.set(`${rule.id}${adapter.separator}${field}`, '0')
      data.delete(`${rule.id}${adapter.separator}enabled`)
      expect(adapter.serialize(rule, data)).toEqual({
        id: 'SELL_TO_BUY',
        enabled: false,
        salesReinvestmentPct: 0,
        prizeReinvestmentPct: 0,
        carryoverPct: 0,
        initialAllocationCents: 0,
      })
    })
  })
}
