import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseProvider } from '../app/providers/database'
import { createCampaign } from '../data/commands/create-campaign'
import { saveConstitution } from '../data/commands/save-constitution'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { constitutionPreset } from '../domain/rules/presets'
import { entityIdSchema } from '../domain/validation/schemas'
import { ConstitutionPage } from '../features/constitution/ConstitutionPage'
import { harborInput } from './fixtures/campaign'

const databaseName = 'constitution-form-page-test'
const campaignId = entityIdSchema.parse(harborInput.campaignId)
const database = () => getDatabase(databaseName)

beforeEach(async () => {
  const created = await createCampaign(database(), harborInput)
  expect(created.ok).toBe(true)
  const saved = await saveConstitution(database(), {
    campaignId,
    constitutionId: 'constitution-1',
    expectedRevision: 1,
    now: harborInput.now,
    auditEventId: 'constitution-audit-1',
    actionId: 'constitution-action-1',
    ledgerEntryId: 'opening-1',
    effectiveOn: '2026-10-19',
    rules: constitutionPreset('balanced'),
  })
  expect(saved.ok).toBe(true)
})

afterEach(async () => {
  await deleteDatabaseForTests(databaseName)
})

function show() {
  return render(
    <DatabaseProvider name={databaseName}>
      <MemoryRouter initialEntries={['/app/campaign-a/constitution']}>
        <Routes>
          <Route
            path="/app/:campaignId/constitution"
            element={<ConstitutionPage />}
          />
        </Routes>
      </MemoryRouter>
    </DatabaseProvider>,
  )
}

describe('browser constitution form', () => {
  it('reports invalid numbers without saving, then saves euro money and a blank nullable age', async () => {
    show()
    await screen.findByRole('button', { name: 'Save constitution' })
    const age = screen.getByLabelText('Age cap')
    for (const value of ['', '1.5', 'Infinity']) {
      fireEvent.change(age, { target: { value } })
      fireEvent.click(screen.getByRole('button', { name: 'Save constitution' }))
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'enter a whole number',
      )
      expect(await database().constitutions.count()).toBe(1)
    }
    fireEvent.change(age, { target: { value: '26' } })
    fireEvent.change(screen.getByLabelText('Opening allocation'), {
      target: { value: '12.345' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save constitution' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'at most two decimal places',
    )
    expect(await database().constitutions.count()).toBe(1)
    fireEvent.change(screen.getByLabelText('Opening allocation'), {
      target: { value: '12.34' },
    })
    fireEvent.change(screen.getByLabelText('Age exemption'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save constitution' }))
    await waitFor(async () =>
      expect(await database().constitutions.count()).toBe(2),
    )
    const saved = (await database().constitutions.toArray()).find(
      (row) => row.version === 2,
    )!
    expect(saved.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'SELL_TO_BUY',
          initialAllocationCents: 1234,
        }),
        expect.objectContaining({
          id: 'REGISTRATION_QUOTA',
          ageExemptionUnder: null,
        }),
      ]),
    )
  })

  it('keeps challenge rules read-only', async () => {
    await database().campaigns.update(campaignId, {
      mode: 'standalone',
      rulesMode: 'challenge',
    })
    show()
    await screen.findByRole('region', { name: 'Challenge rules' })
    expect(
      screen.queryByRole('button', { name: 'Save constitution' }),
    ).toBeNull()
    expect(screen.queryByLabelText('Age cap')).toBeNull()
    expect(await database().constitutions.count()).toBe(1)
  })
})
