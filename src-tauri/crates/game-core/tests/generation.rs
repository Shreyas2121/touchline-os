use game_core::{
    ability::*, calendar::preview_time_advance, career::*, dates::DateOnly,
    finance::transfer_capacity, generation::*, policy::Preset, *,
};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

fn s(value: i64) -> SafeInt {
    SafeInt::new(value).unwrap()
}
fn id(value: &str) -> EntityId {
    EntityId::new(value).unwrap()
}
fn input(seed: &str) -> PlayableWorldInput {
    PlayableWorldInput {
        seed: seed.into(),
        generator_version: PLAYABLE_GENERATOR_VERSION.into(),
        campaign_id: id("native-world"),
        start_year: s(2026),
    }
}
fn career_input() -> CareerInput {
    CareerInput {
        campaign_id: id("native-career"),
        name: "Native career".into(),
        seed: "native-world-seed".into(),
        start_year: s(2026),
        club_key: "club:01".into(),
        rules_mode: RulesMode::Challenge,
        preset: Preset::Balanced,
        now: "2026-10-20T12:00:00.000Z".into(),
        season_id: id("new-season"),
        clock_id: id("new-clock"),
        constitution_id: id("new-rules"),
        allocation_id: id("new-allocation"),
        receipt_id: id("new-receipt"),
        audit_event_id: id("new-audit"),
        action_id: id("new-action"),
    }
}
fn attributes(value: i64) -> PlayerAttributes {
    PlayerAttributes {
        pace: Some(s(value)),
        finishing: Some(s(value)),
        passing: Some(s(value)),
        dribbling: Some(s(value)),
        defending: Some(s(value)),
        physical: Some(s(value)),
    }
}

#[test]
fn native_ability_values_wages_and_unknowns_are_bounded() {
    for group in [
        PositionGroup::Gk,
        PositionGroup::Def,
        PositionGroup::Mid,
        PositionGroup::Fwd,
    ] {
        for value in [0, 1, 50, 99, 100] {
            assert_eq!(
                role_ability(&attributes(value), group).unwrap().get(),
                value
            );
        }
    }
    let mut keeper = attributes(50);
    let before = goalkeeper_rating(&keeper).unwrap();
    keeper.finishing = Some(s(100));
    assert_eq!(goalkeeper_rating(&keeper).unwrap(), before);
    keeper.passing = None;
    assert!(goalkeeper_rating(&keeper).is_err());
    assert!(role_ability(&attributes(50), PositionGroup::Unknown).is_err());
    assert!(role_ability(&attributes(101), PositionGroup::Mid).is_err());
    for age in [16, 21, 23, 27, 34, 38] {
        for ability in [0, 50, 100] {
            let value = market_value_cents(age, ability, ability).unwrap();
            assert!(value.get() >= 0);
            assert!(market_value_cents(age, ability, 100).unwrap().get() >= value.get());
            for (tier, cap) in [
                (SquadTier::Youth, 250_000),
                (SquadTier::Rotation, 1_000_000),
                (SquadTier::Key, 2_250_000),
            ] {
                assert!(weekly_wage_cents(age, ability, tier).unwrap().get() <= cap);
            }
        }
    }
    assert!(market_value_cents(27, 80, 79).is_err());
    assert!(weekly_wage_cents(99, 50, SquadTier::Key).is_err());
}

#[test]
fn production_worlds_have_legal_contracts_funds_profiles_and_starting_squads() {
    for seed in [
        "native-world-seed",
        "café-München",
        "astral-😀-𐍈",
        "another-seed",
    ] {
        let request = input(seed);
        let world = generate_playable_world(&request).unwrap();
        assert_eq!(
            (
                world.leagues.len(),
                world.clubs.len(),
                world.players.len(),
                world.contracts.len(),
                world.club_simulation_states.len(),
                world.player_simulation_states.len()
            ),
            (4, 72, 3000, 2880, 72, 3000)
        );
        assert_eq!(
            world.players.iter().filter(|p| p.club_id.is_none()).count(),
            120
        );
        let mut club_counts = BTreeMap::new();
        let mut contract_counts = BTreeMap::new();
        let mut wages = BTreeMap::new();
        for contract in &world.contracts {
            *contract_counts
                .entry(contract.player_id.as_str())
                .or_insert(0) += 1;
            *wages.entry(contract.club_id.as_str()).or_insert(0_i64) +=
                contract.weekly_wage_cents.unwrap().get();
            assert_eq!(contract.status, ContractStatus::Active);
            DateOnly::parse(contract.starts_on.as_ref().unwrap()).unwrap();
            DateOnly::parse(contract.expires_on.as_ref().unwrap()).unwrap();
        }
        for player in &world.players {
            let ability = role_ability(&player.attributes, player.position_group)
                .unwrap()
                .get();
            assert!(player.potential.unwrap().get() >= ability);
            assert_eq!(
                contract_counts
                    .get(player.id.as_str())
                    .copied()
                    .unwrap_or(0),
                usize::from(player.club_id.is_some())
            );
            if let Some(club) = &player.club_id {
                *club_counts.entry(club.as_str()).or_insert(0) += 1;
            }
        }
        for club in &world.clubs {
            assert!((36..=44).contains(&club_counts[club.id.as_str()]));
            let roster = world
                .players
                .iter()
                .filter(|p| p.club_id.as_ref() == Some(&club.id))
                .collect::<Vec<_>>();
            assert!(
                roster
                    .iter()
                    .filter(|p| p.position_group == PositionGroup::Gk)
                    .count()
                    >= 2
            );
            let state = world
                .club_simulation_states
                .iter()
                .find(|state| state.club_id == club.id)
                .unwrap();
            assert!(state.wage_budget_weekly_cents.get() > wages[club.id.as_str()]);
            assert!(state.transfer_balance_cents.get() > 0);
            let seniors = roster
                .iter()
                .filter(|p| p.reported_age.unwrap().get() >= 21)
                .count();
            assert!(seniors >= 25);
            let homegrown = world
                .player_simulation_states
                .iter()
                .filter(|p| {
                    p.homegrown_club && roster.iter().any(|player| player.id == p.player_id)
                })
                .count();
            assert!(homegrown >= 12);
        }
        for profile in &world.player_simulation_states {
            let player = world
                .players
                .iter()
                .find(|p| p.id == profile.player_id)
                .unwrap();
            assert_eq!(
                profile.goalkeeping.is_some(),
                player.position_group == PositionGroup::Gk
            );
            assert_eq!(profile.fitness.get(), 100);
            assert!(profile.injury_until_date.is_none());
        }
        validate_playable_world(&world, &request).unwrap();
    }
}

#[test]
fn native_worlds_repeat_exactly_and_distinct_seeds_change_football_content() {
    let request = input("😀 deterministic");
    let first = generate_playable_world(&request).unwrap();
    let again = generate_playable_world(&request).unwrap();
    assert_eq!(first, again);
    assert_eq!(
        serde_json::to_vec(&first).unwrap(),
        serde_json::to_vec(&again).unwrap()
    );
    let other = generate_playable_world(&input("different seed")).unwrap();
    assert_ne!(first.players, other.players);
}

fn normalize(value: &mut Value, campaign: &str, dates: bool) {
    match value {
        Value::String(text) => {
            if text == campaign || text.starts_with(&format!("{campaign}-")) {
                *text = text.replacen(campaign, "campaign", 1);
            }
        }
        Value::Array(items) => {
            for item in items {
                normalize(item, campaign, dates);
            }
        }
        Value::Object(fields) => {
            for (key, item) in fields {
                if dates && (key == "startsOn" || key == "expiresOn") {
                    *item = Value::Null;
                } else {
                    normalize(item, campaign, dates);
                }
            }
        }
        _ => {}
    }
}
#[test]
fn campaign_ids_and_start_years_do_not_select_football_content() {
    let first_input = input("same content");
    let first = generate_playable_world(&first_input).unwrap();
    let mut changed = first_input.clone();
    changed.campaign_id = id("other-id");
    changed.start_year = s(2198);
    let other = generate_playable_world(&changed).unwrap();
    let mut left = serde_json::to_value(first).unwrap();
    let mut right = serde_json::to_value(&other).unwrap();
    normalize(&mut left, "native-world", true);
    normalize(&mut right, "other-id", true);
    assert_eq!(left, right);
    assert!(other
        .contracts
        .iter()
        .all(
            |contract| contract.starts_on.as_deref() == Some("2198-07-01")
                && contract.expires_on.as_deref() == Some("2199-06-30")
        ));
    changed.start_year = s(1900);
    let earliest = generate_playable_world(&changed).unwrap();
    assert!(earliest
        .contracts
        .iter()
        .all(|c| c.expires_on.as_ref().unwrap().starts_with("190")));
}

#[test]
fn generator_input_limits_and_generated_id_boundaries_are_enforced() {
    let mut request = input("valid");
    for version in ["1", "3", "", "future"] {
        request.generator_version = version.into();
        assert!(generate_playable_world(&request).is_err());
    }
    request.generator_version = PLAYABLE_GENERATOR_VERSION.into();
    for seed in [
        "".into(),
        " padded".into(),
        "padded ".into(),
        "😀".repeat(61),
    ] {
        request.seed = seed;
        assert!(generate_playable_world(&request).is_err());
    }
    request.seed = "😀".repeat(60);
    request.campaign_id = id(&"x".repeat(MAX_CAMPAIGN_ID_LENGTH));
    let world = generate_playable_world(&request).unwrap();
    assert_eq!(
        world
            .player_simulation_states
            .last()
            .unwrap()
            .id
            .as_str()
            .len(),
        64
    );
    request.campaign_id = id(&"x".repeat(MAX_CAMPAIGN_ID_LENGTH + 1));
    assert!(generate_playable_world(&request).is_err());
    request.campaign_id = id("valid");
    for year in [1899, 2199, 2200] {
        request.start_year = s(year);
        assert!(generate_playable_world(&request).is_err());
    }
    assert!(EntityId::new("bad id").is_err());
}

#[test]
fn world_validator_rejects_missing_unsafe_duplicate_and_cross_scope_data() {
    let request = input("validation");
    let original = generate_playable_world(&request).unwrap();
    let mut mutations = Vec::new();
    let mut bad = original.clone();
    bad.contracts.pop();
    mutations.push(bad);
    let mut bad = original.clone();
    bad.players[0].campaign_id = id("foreign");
    mutations.push(bad);
    let mut bad = original.clone();
    bad.contracts[0].club_id = bad.clubs[1].id.clone();
    mutations.push(bad);
    let mut bad = original.clone();
    bad.player_simulation_states[1].simulation_key =
        bad.player_simulation_states[0].simulation_key.clone();
    mutations.push(bad);
    let mut bad = original.clone();
    bad.player_simulation_states[0].goalkeeping = None;
    mutations.push(bad);
    let mut bad = original.clone();
    bad.players[0].potential = Some(s(0));
    mutations.push(bad);
    let mut bad = original.clone();
    bad.players[0].attributes.passing = None;
    mutations.push(bad);
    let mut bad = original.clone();
    bad.clubs[1].id = bad.clubs[0].id.clone();
    mutations.push(bad);
    let mut bad = original.clone();
    bad.club_simulation_states[0].wage_budget_weekly_cents = MoneyCents::new(0).unwrap();
    mutations.push(bad);
    let mut bad = original.clone();
    for profile in &mut bad.player_simulation_states {
        profile.homegrown_club = false;
        profile.homegrown_nation = false;
    }
    mutations.push(bad);
    let mut bad = original.clone();
    bad.players[0].market_value_cents = None;
    mutations.push(bad);
    let mut bad = original.clone();
    bad.contracts[0].expires_on = Some("2026-06-30".into());
    mutations.push(bad);
    for (number, bad) in mutations.iter().enumerate() {
        assert!(
            validate_playable_world(bad, &request).is_err(),
            "accepted mutation {number}"
        );
    }
    validate_playable_world(&original, &request).unwrap();
    let mut encoded = serde_json::to_value(&original).unwrap();
    encoded["contracts"][0]["weeklyWageCents"] = json!(9007199254740992_i64);
    assert!(serde_json::from_value::<PlayableWorld>(encoded).is_err());
}

#[test]
fn prepared_careers_have_one_consistent_initialization_for_each_mode_and_preset() {
    for rules_mode in [RulesMode::Challenge, RulesMode::Sandbox] {
        for preset in [Preset::Balanced, Preset::Strict] {
            let mut input = career_input();
            input.rules_mode = rules_mode;
            input.preset = preset;
            input.club_key = "club:72".into();
            let career = prepare_standalone_career(&input).unwrap();
            validate_prepared_career(&career, &input).unwrap();
            assert_eq!(career.campaign.mode, CampaignMode::Standalone);
            assert_eq!(career.campaign.rules_mode, rules_mode);
            assert_eq!(career.campaign.revision.get(), 0);
            assert_eq!(career.clock.current_date, "2026-07-01");
            assert!(career.clock.last_boundary_key.is_none());
            assert!(
                preview_time_advance(&career.clock, &career.season)
                    .unwrap()
                    .allowed
            );
            let chosen = career
                .world
                .club_simulation_states
                .iter()
                .find(|state| state.simulation_key == "club:72")
                .unwrap();
            assert_eq!(chosen.club_id, career.campaign.managed_club_id);
            assert_eq!(career.receipt.input_fingerprint, career.fingerprint);
            assert_eq!(career.receipt.operation_key, CAREER_OPERATION_KEY);
            assert_eq!(career.audit.action_id, career.allocation.source_action_id);
            assert_eq!(career.audit.action_type, AuditAction::SimulationInitialize);
            let tables = career.clone().into_tables();
            assert_eq!(
                (
                    tables.campaigns.len(),
                    tables.seasons.len(),
                    tables.constitutions.len(),
                    tables.ledger_entries.len(),
                    tables.audit_events.len(),
                    tables.simulation_states.len(),
                    tables.simulation_receipts.len()
                ),
                (1, 1, 1, 1, 1, 1, 1)
            );
            assert!(
                tables.transfers.is_empty()
                    && tables.offers.is_empty()
                    && tables.registrations.is_empty()
            );
            let capacity = transfer_capacity(
                &tables.ledger_entries,
                &input.campaign_id,
                &input.season_id,
                &career.campaign.managed_club_id,
                70,
                100,
            )
            .unwrap();
            assert_eq!(
                capacity.remaining_cents,
                if preset == Preset::Balanced {
                    500_000_000
                } else {
                    200_000_000
                }
            );
            let encoded = serde_json::to_vec(&career).unwrap();
            let roundtrip: PreparedCareer = serde_json::from_slice(&encoded).unwrap();
            assert_eq!(roundtrip, career);
            let ids = tables
                .players
                .iter()
                .map(|p| p.id.as_str())
                .collect::<BTreeSet<_>>();
            assert_eq!(ids.len(), 3000);
        }
    }
}

#[test]
fn initialization_ids_and_audit_time_do_not_change_world_or_retry_fingerprint() {
    let input = career_input();
    let original = prepare_standalone_career(&input).unwrap();
    let mut retry = input.clone();
    retry.now = "2027-03-01T11:12:13.000Z".into();
    retry.audit_event_id = id("retry-audit");
    retry.action_id = id("retry-action");
    retry.receipt_id = id("retry-receipt");
    retry.season_id = id("retry-season");
    retry.constitution_id = id("retry-rules");
    retry.allocation_id = id("retry-allocation");
    retry.clock_id = id("retry-clock");
    let retried = prepare_standalone_career(&retry).unwrap();
    assert_eq!(original.world, retried.world);
    assert_eq!(original.fingerprint, retried.fingerprint);
    assert_eq!(original.receipt.event_seed, retried.receipt.event_seed);
    assert_ne!(original.audit, retried.audit);
    for number in [1, 18, 19, 36, 37, 54, 55, 72] {
        let mut choice = input.clone();
        choice.club_key = club_key(number).unwrap();
        let career = prepare_standalone_career(&choice).unwrap();
        assert_eq!(career.world, original.world);
        assert_eq!(
            career.campaign.managed_club_id,
            career.world.clubs[number - 1].id
        );
        if number != 1 {
            assert_ne!(career.fingerprint, original.fingerprint);
        }
    }
}

#[test]
fn invalid_career_settings_id_collisions_and_altered_initialization_are_rejected() {
    let original = career_input();
    let mut invalid = Vec::new();
    let mut bad = original.clone();
    bad.name = " ".into();
    invalid.push(bad);
    let mut bad = original.clone();
    bad.name = "x\nname".into();
    invalid.push(bad);
    let mut bad = original.clone();
    bad.preset = Preset::Custom;
    invalid.push(bad);
    let mut bad = original.clone();
    bad.now = "not a timestamp".into();
    invalid.push(bad);
    for key in ["club:00", "club:73", "club:1", "club:01 ", "foreign"] {
        let mut bad = original.clone();
        bad.club_key = key.into();
        invalid.push(bad);
    }
    let mut bad = original.clone();
    bad.action_id = bad.receipt_id.clone();
    invalid.push(bad);
    let mut bad = original.clone();
    bad.season_id = id("native-career-player-0001");
    invalid.push(bad);
    for bad in invalid {
        assert!(prepare_standalone_career(&bad).is_err());
    }
    let valid = prepare_standalone_career(&original).unwrap();
    let mut bad = valid.clone();
    bad.campaign.revision = s(1);
    assert!(validate_prepared_career(&bad, &original).is_err());
    let mut bad = valid.clone();
    bad.allocation.amount_cents = MoneyCents::new(1).unwrap();
    assert!(validate_prepared_career(&bad, &original).is_err());
    let mut bad = valid.clone();
    bad.receipt.input_fingerprint = "different".into();
    assert!(validate_prepared_career(&bad, &original).is_err());
    let mut bad = valid.clone();
    bad.clock.current_date = "2026-08-31".into();
    assert!(validate_prepared_career(&bad, &original).is_err());
    let mut bad = valid.clone();
    bad.audit.payload.0.insert("players".into(), json!(1));
    assert!(validate_prepared_career(&bad, &original).is_err());
    let mut encoded = serde_json::to_value(&original).unwrap();
    encoded["preset"] = json!("unknown");
    assert!(serde_json::from_value::<CareerInput>(encoded).is_err());
    assert!(valid.audit.summary.contains("2026-07-01"));
}
