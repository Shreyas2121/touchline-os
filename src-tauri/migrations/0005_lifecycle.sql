CREATE TABLE boardObjectives (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT NOT NULL CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  clubId TEXT NOT NULL CHECK (length(clubId) BETWEEN 1 AND 64 AND clubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  kind TEXT NOT NULL CHECK (kind IN ('league_title', 'top_half', 'avoid_last')),
  targetPosition INTEGER NOT NULL CHECK (targetPosition BETWEEN 1 AND 18),
  rewardCents INTEGER NOT NULL CHECK (rewardCents BETWEEN 0 AND 9007199254740991),
  outcome TEXT NOT NULL CHECK (outcome IN ('pending', 'met', 'missed')),
  engineVersion TEXT NOT NULL CHECK (engineVersion = '1'),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, clubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (campaignId, seasonId, kind)
) STRICT;
CREATE INDEX idx_boardObjectives_campaignId ON boardObjectives (campaignId);
CREATE TABLE seasonSettlements (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT NOT NULL CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  nextSeasonId TEXT NOT NULL CHECK (length(nextSeasonId) BETWEEN 1 AND 64 AND nextSeasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  engineVersion TEXT NOT NULL CHECK (engineVersion = '1'),
  settledOn TEXT NOT NULL,
  managedPosition INTEGER NOT NULL CHECK (managedPosition BETWEEN 1 AND 18),
  prizeCents INTEGER NOT NULL CHECK (prizeCents BETWEEN 0 AND 9007199254740991),
  objectiveBonusCents INTEGER NOT NULL CHECK (objectiveBonusCents BETWEEN 0 AND 9007199254740991),
  carryoverCents INTEGER NOT NULL CHECK (carryoverCents BETWEEN 0 AND 9007199254740991),
  allocationCents INTEGER NOT NULL CHECK (allocationCents BETWEEN 0 AND 9007199254740991),
  tableJson TEXT NOT NULL CHECK (json_valid(tableJson) AND json_type(tableJson) = 'array' AND json_array_length(tableJson) <= 72),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, nextSeasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (campaignId, seasonId)
) STRICT;
CREATE INDEX idx_seasonSettlements_campaignId ON seasonSettlements (campaignId);
CREATE TABLE developmentSnapshots (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT NOT NULL CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  playerId TEXT NOT NULL CHECK (length(playerId) BETWEEN 1 AND 64 AND playerId NOT GLOB '*[^a-zA-Z0-9-]*'),
  period TEXT NOT NULL CHECK (period IN ('midseason', 'season_end')),
  beforePace INTEGER NOT NULL CHECK (beforePace BETWEEN 0 AND 100),
  beforeFinishing INTEGER NOT NULL CHECK (beforeFinishing BETWEEN 0 AND 100),
  beforePassing INTEGER NOT NULL CHECK (beforePassing BETWEEN 0 AND 100),
  beforeDribbling INTEGER NOT NULL CHECK (beforeDribbling BETWEEN 0 AND 100),
  beforeDefending INTEGER NOT NULL CHECK (beforeDefending BETWEEN 0 AND 100),
  beforePhysical INTEGER NOT NULL CHECK (beforePhysical BETWEEN 0 AND 100),
  afterPace INTEGER NOT NULL CHECK (afterPace BETWEEN 0 AND 100),
  afterFinishing INTEGER NOT NULL CHECK (afterFinishing BETWEEN 0 AND 100),
  afterPassing INTEGER NOT NULL CHECK (afterPassing BETWEEN 0 AND 100),
  afterDribbling INTEGER NOT NULL CHECK (afterDribbling BETWEEN 0 AND 100),
  afterDefending INTEGER NOT NULL CHECK (afterDefending BETWEEN 0 AND 100),
  afterPhysical INTEGER NOT NULL CHECK (afterPhysical BETWEEN 0 AND 100),
  beforeValueCents INTEGER NOT NULL CHECK (beforeValueCents BETWEEN 0 AND 9007199254740991),
  afterValueCents INTEGER NOT NULL CHECK (afterValueCents BETWEEN 0 AND 9007199254740991),
  beforeStatus TEXT NOT NULL CHECK (beforeStatus IN ('active', 'retired')),
  afterStatus TEXT NOT NULL CHECK (afterStatus IN ('active', 'retired')),
  points INTEGER NOT NULL CHECK (points BETWEEN -3 AND 4),
  engineVersion TEXT NOT NULL CHECK (engineVersion = '1'),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, playerId) REFERENCES players(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (campaignId, seasonId, playerId, period)
) STRICT;
CREATE INDEX idx_developmentSnapshots_campaignId ON developmentSnapshots (campaignId);
ALTER TABLE ledgerEntries ADD COLUMN earningSeasonId TEXT CHECK (length(earningSeasonId) BETWEEN 1 AND 64 AND earningSeasonId NOT GLOB '*[^a-zA-Z0-9-]*');
ALTER TABLE ledgerEntries ADD COLUMN settlementId TEXT CHECK (length(settlementId) BETWEEN 1 AND 64 AND settlementId NOT GLOB '*[^a-zA-Z0-9-]*');
ALTER TABLE ledgerEntries ADD COLUMN awardKind TEXT CHECK (awardKind IN ('league_prize', 'league_title', 'top_half', 'avoid_last'));
CREATE TABLE auditEvents_lifecycle (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  actionId TEXT NOT NULL CHECK (length(actionId) BETWEEN 1 AND 64 AND actionId NOT GLOB '*[^a-zA-Z0-9-]*'),
  actionType TEXT NOT NULL CHECK (actionType IN ('campaign.create', 'campaign.rename', 'player.note', 'lineup.save', 'lineup.delete', 'constitution.save', 'campaign.archive', 'campaign.restore', 'shortlist.save', 'shortlist.close', 'registration.save', 'simulation.initialize', 'simulation.advance', 'simulation.matchday', 'market.tick', 'market.close', 'transfer.propose', 'transfer.settle', 'offer.respond', 'development.apply', 'season.settle')),
  createdAt TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (actionId)
) STRICT;
INSERT INTO auditEvents_lifecycle SELECT * FROM auditEvents;
DROP TABLE auditEvents;
ALTER TABLE auditEvents_lifecycle RENAME TO auditEvents;
CREATE INDEX idx_auditEvents_campaignId ON auditEvents (campaignId);
CREATE INDEX idx_auditEvents_campaignId_createdAt ON auditEvents (campaignId, createdAt);
INSERT INTO schemaMigrations VALUES (5, '0005_lifecycle');
PRAGMA user_version = 5;
