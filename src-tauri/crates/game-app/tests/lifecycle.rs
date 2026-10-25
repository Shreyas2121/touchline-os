//! Prepared schema 5 imports exercise the public lifecycle services and real SQLite.
use game_app::*;
use game_core::{
    career::{prepare_standalone_career, CareerInput},
    lifecycle_ops::{LifecycleIdCounts, LifecycleIds},
    policy::Preset,
    schedule::{schedule_season, ScheduleClub},
    *,
};
use rusqlite::Connection;
use serde_json::json;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        OnceLock,
    },
};
#[path = "support/roster_years.rs"]
mod roster_years;
const NOW: &str = "2026-10-25T12:00:00.000Z";
static SEQ: AtomicU64 = AtomicU64::new(0);
fn n(v: i64) -> SafeInt {
    SafeInt::new(v).unwrap()
}
fn m(v: i64) -> MoneyCents {
    MoneyCents::new(v).unwrap()
}
fn id(s: impl Into<String>) -> EntityId {
    EntityId::new(s).unwrap()
}
fn fresh() -> EntityId {
    id(format!(
        "lifecycle-id-{}",
        SEQ.fetch_add(1, Ordering::Relaxed)
    ))
}
fn many(count: usize) -> Vec<EntityId> {
    (0..count).map(|_| fresh()).collect()
}
struct Dir(PathBuf);
impl Dir {
    fn new() -> Self {
        let p = std::env::temp_dir().join(format!(
            "touchline-lifecycle-{}-{}",
            std::process::id(),
            SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&p).unwrap();
        Self(p)
    }
    fn file(&self) -> PathBuf {
        self.0.join("career.sqlite3")
    }
    fn store(&self) -> NativeStore {
        NativeStore::open(self.file()).unwrap()
    }
}
impl Drop for Dir {
    fn drop(&mut self) {
        assert!(self.0.starts_with(std::env::temp_dir()));
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}
fn baseline() -> SnapshotTables {
    static BASE: OnceLock<SnapshotTables> = OnceLock::new();
    BASE.get_or_init(|| {
        let mut t = prepare_standalone_career(&CareerInput {
            campaign_id: id("lifecycle-career"),
            name: "Lifecycle career".into(),
            seed: "p10-g04".into(),
            start_year: n(2026),
            club_key: "club:01".into(),
            rules_mode: RulesMode::Challenge,
            preset: Preset::Balanced,
            now: NOW.into(),
            season_id: id("closing-season"),
            clock_id: id("lifecycle-clock"),
            constitution_id: id("lifecycle-constitution"),
            allocation_id: id("initial-allocation"),
            receipt_id: id("initial-receipt"),
            audit_event_id: id("initial-audit"),
            action_id: id("initial-action"),
        })
        .unwrap()
        .into_tables();
        let clubs = t
            .clubs
            .iter()
            .map(|club| ScheduleClub {
                simulation_key: &t
                    .club_simulation_states
                    .iter()
                    .find(|s| s.club_id == club.id)
                    .unwrap()
                    .simulation_key,
                league_tier: t
                    .leagues
                    .iter()
                    .find(|l| Some(&l.id) == club.league_id.as_ref())
                    .unwrap()
                    .tier
                    .unwrap()
                    .get(),
            })
            .collect::<Vec<_>>();
        for (i, f) in schedule_season(2026, &clubs)
            .unwrap()
            .into_iter()
            .enumerate()
        {
            let home = t
                .club_simulation_states
                .iter()
                .find(|s| s.simulation_key == f.home_simulation_key)
                .unwrap()
                .club_id
                .clone();
            let away = t
                .club_simulation_states
                .iter()
                .find(|s| s.simulation_key == f.away_simulation_key)
                .unwrap()
                .club_id
                .clone();
            let league = t
                .leagues
                .iter()
                .find(|l| l.tier == Some(n(f.league_tier)))
                .unwrap()
                .id
                .clone();
            let fixture = id(format!("old-fixture-{i}"));
            t.fixtures.push(FixtureRow {
                id: fixture.clone(),
                campaign_id: t.campaigns[0].id.clone(),
                season_id: t.seasons[0].id.clone(),
                league_id: league,
                round: n(f.round as i64),
                match_date: f.match_date.as_str().into(),
                home_club_id: home,
                away_club_id: away,
                fixture_key: f.fixture_key,
                status: FixtureStatus::Played,
            });
            t.simulated_matches.push(SimulatedMatchRow {
                id: id(format!("old-match-{i}")),
                campaign_id: t.campaigns[0].id.clone(),
                fixture_id: fixture,
                home_goals: n(0),
                away_goals: n(0),
                home_xg_milli: n(0),
                away_xg_milli: n(0),
                timeline: json!([]),
                input_snapshot: json!({"historical":i}),
                event_seed: n(1),
                engine_version: VersionOne,
            });
        }
        t.simulation_states[0].phase = CalendarPhase::Review;
        t.simulation_states[0].current_date = t
            .fixtures
            .iter()
            .find(|f| f.round == n(34))
            .unwrap()
            .match_date
            .clone();
        t.simulation_states[0].last_boundary_key = Some(format!(
            "season:closing-season:matchday:{}",
            t.simulation_states[0].current_date
        ));
        // A known young player receives exactly the season's minutes, and both periods can grow.
        let club = t.campaigns[0].managed_club_id.clone();
        let player = t
            .players
            .iter_mut()
            .find(|p| p.club_id.as_ref() == Some(&club))
            .unwrap();
        player.birth_date = Some("2007-01-01".into());
        player.potential = Some(n(100));
        player.attributes = PlayerAttributes {
            pace: Some(n(50)),
            finishing: Some(n(50)),
            passing: Some(n(50)),
            dribbling: Some(n(50)),
            defending: Some(n(50)),
            physical: Some(n(50)),
        };
        let player_id = player.id.clone();
        for f in t
            .fixtures
            .iter()
            .filter(|f| f.round.get() <= 17 && (f.home_club_id == club || f.away_club_id == club))
        {
            t.simulated_appearances.push(SimulatedAppearanceRow {
                id: fresh(),
                campaign_id: t.campaigns[0].id.clone(),
                fixture_id: f.id.clone(),
                player_id: player_id.clone(),
                club_id: club.clone(),
                started: true,
                minutes: n(90),
                goals: n(0),
                assists: n(0),
                rating: n(70),
                yellow_cards: n(0),
                red_cards: n(0),
            });
        }
        for rule in &mut t.constitutions[0].rules {
            if let ConstitutionRule::SellToBuy { carryover_pct, .. } = rule {
                *carryover_pct = n(50);
            }
        }
        t
    })
    .clone()
}
fn imported(t: SnapshotTables) -> (Dir, NativeStore) {
    let d = Dir::new();
    let store = d.store();
    import_into(&store, t);
    (d, store)
}
fn import_into(store: &NativeStore, t: SnapshotTables) {
    let bytes=serde_json::to_vec(&json!({"format":"touchline-campaign","formatVersion":1,"sourceStorage":"sqlite","sourceSchemaVersion":5,"exportId":"prepared-lifecycle","exportedAt":NOW,"campaignRevision":t.campaigns[0].revision,"tables":t})).unwrap();
    store.import_snapshot(&bytes).unwrap();
}
fn read(store: &NativeStore) -> SnapshotTables {
    store.read_campaign("lifecycle-career").unwrap()
}
fn request(p: LifecyclePreview) -> LifecycleRequest {
    let LifecycleIdCounts {
        players,
        player_states,
        contracts,
        registrations,
        ledger,
        fixtures,
        seasons,
        settlements,
        objectives,
        snapshots,
    } = p.id_counts;
    LifecycleRequest {
        campaign_id: p.campaign_id,
        season_id: p.season_id,
        expected_revision: p.revision,
        source_date: p.source_date,
        source_boundary_key: p.source_boundary_key,
        input_fingerprint: p.input_fingerprint,
        ids: LifecycleIds {
            players: many(players),
            player_states: many(player_states),
            contracts: many(contracts),
            registrations: many(registrations),
            ledger: many(ledger),
            fixtures: many(fixtures),
            seasons: many(seasons),
            settlements: many(settlements),
            objectives: many(objectives),
            snapshots: many(snapshots),
        },
        receipt_id: fresh(),
        audit_id: fresh(),
        action_id: fresh(),
        now: NOW.into(),
    }
}
fn season_request(store: &NativeStore) -> LifecycleRequest {
    request(preview_season(store, id("lifecycle-career")).unwrap())
}

#[test]
fn roster_floor_holds_after_rollover_and_two_planned_years() {
    let (_d, store) = imported(baseline());
    settle_season(&store, season_request(&store)).unwrap();
    let settled = read(&store);
    roster_years::roster_floor_holds_after_rollover_and_two_planned_years(&settled);
    assert_eq!(
        read(&store),
        settled,
        "two pure continuations never write another season"
    );
}

fn second_campaign(t: &SnapshotTables) -> SnapshotTables {
    use std::collections::BTreeMap;
    let mut value = serde_json::to_value(t).unwrap();
    let ids = value
        .as_object()
        .unwrap()
        .values()
        .flat_map(|v| v.as_array().unwrap())
        .flat_map(|row| [row["id"].as_str(), row["actionId"].as_str()])
        .flatten()
        .map(|id| (id.to_owned(), fresh().as_str().to_owned()))
        .collect::<BTreeMap<_, _>>();
    fn remap(value: &mut serde_json::Value, ids: &BTreeMap<String, String>) {
        match value {
            serde_json::Value::String(s) => {
                if let Some(id) = ids.get(s) {
                    *s = id.clone();
                } else if let Some(new_season) = ids.get("closing-season") {
                    *s = s.replace("season:closing-season:", &format!("season:{new_season}:"));
                }
            }
            serde_json::Value::Array(items) => {
                for item in items {
                    remap(item, ids);
                }
            }
            serde_json::Value::Object(fields) => {
                for item in fields.values_mut() {
                    remap(item, ids);
                }
            }
            _ => {}
        }
    }
    remap(&mut value, &ids);
    serde_json::from_value(value).unwrap()
}

#[test]
fn settlement_replay_isolation_and_rollback() {
    let (d, store) = imported(baseline());
    let other = second_campaign(&baseline());
    let other_id = other.campaigns[0].id.clone();
    import_into(&store, other);
    let other_before = store.read_campaign(other_id.as_str()).unwrap();
    let before = read(&store);
    let p = preview_season(&store, id("lifecycle-career")).unwrap();
    let counts = p.id_counts.clone();
    let left = request(p.clone());
    let right = request(p);
    let db = Connection::open(d.file()).unwrap();
    db.execute_batch("CREATE TRIGGER reject_certified_settle BEFORE INSERT ON auditEvents WHEN new.actionType='season.settle' AND new.campaignId='lifecycle-career' BEGIN SELECT RAISE(ABORT,'injected audit failure'); END;").unwrap();
    assert!(settle_season(&store, left.clone()).is_err());
    assert_eq!(read(&store), before);
    assert_eq!(read(&store).seasons.len(), 1);
    assert_eq!(
        store.read_campaign(other_id.as_str()).unwrap(),
        other_before
    );
    db.execute_batch("DROP TRIGGER reject_certified_settle")
        .unwrap();
    let mut stale = left.clone();
    stale.expected_revision = n(before.campaigns[0].revision.get() + 1);
    assert!(settle_season(&store, stale).is_err());
    assert_eq!(read(&store), before);
    let mut conflict = left.clone();
    conflict.input_fingerprint = "conflicting-preview".into();
    assert!(settle_season(&store, conflict).is_err());
    assert_eq!(read(&store), before);
    // Separate SQLite workers overlap the same logical confirmation. Each
    // client owns different row IDs, which must not change receipt identity.
    let peer = d.store();
    let barrier = std::sync::Barrier::new(2);
    let (a, b) = std::thread::scope(|scope| {
        let a = scope.spawn(|| {
            barrier.wait();
            settle_season(&store, left.clone())
        });
        let b = scope.spawn(|| {
            barrier.wait();
            settle_season(&peer, right)
        });
        (a.join().unwrap().unwrap(), b.join().unwrap().unwrap())
    });
    assert_ne!(a.replayed, b.replayed);
    assert_eq!(a.receipt_id, b.receipt_id);
    assert_eq!(a.revision, n(before.campaigns[0].revision.get() + 1));
    assert_eq!(b.revision, a.revision);
    let settled = read(&store);
    assert_eq!(settled.season_settlements.len(), 1);
    assert_eq!(settled.seasons.len(), 2);
    assert_eq!(
        settled.fixtures.len(),
        before.fixtures.len() + counts.fixtures
    );
    assert_eq!(settled.players.len(), before.players.len() + counts.players);
    assert_eq!(
        settled.ledger_entries.len(),
        before.ledger_entries.len() + counts.ledger
    );
    assert_eq!(
        store.read_campaign(other_id.as_str()).unwrap(),
        other_before
    );
    let balance_sum = settled
        .club_simulation_states
        .iter()
        .map(|s| s.transfer_balance_cents.get())
        .sum::<i64>();
    let replay = settle_season(&peer, left.clone()).unwrap();
    assert!(replay.replayed);
    assert_eq!(replay.revision, a.revision);
    assert_eq!(read(&store), settled);
    let mut wrong = left;
    wrong.input_fingerprint = "conflicting-receipt".into();
    assert!(settle_season(&store, wrong).is_err());
    assert_eq!(read(&store), settled);
    settle_season(
        &store,
        request(preview_season(&store, other_id.clone()).unwrap()),
    )
    .unwrap();
    assert_eq!(
        read(&store),
        settled,
        "settling the second campaign preserves every first-campaign row"
    );
    assert_eq!(
        read(&store)
            .club_simulation_states
            .iter()
            .map(|s| s.transfer_balance_cents.get())
            .sum::<i64>(),
        balance_sum
    );
    assert_eq!(
        store
            .read_campaign(other_id.as_str())
            .unwrap()
            .season_settlements
            .len(),
        1
    );
}

#[test]
fn development_applies_once_from_a_round_17_cursor() {
    let mut t = baseline();
    let date = t
        .fixtures
        .iter()
        .find(|f| f.round == n(17))
        .unwrap()
        .match_date
        .clone();
    t.fixtures.retain(|f| f.round.get() <= 17);
    let fixtures = t.fixtures.iter().map(|f| f.id.clone()).collect::<Vec<_>>();
    t.simulated_matches
        .retain(|m| fixtures.contains(&m.fixture_id));
    t.simulation_states[0].phase = CalendarPhase::League;
    t.simulation_states[0].current_date = date.clone();
    t.simulation_states[0].last_boundary_key =
        Some(format!("season:closing-season:matchday:{date}"));
    let (d, store) = imported(t);
    let before = read(&store);
    let p = preview_development(&store, id("lifecycle-career")).unwrap();
    assert!(!p.attributes.is_empty());
    assert_eq!(read(&store), before);
    let r = request(p);
    let out = apply_development(&store, r.clone()).unwrap();
    assert!(!out.replayed);
    assert_eq!(out.current_date, date);
    let after = read(&store);
    assert!(!after.development_snapshots.is_empty());
    assert_ne!(after.players, before.players);
    drop(store);
    let reopened = d.store();
    assert_eq!(read(&reopened), after);
    assert!(apply_development(&reopened, r).unwrap().replayed);
    assert_eq!(read(&reopened), after);
}

#[test]
fn settlement_pays_the_new_season_once() {
    let (_d, store) = imported(baseline());
    let before = read(&store);
    let p = preview_season(&store, id("lifecycle-career")).unwrap();
    assert!(p.allowed);
    assert!(
        preview_time(&store, id("lifecycle-career"))
            .unwrap()
            .allowed
    );
    assert_eq!(read(&store), before);
    assert_eq!(p.clubs.len(), 72);
    assert!(p.attributes.len() <= 40 && p.roster.len() <= 80);
    assert_eq!(p.carryover_cents, m(250_000_000));
    assert_eq!(p.managed_position, Some(n(1)));
    assert_eq!(p.prize_cents, m(180_000_000));
    assert_eq!(p.objective_bonus_cents, m(80_000_000));
    let r = request(p.clone());
    let out = settle_season(&store, r.clone()).unwrap();
    assert!(!out.replayed);
    assert_eq!(out.revision, n(before.campaigns[0].revision.get() + 1));
    assert_eq!(out.current_date, "2027-07-01");
    assert_eq!(out.phase, CalendarPhase::Preseason);
    assert_eq!(out.last_boundary_key, None);
    let market = preview_market(&store, id("lifecycle-career")).unwrap();
    assert!(market.allowed);
    assert_eq!(market.action, game_core::market_ops::MarketAction::Run);
    let stored = preview_season(&store, id("lifecycle-career")).unwrap();
    assert!(!stored.allowed);
    assert!(stored.settlement.is_some());
    assert!(stored.reason.is_none());
    let after = read(&store);
    let next = &after.campaigns[0].active_season_id;
    assert_eq!(after.season_settlements.len(), 1);
    assert_eq!(
        after
            .fixtures
            .iter()
            .filter(|f| &f.season_id == next && f.status == FixtureStatus::Scheduled)
            .count(),
        1224
    );
    assert_eq!(
        after
            .ledger_entries
            .iter()
            .filter(|l| l.season_id == before.seasons[0].id && l.kind == LedgerKind::PrizeIncome)
            .count(),
        0
    );
    assert_eq!(
        after
            .ledger_entries
            .iter()
            .filter(|l| &l.season_id == next && l.award_kind == Some(AwardKind::LeaguePrize))
            .count(),
        72
    );
    assert!(after
        .ledger_entries
        .iter()
        .filter(|l| l.kind == LedgerKind::PrizeIncome)
        .all(|l| &l.season_id == next
            && l.earning_season_id.as_ref() == Some(&before.seasons[0].id)
            && l.settlement_id.as_ref() == Some(&r.ids.settlements[0])));
    for old in &before.club_simulation_states {
        let new = after
            .club_simulation_states
            .iter()
            .find(|c| c.id == old.id)
            .unwrap();
        let award = after
            .ledger_entries
            .iter()
            .filter(|l| {
                &l.season_id == next
                    && l.club_id == old.club_id
                    && l.kind == LedgerKind::PrizeIncome
            })
            .map(|l| l.amount_cents.get())
            .sum::<i64>();
        assert_eq!(
            new.transfer_balance_cents.get(),
            old.transfer_balance_cents.get() + award
        );
    }
    assert_eq!(after.board_objectives.len(), 6);
    assert!(after.lineups.iter().all(|l| &l.season_id != next));
    for newgen in after
        .players
        .iter()
        .filter(|p| !before.players.iter().any(|b| b.id == p.id))
    {
        assert_eq!(newgen.birth_date.as_deref(), Some("2011-07-01"));
        assert_eq!(newgen.reported_age, Some(n(16)));
        assert_eq!(newgen.source, RecordSource::Generated);
    }
    assert!(settle_season(&store, r).unwrap().replayed);
    assert_eq!(read(&store), after);
    assert!(settle_season(&store, request(p)).unwrap().replayed);
    assert_eq!(read(&store), after);
}

#[test]
fn roster_changes_and_registration_forwarding_are_persisted() {
    let mut t = baseline();
    let club = t.campaigns[0].managed_club_id.clone();
    let ids = t
        .players
        .iter()
        .filter(|p| p.club_id.as_ref() == Some(&club) && p.position_group != PositionGroup::Gk)
        .take(4)
        .map(|p| p.id.clone())
        .collect::<Vec<_>>();
    for (index, id) in ids.iter().enumerate() {
        let p = t.players.iter_mut().find(|p| &p.id == id).unwrap();
        p.birth_date = match index {
            0 => Some("1989-01-01".into()),
            1 => Some("2000-01-01".into()),
            2 => None,
            _ => Some("2001-01-01".into()),
        };
        p.reported_age = None;
        p.age_reference_season_ordinal = None;
        let contract = t
            .contracts
            .iter_mut()
            .find(|c| &c.player_id == id && c.status == ContractStatus::Active)
            .unwrap();
        contract.expires_on = Some(
            if index == 3 {
                "2029-06-30"
            } else {
                "2027-06-30"
            }
            .into(),
        );
        t.registrations.push(RegistrationRow {
            id: fresh(),
            campaign_id: t.campaigns[0].id.clone(),
            season_id: t.seasons[0].id.clone(),
            player_id: id.clone(),
            competition_key: "league".into(),
            status: RegistrationStatus::Registered,
            homegrown_club: Some(true),
            homegrown_nation: Some(true),
            age_exempt: Some(false),
            provenance: RecordSource::UserEntered,
        });
    }
    for rule in &mut t.constitutions[0].rules {
        if let ConstitutionRule::RegistrationQuota { enabled, .. } = rule {
            *enabled = false;
        }
    }
    let (_d, store) = imported(t);
    let before = read(&store);
    let p = preview_season(&store, id("lifecycle-career")).unwrap();
    assert!(p.clubs.iter().find(|c| c.club_id == club).unwrap().retired >= 1);
    settle_season(&store, request(p)).unwrap();
    let after = read(&store);
    let next = &after.campaigns[0].active_season_id;
    assert_eq!(
        after
            .players
            .iter()
            .find(|p| p.id == ids[0])
            .unwrap()
            .club_id,
        None
    );
    assert_eq!(
        after
            .player_simulation_states
            .iter()
            .find(|s| s.player_id == ids[0])
            .unwrap()
            .status,
        PlayerLife::Retired
    );
    assert!(after
        .contracts
        .iter()
        .filter(|c| c.player_id == ids[0])
        .all(|c| c.status == ContractStatus::Ended));
    let renewed = after
        .contracts
        .iter()
        .find(|c| c.player_id == ids[1] && c.status == ContractStatus::Active)
        .unwrap();
    assert_eq!(renewed.starts_on.as_deref(), Some("2027-07-01"));
    assert_eq!(renewed.expires_on.as_deref(), Some("2029-06-30"));
    let registered = after
        .registrations
        .iter()
        .filter(|r| &r.season_id == next)
        .map(|r| r.player_id.clone())
        .collect::<Vec<_>>();
    assert!(!registered.contains(&ids[0]));
    assert!(registered.contains(&ids[1]));
    assert!(!registered.contains(&ids[2]));
    assert!(registered.contains(&ids[3]));
    assert_eq!(
        after
            .registrations
            .iter()
            .filter(|r| r.season_id == before.seasons[0].id)
            .collect::<Vec<_>>(),
        before.registrations.iter().collect::<Vec<_>>()
    );
}
#[test]
fn historical_matches_stay_byte_for_byte() {
    let (_d, store) = imported(baseline());
    let before = read(&store);
    let matches = serde_json::to_vec(&before.simulated_matches).unwrap();
    let appearances = serde_json::to_vec(&before.simulated_appearances).unwrap();
    let fixtures = serde_json::to_vec(&before.fixtures).unwrap();
    settle_season(&store, season_request(&store)).unwrap();
    let after = read(&store);
    assert_eq!(
        serde_json::to_vec(&after.simulated_matches).unwrap(),
        matches
    );
    assert_eq!(
        serde_json::to_vec(&after.simulated_appearances).unwrap(),
        appearances
    );
    assert_eq!(
        serde_json::to_vec(
            &after
                .fixtures
                .iter()
                .filter(|f| f.season_id == before.seasons[0].id)
                .collect::<Vec<_>>()
        )
        .unwrap(),
        fixtures
    );
}
#[test]
fn stale_revision_and_id_mismatch_write_nothing() {
    let (_d, store) = imported(baseline());
    let before = read(&store);
    let r = season_request(&store);
    let mut stale = r.clone();
    stale.expected_revision = n(99);
    assert!(settle_season(&store, stale).is_err());
    assert_eq!(read(&store), before);
    let mut short = r.clone();
    short.ids.fixtures.pop();
    assert!(settle_season(&store, short).is_err());
    assert_eq!(read(&store), before);
    let mut collision = r.clone();
    collision.ids.fixtures[0] = before.fixtures[0].id.clone();
    assert!(settle_season(&store, collision).is_err());
    assert_eq!(read(&store), before);
    let mut mismatch = r.clone();
    mismatch.input_fingerprint = "wrong".into();
    assert!(settle_season(&store, mismatch).is_err());
    assert_eq!(read(&store), before);
    settle_season(&store, r.clone()).unwrap();
    let after = read(&store);
    let mut wrong = r;
    wrong.source_date = "2027-05-01".into();
    assert!(settle_season(&store, wrong).is_err());
    assert_eq!(read(&store), after);
}

#[test]
fn incomplete_calendar_and_bad_year_leave_the_review_untouched() {
    let mut t = baseline();
    t.fixtures[0].status = FixtureStatus::Scheduled;
    let (_d, store) = imported(t);
    let before = read(&store);
    assert!(preview_season(&store, id("lifecycle-career"))
        .unwrap()
        .reason
        .unwrap()
        .contains("Finish every league fixture"));
    assert_eq!(read(&store), before);
    let mut t = baseline();
    t.seasons[0].start_date = Some("2198-07-01".into());
    t.seasons[0].end_date = Some("2199-06-30".into());
    let (_d, store) = imported(t);
    let before = read(&store);
    assert_eq!(
        preview_season(&store, id("lifecycle-career"))
            .unwrap()
            .reason
            .unwrap(),
        "The next season is outside the supported years."
    );
    assert_eq!(read(&store), before);
}

#[test]
fn development_failure_rolls_back_and_cursor_refusals_write_nothing() {
    let t = baseline();
    let (_d, store) = imported(t.clone());
    let before = read(&store);
    assert_eq!(
        preview_development(&store, id("lifecycle-career"))
            .unwrap_err()
            .to_string(),
        "Development is applied after the halfway matchday."
    );
    assert_eq!(read(&store), before);
    let mut t = t;
    let date = t
        .fixtures
        .iter()
        .find(|f| f.round == n(17))
        .unwrap()
        .match_date
        .clone();
    t.simulation_states[0].phase = CalendarPhase::League;
    t.simulation_states[0].current_date = date.clone();
    t.simulation_states[0].last_boundary_key =
        Some(format!("season:closing-season:matchday:{date}"));
    let (d, store) = imported(t);
    let before = read(&store);
    let r = request(preview_development(&store, id("lifecycle-career")).unwrap());
    let db = Connection::open(d.file()).unwrap();
    db.execute_batch("CREATE TRIGGER reject_development_audit BEFORE INSERT ON auditEvents WHEN new.actionType='development.apply' BEGIN SELECT RAISE(ABORT,'injected audit failure'); END;").unwrap();
    assert!(apply_development(&store, r.clone()).is_err());
    assert_eq!(read(&store), before);
    db.execute_batch("DROP TRIGGER reject_development_audit")
        .unwrap();
    apply_development(&store, r).unwrap();
}
#[test]
fn audit_failure_rolls_back_the_season() {
    let (d, store) = imported(baseline());
    let before = read(&store);
    let r = season_request(&store);
    let db = Connection::open(d.file()).unwrap();
    db.execute_batch("CREATE TRIGGER reject_season_audit BEFORE INSERT ON auditEvents WHEN new.actionType='season.settle' BEGIN SELECT RAISE(ABORT,'injected audit failure'); END;").unwrap();
    assert!(settle_season(&store, r.clone()).is_err());
    assert_eq!(read(&store), before);
    db.execute_batch("DROP TRIGGER reject_season_audit")
        .unwrap();
    settle_season(&store, r).unwrap();
}
fn with_offer(qualifying: bool) -> SnapshotTables {
    let mut t = baseline();
    let c = &t.campaigns[0];
    let seller = c.managed_club_id.clone();
    let buyer = t.clubs.iter().find(|x| x.id != seller).unwrap().id.clone();
    let player = t
        .players
        .iter()
        .find(|p| p.club_id.as_ref() == Some(&seller))
        .unwrap()
        .id
        .clone();
    t.negotiations.push(NegotiationRow {
        id: id("open-negotiation"),
        campaign_id: c.id.clone(),
        season_id: c.active_season_id.clone(),
        player_id: player.clone(),
        buyer_club_id: buyer.clone(),
        seller_club_id: Some(seller.clone()),
        status: if qualifying {
            NegotiationStatus::Agreed
        } else {
            NegotiationStatus::Proposed
        },
        fee_cents: m(10_000),
        reserved_cents: m(10_000),
        wage_cents: m(100),
        reserved_wage_cents: m(100),
        squad_tier: SquadTier::Youth,
        expires_on: "2027-06-30".into(),
        counter_count: n(0),
        opened_on: "2027-04-20".into(),
        deadline_on: "2027-06-30".into(),
        resolved_on: None,
        engine_version: VersionOne,
        event_seed: n(1),
        qualification: None,
    });
    t.offers.push(OfferRow {
        id: id("open-offer"),
        campaign_id: c.id.clone(),
        season_id: c.active_season_id.clone(),
        player_id: player,
        bidder_club_id: buyer,
        fee_cents: m(10_000),
        status: OfferStatus::Open,
        received_on: "2027-04-20".into(),
        resolved_on: None,
        negotiation_id: Some(id("open-negotiation")),
        seller_club_id: Some(seller),
        deadline_on: Some("2027-06-30".into()),
        origin: Some(OfferOrigin::Ai),
        market_value_cents: Some(m(if qualifying { 1 } else { 1_000_000 })),
        bidder_prestige: Some(n(100)),
        seller_prestige: Some(n(1)),
        constitution_version: Some(n(1)),
        compulsory: qualifying,
    });
    t
}
#[test]
fn qualifying_offer_blocks_settlement() {
    let (_d, store) = imported(with_offer(true));
    let before = read(&store);
    let review = preview_season(&store, id("lifecycle-career")).unwrap();
    assert!(!review.allowed);
    assert_eq!(review.managed_position, Some(n(1)));
    assert_eq!(review.prize_cents, m(180_000_000));
    assert!(review
        .objectives
        .iter()
        .all(|o| o.outcome == ObjectiveOutcome::Met));
    let time = preview_time(&store, id("lifecycle-career")).unwrap();
    assert!(!time.allowed);
    assert_eq!(
        time.reason.as_deref(),
        Some("Accept the qualifying offer before the season can roll over.")
    );
    assert!(preview_season(&store, id("lifecycle-career"))
        .unwrap()
        .reason
        .unwrap()
        .contains("Accept the qualifying offer"));
    // A previously computed confirmation also must not expire the reserved offer.
    let (_other, clean) = imported(baseline());
    let r = season_request(&clean);
    assert!(settle_season(&store, r).is_err());
    assert_eq!(read(&store), before);
    let clock = &before.simulation_states[0];
    respond_offer(
        &store,
        RespondOfferRequest {
            campaign_id: id("lifecycle-career"),
            expected_revision: before.campaigns[0].revision,
            source_date: clock.current_date.clone(),
            source_boundary_key: clock.last_boundary_key.clone(),
            offer_id: id("open-offer"),
            decision: game_core::market_ops::OfferDecision::Accept,
            transfer_id: fresh(),
            contract_id: fresh(),
            ledger_ids: many(2),
            registration_id: None,
            receipt_id: fresh(),
            audit_id: fresh(),
            action_id: fresh(),
            now: NOW.into(),
        },
    )
    .unwrap();
    let accepted = read(&store);
    assert_eq!(accepted.offers[0].status, OfferStatus::Accepted);
    assert_eq!(accepted.negotiations[0].reserved_cents, m(0));
    assert_eq!(accepted.negotiations[0].reserved_wage_cents, m(0));
    assert!(
        preview_season(&store, id("lifecycle-career"))
            .unwrap()
            .allowed
    );
    let r = season_request(&store);
    settle_season(&store, r.clone()).unwrap();
    let settled = read(&store);
    assert_eq!(settled.simulation_states[0].current_date, "2027-07-01");
    assert!(settle_season(&store, r).unwrap().replayed);
    assert_eq!(read(&store), settled);
    let (d, store) = imported(with_offer(false));
    let db = Connection::open(d.file()).unwrap();
    db.execute_batch("CREATE TRIGGER require_expiry_before_intake BEFORE INSERT ON players WHEN EXISTS(SELECT 1 FROM negotiations WHERE reservedCents>0 OR reservedWageCents>0) BEGIN SELECT RAISE(ABORT,'reservation was not released before intake'); END;").unwrap();
    let r = season_request(&store);
    settle_season(&store, r.clone()).unwrap();
    let after = read(&store);
    assert_eq!(after.offers[0].status, OfferStatus::Expired);
    assert_eq!(after.negotiations[0].status, NegotiationStatus::Expired);
    assert_eq!(after.negotiations[0].reserved_cents, m(0));
    assert_eq!(after.negotiations[0].reserved_wage_cents, m(0));
    assert_eq!(
        after.negotiations[0].resolved_on.as_deref(),
        Some("2027-06-30")
    );
    assert!(settle_season(&store, r).unwrap().replayed);
    assert_eq!(read(&store), after);
}

fn play(store: &NativeStore, p: MatchdayPreview) -> AdvanceOutcome {
    assert!(p.allowed, "{:?}", p.blocker);
    sim_matchday(
        store,
        SimMatchdayRequest {
            campaign_id: p.campaign_id,
            expected_revision: p.revision,
            source_date: p.from_date,
            source_boundary_key: p.source_boundary_key,
            target_date: p.target_date.unwrap(),
            action_id: fresh(),
            audit_id: fresh(),
            receipt_id: fresh(),
            now: NOW.into(),
            fixture_ids: many(p.fixture_count.get() as usize),
            match_ids: many(p.match_count.get() as usize),
            appearance_ids: many(p.appearance_count.get() as usize),
        },
    )
    .unwrap()
}
#[test]
fn halfway_matchday_waits_for_development_then_plays_round_18() {
    let mut t = baseline();
    let date = t
        .fixtures
        .iter()
        .find(|f| f.round == n(17))
        .unwrap()
        .match_date
        .clone();
    for f in &mut t.fixtures {
        if f.round.get() >= 17 {
            f.status = FixtureStatus::Scheduled;
        }
    }
    let played = t
        .fixtures
        .iter()
        .filter(|f| f.status == FixtureStatus::Played)
        .map(|f| f.id.clone())
        .collect::<Vec<_>>();
    t.simulated_matches
        .retain(|m| played.contains(&m.fixture_id));
    t.simulated_appearances
        .retain(|a| played.contains(&a.fixture_id));
    t.simulation_states[0].phase = CalendarPhase::League;
    t.simulation_states[0].current_date = date.clone();
    let previous = dates::add_days(&dates::DateOnly::parse(&date).unwrap(), -7).unwrap();
    t.simulation_states[0].last_boundary_key = Some(format!(
        "season:closing-season:matchday:{}",
        previous.as_str()
    ));
    let (_d, store) = imported(t);
    let outcome = play(
        &store,
        preview_matchday(&store, id("lifecycle-career")).unwrap(),
    );
    assert_eq!(outcome.current_date, date);
    assert_eq!(outcome.phase, CalendarPhase::League);
    let time = preview_time(&store, id("lifecycle-career")).unwrap();
    assert!(!time.allowed);
    assert_eq!(time.reason.as_deref(), Some(calendar::DEVELOPMENT_DUE));
    let blocked = preview_matchday(&store, id("lifecycle-career")).unwrap();
    assert!(!blocked.allowed);
    assert_eq!(blocked.blocker.as_deref(), Some(calendar::DEVELOPMENT_DUE));
    let r = request(preview_development(&store, id("lifecycle-career")).unwrap());
    apply_development(&store, r.clone()).unwrap();
    let time = preview_time(&store, id("lifecycle-career")).unwrap();
    assert!(!time.allowed);
    assert_eq!(
        time.reason.as_deref(),
        Some(calendar::MATCH_SIMULATION_UNAVAILABLE)
    );
    let next = preview_matchday(&store, id("lifecycle-career")).unwrap();
    assert!(next.allowed);
    assert_eq!(next.round, Some(n(18)));
    assert_eq!(next.from_date, date);
    assert_eq!(
        next.target_date.as_deref(),
        Some(
            dates::add_days(&dates::DateOnly::parse(&date).unwrap(), 7)
                .unwrap()
                .as_str()
        )
    );
    play(&store, next);
    let after = read(&store);
    assert_eq!(after.simulated_matches.len(), 18 * 36);
    assert!(apply_development(&store, r).unwrap().replayed);
    assert_eq!(read(&store), after);
    let changed = after.development_snapshots.first().unwrap();
    let planning = store
        .planning(id("lifecycle-career"), changed.player_id.clone())
        .unwrap();
    assert_eq!(planning.history.len(), 1);
    assert_eq!(planning.history[0], *changed);
}
