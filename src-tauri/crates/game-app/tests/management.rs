use game_app::*;
use game_core::{career::CareerInput, management::*, policy::Preset, *};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
};
static SEQ: AtomicU64 = AtomicU64::new(0);
struct Dir(PathBuf);
impl Dir {
    fn new() -> Self {
        let p = std::env::temp_dir().join(format!(
            "touchline-g07-{}-{}",
            std::process::id(),
            SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::create_dir(&p).unwrap();
        Self(p)
    }
    fn store(&self) -> NativeStore {
        NativeStore::open(self.0.join("game.sqlite3")).unwrap()
    }
}
impl Drop for Dir {
    fn drop(&mut self) {
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}
fn id(s: &str) -> EntityId {
    EntityId::new(s).unwrap()
}
fn n(v: i64) -> SafeInt {
    SafeInt::new(v).unwrap()
}
fn request(campaign: &str, mode: RulesMode) -> CreationRequest {
    let unique = SEQ.fetch_add(1, Ordering::Relaxed);
    let key = |label: &str| id(&format!("id-{unique}-{label}"));
    CreationRequest {
        kind: CreationKind::Career,
        reset_revision: None,
        club: None,
        career: CareerInput {
            campaign_id: id(campaign),
            name: "Native career".into(),
            seed: "g07-world".into(),
            start_year: n(2026),
            club_key: "club:01".into(),
            rules_mode: mode,
            preset: Preset::Balanced,
            now: "2026-10-21T12:00:00.000Z".into(),
            season_id: key("season"),
            clock_id: key("clock"),
            constitution_id: key("constitution"),
            allocation_id: key("allocation"),
            receipt_id: key("receipt"),
            audit_event_id: key("audit"),
            action_id: key("action"),
        },
    }
}
fn tables(store: &NativeStore, campaign: &str) -> SnapshotTables {
    store
        .export_snapshot(campaign, "check-export", "2026-10-21T12:00:00.000Z")
        .unwrap()
        .tables
}
fn command(t: &SnapshotTables, action: ManagementAction) -> ManagementCommand {
    let seq = SEQ.fetch_add(1, Ordering::Relaxed);
    ManagementCommand {
        campaign_id: t.campaigns[0].id.clone(),
        expected_revision: t.campaigns[0].revision,
        action_id: id(&format!("action-{seq}")),
        audit_id: id(&format!("audit-{seq}")),
        now: "2026-10-21T13:00:00.000Z".into(),
        action,
    }
}

#[test]
fn full_native_creation_retries_without_preparing_again_and_preserves_changed_revision() {
    let dir = Dir::new();
    let store = dir.store();
    let request = request("career-create", RulesMode::Sandbox);
    let created = create_career(&store, request.clone()).unwrap();
    assert_eq!(created.revision, Some(n(0)));
    let t = tables(&store, "career-create");
    assert_eq!(
        (
            t.leagues.len(),
            t.clubs.len(),
            t.players.len(),
            t.contracts.len()
        ),
        (4, 72, 3000, 2880)
    );
    assert_eq!(
        (
            t.audit_events.len(),
            t.ledger_entries.len(),
            t.constitutions.len(),
            t.simulation_receipts.len()
        ),
        (1, 1, 1, 1)
    );
    manage(
        &store,
        command(
            &t,
            ManagementAction::Rename {
                name: "Later name".into(),
            },
        ),
    )
    .unwrap();
    let before = tables(&store, "career-create");
    let mut retry = request.clone();
    retry.career.season_id = before.players[0].id.clone(); // Would collide if generation/preparation ran.
    let result = create_career(&store, retry).unwrap();
    assert!(result.replayed);
    assert_eq!(result.revision, Some(n(1)));
    assert_eq!(tables(&store, "career-create"), before);
    let mut collision = request;
    collision.career.seed = "different-world".into();
    assert!(create_career(&store, collision).is_err());
    assert_eq!(tables(&store, "career-create"), before);
    drop(store);
    let reopened = dir.store();
    assert_eq!(tables(&reopened, "career-create"), before);
}

#[test]
fn sandbox_edits_notes_lineups_shortlists_and_constitution_commit_one_audit_and_no_extra_money() {
    let dir = Dir::new();
    let store = dir.store();
    create_career(&store, request("sandbox", RulesMode::Sandbox)).unwrap();
    let t = tables(&store, "sandbox");
    let player = t
        .players
        .iter()
        .find(|p| p.club_id.as_ref() == Some(&t.campaigns[0].managed_club_id))
        .unwrap()
        .clone();
    let actions = vec![
        ManagementAction::SaveNote {
            plan: DevelopmentPlanRow {
                id: id("note-row"),
                campaign_id: id("sandbox"),
                player_id: player.id.clone(),
                season_id: t.seasons[0].id.clone(),
                target_role: Some("Playmaker".into()),
                notes: "Plan only; no ability change".into(),
                status: OpenClosed::Open,
            },
        },
        ManagementAction::SaveShortlist {
            item: ShortlistItemRow {
                id: id("short-row"),
                campaign_id: id("sandbox"),
                player_id: player.id.clone(),
                priority: n(2),
                status: OpenClosed::Open,
                notes: Some("Watch".into()),
                added_at: "2026-10-21T12:00:00.000Z".into(),
            },
        },
        ManagementAction::CloseShortlist {
            item_id: id("short-row"),
        },
        ManagementAction::SaveLineup {
            lineup: LineupRow {
                id: id("lineup-row"),
                campaign_id: id("sandbox"),
                season_id: t.seasons[0].id.clone(),
                name: "First team".into(),
                formation: Formation::F433,
                starters: vec![LineupStarter {
                    player_id: player.id.clone(),
                    slot: "gk".into(),
                    role: None,
                }],
                bench_player_ids: vec![],
                updated_at: "2026-10-21T12:00:00.000Z".into(),
            },
        },
        ManagementAction::DeleteLineup {
            lineup_id: id("lineup-row"),
        },
        ManagementAction::SaveConstitution {
            constitution: ConstitutionRow {
                id: id("board-row"),
                campaign_id: id("sandbox"),
                version: n(99),
                rules: game_core::policy::constitution_preset(Preset::Strict),
                updated_at: "2026-10-21T12:00:00.000Z".into(),
            },
            allocation_id: id("no-extra-money"),
        },
    ];
    for (index, action) in actions.into_iter().enumerate() {
        let before = tables(&store, "sandbox");
        let cmd = command(&before, action);
        let result = manage(&store, cmd.clone()).unwrap();
        assert_eq!(result.revision, Some(n(index as i64 + 1)));
        let after = tables(&store, "sandbox");
        assert_eq!(after.audit_events.len(), before.audit_events.len() + 1);
        assert_eq!(after.ledger_entries, t.ledger_entries);
        assert_eq!(after.players, t.players);
        assert!(manage(&store, cmd).unwrap().replayed);
        assert_eq!(tables(&store, "sandbox"), after);
    }
    let t = tables(&store, "sandbox");
    assert_eq!(
        t.constitutions.iter().map(|c| c.version.get()).max(),
        Some(2)
    );
    assert!(t.lineups.is_empty());
    assert_eq!(t.shortlist_items[0].status, OpenClosed::Closed);
    let planning = store.planning(id("sandbox"), player.id.clone()).unwrap();
    assert_eq!(planning.revision, t.campaigns[0].revision);
    assert_eq!(planning.note.unwrap().notes, "Plan only; no ability change");
    assert_eq!(planning.shortlist.unwrap().status, OpenClosed::Closed);
    assert!(store.planning(id("another-save"), player.id).is_err());
}

#[test]
fn registration_rechecks_native_eligibility_and_rejects_forged_ownership_duplicates_and_stale_revisions(
) {
    let dir = Dir::new();
    let store = dir.store();
    create_career(&store, request("registration", RulesMode::Challenge)).unwrap();
    let t = tables(&store, "registration");
    let players = t
        .players
        .iter()
        .filter(|p| p.club_id.as_ref() == Some(&t.campaigns[0].managed_club_id))
        .take(20)
        .enumerate()
        .map(|(i, p)| RegistrationRow {
            id: id(&format!("registration-row-{i}")),
            campaign_id: id("registration"),
            season_id: t.seasons[0].id.clone(),
            player_id: p.id.clone(),
            competition_key: "league".into(),
            status: RegistrationStatus::Registered,
            homegrown_club: Some(false),
            homegrown_nation: Some(false),
            age_exempt: Some(true),
            provenance: RecordSource::UserEntered,
        })
        .collect::<Vec<_>>();
    let cmd = command(
        &t,
        ManagementAction::SaveRegistration {
            competition_key: "league".into(),
            players: players.clone(),
        },
    );
    manage(&store, cmd.clone()).unwrap();
    let saved = tables(&store, "registration");
    assert_eq!(saved.registrations.len(), 20);
    assert_eq!(saved.registrations[0].homegrown_club, Some(true));
    assert_eq!(saved.registrations[0].age_exempt, None);
    let mut duplicated = players.clone();
    duplicated.push(players[0].clone());
    assert!(manage(
        &store,
        command(
            &saved,
            ManagementAction::SaveRegistration {
                competition_key: "league".into(),
                players: duplicated
            }
        )
    )
    .is_err());
    let mut duplicate_ids = players.clone();
    duplicate_ids[1].id = duplicate_ids[0].id.clone();
    assert!(manage(
        &store,
        command(
            &saved,
            ManagementAction::SaveRegistration {
                competition_key: "league".into(),
                players: duplicate_ids
            }
        )
    )
    .is_err());
    let mut forged = players;
    forged[0].player_id = t
        .players
        .iter()
        .find(|p| p.club_id.as_ref() != Some(&t.campaigns[0].managed_club_id))
        .unwrap()
        .id
        .clone();
    assert!(manage(
        &store,
        command(
            &saved,
            ManagementAction::SaveRegistration {
                competition_key: "league".into(),
                players: forged
            }
        )
    )
    .is_err());
    let stale = command(
        &t,
        ManagementAction::Rename {
            name: "Stale".into(),
        },
    );
    assert!(matches!(
        manage(&store, stale),
        Err(CommandError::Conflict { .. })
    ));
    assert_eq!(tables(&store, "registration"), saved);
}

#[test]
fn direct_challenge_standalone_and_cross_campaign_writes_reject_without_side_effects() {
    let dir = Dir::new();
    let store = dir.store();
    create_career(&store, request("guarded", RulesMode::Challenge)).unwrap();
    let t = tables(&store, "guarded");
    let mut player = t.players[0].clone();
    player.name = "Manual edit".into();
    let mut constitution = t.constitutions[0].clone();
    constitution.id = id("locked-edit");
    let actions = vec![
        ManagementAction::UpdatePlayer { player },
        ManagementAction::SelectClub {
            club_id: t.clubs[1].id.clone(),
        },
        ManagementAction::SaveConstitution {
            constitution,
            allocation_id: id("extra-cash"),
        },
        ManagementAction::SaveNote {
            plan: DevelopmentPlanRow {
                id: id("foreign-note"),
                campaign_id: id("another-save"),
                player_id: t.players[0].id.clone(),
                season_id: t.seasons[0].id.clone(),
                target_role: None,
                notes: "Wrong scope".into(),
                status: OpenClosed::Open,
            },
        },
    ];
    for action in actions {
        assert!(manage(&store, command(&t, action)).is_err());
        assert_eq!(tables(&store, "guarded"), t);
    }
    let cmd = command(
        &t,
        ManagementAction::Rename {
            name: "Accepted".into(),
        },
    );
    manage(&store, cmd.clone()).unwrap();
    let after = tables(&store, "guarded");
    let mut changed = cmd;
    changed.action = ManagementAction::Rename {
        name: "Different input".into(),
    };
    assert!(manage(&store, changed).is_err());
    assert_eq!(tables(&store, "guarded"), after);
}

#[test]
fn standalone_demo_lifecycle_and_reset_preserve_historical_saves() {
    let dir = Dir::new();
    let store = dir.store();
    store
        .import_snapshot(include_bytes!(
            "../../../../compatibility/snapshots/legacy-v2.json"
        ))
        .unwrap();
    let protected = tables(&store, "legacy-v2");
    let mut req = request(STANDALONE_DEMO_ID, RulesMode::Sandbox);
    req.kind = CreationKind::StandaloneDemo;
    req.career.seed = "native-standalone-demo-v2".into();
    create_career(&store, req.clone()).unwrap();
    for action in [
        ManagementAction::Rename {
            name: "Changed demo".into(),
        },
        ManagementAction::Archive { archived: true },
        ManagementAction::Archive { archived: false },
    ] {
        let t = tables(&store, STANDALONE_DEMO_ID);
        manage(&store, command(&t, action)).unwrap();
    }
    req.reset_revision = Some(n(3));
    req.career.action_id = id("reset-action");
    req.career.audit_event_id = id("reset-audit");
    assert_eq!(
        create_career(&store, req.clone()).unwrap().revision,
        Some(n(4))
    );
    assert!(create_career(&store, req).unwrap().replayed);
    assert_eq!(tables(&store, STANDALONE_DEMO_ID).players.len(), 3000);
    assert_eq!(tables(&store, "legacy-v2"), protected);
    drop(store);
    let store = dir.store();
    assert_eq!(
        tables(&store, STANDALONE_DEMO_ID).campaigns[0].revision,
        n(4)
    );
    let cmd = command(
        &tables(&store, STANDALONE_DEMO_ID),
        ManagementAction::Delete,
    );
    assert!(manage(&store, cmd.clone()).unwrap().deleted);
    assert!(manage(&store, cmd).unwrap().replayed);
    assert_eq!(tables(&store, "legacy-v2"), protected);
}

#[test]
fn retired_creation_customization_and_old_initialization_receipts_are_rejected() {
    let dir = Dir::new();
    let store = dir.store();
    let mut source: serde_json::Value = serde_json::from_slice(include_bytes!(
        "../../../../compatibility/snapshots/legacy-v2.json"
    ))
    .unwrap();
    source["tables"]["simulationReceipts"] = serde_json::json!([{
        "id":"historical-init","campaignId":"legacy-v2","operationKey":"career:initialize","inputRevision":0,
        "inputFingerprint":"old-native-signature","eventSeed":1,"simulationVersion":"1",
        "outcomeRefs":[{"kind":"campaign","id":"legacy-v2"}],"createdAt":"2026-10-21T12:00:00.000Z"
    }]);
    store
        .import_snapshot(&serde_json::to_vec(&source).unwrap())
        .unwrap();
    let before = tables(&store, "legacy-v2");
    for kind in [CreationKind::Legacy, CreationKind::LegacyDemo] {
        let mut req = request("legacy-v2", RulesMode::Sandbox);
        req.kind = kind;
        assert!(matches!(
            preview_creation(req.clone()),
            Err(CommandError::Scope { .. })
        ));
        assert!(matches!(
            create_career(&store, req.clone()),
            Err(CommandError::Scope { .. })
        ));
        assert!(matches!(
            store.creation_probe(req.clone(), "old-native-signature".into()),
            Err(game_store::StoreError::Command(CommandError::Scope { .. }))
        ));
        req.reset_revision = Some(before.campaigns[0].revision);
        assert!(matches!(
            create_career(&store, req),
            Err(CommandError::Scope { .. })
        ));
    }
    // Even a forged standalone request cannot replay a historical initialization.
    let req = request("legacy-v2", RulesMode::Sandbox);
    assert!(matches!(
        store.creation_probe(req.clone(), "old-native-signature".into()),
        Err(game_store::StoreError::Command(CommandError::Scope { .. }))
    ));
    assert!(matches!(
        create_career(&store, req.clone()),
        Err(CommandError::Scope { .. })
    ));
    let mut custom = req;
    custom.career.campaign_id = id("custom-career");
    custom.club = Some(ClubCreation {
        name: "Custom".into(),
        short_name: "CUS".into(),
        colors: before.clubs[0].colors.clone(),
        prestige: n(50),
        academy_tier: n(3),
        scouting_region: None,
    });
    assert!(matches!(
        create_career(&store, custom),
        Err(CommandError::Scope { .. })
    ));
    assert_eq!(tables(&store, "legacy-v2"), before);
    assert_eq!(store.campaigns(0).unwrap().total, n(1));
}

#[test]
fn historical_saves_refuse_every_edit_and_receipt_replay_but_allow_export_backup_and_deletion() {
    let dir = Dir::new();
    let store = dir.store();
    let source = include_bytes!("../../../../compatibility/snapshots/legacy-v2.json");
    let mut snapshot = game_core::parse_snapshot(source).unwrap();
    let t = &snapshot.tables;
    let rename = command(
        t,
        ManagementAction::Rename {
            name: "Formerly accepted rename".into(),
        },
    );
    let canonical = game_core::management::fingerprint(&rename).unwrap();
    let hash = game_store::creation_fingerprint(&canonical)
        .trim_start_matches("native-create:1:")
        .to_owned();
    snapshot.tables.audit_events[0].action_id = rename.action_id.clone();
    snapshot.tables.audit_events[0]
        .payload
        .0
        .insert("managementFingerprint".into(), serde_json::json!(hash));
    store
        .import_snapshot(&serde_json::to_vec(&snapshot).unwrap())
        .unwrap();
    let before = tables(&store, "legacy-v2");
    let p = before.players[0].clone();
    let c = &before.campaigns[0];
    let actions = vec![
        rename.action.clone(),
        ManagementAction::Archive { archived: true },
        ManagementAction::Archive { archived: false },
        ManagementAction::SelectClub {
            club_id: c.managed_club_id.clone(),
        },
        ManagementAction::AddPlayer { player: p.clone() },
        ManagementAction::UpdatePlayer { player: p.clone() },
        ManagementAction::SaveLineup {
            lineup: LineupRow {
                id: id("retired-lineup"),
                campaign_id: c.id.clone(),
                season_id: c.active_season_id.clone(),
                name: "Retired".into(),
                formation: Formation::F433,
                starters: vec![],
                bench_player_ids: vec![],
                updated_at: rename.now.clone(),
            },
        },
        ManagementAction::DeleteLineup {
            lineup_id: id("retired-lineup"),
        },
        ManagementAction::SaveRegistration {
            competition_key: "league".into(),
            players: vec![],
        },
        ManagementAction::SaveConstitution {
            constitution: before.constitutions[0].clone(),
            allocation_id: id("retired-money"),
        },
        ManagementAction::SaveShortlist {
            item: ShortlistItemRow {
                id: id("retired-shortlist"),
                campaign_id: c.id.clone(),
                player_id: p.id.clone(),
                priority: n(3),
                status: OpenClosed::Open,
                notes: None,
                added_at: rename.now.clone(),
            },
        },
        ManagementAction::CloseShortlist {
            item_id: id("retired-shortlist"),
        },
        ManagementAction::SaveNote {
            plan: DevelopmentPlanRow {
                id: id("retired-note"),
                campaign_id: c.id.clone(),
                season_id: c.active_season_id.clone(),
                player_id: p.id,
                target_role: None,
                notes: "No edits".into(),
                status: OpenClosed::Open,
            },
        },
    ];
    for action in actions {
        let cmd = command(&before, action);
        assert!(matches!(
            manage(&store, cmd.clone()),
            Err(CommandError::Scope { .. })
        ));
        assert!(matches!(
            store.manage(cmd),
            Err(game_store::StoreError::Command(CommandError::Scope { .. }))
        ));
        assert_eq!(tables(&store, "legacy-v2"), before);
    }
    assert!(matches!(
        manage(&store, rename),
        Err(CommandError::Scope { .. })
    ));
    let model = read_screen(
        &store,
        ScreenQuery {
            campaign_id: c.id.clone(),
            screen: Screen::Squad,
            page: n(0),
            search: String::new(),
            all_players: false,
        },
    )
    .unwrap();
    assert!(!model.choose_club_required);
    let exported = dir.0.join("history.json");
    assert!(export_file(
        &store,
        c.id.as_str(),
        Some(&exported),
        "history-export",
        "2026-10-21T12:00:00.000Z"
    )
    .unwrap());
    let bytes = std::fs::read(exported).unwrap();
    assert_eq!(game_core::parse_snapshot(&bytes).unwrap().tables, before);
    let backup = dir.0.join("history.sqlite3");
    store.backup(&backup).unwrap();
    let reopened = NativeStore::open(&backup).unwrap();
    assert_eq!(tables(&reopened, "legacy-v2"), before);
    drop(reopened);
    let cmd = command(&before, ManagementAction::Delete);
    assert!(manage(&store, cmd.clone()).unwrap().deleted);
    assert!(manage(&store, cmd).unwrap().replayed);
    assert_eq!(store.campaigns(0).unwrap().total, n(0));
}

#[test]
fn concurrent_commands_with_the_same_revision_have_only_one_committed_winner() {
    let dir = Dir::new();
    let store = Arc::new(dir.store());
    create_career(&store, request("concurrent", RulesMode::Sandbox)).unwrap();
    let t = tables(&store, "concurrent");
    let a = command(&t, ManagementAction::Rename { name: "One".into() });
    let b = command(&t, ManagementAction::Rename { name: "Two".into() });
    let first = store.clone();
    let second = store.clone();
    let x = std::thread::spawn(move || manage(&first, a));
    let y = std::thread::spawn(move || manage(&second, b));
    assert_eq!(
        [x.join().unwrap(), y.join().unwrap()]
            .iter()
            .filter(|r| r.is_ok())
            .count(),
        1
    );
    let after = tables(&store, "concurrent");
    assert_eq!(after.campaigns[0].revision, n(1));
    assert_eq!(after.audit_events.len(), 2);
}
