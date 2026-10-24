//! Manual comparison on the exact same certified complete-season export.
use game_app::{manage, preview_time, ManagementCommand, NativeStore};
use game_core::{management::ManagementAction, parse_snapshot, EntityId, SafeInt};
use std::{path::PathBuf, time::Instant};

struct Directory(PathBuf);
impl Drop for Directory {
    fn drop(&mut self) {
        assert!(self.0.starts_with(std::env::temp_dir()));
        std::fs::remove_dir_all(&self.0).unwrap();
    }
}

#[test]
#[ignore = "set TOUCHLINE_SEASON_BENCHMARK_SAVE to a certified full-season export"]
fn complete_season_preview_and_small_mutation() {
    let bytes =
        std::fs::read(std::env::var_os("TOUCHLINE_SEASON_BENCHMARK_SAVE").expect("save path"))
            .unwrap();
    let snapshot = parse_snapshot(&bytes).unwrap();
    let campaign = snapshot.tables.campaigns[0].id.clone();
    assert_eq!(snapshot.tables.simulated_matches.len(), 1_224);
    let path = std::env::temp_dir().join(format!("store-08-benchmark-{}", std::process::id()));
    std::fs::create_dir(&path).unwrap();
    let directory = Directory(path);
    // Each repetition starts from identical bytes and revision. Import is untimed.
    for repetition in 0..6 {
        let store = NativeStore::open(directory.0.join(format!("{repetition}.sqlite3"))).unwrap();
        store.import_snapshot(&bytes).unwrap();
        let start = Instant::now();
        std::hint::black_box(preview_time(&store, campaign.clone()).unwrap());
        let preview_ms = start.elapsed().as_secs_f64() * 1000.0;
        let start = Instant::now();
        manage(
            &store,
            ManagementCommand {
                campaign_id: campaign.clone(),
                expected_revision: snapshot.tables.campaigns[0].revision,
                action_id: EntityId::new("benchmark-rename-action").unwrap(),
                audit_id: EntityId::new("benchmark-rename-audit").unwrap(),
                now: "2026-10-23T12:00:00.000Z".into(),
                action: ManagementAction::Rename {
                    name: "Benchmark renamed campaign".into(),
                },
            },
        )
        .unwrap();
        let mutation_ms = start.elapsed().as_secs_f64() * 1000.0;
        assert_eq!(
            store
                .export_snapshot(
                    campaign.as_str(),
                    "benchmark-check",
                    "2026-10-23T12:00:00.000Z"
                )
                .unwrap()
                .tables
                .campaigns[0]
                .revision,
            SafeInt::new(snapshot.tables.campaigns[0].revision.get() + 1).unwrap()
        );
        eprintln!("repetition={repetition} preview_ms={preview_ms:.3} rename_ms={mutation_ms:.3}");
    }
}
