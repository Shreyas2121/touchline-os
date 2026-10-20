use crate::{CoreError, CoreResult, PlayerRow, SafeInt, SeasonRow};
use serde::{Deserialize, Deserializer, Serialize};

pub const INVALID_DATE: &str = "Enter a real date as YYYY-MM-DD.";
pub const INVALID_TIMESTAMP: &str = "Enter a UTC timestamp as YYYY-MM-DDTHH:mm:ss.sssZ.";

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(transparent)]
pub struct DateOnly(String);
impl DateOnly {
    pub fn parse(value: &str) -> CoreResult<Self> {
        let bytes = value.as_bytes();
        if bytes.len() != 10
            || bytes[4] != b'-'
            || bytes[7] != b'-'
            || !bytes
                .iter()
                .enumerate()
                .all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
        {
            return Err(CoreError::Invalid(INVALID_DATE));
        }
        let year = value[..4]
            .parse::<i64>()
            .map_err(|_| CoreError::Invalid(INVALID_DATE))?;
        let month = value[5..7]
            .parse::<i64>()
            .map_err(|_| CoreError::Invalid(INVALID_DATE))?;
        let day = value[8..]
            .parse::<i64>()
            .map_err(|_| CoreError::Invalid(INVALID_DATE))?;
        if !(1900..=2199).contains(&year) || day < 1 || day > days_in_month(year, month) {
            return Err(CoreError::Invalid(INVALID_DATE));
        }
        Ok(Self(value.to_owned()))
    }
    pub fn as_str(&self) -> &str {
        &self.0
    }
    pub fn year(&self) -> i64 {
        self.0[..4].parse().expect("validated date")
    }
    fn month(&self) -> i64 {
        self.0[5..7].parse().expect("validated date")
    }
    fn day(&self) -> i64 {
        self.0[8..].parse().expect("validated date")
    }
}
impl<'de> Deserialize<'de> for DateOnly {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        Self::parse(&String::deserialize(deserializer)?).map_err(serde::de::Error::custom)
    }
}
pub fn is_leap_year(year: i64) -> bool {
    year % 400 == 0 || (year % 100 != 0 && year % 4 == 0)
}
fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if is_leap_year(year) => 29,
        2 => 28,
        _ => 0,
    }
}
fn before_year(year: i64) -> i64 {
    let previous = year - 1;
    previous * 365 + previous / 4 - previous / 100 + previous / 400
}
pub fn add_days(date: &DateOnly, days: i64) -> CoreResult<DateOnly> {
    SafeInt::new(days)?;
    let mut ordinal = before_year(date.year()) + date.day() - 1;
    for month in 1..date.month() {
        ordinal += days_in_month(date.year(), month);
    }
    let target = ordinal.checked_add(days).ok_or(CoreError::Arithmetic)?;
    if target < before_year(1900) || target >= before_year(2200) {
        return Err(CoreError::Invalid(
            "Date arithmetic is outside the supported range.",
        ));
    }
    let mut year = 1900;
    while target >= before_year(year + 1) {
        year += 1;
    }
    let mut remaining = target - before_year(year);
    let mut month = 1;
    while remaining >= days_in_month(year, month) {
        remaining -= days_in_month(year, month);
        month += 1;
    }
    DateOnly::parse(&format!("{year}-{month:02}-{:02}", remaining + 1))
}
pub fn validate_timestamp(value: &str) -> CoreResult<()> {
    let bytes = value.as_bytes();
    if bytes.len() != 24
        || bytes[10] != b'T'
        || bytes[13] != b':'
        || bytes[16] != b':'
        || bytes[19] != b'.'
        || bytes[23] != b'Z'
        || !bytes[11..23]
            .iter()
            .enumerate()
            .all(|(i, c)| i == 2 || i == 5 || i == 8 || c.is_ascii_digit())
        || DateOnly::parse(&value[..10]).is_err()
        || value[11..13].parse::<u8>().unwrap_or(255) > 23
        || value[14..16].parse::<u8>().unwrap_or(255) > 59
        || value[17..19].parse::<u8>().unwrap_or(255) > 59
    {
        return Err(CoreError::Invalid(INVALID_TIMESTAMP));
    }
    Ok(())
}
pub fn age_in_whole_years(birth: &DateOnly, as_of: &DateOnly) -> CoreResult<i64> {
    if birth > as_of {
        return Err(CoreError::Invalid("Birth date is after the as-of date."));
    }
    let birthday_pending = (as_of.month(), as_of.day()) < (birth.month(), birth.day());
    Ok(as_of.year() - birth.year() - i64::from(birthday_pending))
}
pub fn estimate_age(reported: i64, reference: i64, season: i64) -> CoreResult<i64> {
    SafeInt::new(reference)?;
    SafeInt::new(season)?;
    let age = season
        .checked_sub(reference)
        .and_then(|delta| reported.checked_add(delta))
        .ok_or(CoreError::Arithmetic)?;
    if !(0..=99).contains(&reported)
        || reference < 1
        || season < reference
        || !(0..=99).contains(&age)
    {
        return Err(CoreError::Invalid("Estimated age is out of range."));
    }
    Ok(age)
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum AgeDisplay {
    Exact { years: i64 },
    Estimated { years: i64 },
    Unknown,
}
pub fn display_age(player: &PlayerRow, season: &SeasonRow) -> AgeDisplay {
    if let (Some(birth), Some(start)) = (&player.birth_date, &season.start_date) {
        if birth <= start {
            return DateOnly::parse(birth)
                .and_then(|birth| age_in_whole_years(&birth, &DateOnly::parse(start)?))
                .map_or(AgeDisplay::Unknown, |years| AgeDisplay::Exact { years });
        }
    }
    if let (Some(reported), Some(reference)) =
        (player.reported_age, player.age_reference_season_ordinal)
    {
        return estimate_age(reported.get(), reference.get(), season.ordinal.get())
            .map_or(AgeDisplay::Unknown, |years| AgeDisplay::Estimated { years });
    }
    AgeDisplay::Unknown
}
