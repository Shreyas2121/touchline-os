import { afterEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { saveLineup } from '../data/commands/save-lineup'
import { deleteLineup } from '../data/commands/delete-lineup'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import {
  getLineup,
  listLineups,
  removeLineup,
  updateLineup,
} from '../data/repositories/lineups'
import {
  clubSchema,
  entityIdSchema,
  playerSchema,
  seasonSchema,
} from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'
const databaseName = 'touchline-os-test'
const id = entityIdSchema.parse
let sequence = 0
function commandIds() {
  sequence += 1
  return {
    auditEventId: `lineup-audit-${sequence}`,
    actionId: `lineup-action-${sequence}`,
  }
}
afterEach(async () => {
  await deleteDatabaseForTests(databaseName)
})
async function setup() {
  const database = getDatabase(databaseName)
  await createCampaign(database, harborInput)
  await createCampaign(database, {
    ...harborInput,
    campaignId: 'campaign-b',
    clubId: 'club-b',
    seasonId: 'season-b',
    auditEventId: 'audit-b',
    actionId: 'action-b',
  })
  const club = (await database.clubs.get(id('club-a')))!
  await database.clubs.add(
    clubSchema.parse({ ...club, id: 'club-a-other', name: 'Another club' }),
  )
  for (const [playerId, campaignId, clubId] of [
    ['p1', 'campaign-a', 'club-a'],
    ['p2', 'campaign-a', 'club-a'],
    ['other-club', 'campaign-a', 'club-a-other'],
    ['free', 'campaign-a', null],
    ['foreign', 'campaign-b', 'club-b'],
  ] as const) {
    await database.players.add(
      playerSchema.parse({
        id: playerId,
        campaignId,
        clubId,
        name: playerId,
        positionGroup: 'MID',
        positions: ['CM'],
        nationalityCode: null,
        birthDate: null,
        reportedAge: null,
        ageReferenceSeasonOrdinal: null,
        marketValueCents: null,
        attributes: {},
        potential: null,
        source: 'fictional',
        externalSourceId: null,
        isNewgen: false,
      }),
    )
  }
  return database
}
async function save(overrides: Record<string, unknown> = {}) {
  const database = getDatabase(databaseName)
  const campaignId = id(String(overrides.campaignId ?? 'campaign-a'))
  const campaign = await database.campaigns.get(campaignId)
  return saveLineup(database, {
    campaignId,
    lineupId: 'league',
    seasonId: 'season-a',
    expectedRevision: campaign?.revision ?? 0,
    now: harborInput.now,
    ...commandIds(),
    name: 'League XI',
    formation: '4-3-3',
    starters: [{ playerId: 'p1', slot: 'gk', role: null }],
    benchPlayerIds: ['p2'],
    ...overrides,
  })
}
async function remove(
  lineupId: string,
  overrides: Record<string, unknown> = {},
) {
  const database = getDatabase(databaseName)
  const campaignId = id(String(overrides.campaignId ?? 'campaign-a'))
  const campaign = await database.campaigns.get(campaignId)
  return deleteLineup(database, {
    campaignId,
    lineupId,
    expectedRevision: campaign?.revision ?? 0,
    now: harborInput.now,
    ...commandIds(),
    ...overrides,
  })
}
async function snapshot() {
  const database = getDatabase(databaseName)
  return {
    lineups: await database.lineups.toArray(),
    campaigns: await database.campaigns.toArray(),
    audits: await database.auditEvents.toArray(),
    players: await database.players.toArray(),
  }
}
describe('saved lineups', () => {
  it('stores two names in the active season with newest first and keeps campaign B isolated', async () => {
    const database = await setup()
    expect(await save()).toMatchObject({
      ok: true,
      revision: 2,
      value: {
        name: 'League XI',
        starters: [{ playerId: 'p1', slot: 'gk', role: null }],
      },
    })
    expect(
      await save({
        lineupId: 'cup',
        name: 'Cup Rotation',
        now: '2026-10-19T00:00:01.000Z',
      }),
    ).toMatchObject({ ok: true, revision: 3 })
    expect(
      (await listLineups(database, id('campaign-a'), id('season-a'))).map(
        (lineup) => lineup.name,
      ),
    ).toEqual(['Cup Rotation', 'League XI'])
    expect(
      await listLineups(database, id('campaign-b'), id('season-b')),
    ).toEqual([])
    expect(
      await listLineups(database, id('campaign-a'), id('season-b')),
    ).toEqual([])
    expect(
      await getLineup(database, id('campaign-b'), id('league')),
    ).toBeUndefined()
    const audit = (await database.auditEvents.toArray()).find(
      (event) => event.actionType === 'lineup.save',
    )
    expect(audit).toMatchObject({
      summary: 'Saved lineup League XI',
      seasonId: 'season-a',
      payload: { lineupId: 'league' },
    })
  })
  it('uses descending ids to order equal timestamps and updates an existing id', async () => {
    const database = await setup()
    await save({ lineupId: 'a', name: 'First' })
    await save({ lineupId: 'z', name: 'Second' })
    expect(
      (await listLineups(database, id('campaign-a'), id('season-a'))).map(
        (lineup) => lineup.id,
      ),
    ).toEqual(['z', 'a'])
    expect(
      await save({
        lineupId: 'a',
        name: ' First ',
        formation: '4-4-2',
        starters: [],
        now: '2026-10-19T00:00:02.000Z',
      }),
    ).toMatchObject({
      ok: true,
      value: { id: 'a', name: 'First', formation: '4-4-2', starters: [] },
    })
    expect(await database.lineups.count()).toBe(2)
    expect(
      (await listLineups(database, id('campaign-a'), id('season-a')))[0].id,
    ).toBe('a')
  })
  it.each(['foreign', 'free', 'other-club'])(
    'rejects a %s player outside the managed roster without any writes',
    async (playerId) => {
      await setup()
      const before = await snapshot()
      expect(
        await save({ starters: [{ playerId, slot: 'gk', role: null }] }),
      ).toEqual({
        ok: false,
        code: 'VALIDATION',
        message: 'This lineup does not match the current roster.',
      })
      expect(await snapshot()).toEqual(before)
    },
  )
  it.each([
    {
      starters: [
        { playerId: 'p1', slot: 'gk', role: null },
        { playerId: 'p1', slot: 'st', role: null },
      ],
    },
    {
      starters: [
        { playerId: 'p1', slot: 'gk', role: null },
        { playerId: 'p2', slot: 'gk', role: null },
      ],
      benchPlayerIds: [],
    },
    { benchPlayerIds: ['p1'] },
    { starters: [{ playerId: 'p1', slot: 'rst', role: null }] },
    { benchPlayerIds: ['foreign'] },
    { benchPlayerIds: Array(13).fill('p2') },
    {
      starters: Array.from({ length: 12 }, () => ({
        playerId: 'p1',
        slot: 'gk',
        role: null,
      })),
    },
  ])('rejects an invalid lineup placement %# atomically', async (fields) => {
    await setup()
    const before = await snapshot()
    expect(await save(fields)).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'This lineup does not match the current roster.',
    })
    expect(await snapshot()).toEqual(before)
  })
  it('rejects a stale update or delete without changing formation, audits or revision', async () => {
    await setup()
    await save()
    const before = await snapshot()
    expect(
      await save({ expectedRevision: 1, formation: '4-4-2', starters: [] }),
    ).toMatchObject({ ok: false, code: 'CONFLICT' })
    expect(await remove('league', { expectedRevision: 1 })).toMatchObject({
      ok: false,
      code: 'CONFLICT',
    })
    expect(await snapshot()).toEqual(before)
  })
  it('rejects a different id with the same trimmed name', async () => {
    await setup()
    await save()
    const before = await snapshot()
    expect(await save({ lineupId: 'duplicate', name: ' League XI ' })).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'A lineup with this name already exists.',
    })
    expect(await snapshot()).toEqual(before)
  })
  it('deletes only one lineup and writes one deletion audit', async () => {
    const database = await setup()
    await save()
    await save({ lineupId: 'cup', name: 'Cup Rotation' })
    await save({
      campaignId: 'campaign-b',
      seasonId: 'season-b',
      lineupId: 'b',
      name: 'B lineup',
      starters: [],
      benchPlayerIds: [],
    })
    expect(await remove('cup')).toMatchObject({
      ok: true,
      revision: 4,
      value: { id: 'cup' },
    })
    expect(
      (await listLineups(database, id('campaign-a'), id('season-a'))).map(
        (lineup) => lineup.id,
      ),
    ).toEqual(['league'])
    expect(
      (await listLineups(database, id('campaign-b'), id('season-b'))).map(
        (lineup) => lineup.id,
      ),
    ).toEqual(['b'])
    const before = await snapshot()
    expect(await remove('cup')).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: 'Lineup not found.',
    })
    expect(await snapshot()).toEqual(before)
    expect(
      (await database.auditEvents.toArray()).filter(
        (event) => event.actionType === 'lineup.delete',
      ),
    ).toMatchObject([
      { summary: 'Deleted lineup Cup Rotation', seasonId: 'season-a' },
    ])
  })
  it('does not overwrite or delete an id in another campaign, including through scoped repositories', async () => {
    const database = await setup()
    await save({
      campaignId: 'campaign-b',
      seasonId: 'season-b',
      lineupId: 'b',
      name: 'B lineup',
      starters: [],
      benchPlayerIds: [],
    })
    const before = await snapshot()
    expect(await save({ lineupId: 'b' })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: 'Lineup not found.',
    })
    expect(await remove('b')).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: 'Lineup not found.',
    })
    await expect(
      removeLineup(database, id('campaign-a'), id('b')),
    ).rejects.toMatchObject({
      code: 'SCOPE',
      message: 'Lineup is not in this campaign.',
    })
    const foreign = (await getLineup(database, id('campaign-b'), id('b')))!
    await expect(
      updateLineup(database, id('campaign-a'), {
        ...foreign,
        campaignId: id('campaign-a'),
      }),
    ).rejects.toMatchObject({ code: 'SCOPE' })
    expect(await snapshot()).toEqual(before)
  })
  it('requires the active season and does not move a stored lineup into a different season', async () => {
    const database = await setup()
    const before = await snapshot()
    expect(await save({ seasonId: 'season-b' })).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Season is not the active season.',
    })
    expect(await snapshot()).toEqual(before)
    await save()
    const season = (await database.seasons.get(id('season-a')))!
    await database.seasons.update(id('season-a'), { status: 'closed' })
    await database.seasons.add(
      seasonSchema.parse({ ...season, id: 'season-next', ordinal: 2 }),
    )
    const old = await snapshot()
    expect(await save({ seasonId: 'season-next' })).toEqual({
      ok: false,
      code: 'NOT_FOUND',
      message: 'Lineup not found.',
    })
    expect(await snapshot()).toEqual(old)
    expect(
      await save({ seasonId: 'season-next', lineupId: 'new-season' }),
    ).toMatchObject({ ok: true })
  })
  it('rolls back save and delete when the audit insert fails', async () => {
    await setup()
    const before = await snapshot()
    expect(await save({ auditEventId: 'audit-a' })).toMatchObject({
      ok: false,
      code: 'DUPLICATE',
    })
    expect(await snapshot()).toEqual(before)
    await save()
    const saved = await snapshot()
    expect(await remove('league', { auditEventId: 'audit-a' })).toMatchObject({
      ok: false,
      code: 'DUPLICATE',
    })
    expect(await snapshot()).toEqual(saved)
  })
  it('rejects blank names and unexpected fields without writing', async () => {
    await setup()
    const before = await snapshot()
    for (const fields of [{ name: '   ' }, { clubId: 'club-b' }])
      expect(await save(fields)).toEqual({
        ok: false,
        code: 'VALIDATION',
        message: 'Command input is not valid.',
      })
    expect(await remove('league', { extra: true })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    })
    expect(await snapshot()).toEqual(before)
  })
})
