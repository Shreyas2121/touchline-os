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
fn legacy_player_management_archive_delete_and_demo_reset_are_scoped_and_persistent() {
    let dir = Dir::new();
    let store = dir.store();
    let mut legacy = request(LEGACY_DEMO_ID, RulesMode::Sandbox);
    legacy.kind = CreationKind::LegacyDemo;
    legacy.career.seed = "native-legacy-demo-v1".into();
    create_career(&store, legacy.clone()).unwrap();
    let mut standalone = request(STANDALONE_DEMO_ID, RulesMode::Sandbox);
    standalone.kind = CreationKind::StandaloneDemo;
    standalone.career.seed = "native-standalone-demo-v2".into();
    create_career(&store, standalone).unwrap();
    let protected = tables(&store, STANDALONE_DEMO_ID);
    let t = tables(&store, LEGACY_DEMO_ID);
    assert!(t.contracts.is_empty());
    assert!(t.simulation_states.is_empty());
    let mut player = t.players[0].clone();
    player.id = id("manual-player");
    player.club_id = Some(t.campaigns[0].managed_club_id.clone());
    player.source = RecordSource::UserEntered;
    manage(
        &store,
        command(
            &t,
            ManagementAction::AddPlayer {
                player: player.clone(),
            },
        ),
    )
    .unwrap();
    let t = tables(&store, LEGACY_DEMO_ID);
    player.name = "Corrected player".into();
    manage(
        &store,
        command(&t, ManagementAction::UpdatePlayer { player }),
    )
    .unwrap();
    let t = tables(&store, LEGACY_DEMO_ID);
    manage(
        &store,
        command(&t, ManagementAction::Archive { archived: true }),
    )
    .unwrap();
    let archived = tables(&store, LEGACY_DEMO_ID);
    assert!(manage(
        &store,
        command(
            &archived,
            ManagementAction::SelectClub {
                club_id: archived.clubs[1].id.clone()
            }
        )
    )
    .is_err());
    manage(
        &store,
        command(&archived, ManagementAction::Archive { archived: false }),
    )
    .unwrap();
    let t = tables(&store, LEGACY_DEMO_ID);
    legacy.reset_revision = Some(t.campaigns[0].revision);
    legacy.career.action_id = id("reset-action");
    legacy.career.audit_event_id = id("reset-audit");
    let result = create_career(&store, legacy.clone()).unwrap();
    assert_eq!(result.revision, Some(n(t.campaigns[0].revision.get() + 1)));
    assert!(create_career(&store, legacy).unwrap().replayed);
    assert_eq!(tables(&store, LEGACY_DEMO_ID).players.len(), 3000);
    assert_eq!(tables(&store, STANDALONE_DEMO_ID), protected);
    let cmd = command(&tables(&store, LEGACY_DEMO_ID), ManagementAction::Delete);
    assert!(manage(&store, cmd.clone()).unwrap().deleted);
    assert!(manage(&store, cmd).unwrap().replayed);
    assert_eq!(store.campaigns(0).unwrap().total, n(1));
    assert_eq!(tables(&store, STANDALONE_DEMO_ID), protected);
}

#[test]
fn legacy_creation_preserves_custom_club_settings_and_standalone_refuses_them() {
    let dir = Dir::new();
    let store = dir.store();
    let mut req = request("custom-legacy", RulesMode::Sandbox);
    req.kind = CreationKind::Legacy;
    req.career.preset = Preset::Custom;
    req.club = Some(ClubCreation {
        name: "User club".into(),
        short_name: "USR".into(),
        colors: ClubColors {
            primary: "#123456".into(),
            secondary: "#abcdef".into(),
        },
        prestige: n(40),
        academy_tier: n(3),
        scouting_region: Some("Home region".into()),
    });
    let preview = preview_creation(req.clone()).unwrap();
    assert_eq!(preview.clubs[0].name, "User club");
    create_career(&store, req.clone()).unwrap();
    let t = tables(&store, "custom-legacy");
    assert_eq!(t.clubs[0].name, "User club");
    assert_eq!(t.clubs[0].colors.primary, "#123456");
    assert_eq!(t.campaigns[0].mode, CampaignMode::Legacy);
    assert!(
        !read_screen(
            &store,
            ScreenQuery {
                campaign_id: id("custom-legacy"),
                screen: Screen::Squad,
                page: n(0),
                search: String::new(),
                all_players: false
            }
        )
        .unwrap()
        .choose_club_required
    );
    assert!(t.ledger_entries.is_empty());
    for (i, preset) in [Preset::Balanced, Preset::Strict].into_iter().enumerate() {
        let t = tables(&store, "custom-legacy");
        manage(
            &store,
            command(
                &t,
                ManagementAction::SaveConstitution {
                    constitution: ConstitutionRow {
                        id: id(&format!("custom-board-{i}")),
                        campaign_id: id("custom-legacy"),
                        version: n(0),
                        rules: game_core::policy::constitution_preset(preset),
                        updated_at: "2026-10-21T12:00:00.000Z".into(),
                    },
                    allocation_id: id(&format!("custom-money-{i}")),
                },
            ),
        )
        .unwrap();
        assert_eq!(tables(&store, "custom-legacy").ledger_entries.len(), 1);
    }
    req.kind = CreationKind::Career;
    req.career.campaign_id = id("forbidden-custom");
    assert!(create_career(&store, req).is_err());
    assert_eq!(store.campaigns(0).unwrap().total, n(1));
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
