/// <reference types="node" />
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { invoke } from '@tauri-apps/api/core'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest'
import { createNativeClient } from '../platform/native-client'
import { call, type NativeCommands } from '../platform/native-commands'
import type { GameClient } from '../platform/game-client'
import type { CreationRequest } from '../platform/generated/CreationRequest'
import type { ManagementCommand } from '../platform/generated/ManagementCommand'
import type { ScreenQuery } from '../platform/generated/ScreenQuery'
import type { PreviewQuery } from '../platform/generated/PreviewQuery'
import type { HealthReport } from '../platform/generated/HealthReport'
import type { CampaignPage } from '../platform/generated/CampaignPage'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const campaignId = 'campaign-1'
const playerId = 'player-2'
const now = '2026-10-24T10:00:00.000Z'
const exportId = '00000000-0000-4000-8000-000000000001'
const query: ScreenQuery = {
  campaignId,
  screen: 'squad',
  page: 2,
  search: 'Smith',
  allPlayers: true,
}
const policy: PreviewQuery = {
  campaignId,
  expectedRevision: 3,
  effectiveDate: '2026-10-24',
  action: { type: 'window-close', unresolvedQualifyingOffers: 0 },
}
const creation: CreationRequest = {
  kind: 'career',
  resetRevision: null,
  career: {
    campaignId,
    name: 'Career',
    seed: 'seed',
    startYear: 2026,
    clubKey: 'club-1',
    rulesMode: 'sandbox',
    preset: 'balanced',
    now,
    seasonId: 'season-1',
    clockId: 'clock-1',
    constitutionId: 'constitution-1',
    allocationId: 'allocation-1',
    receiptId: 'receipt-1',
    auditEventId: 'audit-1',
    actionId: 'action-1',
  },
}
const management: ManagementCommand = {
  campaignId,
  expectedRevision: 3,
  actionId: 'action-1',
  auditId: 'audit-1',
  now,
  action: { type: 'rename', name: 'New name' },
}
// A complete request payload shared by the transport-only mutation cases.
const mutation = {
  campaignId,
  playerId,
  expectedRevision: 3,
  sourceDate: '2026-10-24',
  sourceBoundaryKey: null,
  targetBoundaryKey: 'next',
  targetDate: '2026-10-25',
  actionId: 'action-1',
  auditId: 'audit-1',
  receiptId: 'receipt-1',
  now,
  negotiationId: 'negotiation-1',
  offerId: 'offer-1',
  transferId: 'transfer-1',
  contractId: 'contract-1',
  registrationId: null,
  negotiationIds: ['negotiation-2'],
  offerIds: ['offer-2'],
  transferIds: ['transfer-2'],
  contractIds: ['contract-2'],
  ledgerIds: ['ledger-1'],
  registrationIds: [],
  fixtureIds: ['fixture-1'],
  matchIds: ['match-1'],
  appearanceIds: ['appearance-1'],
  feeCents: 100,
  wageCents: 50,
  squadTier: 'rotation' as const,
  decision: 'accept' as const,
  seasonId: 'season-1',
  inputFingerprint: 'lifecycle-v1-test',
  ids: {
    players: [],
    playerStates: [],
    contracts: [],
    registrations: [],
    ledger: [],
    fixtures: [],
    seasons: [],
    settlements: [],
    objectives: [],
    snapshots: [],
  },
}

type Mapping = {
  run: (client: GameClient) => Promise<unknown>
  command: keyof NativeCommands
  args?: object
}
const mappings = {
  health: { run: (c) => c.health(), command: 'health' },
  campaigns: {
    run: (c) => c.campaigns(2),
    command: 'list_campaigns',
    args: { page: 2 },
  },
  screen: {
    run: (c) => c.screen(query),
    command: 'read_screen',
    args: { query },
  },
  player: {
    run: (c) => c.player(campaignId, playerId),
    command: 'read_player',
    args: { campaignId, playerId },
  },
  planning: {
    run: (c) => c.planning(campaignId, playerId),
    command: 'player_planning',
    args: { campaignId, playerId },
  },
  previewPolicy: {
    run: (c) => c.previewPolicy(policy),
    command: 'preview_policy',
    args: { query: policy },
  },
  selectImport: { run: (c) => c.selectImport(), command: 'select_import' },
  confirmImport: {
    run: (c) => c.confirmImport('token-1'),
    command: 'confirm_import',
    args: { token: 'token-1' },
  },
  cancelImport: { run: (c) => c.cancelImport(), command: 'cancel_import' },
  exportCampaign: {
    run: (c) => c.exportCampaign(campaignId),
    command: 'export_campaign',
    args: { campaignId, exportId, exportedAt: now },
  },
  backupDatabase: {
    run: (c) => c.backupDatabase(),
    command: 'backup_database',
  },
  createCareer: {
    run: (c) => c.createCareer(creation),
    command: 'create_career',
    args: { request: creation },
  },
  previewCreation: {
    run: (c) => c.previewCreation(creation),
    command: 'preview_creation',
    args: { request: creation },
  },
  manage: {
    run: (c) => c.manage(management),
    command: 'manage_campaign',
    args: { command: management },
  },
  previewTime: {
    run: (c) => c.previewTime(campaignId),
    command: 'preview_time',
    args: { campaignId },
  },
  advanceTime: {
    run: (c) => c.advanceTime(mutation),
    command: 'advance_time',
    args: { request: mutation },
  },
  previewMatchday: {
    run: (c) => c.previewMatchday(campaignId),
    command: 'preview_matchday',
    args: { campaignId },
  },
  simMatchday: {
    run: (c) => c.simMatchday(mutation),
    command: 'sim_matchday',
    args: { request: mutation },
  },
  settleTransfer: {
    run: (c) => c.settleTransfer(mutation),
    command: 'settle_transfer',
    args: { request: mutation },
  },
  previewDevelopment: {
    run: (c) => c.previewDevelopment(campaignId),
    command: 'preview_development',
    args: { campaignId },
  },
  applyDevelopment: {
    run: (c) => c.applyDevelopment(mutation),
    command: 'apply_development',
    args: { request: mutation },
  },
  previewSeason: {
    run: (c) => c.previewSeason(campaignId),
    command: 'preview_season',
    args: { campaignId },
  },
  settleSeason: {
    run: (c) => c.settleSeason(mutation),
    command: 'settle_season',
    args: { request: mutation },
  },
  matchdayView: {
    run: (c) => c.matchdayView(campaignId, 4),
    command: 'matchday_view',
    args: { campaignId, round: 4 },
  },
  previewMarket: {
    run: (c) => c.previewMarket(campaignId),
    command: 'preview_market',
    args: { campaignId },
  },
  transferBoard: {
    run: (c) => c.transferBoard(campaignId),
    command: 'transfer_board',
    args: { campaignId },
  },
  runMarket: {
    run: (c) => c.runMarket(mutation),
    command: 'run_market',
    args: { request: mutation },
  },
  closeWindow: {
    run: (c) => c.closeWindow(mutation),
    command: 'close_window',
    args: { request: mutation },
  },
  proposeTransfer: {
    run: (c) => c.proposeTransfer(mutation),
    command: 'propose_transfer',
    args: { request: mutation },
  },
  respondNegotiation: {
    run: (c) => c.respondNegotiation(mutation),
    command: 'respond_negotiation',
    args: { request: mutation },
  },
  respondOffer: {
    run: (c) => c.respondOffer(mutation),
    command: 'respond_offer',
    args: { request: mutation },
  },
} satisfies Record<keyof GameClient, Mapping>

describe('native client adapter', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date(now))
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(exportId)
  })

  for (const [method, mapping] of Object.entries<Mapping>(mappings)) {
    it(`forwards ${method} arguments and result`, async () => {
      const result = { marker: method }
      vi.mocked(invoke).mockResolvedValueOnce(result)
      await expect(mapping.run(createNativeClient())).resolves.toBe(result)
      expect(invoke).toHaveBeenCalledExactlyOnceWith(
        mapping.command,
        mapping.args,
      )
    })

    it(`converts structured ${method} errors`, async () => {
      const error = { code: 'CONFLICT', message: 'Reload the save.' }
      vi.mocked(invoke).mockRejectedValueOnce(error)
      await expect(mapping.run(createNativeClient())).rejects.toEqual(error)
    })
  }

  it.each([
    { code: 'VALIDATION', message: 'Invalid request.' },
    JSON.stringify({ code: 'SCOPE', message: 'Wrong campaign.' }),
    {
      message: JSON.stringify({ code: 'UNAVAILABLE', message: 'Unavailable.' }),
    },
  ])('preserves supported serialized error forms', async (error) => {
    vi.mocked(invoke).mockRejectedValueOnce(error)
    await expect(createNativeClient().campaigns(0)).rejects.toMatchObject({
      code: expect.stringMatching(/VALIDATION|SCOPE|UNAVAILABLE/),
    })
  })

  it('hides unexpected errors, including health failures', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('private details'))
    for (const run of [
      () => createNativeClient().health(),
      () => createNativeClient().campaigns(0),
    ]) {
      await expect(run()).rejects.toEqual({
        code: 'INTERNAL',
        message: 'The native shell returned an unexpected error.',
      })
    }
  })

  it('forwards null matchday rounds and canceled dialog results', async () => {
    const client = createNativeClient()
    vi.mocked(invoke).mockResolvedValueOnce(null)
    await expect(client.matchdayView(campaignId, null)).resolves.toBeNull()
    expect(invoke).toHaveBeenLastCalledWith('matchday_view', {
      campaignId,
      round: null,
    })
    vi.mocked(invoke).mockResolvedValueOnce(null)
    await expect(client.selectImport()).resolves.toBeNull()
    vi.mocked(invoke).mockResolvedValueOnce(false)
    await expect(client.exportCampaign(campaignId)).resolves.toBe(false)
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    await expect(client.cancelImport()).resolves.toBeUndefined()
  })

  it('keeps command names, wire arguments and results aligned with Rust handlers', () => {
    const rust = readFileSync(path.join(root, 'src-tauri/src/lib.rs'), 'utf8')
    const source = ts.createSourceFile(
      'native-commands.ts',
      readFileSync(path.join(root, 'src/platform/native-commands.ts'), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    const map = source.statements.find(
      (node) =>
        ts.isTypeAliasDeclaration(node) && node.name.text === 'NativeCommands',
    )
    if (
      !map ||
      !ts.isTypeAliasDeclaration(map) ||
      !ts.isTypeLiteralNode(map.type)
    )
      throw new Error('Missing NativeCommands')
    const contracts = Object.fromEntries(
      map.type.members.map((member) => {
        if (
          !ts.isPropertySignature(member) ||
          !member.type ||
          !ts.isTypeReferenceNode(member.type)
        )
          throw new Error('Expected command contract')
        const [args, result] = member.type.typeArguments ?? []
        if (!args || !result) throw new Error('Missing args/result')
        const fields = ts.isTypeLiteralNode(args)
          ? args.members.map((field) => {
              if (!ts.isPropertySignature(field) || !field.type)
                throw new Error('Expected argument')
              return [field.name.getText(source), field.type.getText(source)]
            })
          : []
        return [
          member.name.getText(source),
          { args: Object.fromEntries(fields), result: result.getText(source) },
        ]
      }),
    )
    const wireType = (type: string): string => {
      const normalized = type.trim().replaceAll('game_app::', '')
      if (normalized.startsWith('Option<'))
        return `${wireType(normalized.slice(7, -1))} | null`
      return (
        { String: 'string', bool: 'boolean', '()': 'void' }[normalized] ??
        normalized
      )
    }
    const handlers = [
      ...rust.matchAll(
        /#\[tauri::command\]\s*(?:async )?fn (\w+)\(([\s\S]*?)\) -> Result<([\s\S]*?), CommandError>/g,
      ),
    ]
    expect(handlers.map((match) => match[1]).sort()).toEqual(
      Object.keys(contracts).sort(),
    )
    expect(
      Object.values(mappings)
        .map((value) => value.command)
        .sort(),
    ).toEqual(Object.keys(contracts).sort())
    for (const [, name, parameters, result] of handlers) {
      const args = Object.fromEntries(
        [
          ...parameters.matchAll(
            /(\w+): (game_app::\w+|String|Option<game_app::\w+>)/g,
          ),
        ].map(([, key, type]) => [
          key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
          wireType(type),
        ]),
      )
      expect(contracts[name], name).toEqual({ args, result: wireType(result) })
      expect(rust).toMatch(new RegExp(`\\b${name},?\\s`))
    }
    const registered = rust
      .match(/tauri::generate_handler!\[([\s\S]*?)\]/)?.[1]
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean)
    expect(registered?.sort()).toEqual(Object.keys(contracts).sort())
  })
})

// Compiled by pnpm typecheck, never invoked at runtime.
function commandTypeChecks() {
  expectTypeOf(call('health')).toEqualTypeOf<Promise<HealthReport>>()
  expectTypeOf(call('list_campaigns', { page: 0 })).toEqualTypeOf<
    Promise<CampaignPage>
  >()
  // @ts-expect-error Unknown command name.
  void call('list_campaign')
  // @ts-expect-error Required arguments cannot be omitted.
  void call('read_player')
  // @ts-expect-error Arguments use camelCase.
  void call('read_player', { campaign_id: campaignId, player_id: playerId })
  // @ts-expect-error Page must be a generated SafeInt (number).
  void call('list_campaigns', { page: '0' })
  // @ts-expect-error Health accepts no arguments.
  void call('health', {})
  // @ts-expect-error Extra wire arguments are rejected.
  void call('list_campaigns', { page: 0, unknown: true })
  // @ts-expect-error Generated request fields are required.
  void call('advance_time', { request: { campaignId } })
}
void commandTypeChecks
