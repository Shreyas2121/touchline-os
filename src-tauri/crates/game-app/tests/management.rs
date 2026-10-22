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
fn unsupported_creation_and_edit_variants_are_not_wire_contracts() {
    let supported = serde_json::to_value(request("wire-check", RulesMode::Sandbox)).unwrap();
    for kind in ["manual", "legacy", "legacy-demo"] {
        let mut invalid = supported.clone();
        invalid["kind"] = serde_json::json!(kind);
        assert!(serde_json::from_value::<CreationRequest>(invalid).is_err());
    }
    let mut customized = supported;
    customized["club"] = serde_json::json!({"name":"Not a creation input"});
    assert!(serde_json::from_value::<CreationRequest>(customized).is_err());
    for kind in ["add-player", "update-player", "select-club"] {
        assert!(
            serde_json::from_value::<ManagementAction>(serde_json::json!({"type":kind})).is_err()
        );
    }
}

#[test]
fn migrated_standalone_edits_and_retry_receipts_survive_export_backup_and_reopen() {
    let dir = Dir::new();
    let store = dir.store();
    let source = include_bytes!("../../../fixtures/standalone.json");
    let source_file = dir.0.join("browser-export.json");
    std::fs::write(&source_file, source).unwrap();
    let session = MigrationSession::default();
    let summary = session.select(Some(&source_file)).unwrap().unwrap();
    session.confirm(&store, &summary.token).unwrap();
    let original = tables(&store, "standalone-v2");
    let rename = command(
        &original,
        ManagementAction::Rename {
            name: "Managed after migration".into(),
        },
    );
    let result = manage(&store, rename.clone()).unwrap();
    assert!(!result.replayed);
    assert_eq!(
        result.revision,
        Some(n(original.campaigns[0].revision.get() + 1))
    );
    let changed = tables(&store, "standalone-v2");
    assert_eq!(changed.campaigns[0].name, "Managed after migration");
    assert_eq!(changed.audit_events.len(), original.audit_events.len() + 1);
    assert_eq!(changed.simulation_states, original.simulation_states);
    assert_eq!(changed.simulation_receipts, original.simulation_receipts);
    assert_eq!(changed.ledger_entries, original.ledger_entries);

    create_career(&store, request("isolated-native", RulesMode::Sandbox)).unwrap();
    let other = tables(&store, "isolated-native");
    let backup = dir.0.join("cutover-backup.sqlite3");
    assert!(backup_file(&store, Some(&backup)).unwrap());
    let exported = dir.0.join("managed-export.json");
    assert!(export_file(
        &store,
        "standalone-v2",
        Some(&exported),
        "cutover-export",
        "2026-10-22T12:00:00.000Z"
    )
    .unwrap());
    let encoded = std::fs::read(&exported).unwrap();
    assert_eq!(parse_snapshot(&encoded).unwrap().tables, changed);
    drop(store);

    for reopened in [dir.store(), NativeStore::open(&backup).unwrap()] {
        // Both transport and management receipts must survive storage reopen.
        let retry_session = MigrationSession::default();
        let review = retry_session.select(Some(&source_file)).unwrap().unwrap();
        retry_session.confirm(&reopened, &review.token).unwrap();
        assert!(manage(&reopened, rename.clone()).unwrap().replayed);
        let mut collision = source.to_vec();
        collision.push(b' ');
        assert!(reopened.import_snapshot(&collision).is_err());
        assert_eq!(tables(&reopened, "standalone-v2"), changed);
        assert_eq!(tables(&reopened, "isolated-native"), other);
    }
    let restored = NativeStore::open(dir.0.join("restored.sqlite3")).unwrap();
    restored.import_snapshot(&encoded).unwrap();
    assert!(manage(&restored, rename).unwrap().replayed);
    assert_eq!(tables(&restored, "standalone-v2"), changed);
    assert_eq!(std::fs::read(&source_file).unwrap(), source);
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
    let mut constitution = t.constitutions[0].clone();
    constitution.id = id("locked-edit");
    let actions = vec![
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
fn standalone_demo_lifecycle_and_reset_preserve_other_careers() {
    let dir = Dir::new();
    let store = dir.store();
    store
        .import_snapshot(include_bytes!("../../../fixtures/standalone.json"))
        .unwrap();
    let protected = tables(&store, "standalone-v2");
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
    assert_eq!(tables(&store, "standalone-v2"), protected);
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
    assert_eq!(tables(&store, "standalone-v2"), protected);
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
