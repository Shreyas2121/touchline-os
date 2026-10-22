use game_core::{parse_snapshot, CampaignSnapshot, SnapshotError};
use serde_json::{json, Value};

fn fixture(name: &str) -> Value {
    let text = include_str!("../../../fixtures/standalone.json");
    let text = text.replace("standalone-v2", name);
    serde_json::from_str(&text).expect("fixture json")
}

fn parse(value: &Value) -> Result<CampaignSnapshot, SnapshotError> {
    parse_snapshot(&serde_json::to_vec(value).expect("json"))
}

#[test]
fn unsupported_modes_origins_and_missing_clock_metadata_are_not_normalized() {
    let standalone = fixture("standalone-v2");
    for (pointer, unsupported) in [
        ("/tables/campaigns/0/mode", json!("manual")),
        ("/tables/campaigns/0/mode", Value::Null),
        ("/sourceStorage", json!("indexeddb")),
        ("/sourceSchemaVersion", json!(1)),
        ("/tables/campaigns/0/seed", Value::Null),
        ("/tables/campaigns/0/generatorVersion", json!("1")),
        ("/tables/simulationStates", json!([])),
    ] {
        let mut invalid = standalone.clone();
        *invalid.pointer_mut(pointer).unwrap() = unsupported;
        assert!(parse(&invalid).is_err(), "{pointer}");
    }
    for field in ["mode", "rulesMode"] {
        let mut missing = standalone.clone();
        missing["tables"]["campaigns"][0]
            .as_object_mut()
            .unwrap()
            .remove(field);
        assert!(parse(&missing).is_err());
    }
    let mut journal = standalone;
    journal["tables"]["matchRecords"] = json!([]);
    assert!(parse(&journal).is_err());
}

#[test]
fn committed_fixtures_match_the_snapshot_dto() {
    for name in ["save-a", "save-b", "standalone-v2"] {
        parse(&fixture(name)).unwrap_or_else(|error| panic!("{name}: {error}"));
    }
}

#[test]
fn sqlite_schema_version_follows_the_snapshot_contract() {
    let mut value = fixture("save-b");
    value["sourceStorage"] = json!("sqlite");
    value["sourceSchemaVersion"] = json!(2);
    assert!(parse(&value).is_ok());
    value["sourceSchemaVersion"] = json!(1);
    assert!(matches!(
        parse(&value),
        Err(SnapshotError::UnsupportedVersion(_))
    ));
}

#[test]
fn rejects_invalid_enums_money_ids_and_versions() {
    let mut mode = fixture("save-b");
    mode["tables"]["campaigns"][0]["mode"] = json!("career");
    assert!(matches!(parse(&mode), Err(SnapshotError::InvalidEnum(_))));

    let mut money = fixture("save-b");
    money["tables"]["ledgerEntries"][0]["amountCents"] = json!(9_007_199_254_740_992_i64);
    assert!(matches!(parse(&money), Err(SnapshotError::UnsafeMoney(_))));

    let mut identifier = fixture("save-b");
    identifier["tables"]["players"][0]["id"] = json!("bad id");
    assert!(matches!(
        parse(&identifier),
        Err(SnapshotError::MalformedId(_))
    ));

    let mut version = fixture("save-b");
    version["formatVersion"] = json!(2);
    assert!(matches!(
        parse(&version),
        Err(SnapshotError::UnsupportedVersion(_))
    ));
}

#[test]
fn nullable_fields_stay_distinct_from_optional_attributes() {
    let mut missing_birth_date = fixture("save-b");
    missing_birth_date["tables"]["players"][0]
        .as_object_mut()
        .expect("player")
        .remove("birthDate");
    assert!(parse(&missing_birth_date).is_err());

    let mut null_attribute = fixture("save-b");
    null_attribute["tables"]["players"][0]["attributes"]["passing"] = Value::Null;
    assert!(parse(&null_attribute).is_err());

    let accepted = parse(&fixture("save-b")).expect("fixture");
    let player = &accepted.tables.players[0];
    assert!(player.birth_date.is_none());
    assert!(player.attributes.pace.is_none());
    assert!(player.attributes.passing.is_some());
}
