use crate::enums::{position_group_for, LedgerKind, NegotiationStatus, OfferStatus, TransferKind};
use crate::numbers::JS_MAX_SAFE_INTEGER;
use crate::rows::{
    AuditPayload, CampaignRow, ClubRow, ConstitutionRow, ConstitutionRule, ContractRow,
    DevelopmentPlanRow, ImportReceiptRow, LeagueRow, LineupRow, NegotiationRow, OfferRow,
    OutcomeRef, PlayerAttributes, PlayerRow, PlayerSimulationStateRow, RegistrationRow,
    ScoutingReportRow, SeasonRow, ShortlistItemRow, SimulationReceiptRow, SimulationStateRow,
    SnapshotTables, TransferRow,
};
use crate::snapshot::{CampaignSnapshot, SnapshotError};
use serde_json::Value;
use std::collections::BTreeSet;

const MAX_STRING: usize = 20_000;
const PAYLOAD_DEPTH: usize = 6;
const SNAPSHOT_DEPTH: usize = 12;

pub fn walk_json(value: &Value, depth: usize) -> Result<(), SnapshotError> {
    if depth > SNAPSHOT_DEPTH {
        return Err(SnapshotError::Invalid("snapshot is too deep".into()));
    }
    match value {
        Value::String(text) if text.chars().count() > MAX_STRING => {
            Err(SnapshotError::Invalid("string is too long".into()))
        }
        Value::Array(items) => items.iter().try_for_each(|item| walk_json(item, depth + 1)),
        Value::Object(map) => map.values().try_for_each(|item| walk_json(item, depth + 1)),
        _ => Ok(()),
    }
}

const ATTRIBUTE_KEYS: &[&str] = &[
    "pace",
    "finishing",
    "passing",
    "dribbling",
    "defending",
    "physical",
];

pub fn reject_null_attributes(value: &Value) -> Result<(), SnapshotError> {
    reject_null_table_attributes(&value["tables"])
}

pub fn reject_null_table_attributes(tables: &Value) -> Result<(), SnapshotError> {
    let Some(players) = tables.get("players").and_then(Value::as_array) else {
        return Ok(());
    };
    for player in players {
        let Some(attributes) = player.get("attributes").and_then(Value::as_object) else {
            continue;
        };
        for key in ATTRIBUTE_KEYS {
            if attributes.get(*key).is_some_and(Value::is_null) {
                return Err(SnapshotError::Invalid("attribute cannot be null".into()));
            }
        }
    }
    Ok(())
}

pub fn validate_snapshot(snapshot: &CampaignSnapshot) -> Result<(), SnapshotError> {
    match (
        snapshot.source_storage,
        snapshot.source_schema_version.get(),
    ) {
        (crate::enums::SourceStorage::Sqlite, 2..=4) => {}
        _ => return Err(SnapshotError::UnsupportedVersion("source schema".into())),
    }
    if snapshot.campaign_revision.get() < 0 {
        return Err(SnapshotError::Invalid("campaign revision".into()));
    }
    require_timestamp(&snapshot.exported_at, "exportedAt")?;
    validate_campaign_tables(&snapshot.tables)
}

/// Domain invariants shared by internal campaign reads and snapshot transport.
pub fn validate_campaign_tables(tables: &SnapshotTables) -> Result<(), SnapshotError> {
    require_len(tables.campaigns.len(), 1, 1, "campaigns")?;
    require_len(tables.seasons.len(), 1, 64, "seasons")?;
    require_len(tables.leagues.len(), 0, 32, "leagues")?;
    require_len(tables.clubs.len(), 0, 256, "clubs")?;
    require_len(tables.players.len(), 0, 8_000, "players")?;
    require_len(tables.contracts.len(), 0, 8_000, "contracts")?;
    require_len(tables.constitutions.len(), 0, 64, "constitutions")?;
    require_len(tables.ledger_entries.len(), 0, 8_000, "ledgerEntries")?;
    require_len(tables.transfers.len(), 0, 8_000, "transfers")?;
    require_len(tables.offers.len(), 0, 8_000, "offers")?;
    require_len(tables.negotiations.len(), 0, 4_000, "negotiations")?;
    require_len(tables.lineups.len(), 0, 256, "lineups")?;
    require_len(tables.registrations.len(), 0, 16_000, "registrations")?;
    require_len(tables.shortlist_items.len(), 0, 2_000, "shortlistItems")?;
    require_len(tables.scouting_reports.len(), 0, 8_000, "scoutingReports")?;
    require_len(tables.development_plans.len(), 0, 8_000, "developmentPlans")?;
    require_len(tables.audit_events.len(), 0, 16_000, "auditEvents")?;
    require_len(tables.import_receipts.len(), 0, 256, "importReceipts")?;
    require_len(tables.simulation_states.len(), 1, 1, "simulationStates")?;
    require_len(
        tables.club_simulation_states.len(),
        0,
        256,
        "clubSimulationStates",
    )?;
    require_len(
        tables.player_simulation_states.len(),
        0,
        8_000,
        "playerSimulationStates",
    )?;
    require_len(
        tables.simulation_receipts.len(),
        0,
        256,
        "simulationReceipts",
    )?;
    require_len(tables.fixtures.len(), 0, 2_048, "fixtures")?;
    require_len(tables.simulated_matches.len(), 0, 2_048, "simulatedMatches")?;
    require_len(
        tables.simulated_appearances.len(),
        0,
        80_000,
        "simulatedAppearances",
    )?;
    validate_tables(tables)
}

fn validate_tables(tables: &SnapshotTables) -> Result<(), SnapshotError> {
    let mut fixture_keys = BTreeSet::new();
    let mut fixture_rounds = BTreeSet::new();
    for row in &tables.fixtures {
        require_range(row.round.get(), 1, 34, "fixture round")?;
        require_date(&row.match_date, "match date")?;
        require_key(&row.fixture_key, "fixture key")?;
        if row.home_club_id == row.away_club_id
            || !fixture_keys.insert((row.campaign_id.as_str(), &row.fixture_key))
            || !fixture_rounds.insert((
                row.campaign_id.as_str(),
                row.season_id.as_str(),
                row.round.get(),
                row.home_club_id.as_str(),
            ))
        {
            return Err(SnapshotError::Invalid("fixture identity".into()));
        }
    }
    let mut matches = BTreeSet::new();
    for row in &tables.simulated_matches {
        if !matches.insert((row.campaign_id.as_str(), row.fixture_id.as_str())) {
            return Err(SnapshotError::Invalid("duplicate match".into()));
        }
        for goals in [row.home_goals, row.away_goals] {
            require_range(goals.get(), 0, 15, "match goals")?;
        }
        for xg in [row.home_xg_milli, row.away_xg_milli] {
            require_range(xg.get(), 0, 20_000, "match xG")?;
        }
        require_range(row.event_seed.get(), 0, 0xffff_ffff, "event seed")?;
        let events = row
            .timeline
            .as_array()
            .ok_or_else(|| SnapshotError::Invalid("timeline".into()))?;
        require_len(events.len(), 0, 80, "timeline events")?;
        if !row.input_snapshot.is_object() {
            return Err(SnapshotError::Invalid("input snapshot".into()));
        }
        for value in [&row.timeline, &row.input_snapshot] {
            check_payload(value, 1)?;
            reject_attribute_blobs(value)?;
            if serde_json::to_vec(value)
                .map_err(|_| SnapshotError::Invalid("match JSON".into()))?
                .len()
                > MAX_STRING
            {
                return Err(SnapshotError::Invalid("match JSON size".into()));
            }
        }
    }
    let mut appearances = BTreeSet::new();
    for row in &tables.simulated_appearances {
        if !appearances.insert((
            row.campaign_id.as_str(),
            row.fixture_id.as_str(),
            row.player_id.as_str(),
        )) {
            return Err(SnapshotError::Invalid("duplicate appearance".into()));
        }
        for (value, max, name) in [
            (row.minutes, 90, "minutes"),
            (row.goals, 15, "goals"),
            (row.assists, 15, "assists"),
            (row.rating, 100, "rating"),
            (row.yellow_cards, 2, "yellow cards"),
            (row.red_cards, 1, "red cards"),
        ] {
            require_range(value.get(), 0, max, name)?;
        }
    }

    for row in &tables.campaigns {
        validate_campaign(row)?;
    }
    for row in &tables.seasons {
        validate_season(row)?;
    }
    for row in &tables.leagues {
        validate_league(row)?;
    }
    for row in &tables.clubs {
        validate_club(row)?;
    }
    for row in &tables.players {
        validate_player(row)?;
    }
    for row in &tables.contracts {
        validate_contract(row)?;
    }
    for row in &tables.constitutions {
        validate_constitution(row)?;
    }
    for row in &tables.ledger_entries {
        validate_ledger(row)?;
    }
    for row in &tables.transfers {
        validate_transfer(row)?;
    }
    for row in &tables.offers {
        validate_offer(row)?;
    }
    let mut open_buys = BTreeSet::new();
    for row in &tables.negotiations {
        validate_negotiation(row)?;
        if negotiation_is_open(row.status)
            && !open_buys.insert((
                row.campaign_id.as_str(),
                row.buyer_club_id.as_str(),
                row.player_id.as_str(),
            ))
        {
            return Err(SnapshotError::Invalid("open negotiation".into()));
        }
    }
    for row in &tables.lineups {
        validate_lineup(row)?;
    }
    for row in &tables.registrations {
        validate_registration(row)?;
    }
    for row in &tables.shortlist_items {
        validate_shortlist(row)?;
    }
    for row in &tables.scouting_reports {
        validate_scouting(row)?;
    }
    for row in &tables.development_plans {
        validate_development(row)?;
    }
    for row in &tables.audit_events {
        require_timestamp(&row.created_at, "audit createdAt")?;
        require_bounded(&row.summary, 1, 4_000, "audit summary")?;
        validate_payload(&row.payload)?;
    }
    for row in &tables.import_receipts {
        validate_import(row)?;
    }
    for row in &tables.simulation_states {
        validate_simulation(row)?;
    }
    for row in &tables.club_simulation_states {
        require_key(&row.simulation_key, "club simulation key")?;
    }
    for row in &tables.player_simulation_states {
        validate_player_state(row)?;
    }
    for row in &tables.simulation_receipts {
        validate_receipt(row)?;
    }
    Ok(())
}

fn validate_campaign(row: &CampaignRow) -> Result<(), SnapshotError> {
    require_name(&row.name, 120, "campaign name")?;
    require_bounded(
        row.seed
            .as_deref()
            .ok_or_else(|| SnapshotError::Invalid("seed is required".into()))?,
        1,
        120,
        "seed",
    )?;
    if row.generator_version.as_deref() != Some(crate::generation::PLAYABLE_GENERATOR_VERSION) {
        return Err(SnapshotError::UnsupportedVersion("generator".into()));
    }
    require_nonnegative(row.revision.get(), "revision")?;
    require_timestamp(&row.created_at, "createdAt")?;
    require_timestamp(&row.updated_at, "updatedAt")
}

pub(crate) fn validate_season(row: &SeasonRow) -> Result<(), SnapshotError> {
    require_bounded(&row.label, 1, 40, "season label")?;
    require_range(row.ordinal.get(), 1, JS_MAX_SAFE_INTEGER, "season ordinal")?;
    require_optional_date(row.start_date.as_deref(), "season start")?;
    require_optional_date(row.end_date.as_deref(), "season end")?;
    require_timestamp(&row.opened_at, "season openedAt")?;
    require_optional_timestamp(row.closed_at.as_deref(), "season closedAt")
}

pub(crate) fn validate_league(row: &LeagueRow) -> Result<(), SnapshotError> {
    require_name(&row.name, 120, "league name")?;
    require_optional_country(row.country_code.as_deref())?;
    if let Some(tier) = row.tier {
        require_range(tier.get(), 1, JS_MAX_SAFE_INTEGER, "league tier")?;
    }
    Ok(())
}

pub(crate) fn validate_club(row: &ClubRow) -> Result<(), SnapshotError> {
    require_name(&row.name, 120, "club name")?;
    require_name(&row.short_name, 16, "club short name")?;
    require_hex(&row.colors.primary)?;
    require_hex(&row.colors.secondary)?;
    require_range(row.prestige.get(), 0, 100, "prestige")?;
    require_range(row.academy_tier.get(), 1, 5, "academy tier")?;
    require_optional_bounded(row.scouting_region.as_deref(), 1, 80, "scouting region")
}

pub(crate) fn validate_player(row: &PlayerRow) -> Result<(), SnapshotError> {
    require_name(&row.name, 120, "player name")?;
    if row.positions.is_empty() || row.positions.len() > 5 {
        return Err(SnapshotError::Invalid("positions".into()));
    }
    let mut seen = BTreeSet::new();
    for position in &row.positions {
        if !seen.insert(position) {
            return Err(SnapshotError::Invalid("duplicate position".into()));
        }
        if position_group_for(*position) != row.position_group {
            return Err(SnapshotError::Invalid("position group".into()));
        }
    }
    require_optional_country(row.nationality_code.as_deref())?;
    require_optional_date(row.birth_date.as_deref(), "birth date")?;
    match (row.reported_age, row.age_reference_season_ordinal) {
        (None, None) => {}
        (Some(age), Some(ordinal)) => {
            require_range(age.get(), 0, 99, "reported age")?;
            require_range(ordinal.get(), 1, JS_MAX_SAFE_INTEGER, "age reference")?;
        }
        _ => return Err(SnapshotError::Invalid("reported age".into())),
    }
    validate_attributes(&row.attributes)?;
    if let Some(potential) = row.potential {
        require_range(potential.get(), 0, 100, "potential")?;
    }
    require_optional_bounded(row.external_source_id.as_deref(), 1, 200, "external source")
}

fn validate_attributes(attributes: &PlayerAttributes) -> Result<(), SnapshotError> {
    for value in [
        attributes.pace,
        attributes.finishing,
        attributes.passing,
        attributes.dribbling,
        attributes.defending,
        attributes.physical,
    ]
    .into_iter()
    .flatten()
    {
        require_range(value.get(), 0, 100, "attribute")?;
    }
    Ok(())
}

pub(crate) fn validate_contract(row: &ContractRow) -> Result<(), SnapshotError> {
    require_optional_date(row.starts_on.as_deref(), "contract start")?;
    require_optional_date(row.expires_on.as_deref(), "contract end")
}

pub(crate) fn validate_constitution(row: &ConstitutionRow) -> Result<(), SnapshotError> {
    require_range(
        row.version.get(),
        1,
        JS_MAX_SAFE_INTEGER,
        "constitution version",
    )?;
    require_timestamp(&row.updated_at, "constitution updatedAt")?;
    if row.rules.len() != 5 {
        return Err(SnapshotError::Invalid("constitution rules".into()));
    }
    let mut seen = BTreeSet::new();
    for rule in &row.rules {
        if !seen.insert(rule.id_name()) {
            return Err(SnapshotError::Invalid("duplicate constitution rule".into()));
        }
        validate_rule(rule)?;
    }
    Ok(())
}

fn validate_rule(rule: &ConstitutionRule) -> Result<(), SnapshotError> {
    match rule {
        ConstitutionRule::SellToBuy {
            sales_reinvestment_pct,
            prize_reinvestment_pct,
            carryover_pct,
            ..
        } => {
            require_range(sales_reinvestment_pct.get(), 0, 100, "sales percent")?;
            require_range(prize_reinvestment_pct.get(), 0, 100, "prize percent")?;
            require_range(carryover_pct.get(), 0, 100, "carryover percent")
        }
        ConstitutionRule::MaxSigningAge { max_age, .. } => {
            require_range(max_age.get(), 15, 50, "max signing age")
        }
        ConstitutionRule::WageTierCap { .. } => Ok(()),
        ConstitutionRule::PrestigeBidSale {
            required_fee_numerator,
            required_fee_denominator,
            ..
        } => {
            require_range(
                required_fee_numerator.get(),
                1,
                JS_MAX_SAFE_INTEGER,
                "fee numerator",
            )?;
            require_range(
                required_fee_denominator.get(),
                1,
                JS_MAX_SAFE_INTEGER,
                "fee denominator",
            )
        }
        ConstitutionRule::RegistrationQuota {
            roster_limit,
            minimum_homegrown,
            age_exemption_under,
            competition_key,
            ..
        } => {
            require_range(roster_limit.get(), 1, JS_MAX_SAFE_INTEGER, "roster limit")?;
            require_nonnegative(minimum_homegrown.get(), "minimum homegrown")?;
            if let Some(age) = age_exemption_under {
                require_range(age.get(), 1, JS_MAX_SAFE_INTEGER, "age exemption")?;
            }
            require_bounded(competition_key, 1, 40, "competition key")
        }
    }
}

fn validate_ledger(row: &crate::rows::LedgerEntryRow) -> Result<(), SnapshotError> {
    require_date(&row.effective_on, "ledger date")?;
    require_optional_bounded(row.note.as_deref(), 1, 4_000, "ledger note")?;
    let reversal = row.kind == LedgerKind::Reversal;
    if reversal != row.reverses_entry_id.is_some() {
        return Err(SnapshotError::Invalid("ledger reversal".into()));
    }
    Ok(())
}

fn validate_transfer(row: &TransferRow) -> Result<(), SnapshotError> {
    require_date(&row.effective_on, "transfer date")?;
    if row.from_club_id.is_none() && row.to_club_id.is_none() {
        return Err(SnapshotError::Invalid("transfer clubs".into()));
    }
    if row.kind == TransferKind::Free && row.fee_cents.get() != 0 {
        return Err(SnapshotError::Invalid("free transfer fee".into()));
    }
    Ok(())
}

fn validate_offer(row: &OfferRow) -> Result<(), SnapshotError> {
    require_date(&row.received_on, "offer received")?;
    require_optional_date(row.resolved_on.as_deref(), "offer resolved")?;
    require_optional_date(row.deadline_on.as_deref(), "offer deadline")?;
    if row.status == OfferStatus::Open && row.resolved_on.is_some() {
        return Err(SnapshotError::Invalid("open offer".into()));
    }
    if let Some(prestige) = row.bidder_prestige {
        require_range(prestige.get(), 0, 100, "bidder prestige")?;
    }
    if let Some(prestige) = row.seller_prestige {
        require_range(prestige.get(), 0, 100, "seller prestige")?;
    }
    if let Some(version) = row.constitution_version {
        require_range(version.get(), 1, JS_MAX_SAFE_INTEGER, "offer constitution")?;
    }
    Ok(())
}

fn negotiation_is_open(status: NegotiationStatus) -> bool {
    matches!(
        status,
        NegotiationStatus::Proposed | NegotiationStatus::Countered | NegotiationStatus::Agreed
    )
}

fn validate_negotiation(row: &NegotiationRow) -> Result<(), SnapshotError> {
    require_date(&row.expires_on, "negotiation expires")?;
    require_date(&row.opened_on, "negotiation opened")?;
    require_date(&row.deadline_on, "negotiation deadline")?;
    require_optional_date(row.resolved_on.as_deref(), "negotiation resolved")?;
    require_nonnegative(row.fee_cents.get(), "negotiation fee")?;
    require_nonnegative(row.reserved_cents.get(), "reserved cents")?;
    require_nonnegative(row.wage_cents.get(), "negotiation wage")?;
    require_nonnegative(row.reserved_wage_cents.get(), "reserved wage")?;
    require_range(row.counter_count.get(), 0, 2, "counter count")?;
    require_range(row.event_seed.get(), 0, 0xffff_ffff, "negotiation seed")?;
    let open = negotiation_is_open(row.status);
    if open != row.resolved_on.is_none() {
        return Err(SnapshotError::Invalid("negotiation resolution".into()));
    }
    if !open && row.reserved_cents.get() != 0 {
        return Err(SnapshotError::Invalid("reserved cents".into()));
    }
    if let Some(qualification) = &row.qualification {
        require_nonnegative(qualification.fee_cents.get(), "qualification fee")?;
        require_nonnegative(
            qualification.valuation_cents.get(),
            "qualification valuation",
        )?;
        require_range(qualification.buyer_prestige.get(), 0, 100, "buyer prestige")?;
        require_range(
            qualification.seller_prestige.get(),
            0,
            100,
            "seller prestige",
        )?;
        require_range(
            qualification.constitution_version.get(),
            1,
            JS_MAX_SAFE_INTEGER,
            "qualification constitution",
        )?;
        require_range(
            qualification.compulsory.get(),
            0,
            1,
            "qualification compulsory",
        )?;
    }
    Ok(())
}

fn validate_lineup(row: &LineupRow) -> Result<(), SnapshotError> {
    require_name(&row.name, 120, "lineup name")?;
    require_timestamp(&row.updated_at, "lineup updatedAt")?;
    if row.starters.len() > 11 || row.bench_player_ids.len() > 12 {
        return Err(SnapshotError::Invalid("lineup size".into()));
    }
    for starter in &row.starters {
        require_name(&starter.slot, 40, "lineup slot")?;
        require_optional_name(starter.role.as_deref(), 40, "lineup role")?;
    }
    Ok(())
}

fn validate_registration(row: &RegistrationRow) -> Result<(), SnapshotError> {
    require_bounded(&row.competition_key, 1, 40, "registration competition")
}

fn validate_shortlist(row: &ShortlistItemRow) -> Result<(), SnapshotError> {
    require_range(row.priority.get(), 1, 5, "priority")?;
    require_optional_bounded(row.notes.as_deref(), 1, 4_000, "shortlist notes")?;
    require_timestamp(&row.added_at, "shortlist addedAt")
}

fn validate_scouting(row: &ScoutingReportRow) -> Result<(), SnapshotError> {
    require_bounded(&row.archetype, 1, 80, "archetype")?;
    require_bounded(&row.observations, 0, 4_000, "observations")?;
    require_timestamp(&row.created_at, "scouting createdAt")
}

fn validate_development(row: &DevelopmentPlanRow) -> Result<(), SnapshotError> {
    require_optional_name(row.target_role.as_deref(), 40, "target role")?;
    require_bounded(&row.notes, 0, 4_000, "development notes")
}

fn validate_import(row: &ImportReceiptRow) -> Result<(), SnapshotError> {
    require_name(&row.source_name, 120, "import source")?;
    require_timestamp(&row.imported_at, "importedAt")?;
    require_bounded(&row.mapping_version, 1, 40, "mapping version")?;
    if row.row_counts.len() > 20 {
        return Err(SnapshotError::Invalid("row counts".into()));
    }
    for (key, count) in &row.row_counts {
        require_bounded(key, 1, 40, "row count key")?;
        require_nonnegative(count.get(), "row count")?;
    }
    if row.warnings.len() > 100 {
        return Err(SnapshotError::Invalid("warnings".into()));
    }
    for warning in &row.warnings {
        require_bounded(warning, 1, 4_000, "warning")?;
    }
    Ok(())
}

pub(crate) fn validate_simulation(row: &SimulationStateRow) -> Result<(), SnapshotError> {
    require_key(&row.root_seed, "root seed")?;
    if row.root_seed.chars().count() > 120 {
        return Err(SnapshotError::Invalid("root seed".into()));
    }
    require_date(&row.current_date, "current date")?;
    if let Some(key) = row.last_boundary_key.as_deref() {
        require_key(key, "boundary key")?;
    }
    Ok(())
}

pub(crate) fn validate_player_state(row: &PlayerSimulationStateRow) -> Result<(), SnapshotError> {
    require_key(&row.simulation_key, "player simulation key")?;
    require_range(row.fitness.get(), 0, 100, "fitness")?;
    require_range(row.sharpness.get(), 0, 100, "sharpness")?;
    if let Some(goalkeeping) = row.goalkeeping {
        require_range(goalkeeping.get(), 0, 100, "goalkeeping")?;
    }
    require_optional_date(row.injury_until_date.as_deref(), "injury date")?;
    require_nonnegative(row.suspension_matches.get(), "suspension")
}

fn validate_receipt(row: &SimulationReceiptRow) -> Result<(), SnapshotError> {
    require_key(&row.operation_key, "operation key")?;
    require_nonnegative(row.input_revision.get(), "input revision")?;
    if row.input_fingerprint.trim() != row.input_fingerprint {
        return Err(SnapshotError::Invalid("fingerprint".into()));
    }
    require_bounded(&row.input_fingerprint, 1, 512, "fingerprint")?;
    require_range(row.event_seed.get(), 0, 0xffff_ffff, "event seed")?;
    if row.outcome_refs.is_empty() || row.outcome_refs.len() > 32 {
        return Err(SnapshotError::Invalid("outcome refs".into()));
    }
    for outcome in &row.outcome_refs {
        if let OutcomeRef::Boundary { key } = outcome {
            require_key(key, "outcome boundary")?;
        }
    }
    require_timestamp(&row.created_at, "receipt createdAt")
}

fn reject_attribute_blobs(value: &Value) -> Result<(), SnapshotError> {
    match value {
        Value::Object(map) => {
            if map.contains_key("attributes") {
                return Err(SnapshotError::Invalid("nested attributes".into()));
            }
            for item in map.values() {
                reject_attribute_blobs(item)?;
            }
        }
        Value::Array(items) => {
            for item in items {
                reject_attribute_blobs(item)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn validate_payload(payload: &AuditPayload) -> Result<(), SnapshotError> {
    let value = Value::Object(payload.0.clone());
    check_payload(&value, 1)?;
    let encoded =
        serde_json::to_string(&value).map_err(|_| SnapshotError::Invalid("payload".into()))?;
    if encoded.len() > MAX_STRING {
        return Err(SnapshotError::Invalid("payload size".into()));
    }
    Ok(())
}

fn check_payload(value: &Value, depth: usize) -> Result<(), SnapshotError> {
    if depth > PAYLOAD_DEPTH {
        return Err(SnapshotError::Invalid("payload depth".into()));
    }
    match value {
        Value::Null | Value::Bool(_) => Ok(()),
        Value::Number(number) => {
            let safe_i64 = number
                .as_i64()
                .is_some_and(|item| (-JS_MAX_SAFE_INTEGER..=JS_MAX_SAFE_INTEGER).contains(&item));
            let safe_u64 = number
                .as_u64()
                .is_some_and(|item| item <= JS_MAX_SAFE_INTEGER as u64);
            if (number.is_i64() && safe_i64) || (number.is_u64() && safe_u64) {
                Ok(())
            } else {
                Err(SnapshotError::Invalid("payload number".into()))
            }
        }
        Value::String(text) => {
            if text.chars().count() > MAX_STRING {
                Err(SnapshotError::Invalid("payload string".into()))
            } else {
                Ok(())
            }
        }
        Value::Array(items) => items
            .iter()
            .try_for_each(|item| check_payload(item, depth + 1)),
        Value::Object(map) => map
            .values()
            .try_for_each(|item| check_payload(item, depth + 1)),
    }
}

fn require_len(length: usize, min: usize, max: usize, context: &str) -> Result<(), SnapshotError> {
    if length < min || length > max {
        Err(SnapshotError::Invalid(context.into()))
    } else {
        Ok(())
    }
}

fn require_range(value: i64, min: i64, max: i64, context: &str) -> Result<(), SnapshotError> {
    if value < min || value > max {
        Err(SnapshotError::Invalid(context.into()))
    } else {
        Ok(())
    }
}

fn require_nonnegative(value: i64, context: &str) -> Result<(), SnapshotError> {
    require_range(value, 0, JS_MAX_SAFE_INTEGER, context)
}

fn require_name(value: &str, max: usize, context: &str) -> Result<(), SnapshotError> {
    if value.trim() != value {
        return Err(SnapshotError::Invalid(context.into()));
    }
    require_bounded(value, 1, max, context)
}

fn require_optional_name(
    value: Option<&str>,
    max: usize,
    context: &str,
) -> Result<(), SnapshotError> {
    if let Some(text) = value {
        require_name(text, max, context)?;
    }
    Ok(())
}

fn require_bounded(
    value: &str,
    min: usize,
    max: usize,
    context: &str,
) -> Result<(), SnapshotError> {
    let length = value.chars().count();
    if length < min || length > max || length > MAX_STRING {
        Err(SnapshotError::Invalid(context.into()))
    } else {
        Ok(())
    }
}

fn require_optional_bounded(
    value: Option<&str>,
    min: usize,
    max: usize,
    context: &str,
) -> Result<(), SnapshotError> {
    if let Some(text) = value {
        require_bounded(text, min, max, context)?;
    }
    Ok(())
}

fn require_key(value: &str, context: &str) -> Result<(), SnapshotError> {
    if value.trim() != value {
        return Err(SnapshotError::Invalid(context.into()));
    }
    require_bounded(value, 1, 200, context)
}

fn require_hex(value: &str) -> Result<(), SnapshotError> {
    let bytes = value.as_bytes();
    if bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit) {
        Ok(())
    } else {
        Err(SnapshotError::Invalid("color".into()))
    }
}

fn require_optional_country(value: Option<&str>) -> Result<(), SnapshotError> {
    if let Some(code) = value {
        let bytes = code.as_bytes();
        if bytes.len() != 2 || !bytes.iter().all(|byte| byte.is_ascii_uppercase()) {
            return Err(SnapshotError::Invalid("country".into()));
        }
    }
    Ok(())
}

fn require_optional_date(value: Option<&str>, context: &str) -> Result<(), SnapshotError> {
    if let Some(text) = value {
        require_date(text, context)?;
    }
    Ok(())
}

fn require_optional_timestamp(value: Option<&str>, context: &str) -> Result<(), SnapshotError> {
    if let Some(text) = value {
        require_timestamp(text, context)?;
    }
    Ok(())
}

fn require_date(value: &str, context: &str) -> Result<(), SnapshotError> {
    if is_real_date(value) {
        Ok(())
    } else {
        Err(SnapshotError::Invalid(context.into()))
    }
}

fn require_timestamp(value: &str, context: &str) -> Result<(), SnapshotError> {
    let bytes = value.as_bytes();
    if bytes.len() == 24
        && bytes[10] == b'T'
        && bytes[13] == b':'
        && bytes[16] == b':'
        && bytes[19] == b'.'
        && bytes[23] == b'Z'
        && is_real_date(&value[..10])
        && bytes[11..13].iter().all(u8::is_ascii_digit)
        && bytes[14..16].iter().all(u8::is_ascii_digit)
        && bytes[17..19].iter().all(u8::is_ascii_digit)
        && bytes[20..23].iter().all(u8::is_ascii_digit)
    {
        let hour = parse_two(&bytes[11..13]);
        let minute = parse_two(&bytes[14..16]);
        let second = parse_two(&bytes[17..19]);
        if hour <= 23 && minute <= 59 && second <= 59 {
            return Ok(());
        }
    }
    Err(SnapshotError::Invalid(context.into()))
}

fn is_real_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    if !bytes[..4].iter().all(u8::is_ascii_digit)
        || !bytes[5..7].iter().all(u8::is_ascii_digit)
        || !bytes[8..].iter().all(u8::is_ascii_digit)
    {
        return false;
    }
    let year = parse_four(&bytes[..4]);
    let month = parse_two(&bytes[5..7]);
    let day = parse_two(&bytes[8..]);
    if !(1900..=2199).contains(&year) || !(1..=12).contains(&month) {
        return false;
    }
    let leap = year % 400 == 0 || (year % 100 != 0 && year % 4 == 0);
    let length = match month {
        2 if leap => 29,
        2 => 28,
        4 | 6 | 9 | 11 => 30,
        _ => 31,
    };
    (1..=length).contains(&day)
}

fn parse_two(bytes: &[u8]) -> i64 {
    i64::from((bytes[0] - b'0') * 10 + (bytes[1] - b'0'))
}

fn parse_four(bytes: &[u8]) -> i64 {
    i64::from(bytes[0] - b'0') * 1000
        + i64::from(bytes[1] - b'0') * 100
        + i64::from(bytes[2] - b'0') * 10
        + i64::from(bytes[3] - b'0')
}
