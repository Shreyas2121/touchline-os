use std::path::{Path, PathBuf};

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

const FORBIDDEN: &[&str] = &[
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
];

// Filesystem access belongs in this integration test, outside production core.
fn rust_sources(root: &Path) -> std::io::Result<Vec<PathBuf>> {
    let mut sources = Vec::new();
    for entry in std::fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            sources.extend(rust_sources(&path)?);
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            sources.push(path);
        }
    }
    sources.sort();
    Ok(sources)
}

fn violations(source: &str) -> Vec<&'static str> {
    FORBIDDEN
        .iter()
        .copied()
        .filter(|token| source.contains(token))
        .collect()
}

#[test]
fn core_sources_do_not_touch_the_platform() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let sources = rust_sources(&root).expect("discover all core Rust sources");
    for previously_omitted in ["progression.rs", "matchday.rs", "match_engine.rs"] {
        assert!(
            sources.contains(&root.join(previously_omitted)),
            "missing {previously_omitted}"
        );
    }
    for path in sources {
        let source = std::fs::read_to_string(&path).expect("read core source");
        assert!(
            violations(&source).is_empty(),
            "{}: forbidden platform tokens {:?}",
            path.display(),
            violations(&source)
        );
    }
}

#[test]
fn scanner_discovers_nested_rust_sources_and_detects_forbidden_imports() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/boundary");
    let sources = rust_sources(&root).expect("discover fixture sources");
    assert_eq!(
        sources,
        vec![
            root.join("nested/deeper/forbidden.rs"),
            root.join("pure.rs")
        ]
    );
    let forbidden = std::fs::read_to_string(&sources[0]).expect("forbidden fixture");
    assert_eq!(violations(&forbidden), vec!["std::fs"]);
    let pure = std::fs::read_to_string(&sources[1]).expect("pure fixture");
    assert!(violations(&pure).is_empty());
}
