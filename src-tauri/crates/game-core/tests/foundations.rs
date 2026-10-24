//! Native product invariants. Synthetic saved rows are input data, not an old-logic oracle.
use game_core::{
    calendar::*, dates::*, finance::*, guards::*, money::*, policy::*, random::*, selection::*, *,
};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

fn fixture() -> CampaignSnapshot {
    parse_snapshot(include_bytes!("../../../fixtures/standalone.json")).unwrap()
}
fn s(value: i64) -> SafeInt {
    SafeInt::new(value).unwrap()
}
fn m(value: i64) -> MoneyCents {
    MoneyCents::new(value).unwrap()
}
fn id(value: &str) -> EntityId {
    EntityId::new(value).unwrap()
}
fn date(value: &str) -> DateOnly {
    DateOnly::parse(value).unwrap()
}
fn constitution(preset: Preset) -> ConstitutionRow {
    ConstitutionRow {
        rules: constitution_preset(preset),
        ..fixture().tables.constitutions.remove(0)
    }
}
fn snapshot(remaining: Option<i64>) -> PolicySnapshot {
    PolicySnapshot {
        revision: s(12),
        remaining_capacity_cents: remaining.map(s),
    }
}
fn action(value: Value) -> PolicyAction {
    parse_policy_action(value).unwrap()
}
fn evaluate(value: Value, preset: Preset, remaining: Option<i64>) -> RuleReport {
    evaluate_action(
        &action(value),
        &snapshot(remaining),
        &constitution(preset),
        &date("2026-07-01"),
    )
    .unwrap()
}
fn codes(report: &RuleReport) -> Vec<&str> {
    report
        .verdicts
        .iter()
        .map(|verdict| verdict.code.as_str())
        .collect()
}
fn signing() -> Value {
    json!({"type":"incoming-transfer","feeCents":1000,"age":26,"isFree":false,"weeklyWageCents":2000000,"squadTier":"rotation"})
}
fn reg_player(index: usize) -> Value {
    json!({"playerId":format!("player-{index}"),"status":"registered","homegrownClub":true,"homegrownNation":false,"ageExempt":false,"age":24})
}

#[test]
fn money_parsing_unknowns_and_exact_percentage_flooring() {
    for (text, cents) in [
        ("0", 0),
        ("0.1", 10),
        ("€12.30", 1230),
        ("9999999999999.99", 999_999_999_999_999),
        ("\u{feff} € 1.2\u{feff}", 120),
    ] {
        assert_eq!(parse_money_cents(text).unwrap(), m(cents));
    }
    for invalid in [
        "-1",
        "01",
        "1e3",
        "1,000",
        "0.",
        ".10",
        "1.234",
        "10000000000000",
        "\u{0085}1",
    ] {
        assert!(parse_money_cents(invalid).is_err(), "{invalid}");
    }
    assert_eq!(format_money_euros(m(123456789)), "€1,234,567.89");
    assert_eq!(format_money_unknown(None), "Unknown");
    assert_eq!(format_capacity(Some(s(-123))).unwrap(), "-€1.23");
    for amount in [0, 1, 99, 100, 101, 999_999_999_999_999, JS_MAX_SAFE_INTEGER] {
        for percent in 0..=100 {
            let credit = i128::from(floor_percent(m(amount), percent).unwrap().get());
            let product = i128::from(amount) * i128::from(percent);
            assert!(
                credit * 100 <= product && (credit + 1) * 100 > product,
                "floor for {amount} at {percent}%"
            );
        }
    }
    assert!(floor_percent(m(100), 101).is_err());
    assert!(MoneyCents::new(-1).is_err());
    assert!(checked_add(JS_MAX_SAFE_INTEGER, 1).is_err());
    assert!(checked_add(i64::MAX, -i64::MAX).is_err());
    assert!(checked_sub(-JS_MAX_SAFE_INTEGER, 1).is_err());
}

#[test]
fn capacity_is_scoped_reversals_do_not_count_and_totals_cannot_overflow() {
    let mut original = fixture().tables.ledger_entries.remove(0);
    original.reverses_entry_id = None;
    let row = |name: &str, kind, amount| LedgerEntryRow {
        earning_season_id: None,
        settlement_id: None,
        award_kind: None,
        id: id(name),
        kind,
        amount_cents: m(amount),
        ..original.clone()
    };
    let mut entries = vec![
        row("opening", LedgerKind::InitialAllocation, 1000),
        row("sale", LedgerKind::PlayerSale, 101),
        row("prize", LedgerKind::PrizeIncome, 103),
        row("carry", LedgerKind::ApprovedCarryover, 11),
        row("fee", LedgerKind::IncomingFee, 100),
        row("void-sale", LedgerKind::PlayerSale, 999),
    ];
    let mut reversal = row("undo", LedgerKind::Reversal, 999);
    reversal.reverses_entry_id = Some(id("void-sale"));
    entries.push(reversal);
    let mut other = row("other", LedgerKind::IncomingFee, 9999);
    other.campaign_id = id("foreign");
    entries.push(other);
    let mut other = row("other-season", LedgerKind::IncomingFee, 9999);
    other.season_id = id("foreign-season");
    entries.push(other);
    let mut other = row("other-club", LedgerKind::IncomingFee, 9999);
    other.club_id = id("foreign-club");
    entries.push(other);
    let result = transfer_capacity(
        &entries,
        &original.campaign_id,
        &original.season_id,
        &original.club_id,
        70,
        50,
    )
    .unwrap();
    assert_eq!(
        (
            result.sale_credit_cents,
            result.prize_credit_cents,
            result.authorized_cents,
            result.remaining_cents
        ),
        (70, 51, 1132, 1032)
    );
    let spent = transfer_capacity(
        &[row("spent", LedgerKind::IncomingFee, 123)],
        &original.campaign_id,
        &original.season_id,
        &original.club_id,
        70,
        100,
    )
    .unwrap();
    assert_eq!(spent.remaining_cents, -123);
    let excessive = [
        row("huge", LedgerKind::InitialAllocation, JS_MAX_SAFE_INTEGER),
        row("extra", LedgerKind::InitialAllocation, 1),
    ];
    assert!(transfer_capacity(
        &excessive,
        &original.campaign_id,
        &original.season_id,
        &original.club_id,
        70,
        100
    )
    .is_err());
}

#[test]
fn wages_and_financial_previews_preserve_unknown_values_and_report_shortfalls() {
    let original = fixture().tables.contracts.remove(0);
    let mut known = original.clone();
    known.weekly_wage_cents = Some(m(123));
    known.squad_tier = Some(SquadTier::Key);
    let mut unknown = original.clone();
    unknown.weekly_wage_cents = None;
    unknown.squad_tier = None;
    let mut ended = known.clone();
    ended.status = ContractStatus::Ended;
    let mut foreign = known.clone();
    foreign.campaign_id = id("foreign");
    let commitment = wage_commitment(
        &[known, unknown, ended, foreign],
        &original.campaign_id,
        &original.club_id,
    )
    .unwrap();
    assert_eq!((commitment.known_cents, commitment.unknown_count), (123, 1));
    assert_eq!(commitment.by_tier["key"].count, 1);
    assert_eq!(commitment.by_tier["unknown"].unknown_count, 1);
    let wages = WageSummary {
        known_cents: m(123),
        unknown_count: s(1),
    };
    assert_eq!(format_wage_commitment(wages).unwrap(), "€1.23 · 1 unknown");
    assert_eq!(
        format_wage_commitment(WageSummary {
            known_cents: m(0),
            ..wages
        })
        .unwrap(),
        "Unknown"
    );
    let preview = preview_action(
        &action(signing()),
        &snapshot(Some(999)),
        &constitution(Preset::Balanced),
        &date("2026-07-01"),
        wages,
        None,
    )
    .unwrap();
    assert_eq!(preview.after_capacity, "Short by €0.01");
    assert!(!preview.report.allowed);
    let change = action(json!({"type":"wage-change","weeklyWageCents":200,"squadTier":"youth"}));
    let changed = preview_action(
        &change,
        &snapshot(None),
        &constitution(Preset::Balanced),
        &date("2026-07-01"),
        wages,
        Some(m(100)),
    )
    .unwrap();
    assert_eq!(changed.after_wages, "€2.23 · 1 unknown");
    assert_eq!(
        preview_action(
            &change,
            &snapshot(None),
            &constitution(Preset::Balanced),
            &date("2026-07-01"),
            wages,
            None
        )
        .unwrap()
        .after_wages,
        "Unknown"
    );
    let sale =
        preview_outgoing_sale(m(101), 70, &snapshot(Some(1000)), wages, Some(m(100))).unwrap();
    assert_eq!(sale.after_capacity, "€10.70");
    assert_eq!(sale.after_wages, "€0.23 · 1 unknown");
    assert_eq!(
        preview_outgoing_sale(m(101), 70, &snapshot(None), wages, None)
            .unwrap()
            .after_wages,
        "Unknown"
    );
}

#[test]
fn policy_limits_free_transfers_and_missing_data_are_authoritative() {
    assert!(evaluate(signing(), Preset::Balanced, Some(1000)).allowed);
    let mut over = signing();
    over["feeCents"] = json!(1001);
    over["age"] = json!(27);
    over["weeklyWageCents"] = json!(2000001);
    let report = evaluate(over, Preset::Balanced, Some(1000));
    assert_eq!(
        codes(&report),
        [
            "FEE_EXCEEDS_CAPACITY",
            "AGE_ABOVE_CAP",
            "WAGE_ABOVE_TIER_CAP"
        ]
    );
    assert!(!report.allowed);
    assert_eq!(report.snapshot_revision, s(12));
    assert!(report
        .verdicts
        .iter()
        .all(|v| v.severity == Severity::Block && !v.message.is_empty() && !v.remedy.is_empty()));
    let mut free = signing();
    free["feeCents"] = json!(0);
    free["isFree"] = json!(true);
    free["age"] = json!(30);
    free["weeklyWageCents"] = json!(100);
    assert!(evaluate(free.clone(), Preset::Balanced, Some(0)).allowed);
    assert_eq!(
        codes(&evaluate(free, Preset::Strict, Some(0))),
        ["AGE_ABOVE_CAP"]
    );
    let unknown = json!({"type":"incoming-transfer","feeCents":1,"age":null,"isFree":false,"weeklyWageCents":null,"squadTier":null});
    assert_eq!(
        codes(&evaluate(unknown.clone(), Preset::Balanced, None)),
        [
            "INSUFFICIENT_DATA",
            "INSUFFICIENT_DATA",
            "INSUFFICIENT_DATA"
        ]
    );
    assert!(evaluate(unknown, Preset::Custom, None).allowed);
    for invalid in [
        json!({"type":"wage-change","weeklyWageCents":-1,"squadTier":"key"}),
        json!({"type":"wage-change","weeklyWageCents":9007199254740992_i64,"squadTier":"key"}),
        json!({"type":"incoming-transfer","feeCents":0,"age":100,"isFree":true,"weeklyWageCents":0,"squadTier":"youth"}),
        json!({"type":"wage-change","squadTier":null}),
    ] {
        assert!(parse_policy_action(invalid).is_err());
    }
}

#[test]
fn offer_ratios_are_exact_unknowns_warn_and_only_open_qualifiers_count() {
    let rule = QualificationRule {
        required_fee_numerator: s(3),
        required_fee_denominator: s(2),
        require_higher_prestige: true,
    };
    assert_eq!(
        offer_qualifies(m(149), Some(m(100)), Some(s(80)), Some(s(40)), rule).unwrap(),
        Qualification::DoesNotQualify
    );
    assert_eq!(
        offer_qualifies(m(150), Some(m(100)), Some(s(80)), Some(s(40)), rule).unwrap(),
        Qualification::Qualifies
    );
    assert_eq!(
        offer_qualifies(m(150), Some(m(100)), Some(s(40)), Some(s(40)), rule).unwrap(),
        Qualification::DoesNotQualify
    );
    let huge = QualificationRule {
        required_fee_numerator: s(JS_MAX_SAFE_INTEGER),
        required_fee_denominator: s(JS_MAX_SAFE_INTEGER),
        ..rule
    };
    assert_eq!(
        offer_qualifies(
            m(JS_MAX_SAFE_INTEGER),
            Some(m(JS_MAX_SAFE_INTEGER)),
            Some(s(100)),
            Some(s(99)),
            huge
        )
        .unwrap(),
        Qualification::Qualifies
    );
    let warning = evaluate(
        json!({"type":"reject-offer","feeCents":300,"marketValueCents":null,"bidderPrestige":80,"sellerPrestige":40}),
        Preset::Balanced,
        None,
    );
    assert!(warning.allowed);
    assert_eq!(warning.verdicts[0].severity, Severity::Warn);
    let block = evaluate(
        json!({"type":"reject-offer","feeCents":150,"marketValueCents":100,"bidderPrestige":80,"sellerPrestige":40}),
        Preset::Balanced,
        None,
    );
    assert!(!block.allowed);
    assert_eq!(codes(&block), ["QUALIFYING_OFFER"]);
    let rollover = evaluate(
        json!({"type":"season-rollover","unresolvedQualifyingOffers":1}),
        Preset::Balanced,
        None,
    );
    assert_eq!(codes(&rollover), ["UNRESOLVED_QUALIFYING_OFFER"]);
    let mut offer = fixture().tables.offers.remove(0);
    offer.status = OfferStatus::Open;
    offer.fee_cents = m(150);
    let mut closed = offer.clone();
    closed.status = OfferStatus::Accepted;
    let mut foreign = offer.clone();
    foreign.campaign_id = id("foreign");
    let market = BTreeMap::from([(offer.player_id.as_str().into(), Some(m(100)))]);
    let prestige = BTreeMap::from([(offer.bidder_club_id.as_str().into(), Some(s(80)))]);
    assert_eq!(
        count_unresolved_qualifying_offers(
            &[offer.clone(), closed, foreign],
            &offer.campaign_id,
            &market,
            &prestige,
            Some(s(40)),
            rule
        )
        .unwrap(),
        1
    );
}

#[test]
fn registration_enforces_unique_rosters_quotas_and_explicit_unknowns() {
    let registration = |players: Vec<Value>| json!({"type":"registration","competitionKey":"league","players":players});
    let legal = (0..25).map(reg_player).collect::<Vec<_>>();
    assert!(evaluate(registration(legal), Preset::Balanced, None).allowed);
    let crowded = (0..26).map(reg_player).collect::<Vec<_>>();
    assert_eq!(
        codes(&evaluate(registration(crowded), Preset::Balanced, None)),
        ["ROSTER_ABOVE_LIMIT"]
    );
    let mut unknown = reg_player(0);
    unknown["status"] = json!("unknown");
    let duplicate = evaluate(
        registration(vec![unknown.clone(), unknown]),
        Preset::Balanced,
        None,
    );
    assert_eq!(
        codes(&duplicate),
        [
            "DUPLICATE_PLAYER",
            "INSUFFICIENT_DATA",
            "INSUFFICIENT_DATA",
            "HOMEGROWN_BELOW_MINIMUM"
        ]
    );
    let mut exempt = reg_player(0);
    exempt["age"] = json!(null);
    exempt["ageExempt"] = json!(true);
    exempt["homegrownClub"] = json!(null);
    assert_eq!(
        codes(&evaluate(
            registration(vec![exempt.clone()]),
            Preset::Balanced,
            None
        )),
        ["HOMEGROWN_BELOW_MINIMUM"]
    );
    exempt["ageExempt"] = json!(null);
    assert_eq!(
        codes(&evaluate(
            registration(vec![exempt]),
            Preset::Balanced,
            None
        )),
        ["INSUFFICIENT_DATA", "HOMEGROWN_BELOW_MINIMUM"]
    );
    let mut known = reg_player(0);
    known["homegrownNation"] = json!(null);
    let counted = evaluate(registration(vec![known]), Preset::Balanced, None);
    assert_eq!(counted.verdicts[0].evidence["homegrownCount"], 1);
}

fn placed(result: PlaceResult) -> LineupDraft {
    match result {
        PlaceResult::Success { draft, .. } => draft,
        PlaceResult::Failure { code, .. } => panic!("unexpected {code:?}"),
    }
}
#[test]
fn selection_moves_are_unique_bounded_and_do_not_mutate_the_input() {
    let roster = (0..14).map(|i| format!("p{i}")).collect::<Vec<_>>();
    let ids = roster.iter().map(String::as_str).collect::<Vec<_>>();
    let original = empty_draft();
    let gk = placed(place_on_slot(&original, "p0", "gk", &ids));
    assert!(original.starters.is_empty());
    let replaced = placed(place_on_slot(&gk, "p1", "gk", &ids));
    assert_eq!(replaced.starters.len(), 1);
    assert_eq!(replaced.starters[0].player_id, id("p1"));
    let moved = placed(place_on_slot(&replaced, "p1", "rb", &ids));
    assert_eq!(moved.starters.len(), 1);
    assert_eq!(moved.starters[0].slot, "rb");
    let benched = placed(place_on_bench(&moved, "p1", &ids));
    assert!(benched.starters.is_empty());
    assert_eq!(benched.bench_player_ids, ["p1"]);
    assert_eq!(
        placed(place_on_bench(&benched, "p1", &ids)).bench_player_ids,
        ["p1"]
    );
    let mut full = empty_draft();
    for name in &ids[..12] {
        full = placed(place_on_bench(&full, name, &ids));
    }
    assert!(matches!(
        place_on_bench(&full, "p12", &ids),
        PlaceResult::Failure {
            code: PlaceCode::BenchFull,
            ..
        }
    ));
    assert!(matches!(
        place_on_slot(&full, "foreign", "gk", &ids),
        PlaceResult::Failure {
            code: PlaceCode::UnknownPlayer,
            ..
        }
    ));
    assert!(matches!(
        place_on_slot(&full, "p0", "invalid", &ids),
        PlaceResult::Failure {
            code: PlaceCode::UnknownSlot,
            ..
        }
    ));
    assert_eq!(clear_slot(&gk, "gk").starters.len(), 0);
    assert_eq!(clear_slot(&gk, "invalid"), gk);
    assert!(switch_formation(&gk, Formation::F352).starters.is_empty());
    assert!(lineup_problems(&moved, &ids).is_empty());
    let mut invalid = moved.clone();
    invalid.starters.push(moved.starters[0].clone());
    assert_eq!(
        lineup_problems(&invalid, &ids),
        [LineupProblem::DuplicatePlayer, LineupProblem::DuplicateSlot]
    );
    for formation in [
        Formation::F433,
        Formation::F4231,
        Formation::F442,
        Formation::F352,
    ] {
        let slots = formation_slots(formation);
        assert_eq!(slots.len(), 11);
        assert_eq!(
            slots
                .iter()
                .map(|(id, _)| *id)
                .collect::<BTreeSet<_>>()
                .len(),
            11
        );
        assert_eq!(
            slots
                .iter()
                .filter(|(_, group)| *group == PositionGroup::Gk)
                .count(),
            1
        );
    }
    assert_eq!(position_group_for(Position::Cam), PositionGroup::Mid);
    assert_eq!(
        position_fit(PositionGroup::Unknown, PositionGroup::Gk),
        "Unknown position"
    );
    assert_eq!(
        position_fit(PositionGroup::Mid, PositionGroup::Def),
        "Different position"
    );
}

#[test]
fn date_arithmetic_obeys_gregorian_leaps_bounds_and_age_provenance() {
    for invalid in [
        "1899-12-31",
        "2200-01-01",
        "1900-02-29",
        "2100-02-29",
        "2024-04-31",
        "2024-00-01",
        "2024-01-00",
        "2024-1-01",
        "2024-01-01 ",
    ] {
        assert!(DateOnly::parse(invalid).is_err(), "{invalid}");
    }
    for valid in ["1900-01-01", "2000-02-29", "2024-02-29", "2199-12-31"] {
        DateOnly::parse(valid).unwrap();
    }
    assert_eq!(
        add_days(&date("2000-03-01"), -1).unwrap(),
        date("2000-02-29")
    );
    assert_eq!(
        add_days(&date("1900-02-28"), 1).unwrap(),
        date("1900-03-01")
    );
    for year in 1900..=2199 {
        let start = date(&format!("{year}-01-01"));
        let later = add_days(&start, 200).unwrap();
        assert_eq!(add_days(&later, -200).unwrap(), start);
    }
    assert!(add_days(&date("1900-01-01"), -1).is_err());
    assert!(add_days(&date("2199-12-31"), 1).is_err());
    assert_eq!(
        age_in_whole_years(&date("2000-02-29"), &date("2024-02-28")).unwrap(),
        23
    );
    assert_eq!(
        age_in_whole_years(&date("2000-02-29"), &date("2024-02-29")).unwrap(),
        24
    );
    assert!(age_in_whole_years(&date("2026-01-01"), &date("2025-12-31")).is_err());
    assert!(estimate_age(99, 1, 2).is_err());
    validate_timestamp("2026-10-20T23:59:59.999Z").unwrap();
    for invalid in [
        "2026-10-20T24:00:00.000Z",
        "2026-02-29T00:00:00.000Z",
        "2026-10-20T00:00:00Z",
    ] {
        assert!(validate_timestamp(invalid).is_err());
    }
    let tables = fixture().tables;
    let mut player = tables.players[0].clone();
    let mut season = tables.seasons[0].clone();
    season.start_date = Some("2024-02-28".into());
    player.birth_date = Some("2000-02-29".into());
    assert_eq!(
        display_age(&player, &season),
        AgeDisplay::Exact { years: 23 }
    );
    player.birth_date = None;
    player.reported_age = Some(s(20));
    player.age_reference_season_ordinal = Some(s(1));
    season.ordinal = s(2);
    assert_eq!(
        display_age(&player, &season),
        AgeDisplay::Estimated { years: 21 }
    );
    player.reported_age = None;
    assert_eq!(display_age(&player, &season), AgeDisplay::Unknown);
    let empty = unsaved_registration_draft(&player, None);
    assert!(empty.homegrown_club.is_none());
    assert!(empty.age_exempt.is_none());
    let profile = &tables.player_simulation_states[0];
    let draft = unsaved_registration_draft(&player, Some(profile));
    assert_eq!(draft.homegrown_club, Some(profile.homegrown_club));
    let mut foreign_profile = profile.clone();
    foreign_profile.campaign_id = id("foreign");
    assert!(unsaved_registration_draft(&player, Some(&foreign_profile))
        .homegrown_club
        .is_none());
    assert!(draft.age_exempt.is_none());
}

#[test]
fn streams_are_reproducible_unicode_safe_independent_and_unambiguous() {
    for seed in ["touchline", "café-München", "astral-😀-𐍈", "quote-\"-\\-\n"] {
        let mut first = create_event_stream(seed, "1", EventKind::World, &["world:2"]).unwrap();
        let mut again = first.clone();
        for _ in 0..1000 {
            let draw = first.draw();
            assert!((0.0..1.0).contains(&draw));
            assert_eq!(draw.to_bits(), again.draw().to_bits());
        }
        let expected = create_event_stream(seed, "1", EventKind::Calendar, &["deadline"])
            .unwrap()
            .draw();
        for _ in 0..100 {
            first.draw();
        }
        assert_eq!(
            expected,
            create_event_stream(seed, "1", EventKind::Calendar, &["deadline"])
                .unwrap()
                .draw()
        );
    }
    assert_ne!(hash_seed("😀", "1"), hash_seed("😀", "2"));
    assert_ne!(
        event_stream_key("a", "1", EventKind::World, &["b", "c"]).unwrap(),
        event_stream_key("a", "1", EventKind::World, &["b,c"]).unwrap()
    );
    let key = event_stream_key("quote-\"-😀", "1", EventKind::Calendar, &["a\\b"]).unwrap();
    let parsed: Value = serde_json::from_str(&key).unwrap();
    assert_eq!(parsed[2], "quote-\"-😀");
    assert_eq!(parsed[4][0], "a\\b");
    assert!(event_stream_key("seed", "2", EventKind::World, &[]).is_err());
    assert!(event_stream_key("seed", "1", EventKind::World, &["x"; 33]).is_err());
    let fingerprint = career_fingerprint(
        "Career",
        "😀",
        2026,
        "club:01",
        RulesMode::Challenge,
        Preset::Balanced,
    )
    .unwrap();
    let same = career_fingerprint(
        "Career",
        "😀",
        2026,
        "club:01",
        RulesMode::Challenge,
        Preset::Balanced,
    )
    .unwrap();
    assert_eq!(fingerprint, same);
    assert_ne!(
        fingerprint,
        career_fingerprint(
            "Career",
            "😀",
            2026,
            "club:02",
            RulesMode::Challenge,
            Preset::Balanced
        )
        .unwrap()
    );
    let mut random = Mulberry32::new(u32::MAX);
    assert!(random.next_int(0).is_err());
    for _ in 0..1000 {
        assert!((0..10).contains(&random.next_int(10).unwrap()));
    }
}

#[test]
fn calendar_previews_stop_at_foundation_boundaries_and_never_write_time() {
    let tables = fixture().tables;
    let mut state = tables.simulation_states[0].clone();
    let mut season = tables.seasons[0].clone();
    season.start_date = Some("2026-07-01".into());
    season.end_date = Some("2027-06-30".into());
    season.closed_at = None;
    season.status = SeasonStatus::Active;
    state.current_date = "2026-07-01".into();
    state.last_boundary_key = None;
    state.phase = CalendarPhase::Preseason;
    let original = state.clone();
    let preview = preview_time_advance(&state, &season).unwrap();
    assert_eq!(state, original);
    assert!(!preview.allowed);
    assert!(preview.target.is_none());
    assert_eq!(
        active_transfer_window(&state, &season).unwrap(),
        Some(TransferWindow::Summer)
    );
    state.current_date = "2026-08-31".into();
    assert!(preview_time_advance(&state, &season).is_err());
    state.last_boundary_key = Some("season:2026:summer-deadline".into());
    assert_eq!(active_transfer_window(&state, &season).unwrap(), None);
    assert_eq!(
        next_foundation_boundary(&state, &season)
            .unwrap()
            .unwrap()
            .date,
        date("2026-09-01")
    );
    state.current_date = "2026-09-01".into();
    state.phase = CalendarPhase::League;
    state.last_boundary_key = Some("season:2026:league-kickoff".into());
    let blocked = preview_time_advance(&state, &season).unwrap();
    assert!(!blocked.allowed);
    assert!(blocked.target.is_none());
    assert!(blocked.event_seed.is_none());
    assert_eq!(
        blocked.reason.as_deref(),
        Some(MATCH_SIMULATION_UNAVAILABLE)
    );
    let mut foreign = season.clone();
    foreign.campaign_id = id("foreign");
    assert!(preview_time_advance(&state, &foreign).is_err());
    state.last_boundary_key = None;
    assert!(preview_time_advance(&state, &season).is_err());
    state = original;
    state.last_boundary_key = Some("season:2026:summer-deadline".into());
    assert!(preview_time_advance(&state, &season).is_err());
    state.last_boundary_key = None;
    season.end_date = None;
    assert!(preview_time_advance(&state, &season).is_err());
    assert!(season_dates(2199).is_err());
    assert!(season_dates(1899).is_err());
    assert_eq!(
        transfer_window_on(&date("2026-01-31")),
        Some(TransferWindow::Winter)
    );
    assert_eq!(transfer_window_on(&date("2026-02-01")), None);
}

#[test]
fn mode_challenge_scope_and_revision_guards_reject_direct_calls() {
    let tables = fixture().tables;
    let mut campaign = tables.campaigns[0].clone();
    for rules in [RulesMode::Sandbox, RulesMode::Challenge] {
        campaign.rules_mode = rules;
        for operation in [
            StandaloneWrite::Match,
            StandaloneWrite::Negotiation,
            StandaloneWrite::Player,
            StandaloneWrite::Contract,
            StandaloneWrite::Ledger,
            StandaloneWrite::Club,
        ] {
            assert!(reject_standalone_write(&campaign, operation).is_err());
        }
        assert_eq!(
            reject_challenge_constitution(&campaign).is_err(),
            rules == RulesMode::Challenge
        );
    }
    let mut season = tables.seasons[0].clone();
    let mut player = tables.players[0].clone();
    require_active_season(&campaign, &season).unwrap();
    require_managed_player(&campaign, &player).unwrap();
    season.campaign_id = id("foreign");
    player.campaign_id = id("foreign");
    assert!(require_active_season(&campaign, &season).is_err());
    assert!(require_managed_player(&campaign, &player).is_err());
    player.campaign_id = campaign.id.clone();
    player.club_id = None;
    assert!(require_managed_player(&campaign, &player).is_err());
    require_revision(s(4), s(4)).unwrap();
    assert!(require_revision(s(4), s(3)).is_err());
    assert!(require_revision(s(-1), s(-1)).is_err());
    assert_eq!(next_revision(s(4)).unwrap(), s(5));
    assert!(next_revision(s(JS_MAX_SAFE_INTEGER)).is_err());
}
