-- Fresh standalone schema 2. Earlier database versions are unsupported.
CREATE TABLE campaigns (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('fictional', 'imported')),
  mode TEXT NOT NULL CHECK (mode = 'standalone'),
  rulesMode TEXT NOT NULL CHECK (rulesMode IN ('challenge', 'sandbox')),
  seed TEXT NOT NULL,
  generatorVersion TEXT NOT NULL CHECK (generatorVersion = '2'),
  managedClubId TEXT NOT NULL CHECK (length(managedClubId) BETWEEN 1 AND 64 AND managedClubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  activeSeasonId TEXT NOT NULL CHECK (length(activeSeasonId) BETWEEN 1 AND 64 AND activeSeasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  currency TEXT NOT NULL CHECK (currency = 'EUR'),
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision BETWEEN 0 AND 9007199254740991),
  status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
  FOREIGN KEY (id, managedClubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (id, activeSeasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE INDEX idx_campaigns_kind ON campaigns (kind);
CREATE INDEX idx_campaigns_managedClubId ON campaigns (managedClubId);
CREATE INDEX idx_campaigns_activeSeasonId ON campaigns (activeSeasonId);
CREATE INDEX idx_campaigns_updatedAt ON campaigns (updatedAt);
CREATE TABLE seasons (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  label TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN -9007199254740991 AND 9007199254740991) CHECK (ordinal >= 1),
  status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
  startDate TEXT,
  endDate TEXT,
  openedAt TEXT NOT NULL,
  closedAt TEXT,
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (campaignId, ordinal)
) STRICT;
CREATE INDEX idx_seasons_campaignId ON seasons (campaignId);
CREATE INDEX idx_seasons_campaignId_status ON seasons (campaignId, status);
CREATE TABLE leagues (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  name TEXT NOT NULL,
  countryCode TEXT,
  tier INTEGER CHECK (tier BETWEEN -9007199254740991 AND 9007199254740991),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id)
) STRICT;
CREATE INDEX idx_leagues_campaignId ON leagues (campaignId);
CREATE TABLE clubs (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  leagueId TEXT CHECK (length(leagueId) BETWEEN 1 AND 64 AND leagueId NOT GLOB '*[^a-zA-Z0-9-]*'),
  name TEXT NOT NULL,
  shortName TEXT NOT NULL,
  colors TEXT NOT NULL CHECK (json_valid(colors)),
  prestige INTEGER NOT NULL CHECK (prestige BETWEEN -9007199254740991 AND 9007199254740991),
  academyTier INTEGER NOT NULL CHECK (academyTier BETWEEN -9007199254740991 AND 9007199254740991),
  scoutingRegion TEXT,
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, leagueId) REFERENCES leagues(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id)
) STRICT;
CREATE INDEX idx_clubs_campaignId ON clubs (campaignId);
CREATE INDEX idx_clubs_campaignId_leagueId ON clubs (campaignId, leagueId);
CREATE TABLE players (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  clubId TEXT CHECK (length(clubId) BETWEEN 1 AND 64 AND clubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  name TEXT NOT NULL,
  positionGroup TEXT NOT NULL CHECK (positionGroup IN ('GK', 'DEF', 'MID', 'FWD', 'UNKNOWN')),
  positions TEXT NOT NULL CHECK (json_valid(positions)),
  nationalityCode TEXT,
  birthDate TEXT,
  reportedAge INTEGER CHECK (reportedAge BETWEEN -9007199254740991 AND 9007199254740991),
  ageReferenceSeasonOrdinal INTEGER CHECK (ageReferenceSeasonOrdinal BETWEEN -9007199254740991 AND 9007199254740991),
  marketValueCents INTEGER CHECK (marketValueCents BETWEEN 0 AND 9007199254740991),
  attributes TEXT NOT NULL CHECK (json_valid(attributes)),
  potential INTEGER CHECK (potential BETWEEN -9007199254740991 AND 9007199254740991),
  source TEXT NOT NULL CHECK (source IN ('fictional', 'imported', 'user-entered', 'estimated', 'generated')),
  externalSourceId TEXT,
  isNewgen INTEGER NOT NULL CHECK (isNewgen IN (0, 1)),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, clubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id)
) STRICT;
CREATE INDEX idx_players_campaignId ON players (campaignId);
CREATE INDEX idx_players_campaignId_clubId ON players (campaignId, clubId);
CREATE INDEX idx_players_campaignId_positionGroup ON players (campaignId, positionGroup);
CREATE INDEX idx_players_campaignId_name ON players (campaignId, name);
CREATE TABLE contracts (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  playerId TEXT NOT NULL CHECK (length(playerId) BETWEEN 1 AND 64 AND playerId NOT GLOB '*[^a-zA-Z0-9-]*'),
  clubId TEXT NOT NULL CHECK (length(clubId) BETWEEN 1 AND 64 AND clubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  weeklyWageCents INTEGER CHECK (weeklyWageCents BETWEEN 0 AND 9007199254740991),
  squadTier TEXT CHECK (squadTier IN ('key', 'rotation', 'youth')),
  startsOn TEXT,
  expiresOn TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'ended')),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, playerId) REFERENCES players(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, clubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id)
) STRICT;
CREATE INDEX idx_contracts_campaignId ON contracts (campaignId);
CREATE INDEX idx_contracts_campaignId_playerId ON contracts (campaignId, playerId);
CREATE INDEX idx_contracts_campaignId_clubId ON contracts (campaignId, clubId);
CREATE INDEX idx_contracts_campaignId_status ON contracts (campaignId, status);
CREATE TABLE constitutions (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  version INTEGER NOT NULL CHECK (version BETWEEN -9007199254740991 AND 9007199254740991),
  rules TEXT NOT NULL CHECK (json_valid(rules)),
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (campaignId, version)
) STRICT;
CREATE INDEX idx_constitutions_campaignId ON constitutions (campaignId);
CREATE TABLE ledgerEntries (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT NOT NULL CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  clubId TEXT NOT NULL CHECK (length(clubId) BETWEEN 1 AND 64 AND clubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  kind TEXT NOT NULL CHECK (kind IN ('initial_allocation', 'player_sale', 'prize_income', 'approved_carryover', 'incoming_fee', 'reversal')),
  amountCents INTEGER NOT NULL CHECK (amountCents BETWEEN 0 AND 9007199254740991),
  effectiveOn TEXT NOT NULL,
  sourceActionId TEXT NOT NULL CHECK (length(sourceActionId) BETWEEN 1 AND 64 AND sourceActionId NOT GLOB '*[^a-zA-Z0-9-]*'),
  reversesEntryId TEXT CHECK (length(reversesEntryId) BETWEEN 1 AND 64 AND reversesEntryId NOT GLOB '*[^a-zA-Z0-9-]*'),
  note TEXT,
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, clubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, reversesEntryId) REFERENCES ledgerEntries(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  CHECK (reversesEntryId IS NULL OR reversesEntryId <> id)
) STRICT;
CREATE INDEX idx_ledgerEntries_campaignId ON ledgerEntries (campaignId);
CREATE INDEX idx_ledgerEntries_campaignId_seasonId ON ledgerEntries (campaignId, seasonId);
CREATE INDEX idx_ledgerEntries_campaignId_clubId ON ledgerEntries (campaignId, clubId);
CREATE INDEX idx_ledgerEntries_sourceActionId ON ledgerEntries (sourceActionId);
CREATE INDEX idx_ledgerEntries_reversesEntryId ON ledgerEntries (reversesEntryId);
CREATE TABLE transfers (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT NOT NULL CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  playerId TEXT NOT NULL CHECK (length(playerId) BETWEEN 1 AND 64 AND playerId NOT GLOB '*[^a-zA-Z0-9-]*'),
  fromClubId TEXT CHECK (length(fromClubId) BETWEEN 1 AND 64 AND fromClubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  toClubId TEXT CHECK (length(toClubId) BETWEEN 1 AND 64 AND toClubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  feeCents INTEGER NOT NULL CHECK (feeCents BETWEEN 0 AND 9007199254740991),
  kind TEXT NOT NULL CHECK (kind IN ('sale', 'purchase', 'free')),
  effectiveOn TEXT NOT NULL,
  sourceActionId TEXT NOT NULL CHECK (length(sourceActionId) BETWEEN 1 AND 64 AND sourceActionId NOT GLOB '*[^a-zA-Z0-9-]*'),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, playerId) REFERENCES players(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, fromClubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, toClubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id)
) STRICT;
CREATE INDEX idx_transfers_campaignId ON transfers (campaignId);
CREATE INDEX idx_transfers_campaignId_seasonId ON transfers (campaignId, seasonId);
CREATE INDEX idx_transfers_campaignId_playerId ON transfers (campaignId, playerId);
CREATE INDEX idx_transfers_sourceActionId ON transfers (sourceActionId);
CREATE TABLE offers (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT NOT NULL CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  playerId TEXT NOT NULL CHECK (length(playerId) BETWEEN 1 AND 64 AND playerId NOT GLOB '*[^a-zA-Z0-9-]*'),
  bidderClubId TEXT NOT NULL CHECK (length(bidderClubId) BETWEEN 1 AND 64 AND bidderClubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  feeCents INTEGER NOT NULL CHECK (feeCents BETWEEN 0 AND 9007199254740991),
  status TEXT NOT NULL CHECK (status IN ('open', 'accepted', 'rejected')),
  receivedOn TEXT NOT NULL,
  resolvedOn TEXT,
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, playerId) REFERENCES players(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, bidderClubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id)
) STRICT;
CREATE INDEX idx_offers_campaignId ON offers (campaignId);
CREATE INDEX idx_offers_campaignId_seasonId ON offers (campaignId, seasonId);
CREATE INDEX idx_offers_campaignId_playerId ON offers (campaignId, playerId);
CREATE INDEX idx_offers_campaignId_status ON offers (campaignId, status);
CREATE TABLE lineups (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT NOT NULL CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  name TEXT NOT NULL,
  formation TEXT NOT NULL CHECK (formation IN ('4-3-3', '4-2-3-1', '4-4-2', '3-5-2')),
  starters TEXT NOT NULL CHECK (json_valid(starters)),
  benchPlayerIds TEXT NOT NULL CHECK (json_valid(benchPlayerIds)),
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id)
) STRICT;
CREATE INDEX idx_lineups_campaignId ON lineups (campaignId);
CREATE INDEX idx_lineups_campaignId_seasonId ON lineups (campaignId, seasonId);
CREATE TABLE registrations (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT NOT NULL CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  playerId TEXT NOT NULL CHECK (length(playerId) BETWEEN 1 AND 64 AND playerId NOT GLOB '*[^a-zA-Z0-9-]*'),
  competitionKey TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('registered', 'ineligible', 'unknown')),
  homegrownClub INTEGER CHECK (homegrownClub IN (0, 1)),
  homegrownNation INTEGER CHECK (homegrownNation IN (0, 1)),
  ageExempt INTEGER CHECK (ageExempt IN (0, 1)),
  provenance TEXT NOT NULL CHECK (provenance IN ('fictional', 'imported', 'user-entered', 'estimated', 'generated')),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, playerId) REFERENCES players(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (campaignId, seasonId, competitionKey, playerId)
) STRICT;
CREATE INDEX idx_registrations_campaignId ON registrations (campaignId);
CREATE INDEX idx_registrations_campaignId_competitionKey ON registrations (campaignId, competitionKey);
CREATE TABLE shortlistItems (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  playerId TEXT NOT NULL CHECK (length(playerId) BETWEEN 1 AND 64 AND playerId NOT GLOB '*[^a-zA-Z0-9-]*'),
  priority INTEGER NOT NULL CHECK (priority BETWEEN -9007199254740991 AND 9007199254740991),
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  notes TEXT,
  addedAt TEXT NOT NULL,
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, playerId) REFERENCES players(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (campaignId, playerId)
) STRICT;
CREATE INDEX idx_shortlistItems_campaignId ON shortlistItems (campaignId);
CREATE TABLE scoutingReports (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  playerId TEXT NOT NULL CHECK (length(playerId) BETWEEN 1 AND 64 AND playerId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT NOT NULL CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  archetype TEXT NOT NULL,
  observations TEXT NOT NULL,
  confidence TEXT NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  source TEXT NOT NULL CHECK (source IN ('fictional', 'imported', 'user-entered', 'estimated', 'generated')),
  createdAt TEXT NOT NULL,
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, playerId) REFERENCES players(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id)
) STRICT;
CREATE INDEX idx_scoutingReports_campaignId ON scoutingReports (campaignId);
CREATE INDEX idx_scoutingReports_campaignId_playerId ON scoutingReports (campaignId, playerId);
CREATE INDEX idx_scoutingReports_campaignId_seasonId ON scoutingReports (campaignId, seasonId);
CREATE TABLE developmentPlans (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  playerId TEXT NOT NULL CHECK (length(playerId) BETWEEN 1 AND 64 AND playerId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT NOT NULL CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  targetRole TEXT,
  notes TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, playerId) REFERENCES players(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (campaignId, playerId, seasonId)
) STRICT;
CREATE INDEX idx_developmentPlans_campaignId ON developmentPlans (campaignId);
CREATE TABLE auditEvents (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  actionId TEXT NOT NULL CHECK (length(actionId) BETWEEN 1 AND 64 AND actionId NOT GLOB '*[^a-zA-Z0-9-]*'),
  actionType TEXT NOT NULL CHECK (actionType IN ('campaign.create', 'campaign.rename', 'player.note', 'lineup.save', 'lineup.delete', 'constitution.save', 'campaign.archive', 'campaign.restore', 'shortlist.save', 'shortlist.close', 'registration.save', 'simulation.initialize', 'simulation.advance')),
  createdAt TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (actionId)
) STRICT;
CREATE INDEX idx_auditEvents_campaignId ON auditEvents (campaignId);
CREATE INDEX idx_auditEvents_campaignId_createdAt ON auditEvents (campaignId, createdAt);
CREATE TABLE importReceipts (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  sourceName TEXT NOT NULL,
  sourceType TEXT NOT NULL CHECK (sourceType IN ('csv', 'json', 'backup')),
  importedAt TEXT NOT NULL,
  rowCounts TEXT NOT NULL CHECK (json_valid(rowCounts)),
  mappingVersion TEXT NOT NULL,
  warnings TEXT NOT NULL CHECK (json_valid(warnings)),
  provenance TEXT NOT NULL CHECK (provenance IN ('fictional', 'imported', 'user-entered', 'estimated', 'generated')),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id)
) STRICT;
CREATE INDEX idx_importReceipts_campaignId ON importReceipts (campaignId);
CREATE INDEX idx_importReceipts_importedAt ON importReceipts (importedAt);
CREATE TABLE simulationStates (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  activeSeasonId TEXT NOT NULL CHECK (length(activeSeasonId) BETWEEN 1 AND 64 AND activeSeasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  rootSeed TEXT NOT NULL,
  simulationVersion TEXT NOT NULL CHECK (simulationVersion = '1'),
  calendarVersion TEXT NOT NULL CHECK (calendarVersion = '1'),
  currentDate TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('preseason', 'league', 'review')),
  lastBoundaryKey TEXT,
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, activeSeasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (campaignId)
) STRICT;
CREATE INDEX idx_simulationStates_campaignId ON simulationStates (campaignId);
CREATE TABLE clubSimulationStates (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  clubId TEXT NOT NULL CHECK (length(clubId) BETWEEN 1 AND 64 AND clubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  simulationKey TEXT NOT NULL,
  transferBalanceCents INTEGER NOT NULL CHECK (transferBalanceCents BETWEEN 0 AND 9007199254740991),
  wageBudgetWeeklyCents INTEGER NOT NULL CHECK (wageBudgetWeeklyCents BETWEEN 0 AND 9007199254740991),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, clubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (campaignId, clubId),
  UNIQUE (campaignId, simulationKey)
) STRICT;
CREATE INDEX idx_clubSimulationStates_campaignId ON clubSimulationStates (campaignId);
CREATE TABLE playerSimulationStates (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  playerId TEXT NOT NULL CHECK (length(playerId) BETWEEN 1 AND 64 AND playerId NOT GLOB '*[^a-zA-Z0-9-]*'),
  simulationKey TEXT NOT NULL,
  fitness INTEGER NOT NULL CHECK (fitness BETWEEN -9007199254740991 AND 9007199254740991),
  sharpness INTEGER NOT NULL CHECK (sharpness BETWEEN -9007199254740991 AND 9007199254740991),
  goalkeeping INTEGER CHECK (goalkeeping BETWEEN -9007199254740991 AND 9007199254740991),
  injuryUntilDate TEXT,
  suspensionMatches INTEGER NOT NULL CHECK (suspensionMatches BETWEEN -9007199254740991 AND 9007199254740991),
  status TEXT NOT NULL CHECK (status IN ('active', 'retired')),
  homegrownClub INTEGER NOT NULL CHECK (homegrownClub IN (0, 1)),
  homegrownNation INTEGER NOT NULL CHECK (homegrownNation IN (0, 1)),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, playerId) REFERENCES players(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (campaignId, playerId),
  UNIQUE (campaignId, simulationKey)
) STRICT;
CREATE INDEX idx_playerSimulationStates_campaignId ON playerSimulationStates (campaignId);
CREATE TABLE simulationReceipts (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  operationKey TEXT NOT NULL,
  inputRevision INTEGER NOT NULL CHECK (inputRevision BETWEEN 0 AND 9007199254740991),
  inputFingerprint TEXT NOT NULL,
  eventSeed INTEGER NOT NULL CHECK (eventSeed BETWEEN -9007199254740991 AND 9007199254740991),
  simulationVersion TEXT NOT NULL CHECK (simulationVersion = '1'),
  outcomeRefs TEXT NOT NULL CHECK (json_valid(outcomeRefs)),
  createdAt TEXT NOT NULL,
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (campaignId, operationKey)
) STRICT;
CREATE INDEX idx_simulationReceipts_campaignId ON simulationReceipts (campaignId);
CREATE TABLE transportImports (
  sourceSha256 TEXT NOT NULL PRIMARY KEY CHECK (length(sourceSha256) = 64),
  campaignId TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  importedRevision INTEGER NOT NULL CHECK (importedRevision BETWEEN 0 AND 9007199254740991)
) STRICT;
CREATE TABLE schemaMigrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL) STRICT;
INSERT INTO schemaMigrations VALUES (2, '0002_standalone');
PRAGMA user_version = 2;
