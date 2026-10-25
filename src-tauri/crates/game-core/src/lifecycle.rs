//! Pure development and roster plans. Callers own period receipts and persistence.
use crate::{
    ability::{goalkeeper_rating, role_ability, role_weights},
    calendar::season_dates,
    dates::DateOnly,
    fictional_names::NATIONALITIES,
    generation::{draw_name, market_value_cents, weekly_wage_cents},
    generation_settings::tier_for,
    money::checked_add,
    random::{create_event_stream, EventKind},
    CoreError, CoreResult, DevelopmentPeriod, MoneyCents, PlayerAttributes, PlayerLife, Position,
    PositionGroup, SafeInt, SquadTier,
};
use std::collections::BTreeSet;

pub const DEVELOPMENT_ENGINE_VERSION: &str = "1";

/// Award definitions are shared by preview and settlement; all amounts are cents.
pub fn league_prize(position: i64) -> CoreResult<i64> {
    if !(1..=18).contains(&position) {
        return Err(CoreError::Invalid("Invalid league position."));
    }
    Ok((19 - position) * 10_000_000)
}

pub fn objective_awards() -> [(crate::ObjectiveKind, i64, i64, crate::AwardKind); 3] {
    use crate::{AwardKind as A, ObjectiveKind as O};
    [
        (O::LeagueTitle, 1, 50_000_000, A::LeagueTitle),
        (O::TopHalf, 9, 20_000_000, A::TopHalf),
        (O::AvoidLast, 17, 10_000_000, A::AvoidLast),
    ]
}

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

#[derive(Debug, Clone, PartialEq)]
pub struct ClubRosterInput {
    pub simulation_key: String,
    pub academy_tier: i64,
    pub wage_budget_weekly_cents: i64,
    pub managed: bool,
    pub players: Vec<RosterPlayer>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RosterPlayer {
    pub simulation_key: String,
    pub age: Option<i64>,
    pub position_group: PositionGroup,
    /// The caller supplies post-development attributes.
    pub attributes: PlayerAttributes,
    pub potential: Option<i64>,
    pub weekly_wage_cents: Option<i64>,
    pub expires_on: Option<String>,
    pub status: PlayerLife,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TierCaps {
    pub key_weekly_cap_cents: i64,
    pub rotation_weekly_cap_cents: i64,
    pub youth_weekly_cap_cents: i64,
}

impl TierCaps {
    fn cap(self, tier: SquadTier) -> CoreResult<i64> {
        MoneyCents::new(match tier {
            SquadTier::Key => self.key_weekly_cap_cents,
            SquadTier::Rotation => self.rotation_weekly_cap_cents,
            SquadTier::Youth => self.youth_weekly_cap_cents,
        })
        .map(MoneyCents::get)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RosterPlan {
    pub retired: Vec<String>,
    pub renewed: Vec<Renewal>,
    pub released: Vec<String>,
    pub intake: Vec<IntakePlayer>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Renewal {
    pub simulation_key: String,
    pub weekly_wage_cents: i64,
    pub squad_tier: SquadTier,
    pub starts_on: String,
    pub expires_on: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct IntakePlayer {
    pub simulation_key: String,
    pub name: String,
    pub nationality_code: String,
    pub position_group: PositionGroup,
    pub position: Position,
    pub attributes: PlayerAttributes,
    pub potential: i64,
    pub weekly_wage_cents: i64,
    pub starts_on: String,
    pub expires_on: String,
}

const SQUAD_FLOOR_ERROR: CoreError =
    CoreError::Invalid("A club cannot field a legal squad next season.");
const ROSTER_GROUPS: [PositionGroup; 4] = [
    PositionGroup::Gk,
    PositionGroup::Def,
    PositionGroup::Mid,
    PositionGroup::Fwd,
];

#[derive(Default, Clone, Copy)]
struct RosterCount {
    total: usize,
    groups: [usize; 4],
}

impl RosterCount {
    fn add(&mut self, group: PositionGroup) {
        self.total += 1;
        if let Some(index) = ROSTER_GROUPS.iter().position(|&known| known == group) {
            self.groups[index] += 1;
        }
    }

    fn shortage(&self) -> Option<PositionGroup> {
        ROSTER_GROUPS
            .into_iter()
            .zip(self.groups)
            .zip([2, 1, 1, 1])
            .find_map(|((group, count), minimum)| (count < minimum).then_some(group))
    }

    fn viable(&self) -> bool {
        self.total >= 16 && self.shortage().is_none()
    }
}

struct RosterDates {
    closing_start_year: i64,
    season_end: DateOnly,
    starts_on: String,
    renewal_end: String,
    intake_end: String,
}

/// Plans and decisions follow simulation-key order, independent of caller order
/// or player/club transport IDs. The closing season identifies the event stream.
/// No growth is rerun and no caller-owned data is changed.
/// Contracts without a known future expiry do not establish a squad-floor place;
/// known wages on undated contracts are still reserved. All dates must fit the
/// supported date range, including the two- and three-year contract terms.
pub fn plan_roster(
    clubs: &[ClubRosterInput],
    season_end: &str,
    next_start_year: i64,
    root_seed: &str,
    closing_season_id: &str,
    managed_tier_caps: Option<TierCaps>,
) -> CoreResult<Vec<RosterPlan>> {
    let next = season_dates(next_start_year)?;
    let dates = RosterDates {
        closing_start_year: next_start_year
            .checked_sub(1)
            .ok_or(CoreError::Arithmetic)?,
        season_end: DateOnly::parse(season_end)?,
        starts_on: next.start_date.as_str().into(),
        renewal_end: contract_end(next_start_year, 2)?,
        intake_end: contract_end(next_start_year, 3)?,
    };
    if season_dates(dates.closing_start_year)?.end_date != dates.season_end {
        return Err(CoreError::Invalid(
            "The next season must follow the closing June 30.",
        ));
    }
    let mut ordered = clubs.iter().collect::<Vec<_>>();
    ordered.sort_by(|a, b| a.simulation_key.cmp(&b.simulation_key));
    if ordered.iter().any(|club| club.managed) {
        if let Some(caps) = managed_tier_caps {
            for tier in [SquadTier::Key, SquadTier::Rotation, SquadTier::Youth] {
                caps.cap(tier)?;
            }
        }
    }
    let mut club_keys = BTreeSet::new();
    let mut player_keys = BTreeSet::new();
    for club in &ordered {
        if crate::js_trim(&club.simulation_key).is_empty()
            || crate::js_trim(&club.simulation_key) != club.simulation_key
            || !club_keys.insert(club.simulation_key.clone())
        {
            return Err(CoreError::Invalid(
                "Club simulation keys must be nonempty and unique.",
            ));
        }
        if !(1..=5).contains(&club.academy_tier) {
            return Err(CoreError::Invalid("Academy tier must be from 1 to 5."));
        }
        MoneyCents::new(club.wage_budget_weekly_cents)?;
        for player in &club.players {
            if crate::js_trim(&player.simulation_key).is_empty()
                || crate::js_trim(&player.simulation_key) != player.simulation_key
                || !player_keys.insert(player.simulation_key.clone())
            {
                return Err(CoreError::Invalid(
                    "Player simulation keys must be nonempty and unique.",
                ));
            }
            if let Some(wage) = player.weekly_wage_cents {
                MoneyCents::new(wage)?;
            }
        }
    }
    ordered
        .into_iter()
        .map(|club| {
            let plan = plan_club_roster(
                club,
                &dates,
                root_seed,
                closing_season_id,
                managed_tier_caps,
            )?;
            if plan
                .intake
                .iter()
                .any(|player| !player_keys.insert(player.simulation_key.clone()))
            {
                return Err(CoreError::Invalid("Intake simulation key already exists."));
            }
            Ok(plan)
        })
        .collect()
}

fn contract_end(start_year: i64, years: i64) -> CoreResult<String> {
    let year = start_year.checked_add(years).ok_or(CoreError::Arithmetic)?;
    Ok(DateOnly::parse(&format!("{year}-06-30"))?.as_str().into())
}

fn plan_club_roster(
    club: &ClubRosterInput,
    dates: &RosterDates,
    root_seed: &str,
    closing_season_id: &str,
    managed_tier_caps: Option<TierCaps>,
) -> CoreResult<RosterPlan> {
    let mut plan = RosterPlan {
        retired: vec![],
        renewed: vec![],
        released: vec![],
        intake: vec![],
    };
    let mut players = club.players.iter().collect::<Vec<_>>();
    players.sort_by(|a, b| a.simulation_key.cmp(&b.simulation_key));
    let mut count = RosterCount::default();
    let mut wages = 0;
    let mut expiring = Vec::new();
    for player in players {
        if player.status == PlayerLife::Retired {
            continue;
        }
        let known = player.age.is_some() && player.position_group != PositionGroup::Unknown;
        if known
            && player.age.is_some_and(|age| {
                age >= if player.position_group == PositionGroup::Gk {
                    38
                } else {
                    36
                }
            })
        {
            plan.retired.push(player.simulation_key.clone());
            continue;
        }
        let expiry = player
            .expires_on
            .as_deref()
            .map(DateOnly::parse)
            .transpose()?;
        if expiry
            .as_ref()
            .is_some_and(|expiry| expiry <= &dates.season_end)
        {
            if known {
                expiring.push(player);
            }
            continue;
        }
        // Unknown expiry is preserved and its known wage reserved, but cannot
        // establish a contracted place in next season's squad floor.
        if let Some(wage) = player.weekly_wage_cents {
            wages = checked_add(wages, wage)?;
        } else if expiry.is_some() {
            return Err(CoreError::Invalid(
                "An active contract requires a known weekly wage.",
            ));
        }
        if expiry.is_some() {
            count.add(player.position_group);
        }
    }
    let over_budget = wages > club.wage_budget_weekly_cents;
    for player in expiring {
        if over_budget {
            plan.released.push(player.simulation_key.clone());
            continue;
        }
        let age = player.age.expect("only known ages are renewed");
        let ability = role_ability(&player.attributes, player.position_group)?.get();
        let tier = tier_for(age, ability);
        let caps = if club.managed {
            managed_tier_caps
        } else {
            None
        };
        let mut renewal = None;
        for attempt in [tier, SquadTier::Youth] {
            let wage = weekly_wage_cents(age, ability, attempt)?.get();
            if wage <= club.wage_budget_weekly_cents - wages
                && caps
                    .map(|caps| caps.cap(attempt))
                    .transpose()?
                    .is_none_or(|cap| wage <= cap)
            {
                renewal = Some(Renewal {
                    simulation_key: player.simulation_key.clone(),
                    weekly_wage_cents: wage,
                    squad_tier: attempt,
                    starts_on: dates.starts_on.clone(),
                    expires_on: dates.renewal_end.clone(),
                });
                wages = checked_add(wages, wage)?;
                count.add(player.position_group);
                break;
            }
        }
        if let Some(renewal) = renewal {
            plan.renewed.push(renewal);
        } else {
            plan.released.push(player.simulation_key.clone());
        }
    }
    if over_budget {
        return if count.viable() {
            Ok(plan)
        } else {
            Err(SQUAD_FLOOR_ERROR)
        };
    }
    let base = usize::try_from(
        club.academy_tier
            .checked_add(1)
            .ok_or(CoreError::Arithmetic)?,
    )
    .map_err(|_| CoreError::Arithmetic)?;
    let retained_count = count;
    let mut groups = Vec::new();
    let mut rotation = ROSTER_GROUPS.into_iter().cycle();
    while groups.len() < 10 && (groups.len() < base || !count.viable()) {
        let group = count
            .shortage()
            .unwrap_or_else(|| rotation.next().expect("nonempty rotation"));
        groups.push(group);
        count.add(group);
    }
    if !count.viable() {
        return Err(SQUAD_FLOOR_ERROR);
    }
    let ability = club
        .academy_tier
        .checked_mul(5)
        .and_then(|value| value.checked_add(35))
        .ok_or(CoreError::Arithmetic)?;
    let wage = weekly_wage_cents(16, ability, SquadTier::Youth)?.get();
    while !groups.is_empty() {
        let cost = wage
            .checked_mul(groups.len() as i64)
            .ok_or(CoreError::Arithmetic)?;
        if cost <= club.wage_budget_weekly_cents - wages {
            break;
        }
        groups.pop();
    }
    // Wage trimming may remove a player needed for the floor. Refuse the whole
    // plan instead of accepting an affordable but unplayable partial squad.
    let mut final_count = retained_count;
    for &group in &groups {
        final_count.add(group);
    }
    if !final_count.viable() {
        return Err(SQUAD_FLOOR_ERROR);
    }
    let value = Some(SafeInt::new(ability)?);
    let attributes = PlayerAttributes {
        pace: value,
        finishing: value,
        passing: value,
        dribbling: value,
        defending: value,
        physical: value,
    };
    if !groups.is_empty() {
        let key = format!("season:{closing_season_id}:academy:{}", club.simulation_key);
        let mut rng = create_event_stream(
            root_seed,
            DEVELOPMENT_ENGINE_VERSION,
            EventKind::Development,
            &[&key],
        )?;
        for (index, group) in groups.into_iter().enumerate() {
            plan.intake.push(IntakePlayer {
                simulation_key: format!(
                    "newgen:{}:{}:{index}",
                    dates.closing_start_year, club.simulation_key
                ),
                name: draw_name(&mut rng)?,
                nationality_code: NATIONALITIES[rng.next_int(NATIONALITIES.len() as i64)? as usize]
                    .into(),
                position_group: group,
                position: match group {
                    PositionGroup::Gk => Position::Gk,
                    PositionGroup::Def => Position::Cb,
                    PositionGroup::Mid => Position::Cm,
                    _ => Position::St,
                },
                attributes: attributes.clone(),
                potential: ability
                    .checked_add(15)
                    .ok_or(CoreError::Arithmetic)?
                    .min(100),
                weekly_wage_cents: wage,
                starts_on: dates.starts_on.clone(),
                expires_on: dates.intake_end.clone(),
            });
        }
    }
    Ok(plan)
}
