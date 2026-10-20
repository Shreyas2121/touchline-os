use game_core::{parse_snapshot, CampaignSnapshot, SnapshotError};
use serde_json::{json, Value};

fn fixture(name: &str) -> Value {
    let text = match name {
        "legacy-v1" => include_str!("../../../../compatibility/snapshots/legacy-v1.json"),
        "legacy-v2" => include_str!("../../../../compatibility/snapshots/legacy-v2.json"),
        "standalone-v2" => include_str!("../../../../compatibility/snapshots/standalone-v2.json"),
        _ => panic!("unknown fixture"),
    };
    serde_json::from_str(text).expect("fixture json")
}

fn parse(value: &Value) -> Result<CampaignSnapshot, SnapshotError> {
    parse_snapshot(&serde_json::to_vec(value).expect("json"))
}

#[test]
fn committed_fixtures_match_the_snapshot_dto() {
    for name in ["legacy-v1", "legacy-v2", "standalone-v2"] {
        parse(&fixture(name)).unwrap_or_else(|error| panic!("{name}: {error}"));
    }
}

#[test]
fn sqlite_schema_version_follows_the_snapshot_contract() {
    let mut value = fixture("legacy-v2");
    value["sourceStorage"] = json!("sqlite");
    value["sourceSchemaVersion"] = json!(1);
    assert!(parse(&value).is_ok());
    value["sourceSchemaVersion"] = json!(2);
    assert!(matches!(
        parse(&value),
        Err(SnapshotError::UnsupportedVersion(_))
    ));
}

#[test]
fn rejects_invalid_enums_money_ids_and_versions() {
    let mut mode = fixture("legacy-v2");
    mode["tables"]["campaigns"][0]["mode"] = json!("career");
    assert!(matches!(parse(&mode), Err(SnapshotError::InvalidEnum(_))));

    let mut money = fixture("legacy-v2");
    money["tables"]["ledgerEntries"][0]["amountCents"] = json!(9_007_199_254_740_992_i64);
    assert!(matches!(parse(&money), Err(SnapshotError::UnsafeMoney(_))));

    let mut identifier = fixture("legacy-v2");
    identifier["tables"]["players"][0]["id"] = json!("bad id");
    assert!(matches!(
        parse(&identifier),
        Err(SnapshotError::MalformedId(_))
    ));

    let mut version = fixture("legacy-v2");
    version["formatVersion"] = json!(2);
    assert!(matches!(
        parse(&version),
        Err(SnapshotError::UnsupportedVersion(_))
    ));
}

#[test]
fn nullable_fields_stay_distinct_from_optional_attributes() {
    let mut missing_birth_date = fixture("legacy-v2");
    missing_birth_date["tables"]["players"][0]
        .as_object_mut()
        .expect("player")
        .remove("birthDate");
    assert!(parse(&missing_birth_date).is_err());

    let mut null_attribute = fixture("legacy-v2");
    null_attribute["tables"]["players"][0]["attributes"]["passing"] = Value::Null;
    assert!(parse(&null_attribute).is_err());

    let accepted = parse(&fixture("legacy-v2")).expect("fixture");
    let player = &accepted.tables.players[0];
    assert!(player.birth_date.is_none());
    assert!(player.attributes.pace.is_none());
    assert!(player.attributes.passing.is_some());
}
