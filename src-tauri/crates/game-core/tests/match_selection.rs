use game_core::{
    ability::role_ability, dates::DateOnly, match_selection::*, selection::formation_slots, *,
};

fn attributes(value: i64) -> PlayerAttributes {
    let n = Some(SafeInt::new(value).unwrap());
    PlayerAttributes {
        pace: n,
        finishing: n,
        passing: n,
        dribbling: n,
        defending: n,
        physical: n,
    }
}
fn ids(count: usize) -> Vec<String> {
    (0..count).map(|i| format!("player-{i:02}")).collect()
}
fn date() -> DateOnly {
    DateOnly::parse("2026-09-01").unwrap()
}
fn roster<'a>(ids: &'a [String], attributes: &'a PlayerAttributes) -> Vec<MatchPlayer<'a>> {
    ids.iter()
        .enumerate()
        .map(|(i, id)| MatchPlayer {
            player_id: id,
            simulation_key: id,
            position_group: if i < 11 {
                formation_slots(Formation::F433)[i].1
            } else {
                [
                    PositionGroup::Gk,
                    PositionGroup::Def,
                    PositionGroup::Mid,
                    PositionGroup::Fwd,
                ][(i - 11) % 4]
            },
            attributes,
            goalkeeping: None,
            fitness: 100,
            sharpness: 100,
            life: PlayerLife::Active,
            contract_active: true,
            injury_until_date: None,
            suspension_matches: 0,
            registration: Some(MatchRegistration {
                competition_key: "league",
                status: RegistrationStatus::Registered,
                age_exempt: None,
            }),
        })
        .collect()
}
fn id(s: &str) -> EntityId {
    EntityId::new(s).unwrap()
}
fn lineup(ids: &[String]) -> LineupRow {
    LineupRow {
        id: id("lineup-a"),
        campaign_id: id("campaign"),
        season_id: id("season"),
        name: "First XI".into(),
        formation: Formation::F433,
        starters: formation_slots(Formation::F433)
            .iter()
            .enumerate()
            .map(|(i, (slot, _))| LineupStarter {
                player_id: id(&ids[i]),
                slot: (*slot).into(),
                role: None,
            })
            .collect(),
        bench_player_ids: ids.iter().skip(11).take(12).map(|s| id(s)).collect(),
        updated_at: "2026-08-31T12:00:00.000Z".into(),
    }
}
fn ready(selection: &ClubSelection) -> (SelectionMode, &[SelectedPlayer]) {
    match selection {
        ClubSelection::Ready { mode, players, .. } => (*mode, players),
        other => panic!("not ready: {other:?}"),
    }
}
fn blocked(selection: ClubSelection, message: &str) {
    assert_eq!(
        selection,
        ClubSelection::Blocked {
            message: if message == LINEUP_REQUIRED {
                LINEUP_REQUIRED
            } else {
                INSUFFICIENT_PLAYERS
            }
        }
    );
}

#[test]
fn strength_reuses_role_weights_and_pins_position_fitness_and_sharpness_floors() {
    let attrs = attributes(81);
    for group in [
        PositionGroup::Gk,
        PositionGroup::Def,
        PositionGroup::Mid,
        PositionGroup::Fwd,
    ] {
        assert_eq!(
            effective_strength(&attrs, group, group, None, 100, 100).unwrap(),
            role_ability(&attrs, group).unwrap().get()
        );
    }
    assert_eq!(
        effective_strength(
            &attrs,
            PositionGroup::Def,
            PositionGroup::Mid,
            None,
            100,
            100
        )
        .unwrap(),
        60
    );
    assert_eq!(
        effective_strength(
            &attrs,
            PositionGroup::Gk,
            PositionGroup::Fwd,
            None,
            100,
            100
        )
        .unwrap(),
        40
    );
    assert_eq!(
        effective_strength(
            &attrs,
            PositionGroup::Fwd,
            PositionGroup::Gk,
            None,
            100,
            100
        )
        .unwrap(),
        40
    );
    assert_eq!(
        effective_strength(&attrs, PositionGroup::Def, PositionGroup::Def, None, 100, 0).unwrap(),
        27
    );
    assert_eq!(
        effective_strength(&attrs, PositionGroup::Def, PositionGroup::Mid, None, 59, 79).unwrap(),
        30
    ); // floor(60*59/100)*129/150
    assert_eq!(
        effective_strength(
            &attrs,
            PositionGroup::Gk,
            PositionGroup::Gk,
            Some(99),
            100,
            100
        )
        .unwrap(),
        99
    );
    for invalid in [None, Some(-1), Some(101)] {
        assert_eq!(
            effective_strength(
                &attrs,
                PositionGroup::Gk,
                PositionGroup::Gk,
                invalid,
                100,
                100
            )
            .unwrap(),
            81
        );
    }
    assert_eq!(
        effective_strength(
            &attrs,
            PositionGroup::Fwd,
            PositionGroup::Fwd,
            Some(99),
            100,
            100
        )
        .unwrap(),
        81
    );
    for value in [-1, 101, i64::MAX] {
        assert!(effective_strength(
            &attrs,
            PositionGroup::Def,
            PositionGroup::Def,
            None,
            value,
            100
        )
        .is_err());
        assert!(effective_strength(
            &attrs,
            PositionGroup::Def,
            PositionGroup::Def,
            None,
            100,
            value
        )
        .is_err());
    }
    let mut missing = attrs.clone();
    missing.pace = None;
    assert!(effective_strength(
        &missing,
        PositionGroup::Gk,
        PositionGroup::Gk,
        Some(99),
        100,
        100
    )
    .is_err());
    let invalid = attributes(101);
    assert!(effective_strength(
        &invalid,
        PositionGroup::Def,
        PositionGroup::Def,
        None,
        100,
        100
    )
    .is_err());
    assert!(effective_strength(
        &attrs,
        PositionGroup::Unknown,
        PositionGroup::Def,
        None,
        100,
        100
    )
    .is_err());
}

#[test]
fn saved_lineup_uses_slot_order_first_nine_bench_and_does_not_mutate_inputs() {
    let ids = ids(23);
    let attrs = attributes(70);
    let mut players = roster(&ids, &attrs);
    let mut saved = lineup(&ids);
    saved.starters.reverse();
    let before = saved.clone();
    // Bench position ten is outside the match and may be unavailable.
    players[20].suspension_matches = 1;
    let selection = select_managed_club(&players, std::slice::from_ref(&saved), "season", &date());
    let (mode, selected) = ready(&selection);
    assert_eq!(mode, SelectionMode::SavedLineup);
    assert_eq!(selected.len(), 20);
    for (p, (slot, _)) in selected
        .iter()
        .take(11)
        .zip(formation_slots(Formation::F433))
    {
        assert_eq!(&p.slot, slot);
        assert!(p.started);
    }
    assert_eq!(selected[19].simulation_key, ids[19]);
    assert!(!selected.iter().any(|p| p.simulation_key == ids[20]));
    assert_eq!(saved, before);
}

#[test]
fn newest_active_season_lineup_wins_and_equal_timestamps_use_lowest_id() {
    let ids = ids(23);
    let attrs = attributes(70);
    let players = roster(&ids, &attrs);
    let good = lineup(&ids);
    let mut bad = good.clone();
    bad.id = id("lineup-b");
    bad.starters.pop();
    assert_eq!(
        ready(&select_managed_club(
            &players,
            &[bad.clone(), good.clone()],
            "season",
            &date()
        ))
        .0,
        SelectionMode::SavedLineup
    );
    bad.updated_at = "2026-09-01T00:00:00.000Z".into();
    blocked(
        select_managed_club(&players, &[good.clone(), bad.clone()], "season", &date()),
        LINEUP_REQUIRED,
    );
    bad.season_id = id("old-season");
    assert_eq!(
        ready(&select_managed_club(
            &players,
            &[bad, good],
            "season",
            &date()
        ))
        .0,
        SelectionMode::SavedLineup
    );
}

#[test]
fn malformed_saved_lineups_block_when_a_legal_replacement_xi_exists() {
    let ids = ids(23);
    let attrs = attributes(70);
    let players = roster(&ids, &attrs);
    let good = lineup(&ids);
    let mut variants = Vec::new();
    let mut duplicate = good.clone();
    duplicate.starters[1].player_id = duplicate.starters[2].player_id.clone();
    variants.push(duplicate);
    let mut duplicate_slot = good.clone();
    duplicate_slot.starters[1].slot = "gk".into();
    variants.push(duplicate_slot);
    let mut no_keeper = good.clone();
    no_keeper.starters[0].player_id = id(&ids[1]);
    no_keeper.starters[1].player_id = id(&ids[0]);
    variants.push(no_keeper);
    let mut bench_duplicate = good.clone();
    bench_duplicate.bench_player_ids[11] = bench_duplicate.bench_player_ids[0].clone();
    variants.push(bench_duplicate);
    let mut overlap = good.clone();
    overlap.bench_player_ids[0] = id(&ids[0]);
    variants.push(overlap);
    let mut missing = good.clone();
    missing.starters.pop();
    variants.push(missing);
    let mut unknown = good.clone();
    unknown.starters[1].slot = "unknown".into();
    variants.push(unknown);
    for invalid in variants {
        blocked(
            select_managed_club(&players, &[invalid], "season", &date()),
            LINEUP_REQUIRED,
        );
    }
    blocked(
        select_managed_club(&players, &[], "season", &date()),
        LINEUP_REQUIRED,
    );
}

#[test]
fn registration_life_contract_injury_and_suspension_are_managed_eligibility_gates() {
    let ids = ids(23);
    let attrs = attributes(70);
    let original = roster(&ids, &attrs);
    let saved = lineup(&ids);
    let future = DateOnly::parse("2026-09-02").unwrap();
    for kind in 0..7 {
        let mut players = original.clone();
        match kind {
            0 => players[1].registration = None,
            1 => players[1].registration.as_mut().unwrap().competition_key = "cup",
            2 => players[1].registration.as_mut().unwrap().status = RegistrationStatus::Unknown,
            3 => players[1].injury_until_date = Some(&future),
            4 => players[1].suspension_matches = 1,
            5 => players[1].contract_active = false,
            _ => players[1].life = PlayerLife::Retired,
        }
        blocked(
            select_managed_club(&players, std::slice::from_ref(&saved), "season", &date()),
            LINEUP_REQUIRED,
        );
    }
    let today = date();
    let mut exempt = original.clone();
    exempt[1].registration.as_mut().unwrap().status = RegistrationStatus::Ineligible;
    exempt[1].registration.as_mut().unwrap().age_exempt = Some(true);
    exempt[1].injury_until_date = Some(&today);
    assert_eq!(
        ready(&select_managed_club(&exempt, &[saved], "season", &today)).0,
        SelectionMode::SavedLineup
    );
}

#[test]
fn emergency_uses_active_contracts_and_only_relaxes_availability_below_eleven() {
    let ids = ids(12);
    let attrs = attributes(70);
    let mut players = roster(&ids, &attrs);
    let future = DateOnly::parse("2026-09-02").unwrap();
    players[10].registration = None;
    players[11].registration = None;
    let selection = select_managed_club(&players, &[], "season", &date());
    assert_eq!(ready(&selection).0, SelectionMode::Emergency);
    assert_eq!(ready(&selection).1.iter().filter(|p| p.started).count(), 11);
    players[10].injury_until_date = Some(&future);
    let selection = select_ai_club(&players, &date()).unwrap();
    assert!(!ready(&selection)
        .1
        .iter()
        .any(|p| p.simulation_key == ids[10])); // eleven healthy
    players[11].injury_until_date = Some(&future);
    let selection = select_ai_club(&players, &date()).unwrap();
    assert_eq!(
        ready(&selection)
            .1
            .iter()
            .filter(|p| p.started && (p.simulation_key == ids[10] || p.simulation_key == ids[11]))
            .count(),
        1
    );
    players[10].injury_until_date = None;
    players[11].injury_until_date = None;
    players[10].suspension_matches = 1;
    assert!(!ready(&select_ai_club(&players, &date()).unwrap())
        .1
        .iter()
        .any(|p| p.simulation_key == ids[10]));
    players[11].suspension_matches = 1;
    assert_eq!(
        ready(&select_ai_club(&players, &date()).unwrap())
            .1
            .iter()
            .filter(|p| p.started && (p.simulation_key == ids[10] || p.simulation_key == ids[11]))
            .count(),
        1
    );
    players[10].contract_active = false;
    players[11].life = PlayerLife::Retired;
    blocked(
        select_ai_club(&players, &date()).unwrap(),
        INSUFFICIENT_PLAYERS,
    );
    blocked(
        select_managed_club(&players, &[], "season", &date()),
        INSUFFICIENT_PLAYERS,
    );
}

#[test]
fn ai_ignores_registration_and_is_stable_under_input_and_entity_id_changes() {
    let ids = ids(23);
    let attrs = attributes(70);
    let mut players = roster(&ids, &attrs);
    for p in &mut players {
        p.registration = None;
    }
    let expected = select_ai_club(&players, &date()).unwrap();
    let (_, selected) = ready(&expected);
    assert_eq!(selected[0].position_group, PositionGroup::Gk);
    assert_eq!(selected[1].simulation_key, ids[1]);
    players.reverse();
    assert_eq!(select_ai_club(&players, &date()).unwrap(), expected);
    for (p, new_id) in players.iter_mut().zip(&ids) {
        p.player_id = new_id;
    }
    assert_eq!(select_ai_club(&players, &date()).unwrap(), expected);
}

#[test]
fn automatic_picker_prefers_strength_then_fitness_then_sharpness_then_key() {
    let ids = ids(14);
    let attrs = attributes(70);
    let mut players = roster(&ids, &attrs);
    for p in &mut players {
        p.position_group = PositionGroup::Def;
    }
    players[0].position_group = PositionGroup::Gk;
    players[1].fitness = 60; // weaker than the full-fit defenders
    players[12].fitness = 99;
    players[12].sharpness = 100; // effective 69
    players[13].fitness = 100;
    players[13].sharpness = 99; // effective 69, higher fitness wins
    let result = select_ai_club(&players, &date()).unwrap();
    let (_, selected) = ready(&result);
    assert_eq!(selected[1].simulation_key, ids[2]);
    // Inspect the first bench ordering after the strongest XI are consumed.
    assert_eq!(selected[11].simulation_key, ids[13]);
    assert_eq!(selected[12].simulation_key, ids[12]);

    let zero = attributes(0);
    let mut tied = roster(&ids, &zero);
    for p in &mut tied {
        p.position_group = PositionGroup::Def;
    }
    tied[0].position_group = PositionGroup::Gk;
    tied[1].sharpness = 50;
    tied[2].sharpness = 60;
    for p in tied.iter_mut().skip(3) {
        p.sharpness = 0;
    }
    let result = select_ai_club(&tied, &date()).unwrap();
    assert_eq!(ready(&result).1[1].simulation_key, ids[2]);
    assert_eq!(ready(&result).1[2].simulation_key, ids[1]);
}

#[test]
fn missing_goalkeepers_require_emergency_and_availability_limits_are_independent() {
    let ids = ids(12);
    let attrs = attributes(70);
    let mut players = roster(&ids, &attrs);
    for p in &mut players {
        p.position_group = PositionGroup::Def;
    }
    assert_eq!(
        ready(&select_managed_club(&players, &[], "season", &date())).0,
        SelectionMode::Emergency
    );
    let future = DateOnly::parse("2026-09-02").unwrap();
    players[10].injury_until_date = Some(&future);
    players[11].suspension_matches = 1;
    // Each restriction has eleven alternatives, so neither may be relaxed merely
    // to fill the intersection of the two sets.
    blocked(
        select_ai_club(&players, &date()).unwrap(),
        INSUFFICIENT_PLAYERS,
    );
}

#[test]
fn ten_contracts_block_both_paths_and_invalid_rosters_fail_without_panicking() {
    let ids = ids(10);
    let attrs = attributes(70);
    let players = roster(&ids, &attrs);
    blocked(
        select_ai_club(&players, &date()).unwrap(),
        INSUFFICIENT_PLAYERS,
    );
    blocked(
        select_managed_club(&players, &[], "season", &date()),
        INSUFFICIENT_PLAYERS,
    );
    let mut duplicate = players.clone();
    duplicate[1].simulation_key = duplicate[0].simulation_key;
    assert!(select_ai_club(&duplicate, &date()).is_err());
    let mut invalid = players;
    invalid[0].fitness = 101;
    assert!(select_ai_club(&invalid, &date()).is_err());
    assert!(matches!(
        select_managed_club(&invalid, &[], "season", &date()),
        ClubSelection::Blocked { .. }
    ));
}

fn substitution_selection() -> ClubSelection {
    let mut players = formation_slots(Formation::F433)
        .iter()
        .enumerate()
        .map(|(i, (slot, _))| SelectedPlayer {
            simulation_key: format!("starter-{i}"),
            slot: (*slot).into(),
            started: true,
            effective: 50,
            position_group: PositionGroup::Mid,
            fitness: 59,
            sharpness: 100,
            injury_until_date: None,
            suspension_matches: 0,
        })
        .collect::<Vec<_>>();
    players.extend((0..9).map(|i| SelectedPlayer {
        simulation_key: format!("bench-{i}"),
        slot: "bench".into(),
        started: false,
        effective: 70,
        position_group: PositionGroup::Mid,
        fitness: 100,
        sharpness: 100,
        injury_until_date: None,
        suspension_matches: 0,
    }));
    ClubSelection::Ready {
        mode: SelectionMode::SavedLineup,
        formation: Formation::F433,
        players,
    }
}

#[test]
fn planned_substitutions_pin_thresholds_order_unused_bench_and_five_limit() {
    let mut selection = substitution_selection();
    let ClubSelection::Ready { players, .. } = &mut selection else {
        unreachable!()
    };
    players[1].fitness = 79;
    players[2].fitness = 80;
    players[3].fitness = 60;
    players.reverse(); // starters must still be visited in formation slot order
    let planned = plan_substitutions(&selection).unwrap();
    assert_eq!(planned.len(), 5);
    assert_eq!(
        planned[0],
        PlannedSub {
            minute: 60,
            outgoing_simulation_key: "starter-0".into(),
            incoming_simulation_key: "bench-8".into()
        }
    );
    assert_eq!(planned[1].minute, 75);
    assert_eq!(planned[1].outgoing_simulation_key, "starter-1");
    assert_eq!(planned[2].minute, 75);
    assert!(!planned
        .iter()
        .any(|p| p.outgoing_simulation_key == "starter-2"
            || p.outgoing_simulation_key == "starter-6"));
    assert_eq!(
        planned
            .iter()
            .map(|p| &p.incoming_simulation_key)
            .collect::<std::collections::BTreeSet<_>>()
            .len(),
        5
    );
    assert_eq!(plan_substitutions(&selection).unwrap(), planned);
}

#[test]
fn substitutions_require_same_group_and_higher_fitness_and_reject_invalid_selections() {
    let mut selection = substitution_selection();
    let ClubSelection::Ready { players, .. } = &mut selection else {
        unreachable!()
    };
    for p in players.iter_mut().filter(|p| !p.started) {
        p.fitness = 59;
    }
    assert!(plan_substitutions(&selection).unwrap().is_empty());
    let ClubSelection::Ready { players, .. } = &mut selection else {
        unreachable!()
    };
    for p in players.iter_mut().filter(|p| !p.started) {
        p.fitness = 100;
        p.position_group = PositionGroup::Def;
    }
    assert!(plan_substitutions(&selection).unwrap().is_empty());
    let ClubSelection::Ready { players, .. } = &mut selection else {
        unreachable!()
    };
    players[1].slot = "gk".into();
    assert!(plan_substitutions(&selection).is_err());
    assert!(plan_substitutions(&ClubSelection::Blocked {
        message: LINEUP_REQUIRED
    })
    .is_err());
}
