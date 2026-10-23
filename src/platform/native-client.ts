import { invoke } from '@tauri-apps/api/core'
import { mapInvokeError } from './errors'
import { type GameClient } from './game-client'
import type { HealthReport } from './generated/HealthReport'

export function createNativeClient(): GameClient {
  return {
    async health(): Promise<HealthReport> {
      try {
        return await invoke<HealthReport>('health')
      } catch (error) {
        throw mapInvokeError(error)
      }
    },
    campaigns: (page) => call('list_campaigns', { page }),
    screen: (query) => call('read_screen', { query }),
    player: (campaignId, playerId) =>
      call('read_player', { campaignId, playerId }),
    planning: (campaignId, playerId) =>
      call('player_planning', { campaignId, playerId }),
    previewPolicy: (query) => call('preview_policy', { query }),
    selectImport: () => call('select_import'),
    confirmImport: (token) => call('confirm_import', { token }),
    cancelImport: () => call('cancel_import'),
    exportCampaign: (campaignId) =>
      call('export_campaign', {
        campaignId,
        exportId: crypto.randomUUID(),
        exportedAt: new Date().toISOString(),
      }),
    backupDatabase: () => call('backup_database'),
    createCareer: (request) => call('create_career', { request }),
    previewCreation: (request) => call('preview_creation', { request }),
    manage: (command) => call('manage_campaign', { command }),
    previewTime: (campaignId) => call('preview_time', { campaignId }),
    advanceTime: (request) => call('advance_time', { request }),
    previewMatchday: (campaignId) => call('preview_matchday', { campaignId }),
    simMatchday: (request) => call('sim_matchday', { request }),
    matchdayView: (campaignId, round) =>
      call('matchday_view', { campaignId, round }),
  }
}

async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    throw mapInvokeError(error)
  }
}
