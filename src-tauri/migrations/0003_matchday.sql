-- Applied transactionally after the frozen standalone schema.
CREATE TABLE fixtures (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT NOT NULL CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  leagueId TEXT NOT NULL CHECK (length(leagueId) BETWEEN 1 AND 64 AND leagueId NOT GLOB '*[^a-zA-Z0-9-]*'),
  round INTEGER NOT NULL CHECK (round BETWEEN 1 AND 34),
  matchDate TEXT NOT NULL,
  homeClubId TEXT NOT NULL CHECK (length(homeClubId) BETWEEN 1 AND 64 AND homeClubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  awayClubId TEXT NOT NULL CHECK (length(awayClubId) BETWEEN 1 AND 64 AND awayClubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  fixtureKey TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'played')),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, leagueId) REFERENCES leagues(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, homeClubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, awayClubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (campaignId, fixtureKey),
  UNIQUE (campaignId, seasonId, round, homeClubId),
  CHECK (homeClubId <> awayClubId)
) STRICT;
CREATE INDEX idx_fixtures_campaignId ON fixtures (campaignId);
CREATE TABLE simulatedMatches (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  fixtureId TEXT NOT NULL CHECK (length(fixtureId) BETWEEN 1 AND 64 AND fixtureId NOT GLOB '*[^a-zA-Z0-9-]*'),
  homeGoals INTEGER NOT NULL CHECK (homeGoals BETWEEN 0 AND 15),
  awayGoals INTEGER NOT NULL CHECK (awayGoals BETWEEN 0 AND 15),
  homeXgMilli INTEGER NOT NULL CHECK (homeXgMilli BETWEEN 0 AND 20000),
  awayXgMilli INTEGER NOT NULL CHECK (awayXgMilli BETWEEN 0 AND 20000),
  timeline TEXT NOT NULL CHECK (json_valid(timeline)),
  inputSnapshot TEXT NOT NULL CHECK (json_valid(inputSnapshot)),
  eventSeed INTEGER NOT NULL CHECK (eventSeed BETWEEN 0 AND 4294967295),
  engineVersion TEXT NOT NULL CHECK (engineVersion = '1'),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, fixtureId) REFERENCES fixtures(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (campaignId, fixtureId)
) STRICT;
CREATE INDEX idx_simulatedMatches_campaignId ON simulatedMatches (campaignId);
CREATE TABLE simulatedAppearances (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  fixtureId TEXT NOT NULL CHECK (length(fixtureId) BETWEEN 1 AND 64 AND fixtureId NOT GLOB '*[^a-zA-Z0-9-]*'),
  playerId TEXT NOT NULL CHECK (length(playerId) BETWEEN 1 AND 64 AND playerId NOT GLOB '*[^a-zA-Z0-9-]*'),
  clubId TEXT NOT NULL CHECK (length(clubId) BETWEEN 1 AND 64 AND clubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  started INTEGER NOT NULL CHECK (started IN (0, 1)),
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 0 AND 90),
  goals INTEGER NOT NULL CHECK (goals BETWEEN 0 AND 15),
  assists INTEGER NOT NULL CHECK (assists BETWEEN 0 AND 15),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 0 AND 100),
  yellowCards INTEGER NOT NULL CHECK (yellowCards BETWEEN 0 AND 2),
  redCards INTEGER NOT NULL CHECK (redCards BETWEEN 0 AND 1),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, fixtureId) REFERENCES fixtures(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, playerId) REFERENCES players(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, clubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (campaignId, fixtureId, playerId)
) STRICT;
CREATE INDEX idx_simulatedAppearances_campaignId ON simulatedAppearances (campaignId);
CREATE INDEX idx_fixtures_campaignId_seasonId_round ON fixtures (campaignId, seasonId, round);
CREATE TABLE auditEvents_matchday (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  actionId TEXT NOT NULL CHECK (length(actionId) BETWEEN 1 AND 64 AND actionId NOT GLOB '*[^a-zA-Z0-9-]*'),
  actionType TEXT NOT NULL CHECK (actionType IN ('campaign.create', 'campaign.rename', 'player.note', 'lineup.save', 'lineup.delete', 'constitution.save', 'campaign.archive', 'campaign.restore', 'shortlist.save', 'shortlist.close', 'registration.save', 'simulation.initialize', 'simulation.advance', 'simulation.matchday')),
  createdAt TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (actionId)
) STRICT;
INSERT INTO auditEvents_matchday SELECT * FROM auditEvents;
DROP TABLE auditEvents;
ALTER TABLE auditEvents_matchday RENAME TO auditEvents;
CREATE INDEX idx_auditEvents_campaignId ON auditEvents (campaignId);
CREATE INDEX idx_auditEvents_campaignId_createdAt ON auditEvents (campaignId, createdAt);
INSERT INTO schemaMigrations VALUES (3, '0003_matchday');
PRAGMA user_version = 3;
