// Explicit column mappings for the stored collections; nested values alone use JSON.
use super::{Column, Kind, Table};

impl Table {
    pub(super) fn column_names(&self) -> String {
        self.columns
            .iter()
            .map(|column| column.name)
            .collect::<Vec<_>>()
            .join(",")
    }

    pub(super) fn scope(&self) -> &'static str {
        if self.name == "campaigns" {
            "id"
        } else {
            "campaignId"
        }
    }

    pub(super) fn insert_sql(&self) -> String {
        let names = self.column_names();
        let placeholders = vec!["?"; self.columns.len()].join(",");
        format!(
            "INSERT INTO {} ({names}) VALUES ({placeholders})",
            self.name
        )
    }

    pub(super) fn update_sql(&self) -> String {
        let assignments = self
            .columns
            .iter()
            .map(|column| format!("{}=?", column.name))
            .collect::<Vec<_>>()
            .join(",");
        format!(
            "UPDATE {} SET {assignments} WHERE id=? AND {}=?",
            self.name,
            self.scope()
        )
    }

    pub(super) fn delete_sql(&self) -> String {
        format!(
            "DELETE FROM {} WHERE id=?1 AND {}=?2",
            self.name,
            self.scope()
        )
    }
}
pub(super) const TABLES: &[Table] = &[
    Table {
        name: "boardObjectives",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "seasonId",
                kind: Kind::Text,
            },
            Column {
                name: "clubId",
                kind: Kind::Text,
            },
            Column {
                name: "kind",
                kind: Kind::Text,
            },
            Column {
                name: "targetPosition",
                kind: Kind::Integer,
            },
            Column {
                name: "rewardCents",
                kind: Kind::Integer,
            },
            Column {
                name: "outcome",
                kind: Kind::Text,
            },
            Column {
                name: "engineVersion",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "seasonSettlements",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "seasonId",
                kind: Kind::Text,
            },
            Column {
                name: "nextSeasonId",
                kind: Kind::Text,
            },
            Column {
                name: "engineVersion",
                kind: Kind::Text,
            },
            Column {
                name: "settledOn",
                kind: Kind::Text,
            },
            Column {
                name: "managedPosition",
                kind: Kind::Integer,
            },
            Column {
                name: "prizeCents",
                kind: Kind::Integer,
            },
            Column {
                name: "objectiveBonusCents",
                kind: Kind::Integer,
            },
            Column {
                name: "carryoverCents",
                kind: Kind::Integer,
            },
            Column {
                name: "allocationCents",
                kind: Kind::Integer,
            },
            Column {
                name: "tableJson",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "developmentSnapshots",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "seasonId",
                kind: Kind::Text,
            },
            Column {
                name: "playerId",
                kind: Kind::Text,
            },
            Column {
                name: "period",
                kind: Kind::Text,
            },
            Column {
                name: "beforePace",
                kind: Kind::Integer,
            },
            Column {
                name: "beforeFinishing",
                kind: Kind::Integer,
            },
            Column {
                name: "beforePassing",
                kind: Kind::Integer,
            },
            Column {
                name: "beforeDribbling",
                kind: Kind::Integer,
            },
            Column {
                name: "beforeDefending",
                kind: Kind::Integer,
            },
            Column {
                name: "beforePhysical",
                kind: Kind::Integer,
            },
            Column {
                name: "afterPace",
                kind: Kind::Integer,
            },
            Column {
                name: "afterFinishing",
                kind: Kind::Integer,
            },
            Column {
                name: "afterPassing",
                kind: Kind::Integer,
            },
            Column {
                name: "afterDribbling",
                kind: Kind::Integer,
            },
            Column {
                name: "afterDefending",
                kind: Kind::Integer,
            },
            Column {
                name: "afterPhysical",
                kind: Kind::Integer,
            },
            Column {
                name: "beforeValueCents",
                kind: Kind::Integer,
            },
            Column {
                name: "afterValueCents",
                kind: Kind::Integer,
            },
            Column {
                name: "beforeStatus",
                kind: Kind::Text,
            },
            Column {
                name: "afterStatus",
                kind: Kind::Text,
            },
            Column {
                name: "points",
                kind: Kind::Integer,
            },
            Column {
                name: "engineVersion",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "campaigns",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "name",
                kind: Kind::Text,
            },
            Column {
                name: "kind",
                kind: Kind::Text,
            },
            Column {
                name: "mode",
                kind: Kind::Text,
            },
            Column {
                name: "rulesMode",
                kind: Kind::Text,
            },
            Column {
                name: "seed",
                kind: Kind::Text,
            },
            Column {
                name: "generatorVersion",
                kind: Kind::Text,
            },
            Column {
                name: "managedClubId",
                kind: Kind::Text,
            },
            Column {
                name: "activeSeasonId",
                kind: Kind::Text,
            },
            Column {
                name: "currency",
                kind: Kind::Text,
            },
            Column {
                name: "createdAt",
                kind: Kind::Text,
            },
            Column {
                name: "updatedAt",
                kind: Kind::Text,
            },
            Column {
                name: "revision",
                kind: Kind::Integer,
            },
            Column {
                name: "status",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "seasons",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "label",
                kind: Kind::Text,
            },
            Column {
                name: "ordinal",
                kind: Kind::Integer,
            },
            Column {
                name: "status",
                kind: Kind::Text,
            },
            Column {
                name: "startDate",
                kind: Kind::Text,
            },
            Column {
                name: "endDate",
                kind: Kind::Text,
            },
            Column {
                name: "openedAt",
                kind: Kind::Text,
            },
            Column {
                name: "closedAt",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "leagues",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "name",
                kind: Kind::Text,
            },
            Column {
                name: "countryCode",
                kind: Kind::Text,
            },
            Column {
                name: "tier",
                kind: Kind::Integer,
            },
        ],
    },
    Table {
        name: "clubs",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "leagueId",
                kind: Kind::Text,
            },
            Column {
                name: "name",
                kind: Kind::Text,
            },
            Column {
                name: "shortName",
                kind: Kind::Text,
            },
            Column {
                name: "colors",
                kind: Kind::Json,
            },
            Column {
                name: "prestige",
                kind: Kind::Integer,
            },
            Column {
                name: "academyTier",
                kind: Kind::Integer,
            },
            Column {
                name: "scoutingRegion",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "players",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "clubId",
                kind: Kind::Text,
            },
            Column {
                name: "name",
                kind: Kind::Text,
            },
            Column {
                name: "positionGroup",
                kind: Kind::Text,
            },
            Column {
                name: "positions",
                kind: Kind::Json,
            },
            Column {
                name: "nationalityCode",
                kind: Kind::Text,
            },
            Column {
                name: "birthDate",
                kind: Kind::Text,
            },
            Column {
                name: "reportedAge",
                kind: Kind::Integer,
            },
            Column {
                name: "ageReferenceSeasonOrdinal",
                kind: Kind::Integer,
            },
            Column {
                name: "marketValueCents",
                kind: Kind::Integer,
            },
            Column {
                name: "attributes",
                kind: Kind::Json,
            },
            Column {
                name: "potential",
                kind: Kind::Integer,
            },
            Column {
                name: "source",
                kind: Kind::Text,
            },
            Column {
                name: "externalSourceId",
                kind: Kind::Text,
            },
            Column {
                name: "isNewgen",
                kind: Kind::Bool,
            },
        ],
    },
    Table {
        name: "contracts",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "playerId",
                kind: Kind::Text,
            },
            Column {
                name: "clubId",
                kind: Kind::Text,
            },
            Column {
                name: "weeklyWageCents",
                kind: Kind::Integer,
            },
            Column {
                name: "squadTier",
                kind: Kind::Text,
            },
            Column {
                name: "startsOn",
                kind: Kind::Text,
            },
            Column {
                name: "expiresOn",
                kind: Kind::Text,
            },
            Column {
                name: "status",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "constitutions",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "version",
                kind: Kind::Integer,
            },
            Column {
                name: "rules",
                kind: Kind::Json,
            },
            Column {
                name: "updatedAt",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "ledgerEntries",
        columns: &[
            Column {
                name: "earningSeasonId",
                kind: Kind::Text,
            },
            Column {
                name: "settlementId",
                kind: Kind::Text,
            },
            Column {
                name: "awardKind",
                kind: Kind::Text,
            },
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "seasonId",
                kind: Kind::Text,
            },
            Column {
                name: "clubId",
                kind: Kind::Text,
            },
            Column {
                name: "kind",
                kind: Kind::Text,
            },
            Column {
                name: "amountCents",
                kind: Kind::Integer,
            },
            Column {
                name: "effectiveOn",
                kind: Kind::Text,
            },
            Column {
                name: "sourceActionId",
                kind: Kind::Text,
            },
            Column {
                name: "reversesEntryId",
                kind: Kind::Text,
            },
            Column {
                name: "note",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "transfers",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "seasonId",
                kind: Kind::Text,
            },
            Column {
                name: "playerId",
                kind: Kind::Text,
            },
            Column {
                name: "fromClubId",
                kind: Kind::Text,
            },
            Column {
                name: "toClubId",
                kind: Kind::Text,
            },
            Column {
                name: "feeCents",
                kind: Kind::Integer,
            },
            Column {
                name: "kind",
                kind: Kind::Text,
            },
            Column {
                name: "effectiveOn",
                kind: Kind::Text,
            },
            Column {
                name: "sourceActionId",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "negotiations",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "seasonId",
                kind: Kind::Text,
            },
            Column {
                name: "playerId",
                kind: Kind::Text,
            },
            Column {
                name: "buyerClubId",
                kind: Kind::Text,
            },
            Column {
                name: "sellerClubId",
                kind: Kind::Text,
            },
            Column {
                name: "status",
                kind: Kind::Text,
            },
            Column {
                name: "feeCents",
                kind: Kind::Integer,
            },
            Column {
                name: "reservedCents",
                kind: Kind::Integer,
            },
            Column {
                name: "wageCents",
                kind: Kind::Integer,
            },
            Column {
                name: "reservedWageCents",
                kind: Kind::Integer,
            },
            Column {
                name: "squadTier",
                kind: Kind::Text,
            },
            Column {
                name: "expiresOn",
                kind: Kind::Text,
            },
            Column {
                name: "counterCount",
                kind: Kind::Integer,
            },
            Column {
                name: "openedOn",
                kind: Kind::Text,
            },
            Column {
                name: "deadlineOn",
                kind: Kind::Text,
            },
            Column {
                name: "resolvedOn",
                kind: Kind::Text,
            },
            Column {
                name: "engineVersion",
                kind: Kind::Text,
            },
            Column {
                name: "eventSeed",
                kind: Kind::Integer,
            },
            Column {
                name: "qualification",
                kind: Kind::Json,
            },
        ],
    },
    Table {
        name: "offers",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "seasonId",
                kind: Kind::Text,
            },
            Column {
                name: "playerId",
                kind: Kind::Text,
            },
            Column {
                name: "bidderClubId",
                kind: Kind::Text,
            },
            Column {
                name: "feeCents",
                kind: Kind::Integer,
            },
            Column {
                name: "status",
                kind: Kind::Text,
            },
            Column {
                name: "receivedOn",
                kind: Kind::Text,
            },
            Column {
                name: "resolvedOn",
                kind: Kind::Text,
            },
            Column {
                name: "negotiationId",
                kind: Kind::Text,
            },
            Column {
                name: "sellerClubId",
                kind: Kind::Text,
            },
            Column {
                name: "deadlineOn",
                kind: Kind::Text,
            },
            Column {
                name: "origin",
                kind: Kind::Text,
            },
            Column {
                name: "marketValueCents",
                kind: Kind::Integer,
            },
            Column {
                name: "bidderPrestige",
                kind: Kind::Integer,
            },
            Column {
                name: "sellerPrestige",
                kind: Kind::Integer,
            },
            Column {
                name: "constitutionVersion",
                kind: Kind::Integer,
            },
            Column {
                name: "compulsory",
                kind: Kind::Bool,
            },
        ],
    },
    Table {
        name: "lineups",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "seasonId",
                kind: Kind::Text,
            },
            Column {
                name: "name",
                kind: Kind::Text,
            },
            Column {
                name: "formation",
                kind: Kind::Text,
            },
            Column {
                name: "starters",
                kind: Kind::Json,
            },
            Column {
                name: "benchPlayerIds",
                kind: Kind::Json,
            },
            Column {
                name: "updatedAt",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "registrations",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "seasonId",
                kind: Kind::Text,
            },
            Column {
                name: "playerId",
                kind: Kind::Text,
            },
            Column {
                name: "competitionKey",
                kind: Kind::Text,
            },
            Column {
                name: "status",
                kind: Kind::Text,
            },
            Column {
                name: "homegrownClub",
                kind: Kind::Bool,
            },
            Column {
                name: "homegrownNation",
                kind: Kind::Bool,
            },
            Column {
                name: "ageExempt",
                kind: Kind::Bool,
            },
            Column {
                name: "provenance",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "shortlistItems",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "playerId",
                kind: Kind::Text,
            },
            Column {
                name: "priority",
                kind: Kind::Integer,
            },
            Column {
                name: "status",
                kind: Kind::Text,
            },
            Column {
                name: "notes",
                kind: Kind::Text,
            },
            Column {
                name: "addedAt",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "scoutingReports",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "playerId",
                kind: Kind::Text,
            },
            Column {
                name: "seasonId",
                kind: Kind::Text,
            },
            Column {
                name: "archetype",
                kind: Kind::Text,
            },
            Column {
                name: "observations",
                kind: Kind::Text,
            },
            Column {
                name: "confidence",
                kind: Kind::Text,
            },
            Column {
                name: "source",
                kind: Kind::Text,
            },
            Column {
                name: "createdAt",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "developmentPlans",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "playerId",
                kind: Kind::Text,
            },
            Column {
                name: "seasonId",
                kind: Kind::Text,
            },
            Column {
                name: "targetRole",
                kind: Kind::Text,
            },
            Column {
                name: "notes",
                kind: Kind::Text,
            },
            Column {
                name: "status",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "auditEvents",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "seasonId",
                kind: Kind::Text,
            },
            Column {
                name: "actionId",
                kind: Kind::Text,
            },
            Column {
                name: "actionType",
                kind: Kind::Text,
            },
            Column {
                name: "createdAt",
                kind: Kind::Text,
            },
            Column {
                name: "summary",
                kind: Kind::Text,
            },
            Column {
                name: "payload",
                kind: Kind::Json,
            },
        ],
    },
    Table {
        name: "importReceipts",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "sourceName",
                kind: Kind::Text,
            },
            Column {
                name: "sourceType",
                kind: Kind::Text,
            },
            Column {
                name: "importedAt",
                kind: Kind::Text,
            },
            Column {
                name: "rowCounts",
                kind: Kind::Json,
            },
            Column {
                name: "mappingVersion",
                kind: Kind::Text,
            },
            Column {
                name: "warnings",
                kind: Kind::Json,
            },
            Column {
                name: "provenance",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "simulationStates",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "activeSeasonId",
                kind: Kind::Text,
            },
            Column {
                name: "rootSeed",
                kind: Kind::Text,
            },
            Column {
                name: "simulationVersion",
                kind: Kind::Text,
            },
            Column {
                name: "calendarVersion",
                kind: Kind::Text,
            },
            Column {
                name: "currentDate",
                kind: Kind::Text,
            },
            Column {
                name: "phase",
                kind: Kind::Text,
            },
            Column {
                name: "lastBoundaryKey",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "clubSimulationStates",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "clubId",
                kind: Kind::Text,
            },
            Column {
                name: "simulationKey",
                kind: Kind::Text,
            },
            Column {
                name: "transferBalanceCents",
                kind: Kind::Integer,
            },
            Column {
                name: "wageBudgetWeeklyCents",
                kind: Kind::Integer,
            },
        ],
    },
    Table {
        name: "playerSimulationStates",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "playerId",
                kind: Kind::Text,
            },
            Column {
                name: "simulationKey",
                kind: Kind::Text,
            },
            Column {
                name: "fitness",
                kind: Kind::Integer,
            },
            Column {
                name: "sharpness",
                kind: Kind::Integer,
            },
            Column {
                name: "goalkeeping",
                kind: Kind::Integer,
            },
            Column {
                name: "injuryUntilDate",
                kind: Kind::Text,
            },
            Column {
                name: "suspensionMatches",
                kind: Kind::Integer,
            },
            Column {
                name: "status",
                kind: Kind::Text,
            },
            Column {
                name: "homegrownClub",
                kind: Kind::Bool,
            },
            Column {
                name: "homegrownNation",
                kind: Kind::Bool,
            },
        ],
    },
    Table {
        name: "simulationReceipts",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "operationKey",
                kind: Kind::Text,
            },
            Column {
                name: "inputRevision",
                kind: Kind::Integer,
            },
            Column {
                name: "inputFingerprint",
                kind: Kind::Text,
            },
            Column {
                name: "eventSeed",
                kind: Kind::Integer,
            },
            Column {
                name: "simulationVersion",
                kind: Kind::Text,
            },
            Column {
                name: "outcomeRefs",
                kind: Kind::Json,
            },
            Column {
                name: "createdAt",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "fixtures",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "seasonId",
                kind: Kind::Text,
            },
            Column {
                name: "leagueId",
                kind: Kind::Text,
            },
            Column {
                name: "round",
                kind: Kind::Integer,
            },
            Column {
                name: "matchDate",
                kind: Kind::Text,
            },
            Column {
                name: "homeClubId",
                kind: Kind::Text,
            },
            Column {
                name: "awayClubId",
                kind: Kind::Text,
            },
            Column {
                name: "fixtureKey",
                kind: Kind::Text,
            },
            Column {
                name: "status",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "simulatedMatches",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "fixtureId",
                kind: Kind::Text,
            },
            Column {
                name: "homeGoals",
                kind: Kind::Integer,
            },
            Column {
                name: "awayGoals",
                kind: Kind::Integer,
            },
            Column {
                name: "homeXgMilli",
                kind: Kind::Integer,
            },
            Column {
                name: "awayXgMilli",
                kind: Kind::Integer,
            },
            Column {
                name: "timeline",
                kind: Kind::Json,
            },
            Column {
                name: "inputSnapshot",
                kind: Kind::Json,
            },
            Column {
                name: "eventSeed",
                kind: Kind::Integer,
            },
            Column {
                name: "engineVersion",
                kind: Kind::Text,
            },
        ],
    },
    Table {
        name: "simulatedAppearances",
        columns: &[
            Column {
                name: "id",
                kind: Kind::Text,
            },
            Column {
                name: "campaignId",
                kind: Kind::Text,
            },
            Column {
                name: "fixtureId",
                kind: Kind::Text,
            },
            Column {
                name: "playerId",
                kind: Kind::Text,
            },
            Column {
                name: "clubId",
                kind: Kind::Text,
            },
            Column {
                name: "started",
                kind: Kind::Bool,
            },
            Column {
                name: "minutes",
                kind: Kind::Integer,
            },
            Column {
                name: "goals",
                kind: Kind::Integer,
            },
            Column {
                name: "assists",
                kind: Kind::Integer,
            },
            Column {
                name: "rating",
                kind: Kind::Integer,
            },
            Column {
                name: "yellowCards",
                kind: Kind::Integer,
            },
            Column {
                name: "redCards",
                kind: Kind::Integer,
            },
        ],
    },
];
