use crate::{CoreError, CoreResult, PlayerAttributes, PositionGroup, SafeInt};

/// Fictional role weights for pace, finishing, passing, dribbling, defending, physical.
/// These are game ratings, not measured football statistics.
pub fn role_ability(attributes: &PlayerAttributes, group: PositionGroup) -> CoreResult<SafeInt> {
    let weights = match group {
        PositionGroup::Gk => [10, 0, 25, 5, 30, 30],
        PositionGroup::Def => [10, 5, 15, 10, 40, 20],
        PositionGroup::Mid => [15, 15, 25, 20, 10, 15],
        PositionGroup::Fwd => [20, 35, 10, 20, 5, 10],
        PositionGroup::Unknown => {
            return Err(CoreError::Invalid("Ability requires a known position."))
        }
    };
    let values = [
        attributes.pace,
        attributes.finishing,
        attributes.passing,
        attributes.dribbling,
        attributes.defending,
        attributes.physical,
    ];
    let mut total = 0_i64;
    for (value, weight) in values.into_iter().zip(weights) {
        let value = value
            .ok_or(CoreError::Invalid("Ability requires all six attributes."))?
            .get();
        if !(0..=100).contains(&value) {
            return Err(CoreError::Invalid("Attribute is outside 0–100."));
        }
        total = total
            .checked_add(value.checked_mul(weight).ok_or(CoreError::Arithmetic)?)
            .ok_or(CoreError::Arithmetic)?;
    }
    SafeInt::new(total / 100)
}
pub fn goalkeeper_rating(attributes: &PlayerAttributes) -> CoreResult<SafeInt> {
    role_ability(attributes, PositionGroup::Gk)
}
