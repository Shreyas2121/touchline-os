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
    ];
    for source in sources {
        for forbidden in [
            "tauri::",
            "rusqlite",
            "std::fs",
            "std::path",
            "\"indexeddb\"",
            "\"dexie\"",
        ] {
            assert!(
                !source.contains(forbidden),
                "{forbidden} found in game-core"
            );
        }
    }
}
