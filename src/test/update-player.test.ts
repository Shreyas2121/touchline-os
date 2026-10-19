import { afterEach, describe, expect, it } from 'vitest'
import { createCampaign } from '../data/commands/create-campaign'
import { addPlayer } from '../data/commands/add-player'
import { updatePlayer } from '../data/commands/update-player'
import { saveDevelopmentNote } from '../data/commands/save-development-note'
import { getDatabase, deleteDatabaseForTests } from '../data/db'
import { getDevelopmentPlan } from '../data/repositories/development-plans'
import { updateStoredPlayer } from '../data/repositories/players'
import { entityIdSchema } from '../domain/validation/schemas'
import { harborInput } from './fixtures/campaign'
const databaseName = 'touchline-os-test'
const id = entityIdSchema.parse
const correction = {
  campaignId: 'campaign-a',
  playerId: 'player-a',
  expectedRevision: 2,
  now: harborInput.now,
  auditEventId: 'audit-update',
  actionId: 'action-update',
  name: 'Corrected player',
  positions: ['CM'],
  nationalityCode: null,
  birthDate: null,
  reportedAge: 21,
  marketValueCents: null,
  attributes: { pace: 0, passing: 70 },
  potential: null,
}
const note = {
  campaignId: 'campaign-a',
  playerId: 'player-a',
  seasonId: 'season-a',
  planId: 'plan-a',
  expectedRevision: 2,
  now: harborInput.now,
  auditEventId: 'audit-note',
  actionId: 'action-note',
  notes: 'Hold the ball',
  targetRole: ' Playmaker ',
}
afterEach(async () => {
  await deleteDatabaseForTests(databaseName)
})
async function setup() {
  const database = getDatabase(databaseName)
  expect(await createCampaign(database, harborInput)).toMatchObject({
    ok: true,
    revision: 1,
  })
  expect(
    await addPlayer(database, {
      ...correction,
      name: 'Original player',
      expectedRevision: 1,
      auditEventId: 'audit-add',
      actionId: 'action-add',
      clubId: 'club-a',
      positionGroup: 'MID',
      ageReferenceSeasonOrdinal: 1,
      source: 'fictional',
      externalSourceId: 'original-source',
      isNewgen: true,
    }),
  ).toMatchObject({ ok: true, revision: 2 })
  return database
}
async function snapshot() {
  const database = getDatabase(databaseName)
  return {
    players: await database.players.toArray(),
    campaigns: await database.campaigns.toArray(),
    audits: await database.auditEvents.toArray(),
    plans: await database.developmentPlans.toArray(),
  }
}
describe('player corrections and development notes', () => {
  it('corrects identity with one audit, keeping club, provenance and a null birth date', async () => {
    const database = await setup()
    await database.seasons.update(id('season-a'), { ordinal: 3 })
    const result = await updatePlayer(database, correction)
    expect(result).toMatchObject({
      ok: true,
      revision: 3,
      value: {
        name: 'Corrected player',
        clubId: 'club-a',
        source: 'fictional',
        externalSourceId: 'original-source',
        isNewgen: true,
        birthDate: null,
        reportedAge: 21,
        ageReferenceSeasonOrdinal: 3,
      },
    })
    expect(await database.players.get(id('player-a'))).toMatchObject({
      name: 'Corrected player',
      birthDate: null,
    })
    expect(await database.campaigns.get(id('campaign-a'))).toMatchObject({
      revision: 3,
    })
    const audits = await database.auditEvents
      .where('campaignId')
      .equals('campaign-a')
      .toArray()
    expect(audits).toHaveLength(3)
    expect(
      audits.find((audit) => audit.actionType === 'player.update'),
    ).toMatchObject({
      summary: 'Updated player Corrected player',
      seasonId: 'season-a',
      payload: { playerId: 'player-a' },
    })
  })
  it('rejects stale corrections and notes without any writes', async () => {
    const database = await setup()
    const before = await snapshot()
    expect(
      await updatePlayer(database, { ...correction, expectedRevision: 1 }),
    ).toMatchObject({ ok: false, code: 'CONFLICT' })
    expect(
      await saveDevelopmentNote(database, { ...note, expectedRevision: 1 }),
    ).toMatchObject({ ok: false, code: 'CONFLICT' })
    expect(await snapshot()).toEqual(before)
  })
  it.each([
    'clubId',
    'source',
    'externalSourceId',
    'isNewgen',
    'positionGroup',
  ])('rejects the protected input field %s before writing', async (field) => {
    const database = await setup()
    const before = await snapshot()
    expect(
      await updatePlayer(database, { ...correction, [field]: 'other' }),
    ).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Command input is not valid.',
    })
    expect(await snapshot()).toEqual(before)
  })
  it('rejects mixed position groups atomically', async () => {
    const database = await setup()
    const before = await snapshot()
    expect(
      await updatePlayer(database, { ...correction, positions: ['GK', 'CM'] }),
    ).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await snapshot()).toEqual(before)
  })
  it('treats a foreign or missing player as not found for both commands', async () => {
    const database = await setup()
    await createCampaign(database, {
      ...harborInput,
      campaignId: 'campaign-b',
      clubId: 'club-b',
      seasonId: 'season-b',
      auditEventId: 'audit-b',
      actionId: 'action-b',
    })
    const original = (await database.players.get(id('player-a')))!
    await database.players.add({
      ...original,
      id: id('player-b'),
      campaignId: id('campaign-b'),
      clubId: id('club-b'),
    })
    const before = await snapshot()
    for (const playerId of ['player-b', 'missing']) {
      expect(await updatePlayer(database, { ...correction, playerId })).toEqual(
        { ok: false, code: 'NOT_FOUND', message: 'Player not found.' },
      )
      expect(
        await saveDevelopmentNote(database, { ...note, playerId }),
      ).toEqual({ ok: false, code: 'NOT_FOUND', message: 'Player not found.' })
    }
    await expect(
      updateStoredPlayer(database, id('campaign-a'), {
        ...original,
        id: id('player-b'),
      }),
    ).rejects.toMatchObject({
      code: 'SCOPE',
      message: 'Player is not in this campaign.',
    })
    expect(await snapshot()).toEqual(before)
  })
  it('requires an active season for reported age but allows clearing age without one', async () => {
    const database = await setup()
    await database.seasons.delete(id('season-a'))
    const before = await snapshot()
    expect(await updatePlayer(database, correction)).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'This campaign has no active season.',
    })
    expect(await snapshot()).toEqual(before)
    expect(
      await updatePlayer(database, { ...correction, reportedAge: null }),
    ).toMatchObject({
      ok: true,
      value: {
        reportedAge: null,
        ageReferenceSeasonOrdinal: null,
        birthDate: null,
      },
    })
    expect(await database.auditEvents.get(id('audit-update'))).toMatchObject({
      seasonId: null,
    })
  })
  it('updates one plan in place and records each save without changing the player', async () => {
    const database = await setup()
    const player = await database.players.get(id('player-a'))
    expect(await saveDevelopmentNote(database, note)).toMatchObject({
      ok: true,
      revision: 3,
      value: {
        id: 'plan-a',
        notes: 'Hold the ball',
        targetRole: 'Playmaker',
        status: 'open',
      },
    })
    expect(
      await saveDevelopmentNote(database, {
        ...note,
        expectedRevision: 3,
        planId: 'ignored-plan',
        auditEventId: 'audit-note-2',
        actionId: 'action-note-2',
        notes: '',
        targetRole: null,
      }),
    ).toMatchObject({
      ok: true,
      revision: 4,
      value: { id: 'plan-a', notes: '', targetRole: null },
    })
    expect(await database.developmentPlans.count()).toBe(1)
    expect(await database.players.get(id('player-a'))).toEqual(player)
    expect(
      await getDevelopmentPlan(
        database,
        id('campaign-a'),
        id('player-a'),
        id('season-a'),
      ),
    ).toMatchObject({ id: 'plan-a', notes: '' })
    expect(
      await getDevelopmentPlan(
        database,
        id('campaign-b'),
        id('player-a'),
        id('season-a'),
      ),
    ).toBeUndefined()
    const audits = await database.auditEvents.toArray()
    expect(
      audits
        .filter((audit) => audit.actionType === 'player.note')
        .map((audit) => audit.summary),
    ).toEqual([
      'Noted development for Original player',
      'Noted development for Original player',
    ])
  })
  it('rejects an inactive or foreign season and oversized note inputs without writing', async () => {
    const database = await setup()
    const before = await snapshot()
    expect(
      await saveDevelopmentNote(database, { ...note, seasonId: 'season-b' }),
    ).toEqual({
      ok: false,
      code: 'VALIDATION',
      message: 'Season is not the active season.',
    })
    for (const invalid of [
      { notes: 'x'.repeat(4001) },
      { targetRole: 'x'.repeat(41) },
      { targetRole: '  ' },
      { status: 'closed' },
    ])
      expect(
        await saveDevelopmentNote(database, { ...note, ...invalid }),
      ).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await snapshot()).toEqual(before)
  })
  it('rolls back a player or note write if its audit cannot be inserted', async () => {
    const database = await setup()
    const before = await snapshot()
    expect(
      await updatePlayer(database, {
        ...correction,
        auditEventId: 'audit-add',
      }),
    ).toMatchObject({ ok: false, code: 'DUPLICATE' })
    expect(
      await saveDevelopmentNote(database, {
        ...note,
        auditEventId: 'audit-add',
      }),
    ).toMatchObject({ ok: false, code: 'DUPLICATE' })
    expect(await snapshot()).toEqual(before)
  })
})
