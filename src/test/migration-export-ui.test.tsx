import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  exportEmpty,
  exportFailed,
  exportMissing,
  exportOrigin,
  exportStarted,
} from '../app/copy'
import { createCampaign } from '../data/commands/create-campaign'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await deleteDatabaseForTests('touchline-os-test')
})

describe('export for desktop', () => {
  it('explains an empty database at this origin', async () => {
    renderAt('/')
    expect(
      await screen.findByText(exportOrigin(window.location.origin)),
    ).toBeInTheDocument()
    expect(await screen.findByText(exportEmpty)).toBeInTheDocument()
    expect(document.querySelector('input[type=file]')).toBeNull()
  })

  it('downloads the campaign json and does not change the save', async () => {
    const database = getDatabase('touchline-os-test')
    await createCampaign(database, harborInput)
    const beforeAudit = await database.auditEvents.count()
    const beforeRevision = (await database.campaigns.toArray())[0]?.revision
    renderAt('/')
    const button = await screen.findByRole('button', {
      name: 'Export Harbor for Desktop',
    })
    let downloaded: Blob | undefined
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value) => {
      downloaded = value as Blob
      return 'blob:touchline'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const anchors: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function click(this: HTMLAnchorElement) {
        anchors.push(this)
      },
    )
    fireEvent.click(button)
    await screen.findByText(exportStarted)
    expect(anchors[0]?.download).toBe('touchline-campaign-a-desktop.json')
    expect(anchors[0]?.href).toContain('blob:touchline')
    const snapshot = JSON.parse((await downloaded?.text()) ?? '{}') as {
      sourceStorage: string
      tables: Record<string, unknown[]>
      campaignRevision: number
    }
    expect(snapshot.sourceStorage).toBe('indexeddb')
    expect(Object.keys(snapshot.tables)).toHaveLength(23)
    expect(snapshot.campaignRevision).toBe(beforeRevision)
    expect(await database.auditEvents.count()).toBe(beforeAudit)
    expect((await database.campaigns.toArray())[0]?.revision).toBe(
      beforeRevision,
    )
  })

  it('reports a missing campaign without writing', async () => {
    const database = getDatabase('touchline-os-test')
    await createCampaign(database, harborInput)
    const beforeAudit = await database.auditEvents.count()
    renderAt('/')
    const button = await screen.findByRole('button', {
      name: 'Export Harbor for Desktop',
    })
    await database.campaigns.clear()
    fireEvent.click(button)
    expect(await screen.findByText(exportMissing)).toBeInTheDocument()
    expect(screen.queryByText(exportFailed)).toBeNull()
    await waitFor(async () => {
      expect(await database.auditEvents.count()).toBe(beforeAudit)
    })
  })
})
