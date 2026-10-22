pub fn fixture(campaign: &str) -> Vec<u8> {
    // Scope one standalone fixture to independent saves, including nested references.
    include_str!("fixtures/standalone.json")
        .replace("standalone-v2", campaign)
        .into_bytes()
}
