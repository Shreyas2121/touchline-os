//! Bounded AI transfer bids. No persistence, acceptance, or clock.

use crate::generation_settings::{tier_for, wage};
use crate::policy::QualificationRule;
use crate::random::{derive_event_seed, EventKind, Mulberry32};
use crate::{CoreError, CoreResult, MoneyCents, PositionGroup, SafeInt, SquadTier};

pub const MARKET_ENGINE_VERSION: &str = "1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarketSeedInputs {
    pub root_seed: String,
    pub operation_key: String,
    /// Stream version passed to `derive_event_seed`. Only `"1"` is accepted.
    pub stream_version: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarketClub {
    pub simulation_key: String,
    pub prestige: i64,
    pub spendable_cents: i64,
    pub wage_room_cents: i64,
    pub open_buy_count: i64,
}

/// Current wage and tier travel with the player for the later agreement step.
/// They do not change who is bid for or the opening terms.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarketPlayer {
    pub simulation_key: String,
    pub position_group: PositionGroup,
    pub age: Option<i64>,
    pub ability: Option<i64>,
    pub market_value_cents: Option<i64>,
    pub seller_simulation_key: Option<String>,
    pub seller_prestige: Option<i64>,
    pub current_wage_cents: Option<i64>,
    pub current_tier: Option<SquadTier>,
    pub season_minutes: i64,
    pub rating_sum: i64,
    pub appearance_count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpeningBid {
    pub buyer_key: String,
    pub player_key: String,
    pub seller_key: Option<String>,
    pub fee_cents: i64,
    pub wage_cents: i64,
    pub tier: SquadTier,
    pub noise: i64,
    pub valuation_cents: i64,
    pub raised_to_qualify: bool,
}

const GROUPS: [PositionGroup; 4] = [
    PositionGroup::Gk,
    PositionGroup::Def,
    PositionGroup::Mid,
    PositionGroup::Fwd,
];
const TARGETS: [i64; 4] = [1, 4, 3, 3];

struct Need {
    group: PositionGroup,
    shortage: i64,
    average: Option<i64>,
    rank: u8,
}

struct Priced<'a> {
    player: &'a MarketPlayer,
    valuation: i64,
    wage: i64,
    tier: SquadTier,
}

/// Clubs are visited in simulation-key order. A club draws once when its chosen
/// group has a candidate. Skipped clubs do not draw. At most one bid per club
/// and twelve bids in total.
pub fn plan_tick(
    clubs: &[MarketClub],
    players: &[MarketPlayer],
    managed_club_key: &str,
    seed_inputs: &MarketSeedInputs,
    qualifying_rule: Option<QualificationRule>,
) -> CoreResult<Vec<OpeningBid>> {
    validate_inputs(clubs, players)?;
    if let Some(rule) = qualifying_rule {
        if rule.required_fee_numerator.get() < 1 || rule.required_fee_denominator.get() < 1 {
            return Err(CoreError::Invalid("Invalid qualification ratio."));
        }
    }
    let mut rng = Mulberry32::new(derive_event_seed(
        &seed_inputs.root_seed,
        &seed_inputs.stream_version,
        EventKind::Market,
        &[&seed_inputs.operation_key],
    )?);

    let mut order: Vec<usize> = (0..clubs.len()).collect();
    order.sort_by(|&left, &right| clubs[left].simulation_key.cmp(&clubs[right].simulation_key));

    let mut bids = Vec::new();
    for index in order {
        if bids.len() == 12 {
            break;
        }
        let club = &clubs[index];
        if club.open_buy_count >= 3 {
            continue;
        }
        let Some(group) = choose_group(&club.simulation_key, players)? else {
            continue;
        };
        let mut candidates = priced_candidates(club, group, players)?;
        if candidates.is_empty() {
            continue;
        }
        candidates.sort_by(|left, right| {
            left.valuation
                .cmp(&right.valuation)
                .then_with(|| left.player.simulation_key.cmp(&right.player.simulation_key))
        });
        let noise = rng.next_int(11)? - 5;
        if let Some(bid) =
            first_affordable(club, noise, &candidates, managed_club_key, qualifying_rule)?
        {
            bids.push(bid);
        }
    }
    Ok(bids)
}

fn validate_inputs(clubs: &[MarketClub], players: &[MarketPlayer]) -> CoreResult<()> {
    for club in clubs {
        require_key(&club.simulation_key)?;
        require_prestige(club.prestige)?;
        if club.spendable_cents < 0 {
            return Err(CoreError::Invalid("Invalid spendable balance."));
        }
        MoneyCents::new(club.spendable_cents)?;
        if club.wage_room_cents < 0 {
            return Err(CoreError::Invalid("Invalid wage room."));
        }
        MoneyCents::new(club.wage_room_cents)?;
        if club.open_buy_count < 0 {
            return Err(CoreError::Invalid("Invalid open buy count."));
        }
    }
    for player in players {
        require_key(&player.simulation_key)?;
        if let Some(seller) = &player.seller_simulation_key {
            require_key(seller)?;
        }
        if let Some(prestige) = player.seller_prestige {
            require_prestige(prestige)?;
        }
        if let Some(value) = player.market_value_cents {
            if value < 0 {
                return Err(CoreError::Invalid("Invalid market value."));
            }
            MoneyCents::new(value)?;
        }
        if let Some(ability) = player.ability {
            if !(0..=100).contains(&ability) {
                return Err(CoreError::Invalid("Invalid ability."));
            }
        }
        if player.season_minutes < 0 || player.rating_sum < 0 || player.appearance_count < 0 {
            return Err(CoreError::Invalid("Invalid appearance totals."));
        }
        SafeInt::new(player.season_minutes)?;
        SafeInt::new(player.rating_sum)?;
        SafeInt::new(player.appearance_count)?;
    }
    Ok(())
}

fn require_key(value: &str) -> CoreResult<()> {
    if value.is_empty() {
        Err(CoreError::Invalid("Invalid simulation key."))
    } else {
        Ok(())
    }
}

fn require_prestige(value: i64) -> CoreResult<()> {
    if (0..=100).contains(&value) {
        Ok(())
    } else {
        Err(CoreError::Invalid("Prestige is outside 0–100."))
    }
}

fn choose_group(club_key: &str, players: &[MarketPlayer]) -> CoreResult<Option<PositionGroup>> {
    let mut needs = Vec::new();
    for (rank, (group, target)) in GROUPS.into_iter().zip(TARGETS).enumerate() {
        let mut count = 0_i64;
        let mut ability_sum = 0_i64;
        let mut ability_count = 0_i64;
        for player in players {
            if player.seller_simulation_key.as_deref() != Some(club_key)
                || player.position_group != group
            {
                continue;
            }
            count = count.checked_add(1).ok_or(CoreError::Arithmetic)?;
            if let Some(ability) = player.ability {
                ability_sum = ability_sum
                    .checked_add(ability)
                    .ok_or(CoreError::Arithmetic)?;
                ability_count = ability_count.checked_add(1).ok_or(CoreError::Arithmetic)?;
            }
        }
        let shortage = target.saturating_sub(count);
        if shortage == 0 {
            continue;
        }
        let average = if ability_count == 0 {
            None
        } else {
            Some(ability_sum / ability_count)
        };
        needs.push(Need {
            group,
            shortage,
            average,
            rank: u8::try_from(rank).expect("four groups"),
        });
    }
    needs.sort_by(|left, right| {
        right
            .shortage
            .cmp(&left.shortage)
            .then_with(|| average_order(left.average).cmp(&average_order(right.average)))
            .then_with(|| left.rank.cmp(&right.rank))
    });
    Ok(needs.first().map(|need| need.group))
}

/// Known averages sort before an unknown group, and lower averages sort first.
fn average_order(average: Option<i64>) -> (u8, i64) {
    match average {
        Some(value) => (0, value),
        None => (1, 0),
    }
}

fn priced_candidates<'a>(
    club: &MarketClub,
    group: PositionGroup,
    players: &'a [MarketPlayer],
) -> CoreResult<Vec<Priced<'a>>> {
    let mut candidates = Vec::new();
    for player in players {
        if player.position_group != group
            || player.seller_simulation_key.as_deref() == Some(club.simulation_key.as_str())
        {
            continue;
        }
        let Some((age, ability, market_value)) = candidate_facts(player) else {
            continue;
        };
        let tier = tier_for(age, ability);
        candidates.push(Priced {
            valuation: valuation_of(player, market_value)?,
            wage: wage(age, ability, tier)?.get(),
            tier,
            player,
        });
    }
    Ok(candidates)
}

fn candidate_facts(player: &MarketPlayer) -> Option<(i64, i64, i64)> {
    let age = player.age?;
    let ability = player.ability?;
    let market_value = player.market_value_cents?;
    if !(16..=34).contains(&age) || market_value == 0 {
        return None;
    }
    if player.seller_simulation_key.is_some() && player.seller_prestige.is_none() {
        return None;
    }
    Some((age, ability, market_value))
}

fn valuation_of(player: &MarketPlayer, market_value: i64) -> CoreResult<i64> {
    // No appearances leave demand at 100, so valuation stays the stored market value.
    // The form term applies only once a stored rating exists.
    let demand = if player.appearance_count == 0 {
        100
    } else {
        let form = (player.rating_sum / player.appearance_count).clamp(1, 99);
        (100 + (form - 70) / 2 + player.season_minutes.min(900) / 90).clamp(80, 130)
    };
    checked_percent(market_value, demand)
}

fn opening_fee(
    valuation: i64,
    buyer_prestige: i64,
    seller_prestige: i64,
    noise: i64,
) -> CoreResult<i64> {
    let delta = (buyer_prestige - seller_prestige).clamp(-10, 20);
    checked_percent(valuation, 100 + delta + noise)
}

fn affordability_floor(valuation: i64) -> CoreResult<i64> {
    checked_percent(valuation, 80)
}

fn qualifying_fee(valuation: i64, numerator: i64, denominator: i64) -> CoreResult<i64> {
    let product = i128::from(valuation)
        .checked_mul(i128::from(numerator))
        .ok_or(CoreError::Arithmetic)?;
    let ceiling = product
        .checked_add(i128::from(denominator) - 1)
        .ok_or(CoreError::Arithmetic)?;
    let fee = ceiling / i128::from(denominator);
    i64::try_from(fee)
        .ok()
        .filter(|fee| *fee >= 0)
        .and_then(|fee| MoneyCents::new(fee).ok())
        .map(MoneyCents::get)
        .ok_or(CoreError::Arithmetic)
}

fn checked_percent(amount: i64, percent: i64) -> CoreResult<i64> {
    let fee = amount.checked_mul(percent).ok_or(CoreError::Arithmetic)? / 100;
    MoneyCents::new(fee).map(MoneyCents::get)
}

fn first_affordable(
    club: &MarketClub,
    noise: i64,
    candidates: &[Priced<'_>],
    managed_club_key: &str,
    qualifying_rule: Option<QualificationRule>,
) -> CoreResult<Option<OpeningBid>> {
    for candidate in candidates {
        let player = candidate.player;
        let mut fee = if player.seller_simulation_key.is_none() {
            0
        } else {
            let Some(seller_prestige) = player.seller_prestige else {
                continue;
            };
            opening_fee(candidate.valuation, club.prestige, seller_prestige, noise)?
        };
        if fee > club.spendable_cents {
            if club.spendable_cents >= affordability_floor(candidate.valuation)? {
                fee = club.spendable_cents;
            } else {
                continue;
            }
        }
        if candidate.wage > club.wage_room_cents {
            continue;
        }
        let (fee, raised_to_qualify) = raise_to_qualify(
            club,
            player,
            fee,
            candidate.valuation,
            managed_club_key,
            qualifying_rule,
        )?;
        return Ok(Some(OpeningBid {
            buyer_key: club.simulation_key.clone(),
            player_key: player.simulation_key.clone(),
            seller_key: player.seller_simulation_key.clone(),
            fee_cents: fee,
            wage_cents: candidate.wage,
            tier: candidate.tier,
            noise,
            valuation_cents: candidate.valuation,
            raised_to_qualify,
        }));
    }
    Ok(None)
}

fn raise_to_qualify(
    club: &MarketClub,
    player: &MarketPlayer,
    fee: i64,
    valuation: i64,
    managed_club_key: &str,
    qualifying_rule: Option<QualificationRule>,
) -> CoreResult<(i64, bool)> {
    let Some(rule) = qualifying_rule else {
        return Ok((fee, false));
    };
    if player.seller_simulation_key.as_deref() != Some(managed_club_key) {
        return Ok((fee, false));
    }
    // Some(rule) means PRESTIGE_BID_SALE is enabled. The fee is lifted only
    // when the buyer's prestige is strictly higher and the new fee still fits.
    let Some(seller_prestige) = player.seller_prestige else {
        return Ok((fee, false));
    };
    if club.prestige <= seller_prestige {
        return Ok((fee, false));
    }
    let qualifying = qualifying_fee(
        valuation,
        rule.required_fee_numerator.get(),
        rule.required_fee_denominator.get(),
    )?;
    if qualifying > fee && qualifying <= club.spendable_cents {
        Ok((qualifying, true))
    } else {
        Ok((fee, false))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn opening_wage_uses_the_generation_functions() {
        let club = MarketClub {
            simulation_key: "buyer".into(),
            prestige: 50,
            spendable_cents: 1_000_000_000,
            wage_room_cents: 10_000_000,
            open_buy_count: 0,
        };
        let player = MarketPlayer {
            simulation_key: "player".into(),
            position_group: PositionGroup::Def,
            age: Some(25),
            ability: Some(50),
            market_value_cents: Some(1_000_000),
            seller_simulation_key: None,
            seller_prestige: None,
            current_wage_cents: Some(1),
            current_tier: Some(SquadTier::Key),
            season_minutes: 0,
            rating_sum: 0,
            appearance_count: 0,
        };
        let bid = plan_tick(
            &[club],
            &[player],
            "managed",
            &MarketSeedInputs {
                root_seed: "seed".into(),
                operation_key: "season:2026:market:2026-07-01".into(),
                stream_version: MARKET_ENGINE_VERSION.into(),
            },
            None,
        )
        .unwrap();
        let tier = tier_for(25, 50);
        assert_eq!(bid[0].tier, tier);
        assert_eq!(bid[0].wage_cents, wage(25, 50, tier).unwrap().get());
    }
}
