// Frozen after P02-G02. A new index or table is a new Dexie version, not an edit of this object.
export const schemaV1 = {
  campaigns: 'id, kind, managedClubId, activeSeasonId, updatedAt',
  seasons: 'id, campaignId, &[campaignId+ordinal], [campaignId+status]',
  leagues: 'id, campaignId',
  clubs: 'id, campaignId, [campaignId+leagueId]',
  players:
    'id, campaignId, [campaignId+clubId], [campaignId+positionGroup], [campaignId+name]',
  contracts:
    'id, campaignId, [campaignId+playerId], [campaignId+clubId], [campaignId+status]',
  constitutions: 'id, campaignId, &[campaignId+version]',
  ledgerEntries:
    'id, campaignId, [campaignId+seasonId], [campaignId+clubId], sourceActionId, reversesEntryId',
  transfers:
    'id, campaignId, [campaignId+seasonId], [campaignId+playerId], sourceActionId',
  offers:
    'id, campaignId, [campaignId+seasonId], [campaignId+playerId], [campaignId+status]',
  lineups: 'id, campaignId, [campaignId+seasonId]',
  registrations:
    'id, campaignId, &[campaignId+seasonId+competitionKey+playerId], [campaignId+competitionKey]',
  matchRecords: 'id, campaignId, [campaignId+seasonId], [campaignId+date]',
  appearances:
    'id, campaignId, &[matchId+playerId], [campaignId+seasonId], [campaignId+playerId]',
  shortlistItems: 'id, campaignId, &[campaignId+playerId]',
  scoutingReports:
    'id, campaignId, [campaignId+playerId], [campaignId+seasonId]',
  developmentPlans: 'id, campaignId, &[campaignId+playerId+seasonId]',
  auditEvents: 'id, campaignId, &actionId, [campaignId+createdAt]',
  importReceipts: 'id, campaignId, importedAt',
} as const
