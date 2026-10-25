use game_core::{
    ability::role_ability,
    generation::weekly_wage_cents,
    lifecycle::{plan_roster, ClubRosterInput, RosterPlan, RosterPlayer, TierCaps},
    CoreError, PlayerAttributes, PlayerLife, Position, PositionGroup, SafeInt, SquadTier,
    JS_MAX_SAFE_INTEGER,
};

const END: &str = "2027-06-30";
const FLOOR_ERROR: CoreError = CoreError::Invalid("A club cannot field a legal squad next season.");

fn attributes(rating: i64) -> PlayerAttributes {
    let value = Some(SafeInt::new(rating).unwrap());
    PlayerAttributes {
        pace: value,
        finishing: value,
        passing: value,
        dribbling: value,
        defending: value,
        physical: value,
    }
}

fn player(key: &str, group: PositionGroup) -> RosterPlayer {
    RosterPlayer {
        simulation_key: key.into(),
        age: Some(25),
        position_group: group,
        attributes: attributes(60),
        potential: Some(75),
        weekly_wage_cents: Some(10_000),
        expires_on: Some("2028-06-30".into()),
        status: PlayerLife::Active,
    }
}

fn club(key: &str) -> ClubRosterInput {
    ClubRosterInput {
        simulation_key: key.into(),
        academy_tier: 3,
        wage_budget_weekly_cents: 10_000_000,
        managed: false,
        players: (0..16)
            .map(|index| {
                player(
                    &format!("{key}:player:{index:02}"),
                    match index {
                        0 | 1 => PositionGroup::Gk,
                        _ => [PositionGroup::Def, PositionGroup::Mid, PositionGroup::Fwd]
                            [(index - 2) % 3],
                    },
                )
            })
            .collect(),
    }
}

fn expiring(key: &str) -> RosterPlayer {
    let mut player = player(key, PositionGroup::Fwd);
    player.age = Some(27);
    player.attributes = attributes(80);
    player.expires_on = Some(END.into());
    player
}

fn plans(clubs: &[ClubRosterInput], caps: Option<TierCaps>) -> Result<Vec<RosterPlan>, CoreError> {
    plan_roster(clubs, END, 2027, "academy-seed", "season-2026", caps)
}

#[test]
fn retirement_ages_differ_for_goalkeepers() {
    let mut input = club("club:01");
    input.players.extend([
        player("keeper36", PositionGroup::Gk),
        player("keeper38", PositionGroup::Gk),
        player("forward36", PositionGroup::Fwd),
        player("defender36", PositionGroup::Def),
        player("midfielder36", PositionGroup::Mid),
    ]);
    for player in &mut input.players[16..] {
        player.age = Some(36);
    }
    input.players[17].age = Some(38);
    input.players[17].attributes.pace = None; // Retirement does not need a rating.
    let result = plans(&[input], None).unwrap().remove(0);
    assert_eq!(
        result.retired,
        ["defender36", "forward36", "keeper38", "midfielder36"]
    );
    assert!(result.renewed.is_empty());
    assert!(result.released.is_empty());
    assert!(!result.retired.iter().any(|key| key == "keeper36"));
}

#[test]
fn renewal_uses_generator_wage_and_two_year_term() {
    let mut input = club("club:01");
    let mut candidate = expiring("expiring");
    candidate.attributes = attributes(72); // Caller-supplied post-growth rating.
    candidate.potential = None; // Potential is not part of renewal wage maths.
    candidate.weekly_wage_cents = None;
    input.players.push(candidate);
    let original = input.clone();
    let result = plans(std::slice::from_ref(&input), None).unwrap().remove(0);
    assert_eq!(input, original);
    assert_eq!(result.renewed.len(), 1);
    let renewal = &result.renewed[0];
    assert_eq!(renewal.simulation_key, "expiring");
    assert_eq!(renewal.squad_tier, SquadTier::Key);
    assert_eq!(
        renewal.weekly_wage_cents,
        weekly_wage_cents(27, 72, SquadTier::Key).unwrap().get()
    );
    assert_eq!(renewal.starts_on, "2027-07-01");
    assert_eq!(renewal.expires_on, "2029-06-30");
}

#[test]
fn expiry_boundary_and_tier_selection_are_exact() {
    let mut input = club("club:01");
    let mut earlier = expiring("earlier");
    earlier.expires_on = Some("2027-06-29".into());
    earlier.age = Some(21);
    let mut today = expiring("today");
    today.attributes = attributes(69);
    let mut later = expiring("later");
    later.expires_on = Some("2027-07-01".into());
    input.players.extend([today, later, earlier]);
    let result = plans(&[input], None).unwrap().remove(0);
    assert_eq!(
        result
            .renewed
            .iter()
            .map(|r| (r.simulation_key.as_str(), r.squad_tier))
            .collect::<Vec<_>>(),
        [
            ("earlier", SquadTier::Youth),
            ("today", SquadTier::Rotation)
        ]
    );
    assert!(result.released.is_empty());
}

#[test]
fn renewal_retries_youth_for_budget_and_managed_cap() {
    let mut input = club("club:01");
    input.players.push(expiring("expiring"));
    let youth = weekly_wage_cents(27, 80, SquadTier::Youth).unwrap().get();
    input.wage_budget_weekly_cents = 160_000 + youth;
    let result = plans(std::slice::from_ref(&input), None).unwrap().remove(0);
    assert_eq!(result.renewed.len(), 1);
    assert_eq!(result.renewed[0].squad_tier, SquadTier::Youth);
    assert_eq!(result.renewed[0].weekly_wage_cents, youth);
    assert!(result.intake.is_empty());
    input.managed = true;
    input.wage_budget_weekly_cents = 10_000_000;
    let caps = TierCaps {
        key_weekly_cap_cents: 1,
        rotation_weekly_cap_cents: 1,
        youth_weekly_cap_cents: youth,
    };
    let result = plans(&[input], Some(caps)).unwrap().remove(0);
    assert_eq!(result.renewed[0].squad_tier, SquadTier::Youth);
    assert!(result.released.is_empty());
}

#[test]
fn unaffordable_renewal_releases_once() {
    let mut input = club("club:01");
    input.players.push(expiring("expiring"));
    input.wage_budget_weekly_cents =
        160_000 + weekly_wage_cents(27, 80, SquadTier::Youth).unwrap().get() - 1;
    let result = plans(&[input], None).unwrap().remove(0);
    assert_eq!(result.released, ["expiring"]);
    assert!(result.renewed.is_empty());
}

#[test]
fn non_expiring_wages_are_reserved_before_sorted_renewals() {
    let mut input = club("club:01");
    input.players.extend([expiring("a"), expiring("b")]);
    input.wage_budget_weekly_cents = 320_000;
    let original = input.clone();
    let baseline = plans(std::slice::from_ref(&input), None).unwrap();
    assert_eq!(input, original);
    assert_eq!(baseline[0].renewed.len(), 1);
    assert_eq!(baseline[0].renewed[0].simulation_key, "a");
    assert_eq!(baseline[0].renewed[0].squad_tier, SquadTier::Youth);
    assert_eq!(baseline[0].released, ["b"]);
    input.players.reverse();
    assert_eq!(plans(&[input], None).unwrap(), baseline);
}

#[test]
fn managed_cap_does_not_bind_an_ai_club() {
    let mut input = club("club:01");
    input.players.push(expiring("expiring"));
    let caps = TierCaps {
        key_weekly_cap_cents: 0,
        rotation_weekly_cap_cents: 0,
        youth_weekly_cap_cents: 0,
    };
    let ai = plans(std::slice::from_ref(&input), Some(caps))
        .unwrap()
        .remove(0);
    assert_eq!(ai.renewed[0].squad_tier, SquadTier::Key);
    input.managed = true;
    let managed = plans(&[input], Some(caps)).unwrap().remove(0);
    assert!(managed.renewed.is_empty());
    assert_eq!(managed.released, ["expiring"]);
}

#[test]
fn intake_restores_the_floor_and_is_stable() {
    let mut first = club("club:01");
    first
        .players
        .retain(|p| p.position_group != PositionGroup::Gk);
    let second = club("club:02");
    let baseline = plans(&[first.clone(), second.clone()], None).unwrap();
    assert_eq!(baseline[0].intake[0].position, Position::Gk);
    assert_eq!(baseline[0].intake[1].position, Position::Gk);
    assert_eq!(baseline[0].intake.len(), 4);
    assert_eq!(
        baseline[0].intake[0].simulation_key,
        "newgen:2026:club:01:0"
    );
    first.players.reverse();
    assert_eq!(
        plans(&[second.clone(), first.clone()], None).unwrap(),
        baseline
    );
    assert_eq!(plans(&[first], None).unwrap()[0], baseline[0]);
    // Player/club transport IDs are not inputs. Another club cannot consume
    // this club's stream, even when it sorts earlier or has a different intake.
    let mut earlier = club("club:00");
    earlier.academy_tier = 5;
    let second_alone = plans(std::slice::from_ref(&second), None).unwrap();
    assert_eq!(plans(&[second, earlier], None).unwrap()[1], second_alone[0]);
    assert_eq!(
        baseline[0]
            .intake
            .iter()
            .map(|p| (p.name.as_str(), p.nationality_code.as_str()))
            .collect::<Vec<_>>(),
        [
            ("Solniacor Rost", "IE"),
            ("Eliyornia Voss", "FI"),
            ("Peltae Pell", "SE"),
            ("Taejos Nord", "PL")
        ]
    );
}

#[test]
fn academy_tiers_use_generator_wages_ability_and_three_year_contracts() {
    for tier in 1..=5 {
        let mut input = club("club:01");
        input.academy_tier = tier;
        let result = plans(&[input], None).unwrap().remove(0);
        assert_eq!(result.intake.len() as i64, tier + 1);
        for (index, player) in result.intake.iter().enumerate() {
            assert_eq!(
                player.simulation_key,
                format!("newgen:2026:club:01:{index}")
            );
            assert_eq!(
                role_ability(&player.attributes, player.position_group)
                    .unwrap()
                    .get(),
                35 + tier * 5
            );
            assert_eq!(player.potential, 50 + tier * 5);
            assert_eq!(
                player.weekly_wage_cents,
                weekly_wage_cents(16, 35 + tier * 5, SquadTier::Youth)
                    .unwrap()
                    .get()
            );
            assert_eq!(player.starts_on, "2027-07-01");
            assert_eq!(player.expires_on, "2030-06-30");
            assert_eq!(
                player.position,
                [Position::Gk, Position::Cb, Position::Cm, Position::St][index % 4]
            );
            assert_eq!(player.name.split_whitespace().count(), 2);
            assert!(["SE", "PT", "NL", "AT", "NO", "DK", "FI", "IE", "PL", "CZ"]
                .contains(&player.nationality_code.as_str()));
        }
    }
}

#[test]
fn intake_stops_at_the_wage_budget_and_keeps_its_prefix() {
    let mut input = club("club:01");
    let full = plans(std::slice::from_ref(&input), None).unwrap().remove(0);
    let youth = weekly_wage_cents(16, 50, SquadTier::Youth).unwrap().get();
    input.wage_budget_weekly_cents = 160_000 + youth;
    let trimmed = plans(&[input], None).unwrap().remove(0);
    assert_eq!(trimmed.intake, full.intake[..1]);
}

#[test]
fn ten_intakes_can_restore_six_survivors_but_never_replace_eleven() {
    let mut input = club("club:01");
    input.players.truncate(6);
    let result = plans(std::slice::from_ref(&input), None).unwrap().remove(0);
    assert_eq!(result.intake.len(), 10);
    input.players.pop();
    assert_eq!(plans(&[input], None), Err(FLOOR_ERROR));
}

#[test]
fn every_missing_group_is_filled_before_rotation() {
    let mut input = club("club:01");
    for player in &mut input.players {
        player.position_group = PositionGroup::Unknown;
    }
    input.players.truncate(11);
    let result = plans(&[input], None).unwrap().remove(0);
    assert_eq!(
        result.intake.iter().map(|p| p.position).collect::<Vec<_>>(),
        [
            Position::Gk,
            Position::Gk,
            Position::Cb,
            Position::Cm,
            Position::St
        ]
    );
}

#[test]
fn impossible_squad_is_an_error_without_a_partial_plan() {
    let good = club("club:00");
    let mut bad = club("club:01");
    bad.players.clear();
    bad.wage_budget_weekly_cents = 0;
    let original = [good, bad];
    let unchanged = original.clone();
    assert_eq!(plans(&original, None), Err(FLOOR_ERROR));
    assert_eq!(original, unchanged);
}

#[test]
fn budget_trimming_cannot_remove_the_required_goalkeeper_pair() {
    let mut input = club("club:01");
    input
        .players
        .retain(|p| p.position_group != PositionGroup::Gk);
    let youth = weekly_wage_cents(16, 50, SquadTier::Youth).unwrap().get();
    input.wage_budget_weekly_cents = 140_000 + youth;
    assert_eq!(plans(std::slice::from_ref(&input), None), Err(FLOOR_ERROR));
    input.wage_budget_weekly_cents += youth;
    let result = plans(&[input], None).unwrap().remove(0);
    assert_eq!(result.intake.len(), 2);
    assert!(result.intake.iter().all(|p| p.position == Position::Gk));
}

#[test]
fn existing_over_budget_contracts_stay_without_renewal_or_intake() {
    let mut input = club("club:01");
    input.players.push(expiring("expiring"));
    input.wage_budget_weekly_cents = 159_999;
    let result = plans(&[input], None).unwrap().remove(0);
    assert_eq!(result.released, ["expiring"]);
    assert!(result.retired.is_empty());
    assert!(result.renewed.is_empty());
    assert!(result.intake.is_empty());
}

#[test]
fn unknown_ages_groups_and_already_retired_players_are_unchanged() {
    let mut input = club("club:01");
    let mut unknown_age = expiring("unknown-age");
    unknown_age.age = None;
    unknown_age.attributes.pace = None;
    let mut unknown_group = expiring("unknown-group");
    unknown_group.age = Some(99);
    unknown_group.position_group = PositionGroup::Unknown;
    let mut retired = expiring("already-retired");
    retired.status = PlayerLife::Retired;
    retired.age = Some(99);
    input.players.extend([unknown_age, unknown_group, retired]);
    let result = plans(&[input], None).unwrap().remove(0);
    assert!(result.retired.is_empty());
    assert!(result.renewed.is_empty());
    assert!(result.released.is_empty());
}

#[test]
fn unknown_contract_data_is_not_zero_or_a_proven_squad_place() {
    let mut input = club("club:01");
    input.players[0].weekly_wage_cents = None;
    assert!(plans(std::slice::from_ref(&input), None).is_err());
    input.players[0].weekly_wage_cents = Some(10_000);
    input.players[0].expires_on = None;
    let result = plans(&[input], None).unwrap().remove(0);
    assert!(result.renewed.is_empty());
    assert!(result.released.is_empty());
    assert_eq!(result.intake[0].position, Position::Gk);
}

#[test]
fn a_club_without_intake_does_not_draw() {
    let mut input = club("club:01");
    input.wage_budget_weekly_cents = 160_000;
    let result = plan_roster(&[input], END, 2027, "", "season-2026", None).unwrap();
    assert!(result[0].intake.is_empty());
}

#[test]
fn money_limits_do_not_overflow_when_a_candidate_does_not_fit() {
    let mut input = club("club:01");
    for player in &mut input.players {
        player.weekly_wage_cents = Some(0);
    }
    input.players[0].weekly_wage_cents = Some(JS_MAX_SAFE_INTEGER);
    input.players.push(expiring("expiring"));
    input.wage_budget_weekly_cents = JS_MAX_SAFE_INTEGER;
    let result = plans(&[input], None).unwrap().remove(0);
    assert_eq!(result.released, ["expiring"]);
    assert!(result.intake.is_empty());
}

#[test]
fn retirement_frees_wages_before_renewal() {
    let mut input = club("club:01");
    let mut retiring = player("retiring", PositionGroup::Fwd);
    retiring.age = Some(36);
    retiring.weekly_wage_cents = Some(5_000_000);
    input.players.extend([retiring, expiring("expiring")]);
    input.wage_budget_weekly_cents = 320_000;
    let result = plans(&[input], None).unwrap().remove(0);
    assert_eq!(result.retired, ["retiring"]);
    assert_eq!(result.renewed.len(), 1);
    assert_eq!(result.renewed[0].simulation_key, "expiring");
    assert!(result.released.is_empty());
}

#[test]
fn every_position_shortage_must_fit_in_the_ten_player_limit() {
    let mut input = club("club:01");
    input.players.truncate(6);
    for player in &mut input.players {
        player.position_group = PositionGroup::Unknown;
    }
    let result = plans(&[input], None).unwrap().remove(0);
    assert_eq!(result.intake.len(), 10);
    for group in [
        PositionGroup::Gk,
        PositionGroup::Def,
        PositionGroup::Mid,
        PositionGroup::Fwd,
    ] {
        assert!(result.intake.iter().any(|p| p.position_group == group));
    }
    assert_eq!(
        result
            .intake
            .iter()
            .filter(|p| p.position == Position::Gk)
            .count(),
        4
    );
}

#[test]
fn known_ages_on_non_expiring_contracts_do_not_require_attributes() {
    let mut input = club("club:01");
    for player in &mut input.players {
        player.attributes.pace = None;
        player.potential = None;
    }
    let result = plans(&[input], None).unwrap().remove(0);
    assert!(result.retired.is_empty());
    assert!(result.renewed.is_empty());
    assert!(result.released.is_empty());
    assert_eq!(result.intake.len(), 4);
}

#[test]
fn invalid_identity_dates_money_and_academy_are_refused() {
    let input = club("club:01");
    assert!(plans(&[input.clone(), input.clone()], None).is_err());
    let mut duplicate = input.clone();
    duplicate.players.push(duplicate.players[0].clone());
    assert!(plans(&[duplicate], None).is_err());
    for tier in [0, 6, i64::MAX] {
        let mut invalid = input.clone();
        invalid.academy_tier = tier;
        assert!(plans(&[invalid], None).is_err());
    }
    for budget in [-1, i64::MAX] {
        let mut invalid = input.clone();
        invalid.wage_budget_weekly_cents = budget;
        assert!(plans(&[invalid], None).is_err());
    }
    for (end, year) in [
        ("not-a-date", 2027),
        ("2027-06-29", 2027),
        (END, 2028),
        (END, i64::MAX),
        (END, i64::MIN),
        ("2197-06-30", 2197),
    ] {
        assert!(plan_roster(
            std::slice::from_ref(&input),
            end,
            year,
            "seed",
            "season",
            None
        )
        .is_err());
    }
    let mut collision = input.clone();
    collision.players[0].simulation_key = "newgen:2026:club:01:0".into();
    assert!(plans(&[collision], None).is_err());
    let mut missing_attribute = input;
    let mut candidate = expiring("expiring");
    candidate.attributes.finishing = None;
    missing_attribute.players.push(candidate);
    assert!(plans(&[missing_attribute], None).is_err());
}

#[test]
fn invalid_caps_and_wages_are_not_treated_as_zero() {
    let mut input = club("club:01");
    input.managed = true;
    let caps = TierCaps {
        key_weekly_cap_cents: -1,
        rotation_weekly_cap_cents: 1,
        youth_weekly_cap_cents: 1,
    };
    assert!(plans(std::slice::from_ref(&input), Some(caps)).is_err());
    input.players[0].weekly_wage_cents = Some(-1);
    assert!(plans(&[input], None).is_err());
}
