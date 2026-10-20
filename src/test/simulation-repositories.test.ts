import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createCampaign } from '../data/commands/create-campaign'
import { deleteCampaign } from '../data/commands/delete-campaign'
import { resetDemoCampaign } from '../data/commands/reset-demo'
import { deleteDatabaseForTests, getDatabase } from '../data/db'
import * as simulation from '../data/repositories/simulation'
import { runCommand } from '../data/transactions/run-command'
import {
  clubSimulationStateSchema,
  playerSimulationStateSchema,
  simulationReceiptSchema,
  simulationStateSchema,
  type SimulationState,
} from '../domain/simulation/schemas'
import {
  auditEventSchema,
  campaignSchema,
  entityIdSchema,
  playerSchema,
  seasonSchema,
} from '../domain/validation/schemas'
import {
  campaignA,
  campaignB,
  clubA,
  clubB,
  harborInput,
  seasonA,
  seasonB,
} from './fixtures/campaign'
import {
  clubSimulationState,
  playerSimulationState,
  simulationPlayer,
  simulationReceipt,
  simulationState,
} from './fixtures/simulation'

const name = 'touchline-simulation-repositories-test'
const id = entityIdSchema.parse
const database = () => getDatabase(name)

afterEach(async () => {
  await deleteDatabaseForTests(name)
})

async function seed() {
  const db = database()
  await db.campaigns.bulkAdd([campaignA, campaignB])
  await db.seasons.bulkAdd([seasonA, seasonB])
  await db.clubs.bulkAdd([clubA, clubB])
  await db.players.bulkAdd([
    simulationPlayer,
    playerSchema.parse({
      ...simulationPlayer,
      id: 'player-b',
      campaignId: campaignB.id,
      clubId: clubB.id,
    }),
  ])
  return db
}

async function seedFoundation() {
  const db = await seed()
  await simulation.insertSimulationState(db, campaignA.id, simulationState)
  await simulation.insertClubSimulationState(
    db,
    campaignA.id,
    clubSimulationState,
  )
  await simulation.insertPlayerSimulationState(
    db,
    campaignA.id,
    playerSimulationState,
  )
  await simulation.insertSimulationReceipt(db, campaignA.id, simulationReceipt)
  await simulation.insertSimulationState(
    db,
    campaignB.id,
    simulationStateSchema.parse({
      ...simulationState,
      id: 'state-b',
      campaignId: campaignB.id,
      activeSeasonId: seasonB.id,
    }),
  )
  await simulation.insertClubSimulationState(
    db,
    campaignB.id,
    clubSimulationStateSchema.parse({
      ...clubSimulationState,
      id: 'club-state-b',
      campaignId: campaignB.id,
      clubId: clubB.id,
    }),
  )
  await simulation.insertPlayerSimulationState(
    db,
    campaignB.id,
    playerSimulationStateSchema.parse({
      ...playerSimulationState,
      id: 'player-state-b',
      campaignId: campaignB.id,
      playerId: 'player-b',
    }),
  )
  await simulation.insertSimulationReceipt(
    db,
    campaignB.id,
    simulationReceiptSchema.parse({
      ...simulationReceipt,
      id: 'receipt-b',
      campaignId: campaignB.id,
      outcomeRefs: [{ kind: 'campaign', id: campaignB.id }],
    }),
  )
  return db
}

describe('simulation runtime contracts', () => {
  it('defaults old campaigns to legacy/sandbox independently of provenance', () => {
    const { mode, rulesMode, ...old } = campaignA
    void mode
    void rulesMode
    expect(campaignSchema.parse(old)).toMatchObject({
      mode: 'legacy',
      rulesMode: 'sandbox',
    })
    expect(
      campaignSchema.parse({
        ...old,
        kind: 'imported',
        mode: 'standalone',
        rulesMode: 'challenge',
      }),
    ).toMatchObject({
      kind: 'imported',
      mode: 'standalone',
      rulesMode: 'challenge',
    })
    expect(campaignSchema.safeParse({ ...old, mode: 'future' }).success).toBe(
      false,
    )
    expect(
      campaignSchema.safeParse({ ...old, rulesMode: 'future' }).success,
    ).toBe(false)
  })

  it.each([
    { rootSeed: null },
    { rootSeed: '' },
    { rootSeed: ' ' },
    { rootSeed: 's'.repeat(121) },
    { simulationVersion: '2' },
    { calendarVersion: '2' },
    { currentDate: '2026-02-30' },
    { phase: 'playing' },
    { lastBoundaryKey: '' },
    { lastBoundaryKey: 'k'.repeat(201) },
  ])('rejects invalid simulation state %j', (changes) => {
    expect(
      simulationStateSchema.safeParse({ ...simulationState, ...changes })
        .success,
    ).toBe(false)
  })

  it.each([-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe cents %s',
    (amount) => {
      expect(
        clubSimulationStateSchema.safeParse({
          ...clubSimulationState,
          transferBalanceCents: amount,
        }).success,
      ).toBe(false)
      expect(
        clubSimulationStateSchema.safeParse({
          ...clubSimulationState,
          wageBudgetWeeklyCents: amount,
        }).success,
      ).toBe(false)
    },
  )

  it.each([
    { fitness: -1 },
    { fitness: 101 },
    { sharpness: 1.5 },
    { goalkeeping: 101 },
    { suspensionMatches: -1 },
    { suspensionMatches: 0.5 },
    { injuryUntilDate: '2026-02-30' },
    { homegrownClub: null },
    { status: 'injured' },
    { simulationKey: 'k'.repeat(201) },
  ])('rejects invalid player profile %j', (changes) => {
    expect(
      playerSimulationStateSchema.safeParse({
        ...playerSimulationState,
        ...changes,
      }).success,
    ).toBe(false)
  })

  it.each([
    { inputRevision: -1 },
    { inputRevision: Number.MAX_SAFE_INTEGER + 1 },
    { inputFingerprint: '' },
    { inputFingerprint: 'f'.repeat(513) },
    { operationKey: '' },
    { operationKey: 'k'.repeat(201) },
    { eventSeed: -1 },
    { eventSeed: 0x1_0000_0000 },
    { simulationVersion: '2' },
    { outcomeRefs: [{ kind: 'world', payload: { players: [] } }] },
    { outcomeRefs: [{ kind: 'club', id: 'club-a', payload: {} }] },
    { outcomeRefs: [{ kind: 'boundary', key: '' }] },
    {
      outcomeRefs: Array.from({ length: 33 }, () => ({
        kind: 'campaign',
        id: campaignA.id,
      })),
    },
  ])('rejects invalid receipt %j', (changes) => {
    expect(
      simulationReceiptSchema.safeParse({ ...simulationReceipt, ...changes })
        .success,
    ).toBe(false)
  })

  it('retains old audit actions and permits typed initialization/progression actions', () => {
    for (const actionType of [
      'campaign.create',
      'match.record',
      'simulation.initialize',
      'simulation.advance',
    ]) {
      expect(
        auditEventSchema.safeParse({
          id: 'audit',
          campaignId: campaignA.id,
          seasonId: null,
          actionId: 'action',
          actionType,
          createdAt: campaignA.createdAt,
          summary: 'Action',
          payload: {},
        }).success,
      ).toBe(true)
    }
  })
})

describe('scoped simulation repositories', () => {
  it('reads and updates scoped rows, allowing the same logical keys in another campaign', async () => {
    const db = await seedFoundation()
    expect(await simulation.getSimulationState(db, campaignA.id)).toEqual(
      simulationState,
    )
    expect(
      await simulation.getClubSimulationState(db, campaignA.id, clubA.id),
    ).toEqual(clubSimulationState)
    expect(
      await simulation.getPlayerSimulationState(
        db,
        campaignA.id,
        simulationPlayer.id,
      ),
    ).toEqual(playerSimulationState)
    expect(
      await simulation.getSimulationReceipt(
        db,
        campaignA.id,
        simulationReceipt.operationKey,
      ),
    ).toEqual(simulationReceipt)
    expect(
      await simulation.getSimulationState(db, id('missing')),
    ).toBeUndefined()
    expect(
      await simulation.getClubSimulationState(db, campaignB.id, clubA.id),
    ).toBeUndefined()
    expect(
      await simulation.getPlayerSimulationState(
        db,
        campaignB.id,
        simulationPlayer.id,
      ),
    ).toBeUndefined()
    expect(
      await simulation.getSimulationReceipt(
        db,
        id('missing'),
        simulationReceipt.operationKey,
      ),
    ).toBeUndefined()
    expect(await simulation.listClubSimulationStates(db, campaignA.id)).toEqual(
      [clubSimulationState],
    )
    expect(
      await simulation.listPlayerSimulationStates(db, campaignA.id),
    ).toEqual([playerSimulationState])
    expect(await simulation.listSimulationReceipts(db, campaignA.id)).toEqual([
      simulationReceipt,
    ])
    const next = simulationStateSchema.parse({
      ...simulationState,
      currentDate: '2026-08-31',
      lastBoundaryKey: '2026:summer-deadline',
    })
    await simulation.updateSimulationState(db, campaignA.id, next)
    const clubNext = clubSimulationStateSchema.parse({
      ...clubSimulationState,
      transferBalanceCents: 50_000,
    })
    await simulation.updateClubSimulationState(db, campaignA.id, clubNext)
    const playerNext = playerSimulationStateSchema.parse({
      ...playerSimulationState,
      fitness: 80,
    })
    await simulation.updatePlayerSimulationState(db, campaignA.id, playerNext)
    expect(await simulation.getSimulationState(db, campaignA.id)).toEqual(next)
    expect(
      await simulation.getClubSimulationState(db, campaignA.id, clubA.id),
    ).toEqual(clubNext)
    expect(
      await simulation.getPlayerSimulationState(
        db,
        campaignA.id,
        simulationPlayer.id,
      ),
    ).toEqual(playerNext)
    expect(
      (await simulation.getSimulationState(db, campaignB.id))?.currentDate,
    ).toBe(simulationState.currentDate)
  })

  it('enforces every unique identity and logical key through actual indexes', async () => {
    const db = await seedFoundation()
    const additions = [
      () =>
        db.simulationStates.add({
          ...simulationState,
          id: id('duplicate-state'),
        }),
      () =>
        db.clubSimulationStates.add({
          ...clubSimulationState,
          id: id('duplicate-club'),
          simulationKey: 'other',
        }),
      () =>
        db.clubSimulationStates.add({
          ...clubSimulationState,
          id: id('duplicate-club-key'),
          clubId: id('other-club'),
        }),
      () =>
        db.playerSimulationStates.add({
          ...playerSimulationState,
          id: id('duplicate-player'),
          simulationKey: 'other',
        }),
      () =>
        db.playerSimulationStates.add({
          ...playerSimulationState,
          id: id('duplicate-player-key'),
          playerId: id('other-player'),
        }),
      () =>
        db.simulationReceipts.add({
          ...simulationReceipt,
          id: id('duplicate-receipt'),
        }),
    ]
    for (const add of additions)
      await expect(add()).rejects.toMatchObject({ name: 'ConstraintError' })
    await expect(
      simulation.insertSimulationState(db, campaignA.id, {
        ...simulationState,
        id: id('duplicate'),
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE' })
    await expect(
      simulation.insertClubSimulationState(
        db,
        campaignA.id,
        clubSimulationState,
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE' })
    await expect(
      simulation.insertPlayerSimulationState(
        db,
        campaignA.id,
        playerSimulationState,
      ),
    ).rejects.toMatchObject({ code: 'DUPLICATE' })
    await expect(
      simulation.insertSimulationReceipt(db, campaignA.id, simulationReceipt),
    ).rejects.toMatchObject({ code: 'DUPLICATE' })
    for (const table of [
      db.simulationStates,
      db.clubSimulationStates,
      db.playerSimulationStates,
      db.simulationReceipts,
    ])
      expect(await table.count()).toBe(2)
  })

  it('rejects foreign scopes, reused IDs and updates without any mutation', async () => {
    const db = await seedFoundation()
    const before = await Promise.all(db.tables.map((table) => table.toArray()))
    const attempts = [
      simulation.insertSimulationState(db, campaignB.id, simulationState),
      simulation.insertClubSimulationState(
        db,
        campaignB.id,
        clubSimulationState,
      ),
      simulation.insertPlayerSimulationState(
        db,
        campaignB.id,
        playerSimulationState,
      ),
      simulation.insertSimulationReceipt(db, campaignB.id, simulationReceipt),
      simulation.updateSimulationState(db, campaignB.id, {
        ...simulationState,
        campaignId: campaignB.id,
        activeSeasonId: seasonB.id,
      }),
      simulation.updateClubSimulationState(db, campaignB.id, {
        ...clubSimulationState,
        campaignId: campaignB.id,
        clubId: clubB.id,
      }),
      simulation.updatePlayerSimulationState(db, campaignB.id, {
        ...playerSimulationState,
        campaignId: campaignB.id,
        playerId: id('player-b'),
      }),
      simulation.insertSimulationReceipt(db, campaignB.id, {
        ...simulationReceipt,
        campaignId: campaignB.id,
        operationKey: 'other',
        outcomeRefs: [{ kind: 'campaign', id: campaignB.id }],
      }),
    ]
    await Promise.all(
      attempts.map((attempt) =>
        expect(attempt).rejects.toMatchObject({ code: 'SCOPE' }),
      ),
    )
    expect(
      await Promise.all(db.tables.map((table) => table.toArray())),
    ).toEqual(before)
  })

  it('checks active season, entity existence and goalkeeper relationships', async () => {
    const db = await seed()
    await db.seasons.add(
      seasonSchema.parse({
        ...seasonA,
        id: 'closed-season',
        ordinal: 2,
        status: 'closed',
      }),
    )
    for (const activeSeasonId of [
      seasonB.id,
      id('closed-season'),
      id('missing'),
    ]) {
      await expect(
        simulation.insertSimulationState(db, campaignA.id, {
          ...simulationState,
          activeSeasonId,
        }),
      ).rejects.toMatchObject({ code: 'SCOPE' })
    }
    for (const clubId of [clubB.id, id('missing')])
      await expect(
        simulation.insertClubSimulationState(db, campaignA.id, {
          ...clubSimulationState,
          clubId,
        }),
      ).rejects.toMatchObject({ code: 'SCOPE' })
    for (const playerId of [id('player-b'), id('missing')])
      await expect(
        simulation.insertPlayerSimulationState(db, campaignA.id, {
          ...playerSimulationState,
          playerId,
        }),
      ).rejects.toMatchObject({ code: 'SCOPE' })
    await expect(
      simulation.insertPlayerSimulationState(db, campaignA.id, {
        ...playerSimulationState,
        goalkeeping: 50,
      }),
    ).rejects.toMatchObject({ code: 'SCOPE' })
    await db.players.add(
      playerSchema.parse({
        ...simulationPlayer,
        id: 'keeper',
        positionGroup: 'GK',
        positions: ['GK'],
      }),
    )
    const keeper = { ...playerSimulationState, playerId: id('keeper') }
    await expect(
      simulation.insertPlayerSimulationState(db, campaignA.id, keeper),
    ).rejects.toMatchObject({ code: 'SCOPE' })
    await simulation.insertPlayerSimulationState(db, campaignA.id, {
      ...keeper,
      goalkeeping: 70,
    })
    expect(await db.simulationStates.count()).toBe(0)
    expect(await db.clubSimulationStates.count()).toBe(0)
    expect(await db.playerSimulationStates.count()).toBe(1)
    await expect(
      simulation.insertSimulationState(db, id('missing'), {
        ...simulationState,
        campaignId: id('missing'),
      }),
    ).rejects.toMatchObject({ code: 'SCOPE' })
  })

  it('rejects foreign and missing references of every receipt entity kind', async () => {
    const db = await seed()
    const references = [
      { kind: 'campaign', id: campaignB.id },
      { kind: 'season', id: seasonB.id },
      { kind: 'club', id: clubB.id },
      { kind: 'player', id: 'player-b' },
      ...['campaign', 'season', 'club', 'player'].map((kind) => ({
        kind,
        id: 'missing',
      })),
    ]
    for (const ref of references) {
      const receipt = simulationReceiptSchema.parse({
        ...simulationReceipt,
        outcomeRefs: [ref],
      })
      await expect(
        simulation.insertSimulationReceipt(db, campaignA.id, receipt),
      ).rejects.toMatchObject({ code: 'SCOPE' })
    }
    expect(await db.simulationReceipts.count()).toBe(0)
  })

  it('validates writes, parses corrupt reads and keeps future versions intact', async () => {
    const db = await seed()
    await expect(
      simulation.insertSimulationState(db, campaignA.id, {
        ...simulationState,
        phase: 'invalid',
      } as unknown as SimulationState),
    ).rejects.toBeInstanceOf(z.ZodError)
    expect(await db.simulationStates.count()).toBe(0)
    const future = {
      ...simulationState,
      simulationVersion: '2',
    } as unknown as SimulationState
    await db.simulationStates.add(future)
    await expect(
      simulation.getSimulationState(db, campaignA.id),
    ).rejects.toMatchObject({ code: 'CORRUPT' })
    expect(await db.simulationStates.get(future.id)).toEqual(future)
    await db.clubSimulationStates.add({
      ...clubSimulationState,
      transferBalanceCents: -1,
    } as typeof clubSimulationState)
    await expect(
      simulation.listClubSimulationStates(db, campaignA.id),
    ).rejects.toMatchObject({ code: 'CORRUPT' })
    await db.playerSimulationStates.add({
      ...playerSimulationState,
      fitness: -1,
    })
    await expect(
      simulation.getPlayerSimulationState(
        db,
        campaignA.id,
        simulationPlayer.id,
      ),
    ).rejects.toMatchObject({ code: 'CORRUPT' })
    await db.simulationReceipts.add({
      ...simulationReceipt,
      inputFingerprint: '',
    })
    await expect(
      simulation.listSimulationReceipts(db, campaignA.id),
    ).rejects.toMatchObject({ code: 'CORRUPT' })
  })

  it('preserves logical identities on update and never inserts a missing update', async () => {
    const db = await seedFoundation()
    await expect(
      simulation.updateClubSimulationState(db, campaignA.id, {
        ...clubSimulationState,
        simulationKey: 'changed',
      }),
    ).rejects.toMatchObject({ code: 'SCOPE' })
    await expect(
      simulation.updatePlayerSimulationState(db, campaignA.id, {
        ...playerSimulationState,
        simulationKey: 'changed',
      }),
    ).rejects.toMatchObject({ code: 'SCOPE' })
    await expect(
      simulation.updateSimulationState(db, campaignA.id, {
        ...simulationState,
        rootSeed: 'changed',
      }),
    ).rejects.toMatchObject({ code: 'SCOPE' })
    await expect(
      simulation.updateSimulationState(db, campaignA.id, {
        ...simulationState,
        id: id('missing'),
      }),
    ).rejects.toMatchObject({ code: 'SCOPE' })
    expect(await simulation.getSimulationState(db, campaignA.id)).toEqual(
      simulationState,
    )
  })

  it('rolls back a composed command and preserves existing error mapping', async () => {
    const db = await seed()
    const result = await runCommand(
      db,
      [
        db.campaigns,
        db.seasons,
        db.simulationStates,
        db.simulationReceipts,
        db.clubs,
        db.players,
      ],
      {
        kind: 'update',
        campaignId: campaignA.id,
        expectedRevision: campaignA.revision,
      },
      async () => {
        await simulation.insertSimulationState(
          db,
          campaignA.id,
          simulationState,
        )
        await simulation.insertSimulationReceipt(db, campaignA.id, {
          ...simulationReceipt,
          outcomeRefs: [{ kind: 'club', id: clubB.id }],
        })
      },
    )
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION' })
    expect(await db.simulationStates.count()).toBe(0)
    expect(await db.simulationReceipts.count()).toBe(0)
    expect(await db.campaigns.get(campaignA.id)).toEqual(campaignA)
  })

  it('deletes all foundation rows through the campaign command while preserving another save', async () => {
    const db = await seedFoundation()
    const otherBefore = await Promise.all(
      db.tables.map((table) =>
        table.name === 'campaigns'
          ? table.get(campaignB.id)
          : table.where('campaignId').equals(campaignB.id).toArray(),
      ),
    )
    const result = await deleteCampaign(db, {
      campaignId: campaignA.id,
      expectedRevision: campaignA.revision,
      now: campaignA.updatedAt,
      auditEventId: 'delete-audit',
      actionId: 'delete-action',
    })
    expect(result.ok).toBe(true)
    for (const table of db.tables) {
      if (table.name === 'campaigns')
        expect(await table.get(campaignA.id)).toBeUndefined()
      else
        expect(
          await table.where('campaignId').equals(campaignA.id).count(),
        ).toBe(0)
    }
    expect(
      await Promise.all(
        db.tables.map((table) =>
          table.name === 'campaigns'
            ? table.get(campaignB.id)
            : table.where('campaignId').equals(campaignB.id).toArray(),
        ),
      ),
    ).toEqual(otherBefore)
  })

  it(
    'cleans foundation stores on legacy demo reset and creates no simulated career',
    { timeout: 20_000 },
    async () => {
      const db = await seedFoundation()
      const demoId = id('demo')
      await db.campaigns.add({ ...campaignA, id: demoId })
      await db.simulationStates.add({
        ...simulationState,
        id: id('demo-state'),
        campaignId: demoId,
      })
      await db.clubSimulationStates.add({
        ...clubSimulationState,
        id: id('demo-club-state'),
        campaignId: demoId,
      })
      await db.playerSimulationStates.add({
        ...playerSimulationState,
        id: id('demo-player-state'),
        campaignId: demoId,
      })
      await db.simulationReceipts.add({
        ...simulationReceipt,
        id: id('demo-receipt'),
        campaignId: demoId,
      })
      const result = await resetDemoCampaign(
        db,
        {
          campaignId: demoId,
          expectedRevision: campaignA.revision,
          now: campaignA.updatedAt,
          createAuditEventId: 'demo-create-audit',
          createActionId: 'demo-create',
          seedAuditEventId: 'demo-seed-audit',
          seedActionId: 'demo-seed',
        },
        () => {},
      )
      expect(result.ok).toBe(true)
      expect(await db.campaigns.get(demoId)).toMatchObject({
        mode: 'legacy',
        rulesMode: 'sandbox',
      })
      for (const table of [
        db.simulationStates,
        db.clubSimulationStates,
        db.playerSimulationStates,
        db.simulationReceipts,
      ]) {
        expect(await table.where('campaignId').equals(demoId).count()).toBe(0)
        expect(
          await table.where('campaignId').equals(campaignA.id).count(),
        ).toBe(1)
        expect(
          await table.where('campaignId').equals(campaignB.id).count(),
        ).toBe(1)
      }
    },
  )

  it('keeps old campaign creation legacy with raw mode defaults persisted', async () => {
    const db = database()
    const result = await createCampaign(db, harborInput)
    expect(result.ok).toBe(true)
    expect(await db.campaigns.get(campaignA.id)).toMatchObject({
      mode: 'legacy',
      rulesMode: 'sandbox',
    })
    expect(await db.simulationStates.count()).toBe(0)
  })
})
