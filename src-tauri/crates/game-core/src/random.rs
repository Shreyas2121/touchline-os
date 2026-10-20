use crate::{policy::Preset, CoreError, CoreResult, RulesMode, SafeInt};
use serde::{Deserialize, Serialize};

pub fn hash_seed(seed: &str, generator_version: &str) -> u32 {
    generator_version
        .encode_utf16()
        .chain(std::iter::once(0))
        .chain(seed.encode_utf16())
        .fold(0x811c9dc5_u32, |hash, unit| {
            (hash ^ u32::from(unit)).wrapping_mul(0x01000193)
        })
}
#[derive(Debug, Clone)]
pub struct Mulberry32 {
    state: u32,
}
impl Mulberry32 {
    pub const fn new(seed: u32) -> Self {
        Self { state: seed }
    }
    pub fn draw(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b79f5);
        let mut t = (self.state ^ (self.state >> 15)).wrapping_mul(self.state | 1);
        t ^= t.wrapping_add((t ^ (t >> 7)).wrapping_mul(t | 61));
        f64::from(t ^ (t >> 14)) / 4294967296.0
    }
    pub fn next_int(&mut self, span: i64) -> CoreResult<i64> {
        SafeInt::new(span)?;
        if span <= 0 {
            return Err(CoreError::Invalid("Invalid random span."));
        }
        Ok((self.draw() * span as f64).floor() as i64)
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EventKind {
    World,
    Calendar,
    Fixture,
    Market,
    Development,
}

fn normalized_key(value: &str, max: usize) -> CoreResult<&str> {
    let value = crate::js_trim(value);
    if value.is_empty() || value.encode_utf16().count() > max {
        return Err(CoreError::Invalid("Invalid stream key."));
    }
    Ok(value)
}
pub fn event_stream_key(
    seed: &str,
    version: &str,
    event: EventKind,
    keys: &[&str],
) -> CoreResult<String> {
    if version != "1" {
        return Err(CoreError::Invalid("Unsupported simulation version."));
    }
    if keys.len() > 32 {
        return Err(CoreError::Invalid("Too many logical keys."));
    }
    let seed = normalized_key(seed, 120)?;
    let keys = keys
        .iter()
        .map(|key| normalized_key(key, 200))
        .collect::<CoreResult<Vec<_>>>()?;
    serde_json::to_string(&("simulation-stream", version, seed, event, keys))
        .map_err(|_| CoreError::Invalid("Invalid stream identity."))
}
pub fn derive_event_seed(
    seed: &str,
    version: &str,
    event: EventKind,
    keys: &[&str],
) -> CoreResult<u32> {
    Ok(hash_seed(
        &event_stream_key(seed, version, event, keys)?,
        "simulation-stream",
    ))
}
pub fn create_event_stream(
    seed: &str,
    version: &str,
    event: EventKind,
    keys: &[&str],
) -> CoreResult<Mulberry32> {
    Ok(Mulberry32::new(derive_event_seed(
        seed, version, event, keys,
    )?))
}

pub fn career_fingerprint(
    name: &str,
    seed: &str,
    start_year: i64,
    club_key: &str,
    rules_mode: RulesMode,
    preset: Preset,
) -> CoreResult<String> {
    SafeInt::new(start_year)?;
    if preset == Preset::Custom {
        return Err(CoreError::Invalid(
            "Choose Balanced or Strict for a career.",
        ));
    }
    serde_json::to_string(&(
        "standalone-career",
        "2",
        name,
        seed,
        start_year,
        club_key,
        rules_mode,
        preset,
    ))
    .map_err(|_| CoreError::Invalid("Invalid career fingerprint."))
}
