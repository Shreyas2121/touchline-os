import { createElement } from 'react'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CrestSvg } from '../components/graphics/CrestSvg'
import { PitchSvg } from '../components/graphics/PitchSvg'
import { crestSpec } from '../domain/graphics/crest'
import {
  formationSlots,
  pitchLinePaths,
  type FormationId,
} from '../domain/graphics/pitch'
import { hashSeed } from '../domain/seed/prng'
import { createCampaign } from '../data/commands/create-campaign'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import * as clubs from '../data/repositories/clubs'
import { entityIdSchema } from '../domain/validation/schemas'
import {
  lineupDiscardWarning,
  loadingTactics,
  previewBanner,
  tacticsFailed,
} from '../app/copy'
import { harborInput } from './fixtures/campaign'
import { renderAt } from './render'

const databaseName = 'touchline-os-test'
const club = {
  id: 'club-a',
  name: 'Harbor Athletic',
  colors: { primary: '#1F2933', secondary: '#C4A35A' },
}
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await deleteDatabaseForTests(databaseName)
})

describe('generated crests', () => {
  it('derives the mark from the versioned club id and leaves stored colors unchanged', () => {
    const before = structuredClone(club)
    for (const id of ['club-a', 'club-b', 'Ashbridge', 'club-c', 'club-d']) {
      const input = { ...club, id }
      expect(crestSpec(input).mark).toBe(
        ['shield', 'stripe', 'chevron', 'monogram'][
          hashSeed(id, 'crest-v1') % 4
        ],
      )
      expect(crestSpec(input)).toEqual(crestSpec(input))
      expect(crestSpec(input)).toMatchObject({
        primary: club.colors.primary,
        secondary: club.colors.secondary,
      })
    }
    expect(club).toEqual(before)
  })
  it.each([
    ['Harbor Athletic', 'HA'],
    ['Ashbridge', 'A'],
    ['  North Harbor Athletic Club ', 'NHA'],
    ['!!!', '?'],
    ['  ', '?'],
    ['Étoile Union', 'ÉU'],
  ])('builds the monogram for %s as %s', (name, monogram) => {
    expect(crestSpec({ ...club, name }).monogram).toBe(monogram)
  })
  it.each(['shield', 'stripe', 'chevron', 'monogram'] as const)(
    'renders the %s mark with an accessible title and stored colors',
    (mark) => {
      const { container } = render(
        createElement(CrestSvg, {
          ...crestSpec(club),
          mark,
          title: 'Ashbridge crest',
        }),
      )
      const crest = screen.getByRole('img', {
        name: 'Ashbridge crest',
      })
      expect(crest).toHaveAttribute('viewBox', '0 0 64 64')
      expect(crest.querySelector('title')).toHaveTextContent('Ashbridge crest')
      expect(crest.querySelector('rect')).toHaveAttribute(
        'fill',
        club.colors.primary,
      )
      expect(crest.querySelector('g')).toHaveAttribute(
        'fill',
        club.colors.secondary,
      )
      expect(
        crest.querySelector(mark === 'monogram' ? 'text' : 'path'),
      ).toBeInTheDocument()
      expect(container.querySelector('image, animate, script')).toBeNull()
    },
  )
})

const backLine = [
  'gk GK 50 90',
  'rb DEF 82 72',
  'rcb DEF 64 76',
  'lcb DEF 36 76',
  'lb DEF 18 72',
]
const expectedSlots: Record<FormationId, string[]> = {
  '4-3-3': [
    ...backLine,
    'rcm MID 66 52',
    'cm MID 50 58',
    'lcm MID 34 52',
    'rw FWD 78 28',
    'st FWD 50 20',
    'lw FWD 22 28',
  ],
  '4-2-3-1': [
    ...backLine,
    'rdm MID 62 62',
    'ldm MID 38 62',
    'rw FWD 78 40',
    'cam MID 50 42',
    'lw FWD 22 40',
    'st FWD 50 20',
  ],
  '4-4-2': [
    ...backLine,
    'rm MID 82 48',
    'rcm MID 62 54',
    'lcm MID 38 54',
    'lm MID 18 48',
    'rst FWD 62 22',
    'lst FWD 38 22',
  ],
  '3-5-2': [
    'gk GK 50 90',
    'rcb DEF 66 74',
    'cb DEF 50 78',
    'lcb DEF 34 74',
    'rwb DEF 86 48',
    'rcm MID 62 54',
    'cm MID 50 60',
    'lcm MID 38 54',
    'lwb DEF 14 48',
    'rst FWD 62 22',
    'lst FWD 38 22',
  ],
}
describe('pitch geometry', () => {
  it.each(['4-3-3', '4-2-3-1', '4-4-2', '3-5-2'] as const)(
    'publishes the exact eleven %s slots in order',
    (formation) => {
      const slots = formationSlots(formation)
      expect(slots).toHaveLength(11)
      expect(new Set(slots.map((slot) => slot.id)).size).toBe(11)
      expect(
        slots.map((slot) => `${slot.id} ${slot.group} ${slot.x} ${slot.y}`),
      ).toEqual(expectedSlots[formation])
      for (const slot of slots) expect(slot.label).toBe(slot.id.toUpperCase())
      expect(slots.find((slot) => slot.id === 'gk')).toMatchObject({
        x: 50,
        y: 90,
      })
    },
  )
  it('returns one stable set of nine pitch lines', () => {
    const paths = pitchLinePaths()
    expect(paths).toBe(pitchLinePaths())
    expect(paths).toEqual(pitchLinePaths())
    expect(paths.map((path) => path.id)).toEqual([
      'touchline',
      'halfway',
      'center-circle',
      'penalty-top',
      'penalty-bottom',
      'six-yard-top',
      'six-yard-bottom',
      'goal-top',
      'goal-bottom',
    ])
    expect(new Set(paths.map((path) => path.id)).size).toBe(9)
    expect(paths.every((path) => path.d.length > 0)).toBe(true)
  })
  it('renders an accessible static pitch with all nine lines and no players', () => {
    const { container } = render(
      createElement(PitchSvg, { paths: pitchLinePaths() }),
    )
    const pitch = screen.getByRole('img', { name: 'Pitch' })
    expect(pitch).toHaveAttribute('viewBox', '0 0 680 1050')
    expect(pitch.querySelectorAll('path')).toHaveLength(9)
    expect(pitch.textContent).toBe('Pitch')
    expect(container.innerHTML).not.toContain('<animate')
    expect(container.querySelector('script, image, button, text')).toBeNull()
  })
})

describe('club graphics on campaign pages', () => {
  it('shows the saved club on Squad and Tactics without writing a lineup', async () => {
    const database = getDatabase(databaseName)
    await createCampaign(database, harborInput)
    const { unmount } = renderAt('/app/campaign-a/squad')
    const squadCrest = await screen.findByRole('img', {
      name: 'Harbor Athletic crest',
    })
    expect(
      screen.getByRole('heading', { level: 2, name: 'Harbor Athletic' }),
    ).toBeInTheDocument()
    const crestMarkup = squadCrest.outerHTML
    unmount()
    renderAt('/app/campaign-a/tactics')
    const tacticsCrest = await screen.findByRole('img', {
      name: 'Harbor Athletic crest',
    })
    expect(tacticsCrest.outerHTML).toBe(crestMarkup)
    expect(
      await screen.findByRole('img', { name: 'Pitch' }),
    ).toBeInTheDocument()
    expect(screen.getByText(lineupDiscardWarning)).toBeInTheDocument()
    expect(screen.queryByText(previewBanner)).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Formation' })).toHaveValue(
      '4-3-3',
    )
    expect(
      screen
        .getByRole('group', { name: 'Pitch slots' })
        .querySelectorAll('button'),
    ).toHaveLength(11)
    expect(await database.lineups.count()).toBe(0)
  })
  it('omits the crest when the managed club is missing', async () => {
    const database = getDatabase(databaseName)
    await createCampaign(database, harborInput)
    await database.clubs.delete(entityIdSchema.parse('club-a'))
    const { unmount } = renderAt('/app/campaign-a/squad')
    await screen.findByText('No players at this club.')
    expect(screen.queryByRole('img', { name: /crest$/ })).toBeNull()
    unmount()
    renderAt('/app/campaign-a/tactics')
    await screen.findByRole('img', { name: 'Pitch' })
    expect(screen.queryByRole('img', { name: /crest$/ })).toBeNull()
  })
  it('redirects an unconfirmed demo before reading its club', async () => {
    await createCampaign(getDatabase(databaseName), {
      ...harborInput,
      seed: 'crest-test',
      generatorVersion: '1',
    })
    const readClub = vi.spyOn(clubs, 'getClub')
    const { router } = renderAt('/app/campaign-a/tactics')
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        '/app/campaign-a/choose-club',
      ),
    )
    expect(readClub).not.toHaveBeenCalled()
  })
  it('shows the tactics loading state and reports a failed read', async () => {
    await createCampaign(getDatabase(databaseName), harborInput)
    let fail!: (error: Error) => void
    vi.spyOn(clubs, 'getClub').mockImplementation(
      () =>
        new Promise((_, reject) => {
          fail = reject
        }),
    )
    renderAt('/app/campaign-a/tactics')
    expect(await screen.findByText(loadingTactics)).toBeInTheDocument()
    await waitFor(() => expect(fail).toBeDefined())
    expect(screen.queryByRole('img', { name: 'Pitch' })).toBeNull()
    fail(new Error('Read failed'))
    expect(await screen.findByRole('alert')).toHaveTextContent(tacticsFailed)
  })
})
