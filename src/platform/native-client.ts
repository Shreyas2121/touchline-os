import { call } from './native-commands'
import { type GameClient } from './game-client'

export function createNativeClient(): GameClient {
  return {
    previewDevelopment: (campaignId) =>
      call('preview_development', { campaignId }),
    applyDevelopment: (request) => call('apply_development', { request }),
    previewSeason: (campaignId) => call('preview_season', { campaignId }),
    settleSeason: (request) => call('settle_season', { request }),
    health: () => call('health'),
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
    settleTransfer: (request) => call('settle_transfer', { request }),
    matchdayView: (campaignId, round) =>
      call('matchday_view', { campaignId, round }),
    previewMarket: (campaignId) => call('preview_market', { campaignId }),
    transferBoard: (campaignId) => call('transfer_board', { campaignId }),
    runMarket: (request) => call('run_market', { request }),
    closeWindow: (request) => call('close_window', { request }),
    proposeTransfer: (request) => call('propose_transfer', { request }),
    respondNegotiation: (request) => call('respond_negotiation', { request }),
    respondOffer: (request) => call('respond_offer', { request }),
  }
}
