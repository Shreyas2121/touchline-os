#[test]
fn core_manifest_has_no_platform_or_store_dependency() {
    let manifest = include_str!("../Cargo.toml");
    let dependencies = manifest
        .split("[dependencies]")
        .nth(1)
        .expect("dependencies");
    for forbidden in ["tauri", "rusqlite", "game-store", "game-app", "dexie"] {
        assert!(
            !dependencies.contains(forbidden),
            "{forbidden} does not belong in game-core"
        );
    }
}

#[test]
fn core_sources_do_not_touch_the_platform() {
    let sources = [
        include_str!("../src/lib.rs"),
        include_str!("../src/boundary.rs"),
        include_str!("../src/enums.rs"),
        include_str!("../src/ids.rs"),
        include_str!("../src/nulls.rs"),
        include_str!("../src/numbers.rs"),
        include_str!("../src/rows.rs"),
        include_str!("../src/snapshot.rs"),
        include_str!("../src/validate.rs"),
        include_str!("../src/calendar.rs"),
        include_str!("../src/schedule.rs"),
        include_str!("../src/dates.rs"),
        include_str!("../src/finance.rs"),
        include_str!("../src/guards.rs"),
        include_str!("../src/money.rs"),
        include_str!("../src/policy.rs"),
        include_str!("../src/random.rs"),
        include_str!("../src/selection.rs"),
        include_str!("../src/match_selection.rs"),
        include_str!("../src/ability.rs"),
        include_str!("../src/career.rs"),
        include_str!("../src/generation.rs"),
        include_str!("../src/generation_settings.rs"),
        include_str!("../src/fictional_names.rs"),
        include_str!("../src/world_validation.rs"),
        include_str!("../src/queries.rs"),
        include_str!("../src/management.rs"),
    ];
    for source in sources {
        for forbidden in [
            "tauri::",
            "rusqlite",
            "std::fs",
            "std::path",
            "\"indexeddb\"",
            "\"dexie\"",
            "SystemTime",
            "Instant::",
            "std::time",
            "std::net",
            "reqwest",
            "rand::",
            "thread_rng",
            "getrandom",
            "std::env",
        ] {
            assert!(
                !source.contains(forbidden),
                "{forbidden} found in game-core"
            );
        }
    }
}
