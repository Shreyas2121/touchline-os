//! Pure, bounded development plans. Callers own minutes, period receipts, and persistence.
use crate::{
    ability::{goalkeeper_rating, role_ability, role_weights},
    generation::market_value_cents,
    CoreError, CoreResult, DevelopmentPeriod, PlayerAttributes, PlayerLife, PositionGroup, SafeInt,
};

pub const DEVELOPMENT_ENGINE_VERSION: &str = "1";

#[derive(Debug, Clone, PartialEq)]
pub struct DevelopmentInput {
    pub age: Option<i64>,
    pub potential: Option<i64>,
    pub attributes: PlayerAttributes,
    pub position_group: PositionGroup,
    pub target_role: Option<String>,
    pub minutes: i64,
    pub already_applied: i64,
    pub period: DevelopmentPeriod,
    pub status: PlayerLife,
}

#[derive(Debug, Clone, PartialEq)]
pub struct DevelopmentChange {
    pub before: PlayerAttributes,
    pub after: PlayerAttributes,
    pub before_value_cents: i64,
    pub after_value_cents: i64,
    pub points: i64,
    pub goalkeeping: Option<i64>,
}

fn target_group(role: Option<&str>, fallback: PositionGroup) -> PositionGroup {
    match role {
        Some("GK") => PositionGroup::Gk,
        Some("DEF" | "CB" | "LB" | "RB" | "LWB" | "RWB") => PositionGroup::Def,
        Some("MID" | "CDM" | "CM" | "CAM" | "LM" | "RM") => PositionGroup::Mid,
        Some("FWD" | "LW" | "RW" | "ST" | "CF") => PositionGroup::Fwd,
        _ => fallback,
    }
}

fn attribute_slots(attributes: &mut PlayerAttributes) -> [&mut Option<SafeInt>; 6] {
    [
        &mut attributes.pace,
        &mut attributes.finishing,
        &mut attributes.passing,
        &mut attributes.dribbling,
        &mut attributes.defending,
        &mut attributes.physical,
    ]
}

pub fn plan_development(input: &DevelopmentInput) -> CoreResult<Option<DevelopmentChange>> {
    let (Some(age), Some(potential)) = (input.age, input.potential) else {
        return Ok(None);
    };
    let mut after = input.attributes.clone();
    if input.status == PlayerLife::Retired
        || input.position_group == PositionGroup::Unknown
        || input.minutes < 0
        || !(0..=4).contains(&input.already_applied)
        || attribute_slots(&mut after)
            .iter()
            .any(|value| value.is_none())
    {
        return Ok(None);
    }
    let group = target_group(input.target_role.as_deref(), input.position_group);
    let before_ability = role_ability(&input.attributes, group)?.get();
    let headroom = potential
        .checked_sub(before_ability)
        .ok_or(CoreError::Arithmetic)?
        .max(0);
    let participation = input
        .minutes
        .min(1530)
        .checked_mul(100)
        .ok_or(CoreError::Arithmetic)?
        / 1530;
    let age_pct = match age {
        ..=21 => 100,
        22..=24 => 75,
        25..=27 => 40,
        _ => 0,
    };
    let annual = (headroom
        .min(4)
        .checked_mul(participation)
        .ok_or(CoreError::Arithmetic)?
        / 100)
        .checked_mul(age_pct)
        .ok_or(CoreError::Arithmetic)?
        / 100;
    let budget = match input.period {
        DevelopmentPeriod::Midseason => annual / 2,
        DevelopmentPeriod::SeasonEnd => (annual / 2).min(4 - input.already_applied),
    };
    let decline = if input.period == DevelopmentPeriod::SeasonEnd && budget == 0 && age >= 33 {
        if input.position_group == PositionGroup::Gk {
            match age {
                38.. => 2,
                36..=37 => 1,
                _ => 0,
            }
        } else {
            match age {
                37.. => 3,
                35..=36 => 2,
                _ => 1,
            }
        }
    } else {
        0
    };
    let weights = role_weights(group)?;
    let mut order = [0, 1, 2, 3, 4, 5];
    // Stable sorting preserves the canonical attribute order for equal weights.
    order.sort_by_key(|&index| std::cmp::Reverse(weights[index]));
    let direction = if decline > 0 { -1 } else { 1 };
    let mut points = 0_i64;
    for _ in 0..budget.max(decline) {
        for &index in &order {
            let previous = *attribute_slots(&mut after)[index];
            let value = previous.expect("all six attributes checked above").get();
            if (direction > 0 && value >= 100) || (direction < 0 && value <= 1) {
                continue;
            }
            let next = value.checked_add(direction).ok_or(CoreError::Arithmetic)?;
            *attribute_slots(&mut after)[index] = Some(SafeInt::new(next)?);
            if direction > 0 && role_ability(&after, group)?.get() > potential {
                *attribute_slots(&mut after)[index] = previous;
                continue;
            }
            points = points.checked_add(direction).ok_or(CoreError::Arithmetic)?;
            break;
        }
    }
    if after == input.attributes {
        return Ok(None);
    }
    let before_value_cents = market_value_cents(age, before_ability, potential)?.get();
    let after_value_cents =
        market_value_cents(age, role_ability(&after, group)?.get(), potential)?.get();
    let goalkeeping = if input.position_group == PositionGroup::Gk {
        Some(goalkeeper_rating(&after)?.get())
    } else {
        None
    };
    Ok(Some(DevelopmentChange {
        before: input.attributes.clone(),
        after,
        before_value_cents,
        after_value_cents,
        points,
        goalkeeping,
    }))
}
