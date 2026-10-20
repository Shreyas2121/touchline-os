import Dexie, { type EntityTable, type Table } from 'dexie'
import type { ZodType } from 'zod'
import {
  clubSimulationStateSchema,
  playerSimulationStateSchema,
  simulationReceiptSchema,
  simulationStateSchema,
  type ClubSimulationState,
  type PlayerSimulationState,
  type SimulationReceipt,
  type SimulationState,
} from '../../domain/simulation/schemas'
import type { EntityId } from '../../domain/validation/schemas'
import { parseStored, type TouchlineDatabase } from '../db'
import { PersistenceError } from '../errors'
import { getCampaign } from './campaigns'
import { getClub } from './clubs'
import { getPlayer } from './players'
import { getSeason } from './seasons'

type ScopedRow = { id: EntityId; campaignId: EntityId }

function scopeError(message = 'Row is not in this campaign.'): never {
  throw new PersistenceError('SCOPE', message)
}

function parseSimulationStored<T>(schema: ZodType<T>, row: unknown): T {
  if (typeof row === 'object' && row !== null) {
    if (
      ('simulationVersion' in row && row.simulationVersion !== '1') ||
      ('calendarVersion' in row && row.calendarVersion !== '1')
    ) {
      throw new PersistenceError(
        'CORRUPT',
        'Unsupported simulation or calendar version. Update Touchline OS to open this save.',
      )
    }
  }
  return parseStored(schema, row)
}

async function readOne<T>(
  schema: ZodType<T>,
  query: PromiseLike<unknown>,
): Promise<T | undefined> {
  const row = await query
  return row === undefined ? undefined : parseSimulationStored(schema, row)
}

async function listRows<T extends ScopedRow>(
  table: EntityTable<T, 'id'>,
  schema: ZodType<T>,
  campaignId: EntityId,
): Promise<T[]> {
  const rows = await table.where('campaignId').equals(campaignId).toArray()
  return rows.map((row) => parseSimulationStored(schema, row))
}

// Validate relationships and write in one transaction, also when used directly.
// Updates preserve stable identity; receipts are append-only.
function writeRow<T extends ScopedRow>(
  database: TouchlineDatabase,
  table: EntityTable<T, 'id'>,
  schema: ZodType<T>,
  campaignId: EntityId,
  input: T,
  relatedTables: Table[],
  validate: (row: T) => Promise<void>,
  identity: (keyof T)[] | null,
): Promise<void> {
  return Dexie.Promise.resolve()
    .then(() => {
      const row = schema.parse(input)
      if (row.campaignId !== campaignId) scopeError()
      const write = async () => {
        if (!(await getCampaign(database, campaignId)))
          scopeError('Campaign does not exist.')
        const stored = await table.get(row.id)
        if (stored !== undefined) {
          if (stored.campaignId !== campaignId) scopeError()
          const previous = parseSimulationStored(schema, stored)
          if (
            identity !== null &&
            identity.some((key) => previous[key] !== row[key])
          ) {
            scopeError('Simulation identity cannot change.')
          }
        } else if (identity !== null) {
          scopeError('Simulation row does not exist.')
        }
        await validate(row)
        if (identity === null) await table.add(row)
        else await table.put(row)
      }
      // Dexie nests this scope within a command transaction when one is active.
      return database.transaction(
        'rw',
        [table, database.campaigns, ...relatedTables],
        write,
      )
    })
    .catch((error: unknown) => {
      if (error instanceof Dexie.ConstraintError) {
        throw new PersistenceError(
          'DUPLICATE',
          'Simulation identity or logical key already exists.',
        )
      }
      throw error
    })
}

export function getSimulationState(
  database: TouchlineDatabase,
  campaignId: EntityId,
): Promise<SimulationState | undefined> {
  return readOne(
    simulationStateSchema,
    database.simulationStates.where('campaignId').equals(campaignId).first(),
  )
}

function writeSimulationState(
  database: TouchlineDatabase,
  campaignId: EntityId,
  state: SimulationState,
  update: boolean,
): Promise<void> {
  return writeRow(
    database,
    database.simulationStates,
    simulationStateSchema,
    campaignId,
    state,
    [database.seasons],
    async (row) => {
      const campaign = await getCampaign(database, campaignId)
      const season = await getSeason(database, campaignId, row.activeSeasonId)
      if (
        campaign?.activeSeasonId !== row.activeSeasonId ||
        season?.status !== 'active'
      ) {
        scopeError(
          'Simulation state must reference the campaign active season.',
        )
      }
    },
    update ? ['rootSeed', 'simulationVersion', 'calendarVersion'] : null,
  )
}

export function insertSimulationState(
  database: TouchlineDatabase,
  campaignId: EntityId,
  state: SimulationState,
): Promise<void> {
  return writeSimulationState(database, campaignId, state, false)
}

export function updateSimulationState(
  database: TouchlineDatabase,
  campaignId: EntityId,
  state: SimulationState,
): Promise<void> {
  return writeSimulationState(database, campaignId, state, true)
}

export function getClubSimulationState(
  database: TouchlineDatabase,
  campaignId: EntityId,
  clubId: EntityId,
): Promise<ClubSimulationState | undefined> {
  return readOne(
    clubSimulationStateSchema,
    database.clubSimulationStates
      .where('[campaignId+clubId]')
      .equals([campaignId, clubId])
      .first(),
  )
}

export function listClubSimulationStates(
  database: TouchlineDatabase,
  campaignId: EntityId,
): Promise<ClubSimulationState[]> {
  return listRows(
    database.clubSimulationStates,
    clubSimulationStateSchema,
    campaignId,
  )
}

function writeClubSimulationState(
  database: TouchlineDatabase,
  campaignId: EntityId,
  state: ClubSimulationState,
  update: boolean,
): Promise<void> {
  return writeRow(
    database,
    database.clubSimulationStates,
    clubSimulationStateSchema,
    campaignId,
    state,
    [database.clubs],
    async (row) => {
      if (!(await getClub(database, campaignId, row.clubId)))
        scopeError('Club is not in this campaign.')
    },
    update ? ['clubId', 'simulationKey'] : null,
  )
}

export function insertClubSimulationState(
  database: TouchlineDatabase,
  campaignId: EntityId,
  state: ClubSimulationState,
): Promise<void> {
  return writeClubSimulationState(database, campaignId, state, false)
}

export function updateClubSimulationState(
  database: TouchlineDatabase,
  campaignId: EntityId,
  state: ClubSimulationState,
): Promise<void> {
  return writeClubSimulationState(database, campaignId, state, true)
}

export function getPlayerSimulationState(
  database: TouchlineDatabase,
  campaignId: EntityId,
  playerId: EntityId,
): Promise<PlayerSimulationState | undefined> {
  return readOne(
    playerSimulationStateSchema,
    database.playerSimulationStates
      .where('[campaignId+playerId]')
      .equals([campaignId, playerId])
      .first(),
  )
}

export function listPlayerSimulationStates(
  database: TouchlineDatabase,
  campaignId: EntityId,
): Promise<PlayerSimulationState[]> {
  return listRows(
    database.playerSimulationStates,
    playerSimulationStateSchema,
    campaignId,
  )
}

function writePlayerSimulationState(
  database: TouchlineDatabase,
  campaignId: EntityId,
  state: PlayerSimulationState,
  update: boolean,
): Promise<void> {
  return writeRow(
    database,
    database.playerSimulationStates,
    playerSimulationStateSchema,
    campaignId,
    state,
    [database.players],
    async (row) => {
      const player = await getPlayer(database, campaignId, row.playerId)
      if (!player) scopeError('Player is not in this campaign.')
      if ((player.positionGroup === 'GK') !== (row.goalkeeping !== null)) {
        scopeError(
          'Goalkeeping must be known for a goalkeeper and null for outfield players.',
        )
      }
    },
    update ? ['playerId', 'simulationKey'] : null,
  )
}

export function insertPlayerSimulationState(
  database: TouchlineDatabase,
  campaignId: EntityId,
  state: PlayerSimulationState,
): Promise<void> {
  return writePlayerSimulationState(database, campaignId, state, false)
}

export function updatePlayerSimulationState(
  database: TouchlineDatabase,
  campaignId: EntityId,
  state: PlayerSimulationState,
): Promise<void> {
  return writePlayerSimulationState(database, campaignId, state, true)
}

export function getSimulationReceipt(
  database: TouchlineDatabase,
  campaignId: EntityId,
  operationKey: string,
): Promise<SimulationReceipt | undefined> {
  return readOne(
    simulationReceiptSchema,
    database.simulationReceipts
      .where('[campaignId+operationKey]')
      .equals([campaignId, operationKey])
      .first(),
  )
}

export function listSimulationReceipts(
  database: TouchlineDatabase,
  campaignId: EntityId,
): Promise<SimulationReceipt[]> {
  return listRows(
    database.simulationReceipts,
    simulationReceiptSchema,
    campaignId,
  )
}

export function insertSimulationReceipt(
  database: TouchlineDatabase,
  campaignId: EntityId,
  receipt: SimulationReceipt,
): Promise<void> {
  return writeRow(
    database,
    database.simulationReceipts,
    simulationReceiptSchema,
    campaignId,
    receipt,
    [database.seasons, database.clubs, database.players],
    async (row) => {
      for (const ref of row.outcomeRefs) {
        switch (ref.kind) {
          case 'campaign':
            if (ref.id !== campaignId) scopeError()
            break
          case 'season':
            if (!(await getSeason(database, campaignId, ref.id)))
              scopeError('Season is not in this campaign.')
            break
          case 'club':
            if (!(await getClub(database, campaignId, ref.id)))
              scopeError('Club is not in this campaign.')
            break
          case 'player':
            if (!(await getPlayer(database, campaignId, ref.id)))
              scopeError('Player is not in this campaign.')
            break
          case 'boundary':
            // A boundary is a campaign-local logical key, not an entity ID.
            break
        }
      }
    },
    null,
  )
}
