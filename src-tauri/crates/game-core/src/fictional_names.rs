//! Fictional source vocabulary shared by native generator versions.
pub(crate) const LEAGUES: &[(&str, &str)] = &[
    ("Northwater Premier", "SE"),
    ("Redfen Championship", "PT"),
    ("Calderan League", "NL"),
    ("Ostmark Regional", "AT"),
];
const PREFIXES: &[&str] = &[
    "Ash", "Black", "Brine", "Castle", "East", "Ferry", "Grey", "High", "Iron", "Kings", "Low",
    "North", "Port", "Red", "South", "West", "White", "Wind",
];
const SUFFIXES: &[&str] = &["bridge", "dale", "ford", "gate"];
pub(crate) const GIVEN: &[&str] = &[
    "an", "bel", "cor", "dan", "eli", "fen", "gar", "hal", "ira", "jos", "kel", "lan", "mir",
    "nia", "oren", "pel", "quin", "rae", "sol", "tae", "ulf", "vera", "wyn", "yor",
];
pub(crate) const FAMILY: &[&str] = &[
    "beck", "cairn", "dold", "esth", "falk", "greve", "holt", "isk", "jorn", "kell", "marsh",
    "nord", "ost", "pell", "quay", "rost", "skar", "thorn", "ulm", "voss", "wren", "yarrow",
];
pub(crate) const REGIONS: &[&str] = &["north", "south", "east", "west", "coast", "inland"];
pub(crate) const NATIONALITIES: &[&str] =
    &["SE", "PT", "NL", "AT", "NO", "DK", "FI", "IE", "PL", "CZ"];
pub(crate) const PALETTES: &[(&str, &str)] = &[
    ("#1F2933", "#C4A35A"),
    ("#16302A", "#D7E2DC"),
    ("#3B1D2A", "#E6C07B"),
    ("#102A43", "#9FB3C8"),
    ("#3F2A1D", "#E8D5C4"),
    ("#1D2B1F", "#F2C14E"),
    ("#241E33", "#C3B4E0"),
    ("#3A2F2F", "#A8DADC"),
];
pub(crate) fn club_name(index: usize) -> (String, String) {
    let name = format!("{}{}", PREFIXES[index % 18], SUFFIXES[index / 18]);
    // The suffix index disambiguates repeated three-letter abbreviations.
    let base = name[..3].to_ascii_uppercase();
    (
        name,
        if index < 18 {
            base
        } else {
            format!("{base}{}", index / 18 + 1)
        },
    )
}
