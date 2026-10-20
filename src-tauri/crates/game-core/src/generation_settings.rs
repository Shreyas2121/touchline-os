//! Declared native game formulas. All monetary operations use integer cents.
use crate::{
    money::checked_add, CoreError, CoreResult, MoneyCents, Position, PositionGroup, SquadTier,
};

pub(crate) const GUARANTEED: &[Position] = &[
    Position::Gk,
    Position::Gk,
    Position::Cb,
    Position::Cb,
    Position::Cb,
    Position::Lb,
    Position::Rb,
    Position::Cdm,
    Position::Cm,
    Position::Cm,
    Position::Cam,
    Position::Lm,
    Position::Rm,
    Position::Lw,
    Position::Rw,
    Position::St,
    Position::St,
    Position::Cb,
    Position::Cm,
    Position::St,
];
pub(crate) const EXTRA_POSITIONS: &[Position] = &[
    Position::Gk,
    Position::Cb,
    Position::Lb,
    Position::Rb,
    Position::Cdm,
    Position::Cm,
    Position::Cam,
    Position::Lm,
    Position::Rm,
    Position::Lw,
    Position::Rw,
    Position::St,
    Position::Cf,
];
pub(crate) fn roster_size(index: usize) -> usize {
    36 + index % 9
}
pub(crate) fn attribute_windows(group: PositionGroup) -> CoreResult<[(i64, i64); 6]> {
    Ok(match group {
        PositionGroup::Gk => [(20, 60), (5, 40), (25, 70), (10, 50), (30, 80), (40, 90)],
        PositionGroup::Def => [(30, 85), (10, 50), (25, 80), (20, 70), (40, 95), (40, 95)],
        PositionGroup::Mid => [(30, 90), (25, 85), (40, 95), (30, 90), (20, 80), (30, 90)],
        PositionGroup::Fwd => [(40, 95), (40, 95), (25, 80), (35, 95), (10, 50), (30, 90)],
        PositionGroup::Unknown => return Err(CoreError::Invalid("Unknown generated position.")),
    })
}
pub(crate) fn potential_spread(age: i64) -> i64 {
    if age <= 23 {
        15
    } else {
        8
    }
}
pub(crate) fn tier_for(age: i64, ability: i64) -> SquadTier {
    if age <= 21 {
        SquadTier::Youth
    } else if ability >= 70 {
        SquadTier::Key
    } else {
        SquadTier::Rotation
    }
}
pub(crate) fn age_factor(age: i64) -> CoreResult<i64> {
    if !(16..=38).contains(&age) {
        return Err(CoreError::Invalid("Generated age is outside 16–38."));
    }
    Ok((100 - (age - 27).abs() * 3).max(50))
}
pub(crate) fn value(age: i64, ability: i64, potential: i64) -> CoreResult<MoneyCents> {
    if !(0..=100).contains(&ability) || !(ability..=100).contains(&potential) {
        return Err(CoreError::Invalid(
            "Invalid generated ability or potential.",
        ));
    }
    let base = ability
        .checked_mul(5_000_000)
        .ok_or(CoreError::Arithmetic)?;
    let upside = (potential - ability)
        .checked_mul(2_000_000)
        .and_then(|n| n.checked_mul(if age <= 23 { 2 } else { 1 }))
        .ok_or(CoreError::Arithmetic)?;
    MoneyCents::new(
        checked_add(base, upside)?
            .checked_mul(age_factor(age)?)
            .ok_or(CoreError::Arithmetic)?
            / 100,
    )
}
pub(crate) fn wage(age: i64, ability: i64, tier: SquadTier) -> CoreResult<MoneyCents> {
    if !(0..=100).contains(&ability) {
        return Err(CoreError::Invalid("Invalid generated ability."));
    }
    let (rate, cap) = match tier {
        SquadTier::Youth => (2000, 250_000),
        SquadTier::Rotation => (12_000, 1_000_000),
        SquadTier::Key => (25_000, 2_250_000),
    };
    let factor = age_factor(age)?;
    let raw = ability
        .checked_mul(rate)
        .and_then(|n| n.checked_mul(factor))
        .ok_or(CoreError::Arithmetic)?
        / 100;
    MoneyCents::new(raw.min(cap))
}
pub(crate) fn transfer_balance(prestige: i64) -> CoreResult<MoneyCents> {
    if !(20..=90).contains(&prestige) {
        return Err(CoreError::Invalid("Invalid generated club prestige."));
    }
    MoneyCents::new(checked_add(
        100_000_000,
        prestige
            .checked_mul(4_000_000)
            .ok_or(CoreError::Arithmetic)?,
    )?)
}
pub(crate) fn wage_budget(commitment: i64) -> CoreResult<MoneyCents> {
    MoneyCents::new(checked_add(commitment, (commitment / 5).max(100_000))?)
}
