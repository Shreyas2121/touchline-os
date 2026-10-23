-- Applied transactionally after the frozen matchday schema.
CREATE TABLE negotiations (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT NOT NULL CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  playerId TEXT NOT NULL CHECK (length(playerId) BETWEEN 1 AND 64 AND playerId NOT GLOB '*[^a-zA-Z0-9-]*'),
  buyerClubId TEXT NOT NULL CHECK (length(buyerClubId) BETWEEN 1 AND 64 AND buyerClubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  sellerClubId TEXT CHECK (length(sellerClubId) BETWEEN 1 AND 64 AND sellerClubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'countered', 'agreed', 'settled', 'rejected', 'expired', 'withdrawn', 'superseded')),
  feeCents INTEGER NOT NULL CHECK (feeCents BETWEEN 0 AND 9007199254740991),
  reservedCents INTEGER NOT NULL CHECK (reservedCents BETWEEN 0 AND 9007199254740991),
  wageCents INTEGER NOT NULL CHECK (wageCents BETWEEN 0 AND 9007199254740991),
  reservedWageCents INTEGER NOT NULL CHECK (reservedWageCents BETWEEN 0 AND 9007199254740991),
  squadTier TEXT NOT NULL CHECK (squadTier IN ('key', 'rotation', 'youth')),
  expiresOn TEXT NOT NULL,
  counterCount INTEGER NOT NULL CHECK (counterCount BETWEEN 0 AND 2),
  openedOn TEXT NOT NULL,
  deadlineOn TEXT NOT NULL,
  resolvedOn TEXT,
  engineVersion TEXT NOT NULL CHECK (engineVersion = '1'),
  eventSeed INTEGER NOT NULL CHECK (eventSeed BETWEEN 0 AND 4294967295),
  qualification TEXT CHECK (qualification IS NULL OR json_valid(qualification)),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, playerId) REFERENCES players(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, buyerClubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, sellerClubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  CHECK (
    (
      status IN ('proposed', 'countered', 'agreed')
      AND resolvedOn IS NULL
    )
    OR (
      status IN ('settled', 'rejected', 'expired', 'withdrawn', 'superseded')
      AND resolvedOn IS NOT NULL
      AND reservedCents = 0
    )
  )
) STRICT;
CREATE INDEX idx_negotiations_campaignId ON negotiations (campaignId);
CREATE INDEX idx_negotiations_campaignId_playerId ON negotiations (campaignId, playerId);
CREATE INDEX idx_negotiations_campaignId_buyerClubId ON negotiations (campaignId, buyerClubId);
CREATE UNIQUE INDEX idx_negotiations_open_buy ON negotiations (campaignId, buyerClubId, playerId) WHERE status IN ('proposed', 'countered', 'agreed');
CREATE TABLE offers_market (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT NOT NULL CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  playerId TEXT NOT NULL CHECK (length(playerId) BETWEEN 1 AND 64 AND playerId NOT GLOB '*[^a-zA-Z0-9-]*'),
  bidderClubId TEXT NOT NULL CHECK (length(bidderClubId) BETWEEN 1 AND 64 AND bidderClubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  feeCents INTEGER NOT NULL CHECK (feeCents BETWEEN 0 AND 9007199254740991),
  status TEXT NOT NULL CHECK (status IN ('open', 'accepted', 'rejected', 'expired', 'withdrawn', 'superseded')),
  receivedOn TEXT NOT NULL,
  resolvedOn TEXT,
  negotiationId TEXT CHECK (length(negotiationId) BETWEEN 1 AND 64 AND negotiationId NOT GLOB '*[^a-zA-Z0-9-]*'),
  sellerClubId TEXT CHECK (length(sellerClubId) BETWEEN 1 AND 64 AND sellerClubId NOT GLOB '*[^a-zA-Z0-9-]*'),
  deadlineOn TEXT,
  origin TEXT CHECK (origin IS NULL OR origin = 'ai'),
  marketValueCents INTEGER CHECK (marketValueCents BETWEEN 0 AND 9007199254740991),
  bidderPrestige INTEGER CHECK (bidderPrestige BETWEEN -9007199254740991 AND 9007199254740991),
  sellerPrestige INTEGER CHECK (sellerPrestige BETWEEN -9007199254740991 AND 9007199254740991),
  constitutionVersion INTEGER CHECK (constitutionVersion BETWEEN -9007199254740991 AND 9007199254740991),
  compulsory INTEGER NOT NULL DEFAULT 0 CHECK (compulsory IN (0, 1)),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, playerId) REFERENCES players(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, bidderClubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, sellerClubId) REFERENCES clubs(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, negotiationId) REFERENCES negotiations(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id)
) STRICT;
INSERT INTO offers_market (
  id, campaignId, seasonId, playerId, bidderClubId, feeCents, status, receivedOn, resolvedOn,
  negotiationId, sellerClubId, deadlineOn, origin, marketValueCents, bidderPrestige, sellerPrestige, constitutionVersion, compulsory
)
SELECT
  id, campaignId, seasonId, playerId, bidderClubId, feeCents, status, receivedOn, resolvedOn,
  NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0
FROM offers;
DROP TABLE offers;
ALTER TABLE offers_market RENAME TO offers;
CREATE INDEX idx_offers_campaignId ON offers (campaignId);
CREATE INDEX idx_offers_campaignId_seasonId ON offers (campaignId, seasonId);
CREATE INDEX idx_offers_campaignId_playerId ON offers (campaignId, playerId);
CREATE INDEX idx_offers_campaignId_status ON offers (campaignId, status);
CREATE TABLE auditEvents_market (
  id TEXT NOT NULL PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 64 AND id NOT GLOB '*[^a-zA-Z0-9-]*'),
  campaignId TEXT NOT NULL CHECK (length(campaignId) BETWEEN 1 AND 64 AND campaignId NOT GLOB '*[^a-zA-Z0-9-]*'),
  seasonId TEXT CHECK (length(seasonId) BETWEEN 1 AND 64 AND seasonId NOT GLOB '*[^a-zA-Z0-9-]*'),
  actionId TEXT NOT NULL CHECK (length(actionId) BETWEEN 1 AND 64 AND actionId NOT GLOB '*[^a-zA-Z0-9-]*'),
  actionType TEXT NOT NULL CHECK (actionType IN ('campaign.create', 'campaign.rename', 'player.note', 'lineup.save', 'lineup.delete', 'constitution.save', 'campaign.archive', 'campaign.restore', 'shortlist.save', 'shortlist.close', 'registration.save', 'simulation.initialize', 'simulation.advance', 'simulation.matchday', 'market.tick', 'market.close', 'transfer.propose', 'transfer.settle', 'offer.respond')),
  createdAt TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  FOREIGN KEY (campaignId) REFERENCES campaigns(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (campaignId, seasonId) REFERENCES seasons(campaignId, id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (campaignId, id),
  UNIQUE (actionId)
) STRICT;
INSERT INTO auditEvents_market SELECT * FROM auditEvents;
DROP TABLE auditEvents;
ALTER TABLE auditEvents_market RENAME TO auditEvents;
CREATE INDEX idx_auditEvents_campaignId ON auditEvents (campaignId);
CREATE INDEX idx_auditEvents_campaignId_createdAt ON auditEvents (campaignId, createdAt);
INSERT INTO schemaMigrations VALUES (4, '0004_market');
PRAGMA user_version = 4;
