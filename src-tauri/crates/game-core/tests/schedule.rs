use game_core::{
    calendar::season_dates,
    dates::{add_days, DateOnly},
    generation::club_key,
    schedule::{schedule_season, standings, MatchScore, ScheduleClub, StandingRow},
    CoreError,
};
use std::collections::{BTreeMap, BTreeSet};

fn keys() -> Vec<String> {
    (1..=72).map(|n| club_key(n).unwrap()).collect()
}
fn clubs(keys: &[String]) -> Vec<ScheduleClub<'_>> {
    keys.iter()
        .enumerate()
        .map(|(i, key)| ScheduleClub {
            simulation_key: key,
            league_tier: (i / 18 + 1) as i64,
        })
        .collect()
}
fn score<'a>(home: &'a str, away: &'a str, home_goals: i64, away_goals: i64) -> MatchScore<'a> {
    MatchScore {
        home_simulation_key: home,
        away_simulation_key: away,
        home_goals,
        away_goals,
    }
}

#[test]
fn season_has_exact_round_sizes_and_every_pair_plays_at_each_venue() {
    let keys = keys();
    let fixtures = schedule_season(2026, &clubs(&keys)).unwrap();
    assert_eq!(fixtures.len(), 1_224);
    let mut unique_keys = BTreeSet::new();
    for tier in 1..=4 {
        let league = fixtures
            .iter()
            .filter(|f| f.league_tier == tier)
            .collect::<Vec<_>>();
        assert_eq!(league.len(), 306);
        let members = clubs(&keys)
            .into_iter()
            .filter(|c| c.league_tier == tier)
            .map(|c| c.simulation_key)
            .collect::<BTreeSet<_>>();
        let mut pairs = BTreeMap::new();
        for round in 1..=34 {
            let games = league
                .iter()
                .filter(|f| f.round == round)
                .collect::<Vec<_>>();
            assert_eq!(games.len(), 9);
            let mut played = BTreeSet::new();
            for game in games {
                let home = game.home_simulation_key.as_str();
                let away = game.away_simulation_key.as_str();
                assert_ne!(home, away);
                assert!(members.contains(home) && members.contains(away));
                assert!(played.insert(home));
                assert!(played.insert(away));
                assert!(unique_keys.insert(&game.fixture_key));
                assert_eq!(
                    game.fixture_key,
                    format!(
                        "season:2026:league-tier:{tier}:round:{round:02}:home:{home}:away:{away}"
                    )
                );
                *pairs.entry((home, away)).or_insert(0) += 1;
            }
            assert_eq!(played, members);
        }
        assert_eq!(pairs.len(), 18 * 17);
        for home in &members {
            for away in &members {
                if home != away {
                    assert_eq!(pairs.get(&(*home, *away)), Some(&1));
                }
            }
        }
        for game in &league[..153] {
            let reverse = league.iter().find(|g| {
                g.round == game.round + 17
                    && g.home_simulation_key == game.away_simulation_key
                    && g.away_simulation_key == game.home_simulation_key
            });
            assert!(reverse.is_some());
        }
    }
}

#[test]
fn first_round_is_pinned_and_input_order_does_not_change_any_fixture() {
    let keys = keys();
    let mut clubs = clubs(&keys);
    let fixtures = schedule_season(2026, &clubs).unwrap();
    let pairs = fixtures
        .iter()
        .take(9)
        .map(|f| {
            (
                f.home_simulation_key.as_str(),
                f.away_simulation_key.as_str(),
            )
        })
        .collect::<Vec<_>>();
    assert_eq!(
        pairs,
        vec![
            ("club:01", "club:18"),
            ("club:17", "club:02"),
            ("club:03", "club:16"),
            ("club:15", "club:04"),
            ("club:05", "club:14"),
            ("club:13", "club:06"),
            ("club:07", "club:12"),
            ("club:11", "club:08"),
            ("club:09", "club:10")
        ]
    );
    clubs.reverse();
    assert_eq!(schedule_season(2026, &clubs).unwrap(), fixtures);
}

#[test]
fn dates_are_weekly_inside_the_season_including_leap_years_and_year_limits() {
    let keys = keys();
    for year in [1900, 2026, 2027, 2198] {
        let fixtures = schedule_season(year, &clubs(&keys)).unwrap();
        let kickoff = DateOnly::parse(&format!("{year}-09-01")).unwrap();
        let season = season_dates(year).unwrap();
        for fixture in &fixtures {
            assert_eq!(
                fixture.match_date,
                add_days(&kickoff, i64::from(fixture.round - 1) * 7).unwrap()
            );
            assert!(
                fixture.match_date >= season.start_date && fixture.match_date <= season.end_date
            );
        }
        let last = &fixtures.last().unwrap().match_date;
        if year == 2026 {
            assert_eq!(last.as_str(), "2027-04-20");
        }
        if year == 2027 {
            assert_eq!(last.as_str(), "2028-04-19");
            assert_eq!(
                fixtures
                    .iter()
                    .find(|f| f.round == 27)
                    .unwrap()
                    .match_date
                    .as_str(),
                "2028-03-01"
            );
        }
    }
    for year in [i64::MIN, 1899, 2199, i64::MAX] {
        assert!(schedule_season(year, &clubs(&keys)).is_err());
    }
}

#[test]
fn unicode_keys_use_scalar_order_for_pairings_and_standings() {
    let mut keys = keys();
    // UTF-16 would put U+10000 before U+E000; scalar order puts it last.
    keys[16] = "\u{e000}".into();
    keys[17] = "\u{10000}".into();
    let fixtures = schedule_season(2026, &clubs(&keys)).unwrap();
    assert_eq!(fixtures[0].away_simulation_key, "\u{10000}");
    assert_eq!(fixtures[1].home_simulation_key, "\u{e000}");
    let table = standings(&["\u{10000}", "\u{e000}"], &[]).unwrap();
    assert_eq!(table[0].simulation_key, "\u{e000}");
}

#[test]
fn invalid_league_sizes_tiers_and_duplicate_keys_are_rejected() {
    let keys = keys();
    let original = clubs(&keys);
    let mut short = original.clone();
    short.pop();
    assert!(schedule_season(2026, &short).is_err());
    let mut duplicate_tier = original.clone();
    for club in &mut duplicate_tier {
        if club.league_tier == 4 {
            club.league_tier = 3;
        }
    }
    assert!(schedule_season(2026, &duplicate_tier).is_err());
    let missing_tier = original
        .iter()
        .filter(|c| c.league_tier != 2)
        .copied()
        .collect::<Vec<_>>();
    assert!(schedule_season(2026, &missing_tier).is_err());
    for tier in [0, 5, i64::MAX] {
        let mut invalid = original.clone();
        invalid[0].league_tier = tier;
        assert!(schedule_season(2026, &invalid).is_err());
    }
    let mut duplicate = original.clone();
    duplicate[18].simulation_key = duplicate[0].simulation_key;
    assert!(schedule_season(2026, &duplicate).is_err());
    for key in ["", " padded", "control\nkey"] {
        let mut invalid = original.clone();
        invalid[0].simulation_key = key;
        assert!(schedule_season(2026, &invalid).is_err());
    }
    assert!(schedule_season(2026, &[]).is_err());
}

#[test]
fn standings_reconcile_wins_draws_losses_and_include_unplayed_clubs() {
    let table = standings(
        &["a", "b", "c", "idle"],
        &[
            score("a", "b", 2, 1),
            score("c", "a", 0, 0),
            score("b", "c", 3, 0),
        ],
    )
    .unwrap();
    assert_eq!(
        table,
        vec![
            StandingRow {
                simulation_key: "a".into(),
                played: 2,
                won: 1,
                drawn: 1,
                lost: 0,
                goals_for: 2,
                goals_against: 1,
                goal_difference: 1,
                points: 4
            },
            StandingRow {
                simulation_key: "b".into(),
                played: 2,
                won: 1,
                drawn: 0,
                lost: 1,
                goals_for: 4,
                goals_against: 2,
                goal_difference: 2,
                points: 3
            },
            StandingRow {
                simulation_key: "c".into(),
                played: 2,
                won: 0,
                drawn: 1,
                lost: 1,
                goals_for: 0,
                goals_against: 3,
                goal_difference: -3,
                points: 1
            },
            StandingRow {
                simulation_key: "idle".into(),
                ..StandingRow::default()
            },
        ]
    );
    assert_eq!(
        table.iter().map(|r| r.goals_for).sum::<u16>(),
        table.iter().map(|r| r.goals_against).sum::<u16>()
    );
}

#[test]
fn tie_breaks_use_goal_difference_then_goals_scored_then_key() {
    let clubs = [
        "club:10",
        "club:02",
        "scorer",
        "better-defense",
        "a",
        "b",
        "c",
        "d",
    ];
    let results = [
        score("club:10", "a", 2, 0),
        score("club:02", "b", 2, 0),
        score("scorer", "c", 3, 1),
        score("better-defense", "d", 3, 0),
    ];
    let table = standings(&clubs, &results).unwrap();
    assert_eq!(
        table[..4]
            .iter()
            .map(|r| r.simulation_key.as_str())
            .collect::<Vec<_>>(),
        vec!["better-defense", "scorer", "club:02", "club:10"]
    );
    let mut reversed = results;
    reversed.reverse();
    let mut reversed_clubs = clubs;
    reversed_clubs.reverse();
    assert_eq!(standings(&reversed_clubs, &reversed).unwrap(), table);
    assert!(standings(&[], &[]).unwrap().is_empty());
}

#[test]
fn invalid_results_and_overflow_return_errors() {
    for result in [
        score("a", "b", -1, 0),
        score("a", "b", 0, -1),
        score("a", "missing", 0, 0),
        score("missing", "b", 0, 0),
        score("a", "a", 0, 0),
    ] {
        assert!(standings(&["a", "b"], &[result]).is_err());
    }
    assert!(standings(&["a", "a"], &[]).is_err());
    assert!(standings(&[""], &[]).is_err());
    assert_eq!(
        standings(&["a", "b"], &[score("a", "b", 65536, 0)]),
        Err(CoreError::Arithmetic)
    );
    assert_eq!(
        standings(
            &["a", "b"],
            &[score("a", "b", 65535, 0), score("a", "b", 1, 0)]
        ),
        Err(CoreError::Arithmetic)
    );
    // Points overflow before the played counter does.
    assert_eq!(
        standings(&["a", "b"], &vec![score("a", "b", 1, 0); 21846]),
        Err(CoreError::Arithmetic)
    );
    assert_eq!(
        standings(&["a", "b"], &vec![score("a", "b", 0, 0); 65536]),
        Err(CoreError::Arithmetic)
    );
}
