use game_core::{
    dates::{add_days, DateOnly},
    match_engine::*,
    match_selection::{ClubSelection, SelectedPlayer, SelectionMode},
    random::{derive_event_seed, EventKind, Mulberry32},
    selection::formation_slots,
    CoreError, Formation, PositionGroup, JS_MAX_SAFE_INTEGER,
};
use std::collections::BTreeSet;

fn squad(prefix: &str, bench: bool) -> ClubSelection {
    let mut players = formation_slots(Formation::F433)
        .iter()
        .enumerate()
        .map(|(i, (slot, group))| SelectedPlayer {
            simulation_key: format!("{prefix}-{i}"),
            slot: (*slot).into(),
            started: true,
            effective: 60,
            position_group: *group,
            fitness: 100,
            sharpness: 80,
            injury_until_date: None,
            suspension_matches: 0,
        })
        .collect::<Vec<_>>();
    if bench {
        for (i, group) in [
            PositionGroup::Gk,
            PositionGroup::Def,
            PositionGroup::Def,
            PositionGroup::Def,
            PositionGroup::Def,
            PositionGroup::Mid,
            PositionGroup::Mid,
            PositionGroup::Fwd,
            PositionGroup::Fwd,
        ]
        .into_iter()
        .enumerate()
        {
            players.push(SelectedPlayer {
                simulation_key: format!("{prefix}-bench-{i}"),
                slot: "bench".into(),
                started: false,
                effective: 60,
                position_group: group,
                fitness: 100,
                sharpness: 80,
                injury_until_date: None,
                suspension_matches: 0,
            });
        }
    }
    ClubSelection::Ready {
        mode: SelectionMode::Emergency,
        formation: Formation::F433,
        players,
    }
}
fn players(selection: &mut ClubSelection) -> &mut Vec<SelectedPlayer> {
    let ClubSelection::Ready { players, .. } = selection else {
        panic!("test squad")
    };
    players
}
fn play(seed: &str, home: &ClubSelection, away: &ClubSelection) -> EngineMatch {
    simulate_fixture(&EngineInput {
        root_seed: seed,
        fixture_key: "fixture-1",
        match_date: DateOnly::parse("2026-09-01").unwrap(),
        home,
        away,
    })
    .unwrap()
}

#[test]
fn deterministic_stream_and_pinned_first_draws() {
    let home = squad("h", false);
    let away = squad("a", false);
    let seed = derive_event_seed("tiny", "1", EventKind::Fixture, &["fixture-1"]).unwrap();
    let mut random = Mulberry32::new(seed);
    // Pinned independently from the engine, including misses in the draw stream.
    let draws = [
        random.next_int(1000).unwrap(),
        random.next_int(1000).unwrap(),
        random.next_int(1000).unwrap(),
    ];
    assert_eq!(seed, 1_070_559_128);
    assert_eq!(draws, [194, 742, 4]);
    let result = play("tiny", &home, &away);
    assert_eq!(result, play("tiny", &home, &away));
    assert_eq!(result.event_seed, seed);
    assert_eq!(
        result.timeline[0],
        MatchEvent {
            kind: MatchEventKind::Goal,
            minute: 10,
            side: ClubSide::Home,
            simulation_key: "h-9".into(),
            assist_key: Some("h-8".into()),
            xg_milli: Some(138),
            incoming_simulation_key: None,
        }
    );
    assert_eq!(
        result.chances[0],
        EngineChance {
            minute: 1,
            side: ClubSide::Home,
            simulation_key: "h-8".into(),
            xg_milli: 138,
            scored: draws[0] < 138
        }
    );
    assert_ne!(
        seed,
        derive_event_seed("tiny", "1", EventKind::Fixture, &["fixture-2"]).unwrap()
    );
    // Input vector order is not a simulation identity; formation slots set order.
    let mut reordered = home.clone();
    players(&mut reordered).reverse();
    assert_eq!(result, play("tiny", &reordered, &away));
}

#[test]
fn scores_xg_assists_cards_and_appearances_reconcile() {
    let home = squad("h", true);
    let away = squad("a", true);
    for seed in 0..100 {
        let result = play(&format!("reconcile-{seed}"), &home, &away);
        let mut keys = BTreeSet::new();
        for appearance in &result.appearances {
            assert!(keys.insert(&appearance.simulation_key));
            assert!((1..=90).contains(&appearance.minutes));
            assert!((1..=99).contains(&appearance.rating));
            let count = |kind| {
                result
                    .timeline
                    .iter()
                    .filter(|e| e.kind == kind && e.simulation_key == appearance.simulation_key)
                    .count() as u8
            };
            assert_eq!(appearance.goals, count(MatchEventKind::Goal));
            assert_eq!(appearance.yellow_cards, count(MatchEventKind::Yellow));
            assert_eq!(appearance.red_cards, count(MatchEventKind::Red));
            assert_eq!(
                appearance.assists,
                result
                    .timeline
                    .iter()
                    .filter(|e| e.assist_key.as_ref() == Some(&appearance.simulation_key))
                    .count() as u8
            );
        }
        for (side, score, xg) in [
            (ClubSide::Home, result.home_goals, result.home_xg_milli),
            (ClubSide::Away, result.away_goals, result.away_xg_milli),
        ] {
            assert_eq!(
                usize::from(score),
                result
                    .timeline
                    .iter()
                    .filter(|e| e.side == side && e.kind == MatchEventKind::Goal)
                    .count()
            );
            let lost_minutes: u16 = result
                .timeline
                .iter()
                .filter(|e| e.side == side)
                .filter(|e| {
                    e.kind == MatchEventKind::Red
                        || (e.kind == MatchEventKind::Injury
                            && !result.timeline.iter().any(|sub| {
                                sub.kind == MatchEventKind::Substitution
                                    && sub.simulation_key == e.simulation_key
                                    && sub.minute == e.minute
                            }))
                })
                .map(|e| u16::from(90 - e.minute))
                .sum();
            assert_eq!(
                result
                    .appearances
                    .iter()
                    .filter(|a| a.side == side)
                    .map(|a| u16::from(a.minutes))
                    .sum::<u16>(),
                990 - lost_minutes
            );
            assert_eq!(
                xg,
                result
                    .chances
                    .iter()
                    .filter(|e| e.side == side)
                    .map(|e| e.xg_milli)
                    .sum::<i64>()
            );
            assert_eq!(
                usize::from(score),
                result
                    .chances
                    .iter()
                    .filter(|e| e.side == side && e.scored)
                    .count()
            );
        }
        for event in &result.timeline {
            // Exhaustive match ensures the public set stays closed, with no own goal.
            match event.kind {
                MatchEventKind::Goal => {
                    if let Some(assist) = &event.assist_key {
                        assert_ne!(assist, &event.simulation_key);
                        assert!(result
                            .appearances
                            .iter()
                            .any(|a| a.side == event.side && &a.simulation_key == assist));
                    }
                }
                MatchEventKind::Substitution => {
                    let outgoing = result
                        .appearances
                        .iter()
                        .find(|a| a.simulation_key == event.simulation_key)
                        .unwrap();
                    let incoming = result
                        .appearances
                        .iter()
                        .find(|a| Some(&a.simulation_key) == event.incoming_simulation_key.as_ref())
                        .unwrap();
                    assert!(outgoing.minutes <= event.minute);
                    assert!(incoming.minutes <= 90 - event.minute);
                    assert!(!incoming.started);
                }
                MatchEventKind::Yellow | MatchEventKind::Red | MatchEventKind::Injury => {}
            }
        }
        assert!(result
            .timeline
            .windows(2)
            .all(|w| (w[0].minute, w[0].side) <= (w[1].minute, w[1].side)));
    }
}

#[test]
fn home_advantage_precedes_chance_formula_without_mutation() {
    let home = squad("h", false);
    let away = squad("a", false);
    let original = home.clone();
    let result = play("tiny", &home, &away);
    assert_eq!(home, original);
    // Attack 6*64, opposing defense 5*60: 10+(384-300)/50 = 11.
    assert_eq!(
        result
            .chances
            .iter()
            .filter(|c| c.side == ClubSide::Home)
            .count(),
        11
    );
    assert_eq!(result.home_xg_milli, 11 * 138);
    // Away attack 360, home defense 4*64+62 = 318; average /2 = 31.
    assert_eq!(result.away_xg_milli, 8 * 129);
    assert!(result
        .chances
        .iter()
        .all(|c| c.xg_milli == if c.side == ClubSide::Home { 138 } else { 129 }));
    for (i, chance) in result.chances.iter().enumerate() {
        assert_eq!(
            usize::from(chance.minute),
            1 + i * 88 / result.chances.len()
        );
    }
}

#[test]
fn second_yellow_and_existing_bans_are_sequential() {
    let mut home = squad("h", false);
    let away = squad("a", false);
    for player in players(&mut home) {
        player.suspension_matches = 1;
    }
    let mut saw_second_yellow = false;
    let mut saw_no_red = false;
    for seed in 0..300 {
        let root = format!("cards-{seed}");
        let result = play(&root, &home, &away);
        for a in &result.appearances {
            let delta = result
                .availability
                .iter()
                .find(|d| d.simulation_key == a.simulation_key)
                .unwrap();
            if a.side == ClubSide::Home {
                assert_eq!(delta.suspension_matches, i64::from(a.red_cards));
                saw_no_red |= a.red_cards == 0;
            }
            if a.yellow_cards == 2 {
                saw_second_yellow = true;
                assert_eq!(a.red_cards, 1);
                assert_eq!(a.minutes, 75);
                assert_eq!(delta.suspension_matches, 1);
                let events = result
                    .timeline
                    .iter()
                    .filter(|e| {
                        e.simulation_key == a.simulation_key
                            && e.minute == 75
                            && matches!(e.kind, MatchEventKind::Yellow | MatchEventKind::Red)
                    })
                    .map(|e| e.kind)
                    .collect::<Vec<_>>();
                assert_eq!(events, vec![MatchEventKind::Yellow, MatchEventKind::Red]);
            }
        }
    }
    assert!(saw_second_yellow && saw_no_red);
}

#[test]
fn injuries_use_date_arithmetic_and_unused_ranked_replacements() {
    let mut home = squad("h", true);
    // Reverse relative bench strengths so selection cannot accidentally use its
    // input order instead of effective/fitness/sharpness/key ranking.
    for (i, p) in players(&mut home).iter_mut().skip(11).enumerate() {
        p.effective = 60 + i as i64;
    }
    let away = squad("a", true);
    let date = DateOnly::parse("2026-09-01").unwrap();
    let mut count = 0;
    for seed in 0..100 {
        let result = play(&format!("injury-{seed}"), &home, &away);
        let mut used = BTreeSet::new();
        for sub in result
            .timeline
            .iter()
            .filter(|e| e.side == ClubSide::Home && e.kind == MatchEventKind::Substitution)
        {
            let ClubSelection::Ready { players, .. } = &home else {
                unreachable!()
            };
            let outgoing = players
                .iter()
                .find(|p| p.simulation_key == sub.simulation_key)
                .unwrap();
            let expected = players
                .iter()
                .filter(|p| {
                    !p.started
                        && p.position_group == outgoing.position_group
                        && !used.contains(&p.simulation_key)
                })
                .max_by_key(|p| p.effective)
                .unwrap();
            assert_eq!(
                sub.incoming_simulation_key.as_ref(),
                Some(&expected.simulation_key)
            );
            assert!(used.insert(expected.simulation_key.clone()));
        }
        for e in result
            .timeline
            .iter()
            .filter(|e| e.kind == MatchEventKind::Injury)
        {
            count += 1;
            let delta = result
                .availability
                .iter()
                .find(|d| d.simulation_key == e.simulation_key)
                .unwrap();
            assert!((7..=28)
                .any(|days| Some(add_days(&date, days).unwrap()) == delta.injury_until_date));
            assert_eq!(delta.fitness, 94);
            assert_eq!(delta.sharpness, 80);
            assert_eq!(
                result
                    .appearances
                    .iter()
                    .find(|a| a.simulation_key == e.simulation_key)
                    .unwrap()
                    .minutes,
                89
            );
        }
    }
    assert!(count > 0);
}

#[test]
fn five_substitution_limit_and_minutes_include_bench() {
    let mut home = squad("h", true);
    let away = squad("a", false);
    for p in players(&mut home).iter_mut().filter(|p| p.started) {
        p.fitness = 50;
    }
    let mut saw_cancelled = false;
    let mut saw_five = false;
    for seed in 0..100 {
        let result = play(&format!("subs-{seed}"), &home, &away);
        let subs = result
            .timeline
            .iter()
            .filter(|e| e.side == ClubSide::Home && e.kind == MatchEventKind::Substitution)
            .collect::<Vec<_>>();
        assert!(subs.len() <= 5);
        saw_five |= subs.len() == 5;
        for red in result
            .timeline
            .iter()
            .filter(|e| e.side == ClubSide::Home && e.kind == MatchEventKind::Red && e.minute < 60)
        {
            if ["h-0", "h-1", "h-2", "h-3", "h-4"].contains(&red.simulation_key.as_str()) {
                saw_cancelled = true;
                assert!(!subs
                    .iter()
                    .any(|sub| sub.simulation_key == red.simulation_key));
            }
        }
        for event in subs {
            assert!(matches!(event.minute, 60 | 89));
            let a = result
                .appearances
                .iter()
                .find(|a| Some(&a.simulation_key) == event.incoming_simulation_key.as_ref())
                .unwrap();
            assert!((1..=30).contains(&a.minutes));
        }
    }
    assert!(saw_cancelled && saw_five);
}

#[test]
fn availability_and_rating_follow_the_integer_tables() {
    let mut home = squad("h", true);
    let away = squad("a", true);
    players(&mut home)[0].fitness = 70;
    let result = play("tables", &home, &away);
    for delta in &result.availability {
        let appearance = result
            .appearances
            .iter()
            .find(|a| a.simulation_key == delta.simulation_key);
        if let Some(a) = appearance.filter(|_| delta.injury_until_date.is_none()) {
            let kickoff_fitness = if a.simulation_key == "h-0" { 70 } else { 100 };
            assert_eq!(
                delta.fitness,
                (kickoff_fitness - if a.minutes == 90 { 12_i64 } else { 6 }).clamp(40, 100)
            );
            assert_eq!(delta.sharpness, if a.minutes == 90 { 84 } else { 82 });
        } else if appearance.is_none() {
            assert_eq!((delta.fitness, delta.sharpness), (100, 77));
        }
    }
    for a in &result.appearances {
        let (own, other) = if a.side == ClubSide::Home {
            (result.home_goals, result.away_goals)
        } else {
            (result.away_goals, result.home_goals)
        };
        let goalkeeper = a.simulation_key.ends_with("-0");
        let bonus = if own > other {
            8
        } else if own == other {
            0
        } else {
            -6
        };
        let conceded = if goalkeeper { i64::from(other) } else { 0 };
        assert_eq!(
            a.rating,
            (60 + i64::from(a.goals) * 8
                + i64::from(a.assists) * 4
                + bonus
                + if goalkeeper && other == 0 { 6 } else { 0 }
                - conceded)
                .clamp(1, 99)
        );
    }
}

#[test]
fn injured_emergency_players_gain_no_fitness_or_sharpness_and_unused_bans_expire() {
    let mut home = squad("h", true);
    let away = squad("a", false);
    let until = DateOnly::parse("2027-01-01").unwrap();
    for p in players(&mut home) {
        p.fitness = 20;
        p.injury_until_date = Some(until.clone());
        p.suspension_matches = 1;
    }
    let result = play("emergency-availability", &home, &away);
    for delta in result
        .availability
        .iter()
        .filter(|d| d.simulation_key.starts_with("h-"))
    {
        let appearance = result
            .appearances
            .iter()
            .find(|a| a.simulation_key == delta.simulation_key);
        assert!(delta.fitness <= 20);
        assert!(delta.sharpness <= 80);
        assert_eq!(delta.injury_until_date.as_ref(), Some(&until));
        assert_eq!(
            delta.suspension_matches,
            appearance.map_or(0, |a| i64::from(a.red_cards))
        );
        if delta.simulation_key.contains("bench") {
            assert!(appearance.is_none());
            assert_eq!(
                (delta.fitness, delta.sharpness, delta.suspension_matches),
                (20, 77, 0)
            );
        }
    }
}

#[test]
fn rejects_blocked_invalid_keys_duplicate_players_and_unsafe_arithmetic() {
    let home = squad("h", false);
    let away = squad("a", false);
    let bad = ClubSelection::Blocked { message: "blocked" };
    let run = |home, away, fixture_key| {
        simulate_fixture(&EngineInput {
            root_seed: "tiny",
            fixture_key,
            match_date: DateOnly::parse("2026-09-01").unwrap(),
            home,
            away,
        })
    };
    assert!(run(&bad, &away, "valid").is_err());
    assert!(run(&home, &away, "").is_err());
    assert!(run(&home, &away, &"x".repeat(201)).is_err());
    assert!(run(&home, &home, "valid").is_err());
    let mut unsafe_home = home.clone();
    players(&mut unsafe_home)[0].effective = JS_MAX_SAFE_INTEGER;
    assert_eq!(
        run(&unsafe_home, &away, "valid"),
        Err(CoreError::Arithmetic)
    );
    for p in players(&mut unsafe_home) {
        p.effective = JS_MAX_SAFE_INTEGER / 4;
    }
    assert_eq!(
        run(&unsafe_home, &away, "valid"),
        Err(CoreError::Arithmetic)
    );
    players(&mut unsafe_home)[0].suspension_matches = -1;
    assert!(run(&unsafe_home, &away, "valid").is_err());
}
