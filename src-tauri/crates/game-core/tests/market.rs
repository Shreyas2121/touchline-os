use game_core::market::{
    plan_openings, plan_tick, resolve_terms, Agreement, MarketClub, MarketPlayer, MarketSeedInputs,
    OpeningBid, TermProposal, MARKET_ENGINE_VERSION,
};
use game_core::policy::QualificationRule;
use game_core::random::{derive_event_seed, EventKind, Mulberry32};
use game_core::{CoreError, PositionGroup, SafeInt, SquadTier};
use std::collections::BTreeSet;

fn seed() -> MarketSeedInputs {
    MarketSeedInputs {
        root_seed: "market-root".into(),
        operation_key: "season:2026:market:2026-07-01".into(),
        stream_version: MARKET_ENGINE_VERSION.into(),
    }
}

fn club(key: &str, prestige: i64, spendable: i64, wage_room: i64, open_buys: i64) -> MarketClub {
    MarketClub {
        simulation_key: key.into(),
        prestige,
        spendable_cents: spendable,
        wage_room_cents: wage_room,
        open_buy_count: open_buys,
    }
}

fn buyer(key: &str, prestige: i64) -> MarketClub {
    club(key, prestige, 50_000_000_000, 50_000_000, 0)
}

fn player(
    key: &str,
    group: PositionGroup,
    age: Option<i64>,
    ability: Option<i64>,
    value: Option<i64>,
    seller: Option<&str>,
    seller_prestige: Option<i64>,
) -> MarketPlayer {
    MarketPlayer {
        simulation_key: key.into(),
        position_group: group,
        age,
        ability,
        market_value_cents: value,
        seller_simulation_key: seller.map(str::to_owned),
        seller_prestige,
        current_wage_cents: None,
        current_tier: None,
        season_minutes: 0,
        rating_sum: 0,
        appearance_count: 0,
    }
}

fn contracted(
    key: &str,
    group: PositionGroup,
    ability: i64,
    value: i64,
    seller: &str,
) -> MarketPlayer {
    player(
        key,
        group,
        Some(25),
        Some(ability),
        Some(value),
        Some(seller),
        Some(50),
    )
}

fn tick(clubs: &[MarketClub], players: &[MarketPlayer]) -> Vec<OpeningBid> {
    plan_tick(clubs, players, "managed", &seed(), None).unwrap()
}

fn rule(numerator: i64, denominator: i64) -> QualificationRule {
    QualificationRule {
        required_fee_numerator: SafeInt::new(numerator).unwrap(),
        required_fee_denominator: SafeInt::new(denominator).unwrap(),
        require_higher_prestige: true,
    }
}

#[test]
fn shortage_order_fills_the_larger_gap_then_the_weaker_group() {
    let players = vec![
        contracted("def-low", PositionGroup::Def, 70, 2_000_000, "alpha"),
        contracted("def-high", PositionGroup::Def, 90, 3_000_000, "alpha"),
        contracted("keeper", PositionGroup::Gk, 40, 100, "beta"),
        contracted("mid", PositionGroup::Mid, 55, 5_000_000, "beta"),
    ];
    let bids = tick(&[buyer("alpha", 50), buyer("beta", 50)], &players);
    assert_eq!(bids.len(), 2);
    assert_eq!(bids[0].buyer_key, "alpha");
    assert_eq!(bids[0].player_key, "mid");
    assert_eq!(bids[1].buyer_key, "beta");
    assert_eq!(bids[1].player_key, "def-low");

    let mut tied = vec![
        contracted("def-a", PositionGroup::Def, 90, 1_000_000, "buyer"),
        contracted("def-b", PositionGroup::Def, 90, 1_000_000, "buyer"),
        contracted("mid", PositionGroup::Mid, 80, 1_000_000, "buyer"),
        contracted("fwd", PositionGroup::Fwd, 30, 1_000_000, "buyer"),
        contracted("cheap-def", PositionGroup::Def, 50, 100, "seller"),
        contracted("target-fwd", PositionGroup::Fwd, 40, 8_000_000, "seller"),
    ];
    let bids = tick(&[buyer("buyer", 50)], &tied);
    assert_eq!(bids.len(), 1);
    assert_eq!(bids[0].player_key, "target-fwd");

    tied[2].ability = Some(40);
    tied[3].ability = Some(40);
    tied.push(contracted(
        "target-mid",
        PositionGroup::Mid,
        45,
        9_000_000,
        "seller",
    ));
    let bids = tick(&[buyer("buyer", 50)], &tied);
    assert_eq!(bids.len(), 1);
    assert_eq!(bids[0].player_key, "target-mid");
}

#[test]
fn fixed_seed_pins_noise_fee_and_input_order() {
    let inputs = seed();
    let mut rng = Mulberry32::new(
        derive_event_seed(
            &inputs.root_seed,
            &inputs.stream_version,
            EventKind::Market,
            &[&inputs.operation_key],
        )
        .unwrap(),
    );
    let first_noise = rng.next_int(11).unwrap() - 5;
    let second_noise = rng.next_int(11).unwrap() - 5;
    let valuation = 1_000_000;
    let fee = |noise| valuation * (100 + 20 + noise) / 100;

    let clubs = vec![buyer("a", 60), buyer("b", 60)];
    let mut players = vec![contracted(
        "player",
        PositionGroup::Def,
        50,
        valuation,
        "seller",
    )];
    players[0].seller_prestige = Some(40);
    let first = tick(&clubs, &players);
    assert_eq!(tick(&clubs, &players), first);
    assert_eq!(first[0].buyer_key, "a");
    assert_eq!(first[0].noise, first_noise);
    assert_eq!(first[0].valuation_cents, valuation);
    assert_eq!(first[0].fee_cents, fee(first_noise));
    assert_eq!(first[0].tier, SquadTier::Rotation);
    assert_eq!(first[0].wage_cents, 564_000);
    assert_eq!(first[1].noise, second_noise);
    assert_eq!(first[1].fee_cents, fee(second_noise));

    let mut shuffled_clubs = clubs.clone();
    shuffled_clubs.reverse();
    let mut shuffled_players = players.clone();
    shuffled_players.reverse();
    assert_eq!(tick(&shuffled_clubs, &shuffled_players), first);

    let mut renamed = clubs.clone();
    renamed[0].simulation_key = "z".into();
    let renamed_bids = tick(&renamed, &players);
    assert_eq!(renamed_bids[0].buyer_key, "b");
    assert_eq!(renamed_bids[0].noise, first_noise);
    assert_eq!(renamed_bids[1].buyer_key, "z");
    assert_eq!(renamed_bids[1].noise, second_noise);
    assert_ne!(renamed_bids, first);
}

#[test]
fn the_thirteenth_club_and_a_full_inbox_are_omitted_without_a_draw() {
    let players = vec![player(
        "free",
        PositionGroup::Def,
        Some(25),
        Some(50),
        Some(1_000_000),
        None,
        None,
    )];
    let mut clubs: Vec<MarketClub> = (0..13)
        .map(|index| {
            club(
                &format!("c{index:02}"),
                if index == 0 { 0 } else { 100 },
                0,
                10_000_000,
                0,
            )
        })
        .collect();
    clubs.reverse();
    let bids = tick(&clubs, &players);
    assert_eq!(bids.len(), 12);
    assert_eq!(bids[0].buyer_key, "c00");
    assert!(bids.iter().all(|bid| bid.fee_cents == 0));
    assert!(bids.iter().all(|bid| bid.buyer_key != "c12"));

    let skipped = tick(
        &[
            club("a", 40, 0, 10_000_000, 3),
            club("b", 40, 0, 10_000_000, 0),
        ],
        &players,
    );
    let only_bidder = tick(&[club("b", 40, 0, 10_000_000, 0)], &players);
    assert_eq!(skipped, only_bidder);
    assert_eq!(skipped[0].buyer_key, "b");
    assert_eq!(tick(&[club("a", 40, 0, 10_000_000, 2)], &players).len(), 1);

    let mut squad = Vec::new();
    for (group, count) in [
        (PositionGroup::Gk, 1),
        (PositionGroup::Def, 4),
        (PositionGroup::Mid, 3),
        (PositionGroup::Fwd, 3),
    ] {
        for index in 0..count {
            squad.push(contracted(
                &format!("full-{group:?}-{index}"),
                group,
                50,
                1_000_000,
                "full",
            ));
        }
    }
    let with_full = tick(
        &[
            club("full", 50, 50_000_000_000, 10_000_000, 0),
            club("needy", 50, 50_000_000_000, 10_000_000, 0),
        ],
        &squad,
    );
    let needy_only = tick(&[club("needy", 50, 50_000_000_000, 10_000_000, 0)], &squad);
    assert_eq!(with_full, needy_only);
    assert_eq!(with_full[0].buyer_key, "needy");
}

#[test]
fn unaffordable_fees_are_lowered_or_the_next_candidate_is_used() {
    let valuation = 1_000_000;
    let contracted_player = contracted("priced", PositionGroup::Def, 50, valuation, "seller");
    let mut seller = contracted_player.clone();
    seller.seller_prestige = Some(40);
    let lowered = tick(
        &[club("buyer", 80, valuation * 80 / 100, 10_000_000, 0)],
        std::slice::from_ref(&seller),
    );
    assert_eq!(lowered.len(), 1);
    assert_eq!(lowered[0].fee_cents, valuation * 80 / 100);
    assert!(!lowered[0].raised_to_qualify);

    let omitted = tick(
        &[club("buyer", 80, valuation * 80 / 100 - 1, 10_000_000, 0)],
        std::slice::from_ref(&seller),
    );
    assert!(omitted.is_empty());

    let free_agent = player(
        "free",
        PositionGroup::Def,
        Some(25),
        Some(50),
        Some(2_000_000),
        None,
        None,
    );
    let bids = tick(
        &[club("buyer", 80, 100_000, 10_000_000, 0)],
        &[seller, free_agent],
    );
    assert_eq!(bids.len(), 1);
    assert_eq!(bids[0].player_key, "free");
    assert_eq!(bids[0].fee_cents, 0);
    assert_eq!(bids[0].seller_key, None);
}

#[test]
fn a_wage_that_does_not_fit_tries_the_next_candidate() {
    let expensive = player(
        "key",
        PositionGroup::Def,
        Some(30),
        Some(90),
        Some(1_000),
        None,
        None,
    );
    let affordable = player(
        "youth",
        PositionGroup::Def,
        Some(18),
        Some(20),
        Some(2_000),
        None,
        None,
    );
    let bids = tick(&[club("buyer", 50, 0, 29_200, 0)], &[expensive, affordable]);
    assert_eq!(bids.len(), 1);
    assert_eq!(bids[0].player_key, "youth");
    assert_eq!(bids[0].tier, SquadTier::Youth);
    assert_eq!(bids[0].wage_cents, 29_200);

    let blocked = player(
        "blocked",
        PositionGroup::Def,
        Some(30),
        Some(90),
        Some(1_000_000),
        None,
        None,
    );
    let open = player(
        "open",
        PositionGroup::Def,
        Some(25),
        Some(50),
        Some(1_000_000),
        None,
        None,
    );
    let inputs = seed();
    let mut rng = Mulberry32::new(
        derive_event_seed(
            &inputs.root_seed,
            &inputs.stream_version,
            EventKind::Market,
            &[&inputs.operation_key],
        )
        .unwrap(),
    );
    let _blocked_draw = rng.next_int(11).unwrap() - 5;
    let next_noise = rng.next_int(11).unwrap() - 5;
    let bids = tick(
        &[club("a", 50, 0, 0, 0), club("b", 50, 0, 10_000_000, 0)],
        &[blocked, open],
    );
    assert_eq!(bids.len(), 1);
    assert_eq!(bids[0].buyer_key, "b");
    assert_eq!(bids[0].noise, next_noise);
}

#[test]
fn qualifying_fee_is_reserved_only_when_the_buyer_can_pay_it() {
    let valuation = 101_i64;
    let qualifying = (valuation * 3 + 2 - 1) / 2;
    assert_eq!(qualifying, 152);
    let mut player = contracted("player", PositionGroup::Def, 50, valuation, "managed");
    player.seller_prestige = Some(40);
    let rich = club("buyer", 80, qualifying, 10_000_000, 0);
    let raised = plan_tick(
        std::slice::from_ref(&rich),
        std::slice::from_ref(&player),
        "managed",
        &seed(),
        Some(rule(3, 2)),
    )
    .unwrap();
    assert_eq!(raised[0].fee_cents, qualifying);
    assert_eq!(raised[0].valuation_cents, valuation);
    assert!(raised[0].raised_to_qualify);

    let poor = club("buyer", 80, qualifying - 1, 10_000_000, 0);
    let kept = plan_tick(
        &[poor],
        std::slice::from_ref(&player),
        "managed",
        &seed(),
        Some(rule(3, 2)),
    )
    .unwrap();
    let unraised = plan_tick(
        &[rich],
        std::slice::from_ref(&player),
        "managed",
        &seed(),
        None,
    )
    .unwrap();
    assert_eq!(kept[0].fee_cents, unraised[0].fee_cents);
    assert!(kept[0].fee_cents < qualifying);
    assert!(!kept[0].raised_to_qualify);

    let lower_prestige = club("buyer", 40, 10_000_000, 10_000_000, 0);
    let not_raised = plan_tick(
        &[lower_prestige],
        &[player],
        "managed",
        &seed(),
        Some(rule(3, 2)),
    )
    .unwrap();
    assert!(!not_raised[0].raised_to_qualify);
    assert_ne!(not_raised[0].fee_cents, qualifying);
}

#[test]
fn missing_value_and_form_follow_the_valuation_rules() {
    let base = contracted("player", PositionGroup::Def, 50, 1_000_000, "seller");
    assert_eq!(
        tick(&[buyer("buyer", 50)], std::slice::from_ref(&base)).len(),
        1
    );

    let mut missing = base.clone();
    missing.market_value_cents = None;
    assert!(tick(&[buyer("buyer", 50)], &[missing]).is_empty());

    let mut zero = base.clone();
    zero.market_value_cents = Some(0);
    assert!(tick(&[buyer("buyer", 50)], &[zero]).is_empty());

    let mut no_age = base.clone();
    no_age.age = None;
    assert!(tick(&[buyer("buyer", 50)], &[no_age]).is_empty());

    let mut too_old = base.clone();
    too_old.age = Some(35);
    assert!(tick(&[buyer("buyer", 50)], &[too_old]).is_empty());

    let before_matches = tick(&[buyer("buyer", 50)], std::slice::from_ref(&base));
    assert_eq!(
        before_matches[0].valuation_cents,
        base.market_value_cents.unwrap()
    );

    let mut formed = base.clone();
    formed.appearance_count = 2;
    formed.rating_sum = 160;
    formed.season_minutes = 180;
    let formed_bid = tick(&[buyer("buyer", 50)], &[formed]);
    assert_eq!(formed_bid[0].valuation_cents, 1_000_000 * 107 / 100);

    let mut cold = base;
    cold.market_value_cents = Some(1_000);
    cold.appearance_count = 1;
    cold.rating_sum = 1;
    cold.season_minutes = 0;
    let cold_bid = tick(&[buyer("buyer", 50)], &[cold]);
    assert_eq!(cold_bid[0].valuation_cents, 800);
}

#[test]
fn invalid_market_inputs_are_refused() {
    let clubs = [buyer("buyer", 50)];
    let players = [contracted(
        "player",
        PositionGroup::Def,
        50,
        1_000,
        "seller",
    )];
    let mut bad_version = seed();
    bad_version.stream_version = "2".into();
    assert_eq!(
        plan_tick(&clubs, &players, "managed", &bad_version, None).unwrap_err(),
        CoreError::Invalid("Unsupported simulation version.")
    );

    let mut empty_key = seed();
    empty_key.operation_key.clear();
    assert_eq!(
        plan_tick(&clubs, &players, "managed", &empty_key, None).unwrap_err(),
        CoreError::Invalid("Invalid stream key.")
    );

    assert_eq!(
        plan_tick(
            &[club("buyer", 50, -1, 0, 0)],
            &players,
            "managed",
            &seed(),
            None
        )
        .unwrap_err(),
        CoreError::Invalid("Invalid spendable balance.")
    );
    assert_eq!(
        plan_tick(
            &[club("buyer", 101, 0, 0, 0)],
            &players,
            "managed",
            &seed(),
            None
        )
        .unwrap_err(),
        CoreError::Invalid("Prestige is outside 0–100.")
    );
    assert_eq!(
        plan_tick(
            &[club("buyer", -1, 0, 0, 0)],
            &players,
            "managed",
            &seed(),
            None
        )
        .unwrap_err(),
        CoreError::Invalid("Prestige is outside 0–100.")
    );

    let mut bad_seller = players[0].clone();
    bad_seller.seller_prestige = Some(101);
    assert_eq!(
        plan_tick(&clubs, &[bad_seller], "managed", &seed(), None).unwrap_err(),
        CoreError::Invalid("Prestige is outside 0–100.")
    );
}

fn proposal() -> TermProposal {
    TermProposal {
        fee_cents: 900_000,
        wage_cents: 100_000,
        tier: SquadTier::Rotation,
        valuation_cents: 1_000_000,
        current_wage_cents: 100_000,
        current_tier: Some(SquadTier::Rotation),
        seller_is_managed: false,
        buyer_is_ai: false,
        spendable_cents: 2_000_000,
        wage_room_cents: 200_000,
    }
}

#[test]
fn seller_bands_accept_counter_or_reject() {
    let minimum = 1_000_000 * 90 / 100;
    let counter_floor = minimum * 80 / 100;
    let mut accepted = proposal();
    accepted.fee_cents = minimum;
    assert_eq!(
        resolve_terms(accepted).unwrap(),
        Agreement::Agreed {
            fee_cents: minimum,
            wage_cents: 100_000,
            tier: SquadTier::Rotation,
            counter_count: 0,
        }
    );

    let mut countered = proposal();
    countered.fee_cents = 800_000;
    assert_eq!(
        resolve_terms(countered.clone()).unwrap(),
        Agreement::Countered {
            fee_cents: minimum,
            wage_cents: 100_000,
            tier: SquadTier::Rotation,
            counter_count: 1,
        }
    );
    countered.fee_cents = counter_floor;
    assert_eq!(
        resolve_terms(countered).unwrap(),
        Agreement::Countered {
            fee_cents: minimum,
            wage_cents: 100_000,
            tier: SquadTier::Rotation,
            counter_count: 1,
        }
    );

    let mut rejected = proposal();
    rejected.fee_cents = counter_floor - 1;
    assert_eq!(resolve_terms(rejected).unwrap(), Agreement::Rejected);
}

#[test]
fn player_bands_accept_counter_or_reject_a_demotion() {
    let mut accepted = proposal();
    accepted.fee_cents = 900_000;
    accepted.wage_cents = 100_000;
    assert!(matches!(
        resolve_terms(accepted).unwrap(),
        Agreement::Agreed {
            counter_count: 0,
            ..
        }
    ));

    let mut countered = proposal();
    countered.wage_cents = 90_000;
    assert_eq!(
        resolve_terms(countered).unwrap(),
        Agreement::Countered {
            fee_cents: 900_000,
            wage_cents: 100_000,
            tier: SquadTier::Rotation,
            counter_count: 1,
        }
    );

    let mut demoted = proposal();
    demoted.tier = SquadTier::Youth;
    demoted.current_tier = Some(SquadTier::Key);
    demoted.wage_cents = 119_999;
    assert_eq!(resolve_terms(demoted.clone()).unwrap(), Agreement::Rejected);
    demoted.wage_cents = 120_000;
    assert_eq!(
        resolve_terms(demoted).unwrap(),
        Agreement::Agreed {
            fee_cents: 900_000,
            wage_cents: 120_000,
            tier: SquadTier::Youth,
            counter_count: 0,
        }
    );

    let mut missing_tier = proposal();
    missing_tier.current_tier = None;
    missing_tier.wage_cents = 90_000;
    assert!(matches!(
        resolve_terms(missing_tier).unwrap(),
        Agreement::Countered {
            counter_count: 1,
            ..
        }
    ));
}

#[test]
fn seller_and_player_counters_stop_at_two() {
    let mut user = proposal();
    user.fee_cents = 800_000;
    user.wage_cents = 90_000;
    let first = resolve_terms(user.clone()).unwrap();
    assert_eq!(resolve_terms(user).unwrap(), first);
    assert_eq!(
        first,
        Agreement::Countered {
            fee_cents: 900_000,
            wage_cents: 100_000,
            tier: SquadTier::Rotation,
            counter_count: 2,
        }
    );

    let mut ai = proposal();
    ai.buyer_is_ai = true;
    ai.fee_cents = 800_000;
    ai.wage_cents = 90_000;
    ai.spendable_cents = 900_000;
    ai.wage_room_cents = 100_000;
    assert_eq!(
        resolve_terms(ai.clone()).unwrap(),
        Agreement::Agreed {
            fee_cents: 900_000,
            wage_cents: 100_000,
            tier: SquadTier::Rotation,
            counter_count: 2,
        }
    );
    ai.spendable_cents = 899_999;
    assert_eq!(resolve_terms(ai.clone()).unwrap(), Agreement::Rejected);
    ai.spendable_cents = 900_000;
    ai.wage_cents = 100_000;
    ai.wage_room_cents = 99_999;
    assert_eq!(resolve_terms(ai).unwrap(), Agreement::Rejected);
}

#[test]
fn a_managed_seller_does_not_decide_the_fee() {
    let mut countered = proposal();
    countered.seller_is_managed = true;
    countered.buyer_is_ai = true;
    countered.fee_cents = 50_000;
    countered.wage_cents = 90_000;
    countered.wage_room_cents = 100_000;
    assert_eq!(
        resolve_terms(countered.clone()).unwrap(),
        Agreement::Agreed {
            fee_cents: 50_000,
            wage_cents: 100_000,
            tier: SquadTier::Rotation,
            counter_count: 1,
        }
    );
    countered.wage_room_cents = 99_999;
    assert_eq!(resolve_terms(countered).unwrap(), Agreement::Rejected);

    let mut rejected = proposal();
    rejected.seller_is_managed = true;
    rejected.tier = SquadTier::Youth;
    rejected.current_tier = Some(SquadTier::Key);
    rejected.wage_cents = 100_000;
    assert_eq!(resolve_terms(rejected).unwrap(), Agreement::Rejected);
}

#[test]
fn term_inputs_reject_bad_money_and_repeat() {
    let sample = proposal();
    assert_eq!(
        resolve_terms(sample.clone()).unwrap(),
        resolve_terms(sample).unwrap()
    );

    let mut negative = proposal();
    negative.fee_cents = -1;
    assert_eq!(
        resolve_terms(negative).unwrap_err(),
        CoreError::Invalid("Invalid money.")
    );
    let mut zero = proposal();
    zero.valuation_cents = 0;
    assert_eq!(
        resolve_terms(zero).unwrap_err(),
        CoreError::Invalid("Invalid valuation.")
    );
}

#[test]
fn a_second_compulsory_bid_for_one_player_is_absent() {
    let mut player = contracted("player", PositionGroup::Def, 50, 101, "managed");
    player.seller_prestige = Some(40);
    let clubs = [
        club("a", 80, 50_000_000_000, 50_000_000, 0),
        club("b", 90, 50_000_000_000, 50_000_000, 0),
    ];
    let bids = plan_openings(
        &clubs,
        std::slice::from_ref(&player),
        "managed",
        &seed(),
        Some(rule(3, 2)),
        &BTreeSet::new(),
        &BTreeSet::new(),
    )
    .unwrap();
    assert_eq!(bids.len(), 1);
    assert_eq!(bids[0].player_key, "player");
    let mut already = BTreeSet::new();
    already.insert("player".into());
    let skipped = plan_openings(
        &clubs,
        std::slice::from_ref(&player),
        "managed",
        &seed(),
        Some(rule(3, 2)),
        &already,
        &BTreeSet::new(),
    )
    .unwrap();
    assert!(skipped.is_empty());
}
