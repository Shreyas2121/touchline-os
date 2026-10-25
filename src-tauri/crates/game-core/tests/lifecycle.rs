use game_core::{
    ability::{goalkeeper_rating, role_ability},
    generation::market_value_cents,
    lifecycle::{plan_development, DevelopmentInput, DEVELOPMENT_ENGINE_VERSION},
    CoreError, DevelopmentPeriod, PlayerAttributes, PlayerLife, PositionGroup, SafeInt,
};

fn attributes(value: i64) -> PlayerAttributes {
    let value = Some(SafeInt::new(value).unwrap());
    PlayerAttributes {
        pace: value,
        finishing: value,
        passing: value,
        dribbling: value,
        defending: value,
        physical: value,
    }
}

fn input() -> DevelopmentInput {
    DevelopmentInput {
        age: Some(21),
        potential: Some(54),
        attributes: attributes(50),
        position_group: PositionGroup::Fwd,
        target_role: None,
        minutes: 1530,
        already_applied: 0,
        period: DevelopmentPeriod::Midseason,
        status: PlayerLife::Active,
    }
}

#[test]
fn split_budget_never_adds_four_twice() {
    assert_eq!(DEVELOPMENT_ENGINE_VERSION, "1");
    let mut player = input();
    let original = player.clone();
    let mid = plan_development(&player).unwrap().unwrap();
    assert_eq!(player, original);
    assert_eq!(Some(mid.clone()), plan_development(&player).unwrap());
    assert_eq!(mid.points, 2);
    player.attributes = mid.after;
    player.period = DevelopmentPeriod::SeasonEnd;
    player.already_applied = mid.points;
    let end = plan_development(&player).unwrap().unwrap();
    assert_eq!(end.points, 2);
    assert!(mid.points + end.points <= 4);
    for already in 0..=4 {
        player.already_applied = already;
        let points = plan_development(&player).unwrap().map_or(0, |c| c.points);
        assert!(points + already <= 4);
    }
}

#[test]
fn missed_midseason_pays_only_the_end_half() {
    let mut player = input();
    player.period = DevelopmentPeriod::SeasonEnd;
    assert_eq!(plan_development(&player).unwrap().unwrap().points, 2);
}

#[test]
fn integer_participation_and_age_bands_bound_growth() {
    for (age, minutes, points) in [
        (21, 1530, 2),
        (22, 1530, 1),
        (24, 1530, 1),
        (25, 1530, 0),
        (27, 1530, 0),
        (28, 1530, 0),
        (21, 764, 0),
        (21, 765, 1),
        (21, i64::MAX, 2),
    ] {
        let mut player = input();
        player.age = Some(age);
        player.minutes = minutes;
        assert_eq!(
            plan_development(&player).unwrap().map_or(0, |c| c.points),
            points
        );
    }
}

#[test]
fn zero_minutes_do_not_grow() {
    let mut player = input();
    player.minutes = 0;
    for period in [DevelopmentPeriod::Midseason, DevelopmentPeriod::SeasonEnd] {
        player.period = period;
        assert_eq!(plan_development(&player), Ok(None));
    }
}

#[test]
fn decline_follows_position_weights() {
    let mut player = input();
    player.age = Some(37);
    player.period = DevelopmentPeriod::SeasonEnd;
    let forward = plan_development(&player).unwrap().unwrap();
    assert_eq!(forward.points, -3);
    let mut expected = attributes(50);
    expected.finishing = Some(SafeInt::new(47).unwrap());
    assert_eq!(forward.after, expected);
    player.position_group = PositionGroup::Gk;
    let keeper = plan_development(&player).unwrap().unwrap();
    assert_eq!(keeper.points, -1);
    let mut expected = attributes(50);
    expected.defending = Some(SafeInt::new(49).unwrap());
    assert_eq!(keeper.after, expected);
    assert_eq!(
        keeper.goalkeeping,
        Some(goalkeeper_rating(&keeper.after).unwrap().get())
    );
    player.attributes = attributes(1);
    assert_eq!(plan_development(&player), Ok(None));
    player.attributes.defending = Some(SafeInt::new(2).unwrap());
    player.age = Some(38);
    let floor = plan_development(&player).unwrap().unwrap();
    assert_eq!(floor.points, -1);
    assert_eq!(floor.after, attributes(1));
}

#[test]
fn decline_age_thresholds_and_midseason_exclusion() {
    for (group, age, points) in [
        (PositionGroup::Fwd, 32, 0),
        (PositionGroup::Fwd, 33, -1),
        (PositionGroup::Def, 34, -1),
        (PositionGroup::Mid, 35, -2),
        (PositionGroup::Fwd, 36, -2),
        (PositionGroup::Fwd, 38, -3),
        (PositionGroup::Gk, 35, 0),
        (PositionGroup::Gk, 36, -1),
        (PositionGroup::Gk, 38, -2),
    ] {
        let mut player = input();
        player.age = Some(age);
        player.position_group = group;
        assert_eq!(plan_development(&player), Ok(None));
        player.period = DevelopmentPeriod::SeasonEnd;
        assert_eq!(
            plan_development(&player).unwrap().map_or(0, |c| c.points),
            points
        );
    }
}

#[test]
fn value_uses_the_generator_formula() {
    let player = input();
    let original = player.clone();
    let change = plan_development(&player).unwrap().unwrap();
    for (attributes, cents) in [
        (&change.before, change.before_value_cents),
        (&change.after, change.after_value_cents),
    ] {
        assert_eq!(
            cents,
            market_value_cents(
                21,
                role_ability(attributes, player.position_group)
                    .unwrap()
                    .get(),
                54
            )
            .unwrap()
            .get()
        );
    }
    assert_eq!(player, original);
    assert_eq!(change.goalkeeping, None);
}

#[test]
fn notes_are_not_an_input() {
    let mut player = input();
    let baseline = plan_development(&player);
    for role in ["", "Work on finishing", "UNKNOWN", "striker", "FWD notes"] {
        player.target_role = Some(role.into());
        assert_eq!(plan_development(&player), baseline);
    }
}

#[test]
fn target_roles_select_weights_and_ties_follow_attribute_order() {
    for (roles, expected_index) in [
        (vec!["GK", "DEF", "CB", "LB", "RB", "LWB", "RWB"], 4),
        (vec!["MID", "CDM", "CM", "CAM", "LM", "RM"], 2),
        (vec!["FWD", "LW", "RW", "ST", "CF"], 1),
    ] {
        for role in roles {
            let mut player = input();
            player.target_role = Some(role.into());
            let change = plan_development(&player).unwrap().unwrap();
            let mut expected = attributes(50);
            match expected_index {
                4 => expected.defending = Some(SafeInt::new(52).unwrap()),
                2 => expected.passing = Some(SafeInt::new(52).unwrap()),
                _ => expected.finishing = Some(SafeInt::new(52).unwrap()),
            }
            assert_eq!(change.after, expected, "{role}");
        }
    }
    let mut player = input();
    player.position_group = PositionGroup::Gk;
    player.attributes.defending = Some(SafeInt::new(100).unwrap());
    player.potential = Some(100);
    let change = plan_development(&player).unwrap().unwrap();
    assert_eq!(change.after.physical.unwrap().get(), 52);
}

#[test]
fn growth_respects_attribute_ceiling_and_potential() {
    let mut player = input();
    player.attributes = attributes(99);
    player.potential = Some(100);
    assert_eq!(plan_development(&player), Ok(None)); // headroom 1 halves to zero
    player.attributes = attributes(90);
    player.attributes.finishing = Some(SafeInt::new(100).unwrap());
    player.potential = Some(100);
    let change = plan_development(&player).unwrap().unwrap();
    assert_eq!(change.after.finishing.unwrap().get(), 100);
    assert_eq!(change.after.pace.unwrap().get(), 92);
    assert!(
        role_ability(&change.after, player.position_group)
            .unwrap()
            .get()
            <= 100
    );
    player.attributes = attributes(100);
    assert_eq!(plan_development(&player), Ok(None));
}

#[test]
fn retired_and_incomplete_players_are_omitted() {
    let baseline = input();
    let mut invalid = Vec::new();
    let mut player = baseline.clone();
    player.status = PlayerLife::Retired;
    invalid.push(player);
    let mut player = baseline.clone();
    player.age = None;
    invalid.push(player);
    let mut player = baseline.clone();
    player.potential = None;
    invalid.push(player);
    let mut player = baseline.clone();
    player.position_group = PositionGroup::Unknown;
    player.target_role = Some("FWD".into());
    invalid.push(player);
    for index in 0..6 {
        let mut player = baseline.clone();
        match index {
            0 => player.attributes.pace = None,
            1 => player.attributes.finishing = None,
            2 => player.attributes.passing = None,
            3 => player.attributes.dribbling = None,
            4 => player.attributes.defending = None,
            _ => player.attributes.physical = None,
        }
        invalid.push(player);
    }
    for already in [-1, 5, i64::MIN, i64::MAX] {
        let mut player = baseline.clone();
        player.already_applied = already;
        invalid.push(player);
    }
    let mut player = baseline;
    player.minutes = -1;
    invalid.push(player);
    for player in invalid {
        assert_eq!(plan_development(&player), Ok(None));
    }
}

#[test]
fn invalid_values_return_errors_without_partial_changes() {
    let mut player = input();
    player.age = Some(15);
    let original = player.clone();
    assert!(plan_development(&player).is_err());
    assert_eq!(player, original);
    player.age = Some(39);
    player.period = DevelopmentPeriod::SeasonEnd;
    assert!(plan_development(&player).is_err());
    player.potential = Some(i64::MIN);
    assert_eq!(plan_development(&player), Err(CoreError::Arithmetic));
    player = input();
    player.attributes.pace = Some(SafeInt::new(101).unwrap());
    assert!(plan_development(&player).is_err());
}
