//! Pure league pairings and standings, identified only by stable simulation keys.
use crate::{
    calendar::season_dates,
    dates::{add_days, DateOnly},
    CoreError, CoreResult,
};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Copy)]
pub struct ScheduleClub<'a> {
    pub simulation_key: &'a str,
    pub league_tier: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScheduledFixture {
    pub fixture_key: String,
    pub league_tier: i64,
    pub round: u8,
    pub match_date: DateOnly,
    pub home_simulation_key: String,
    pub away_simulation_key: String,
}

#[derive(Debug, Clone, Copy)]
pub struct MatchScore<'a> {
    pub home_simulation_key: &'a str,
    pub away_simulation_key: &'a str,
    pub home_goals: i64,
    pub away_goals: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StandingRow {
    pub simulation_key: String,
    pub played: u16,
    pub won: u16,
    pub drawn: u16,
    pub lost: u16,
    pub goals_for: u16,
    pub goals_against: u16,
    pub goal_difference: i32,
    pub points: u16,
}

/// Four 18-club leagues, in tier, round, then circle-pair order.
pub fn schedule_season(
    start_year: i64,
    clubs: &[ScheduleClub<'_>],
) -> CoreResult<Vec<ScheduledFixture>> {
    let season = season_dates(start_year)?;
    let kickoff = DateOnly::parse(&format!("{start_year}-09-01"))?;
    let dates = (0..34)
        .map(|q| add_days(&kickoff, q * 7))
        .collect::<CoreResult<Vec<_>>>()?;
    if dates[33] > season.end_date {
        return Err(CoreError::Invalid("The calendar exceeds the season end."));
    }

    let mut leagues = BTreeMap::<i64, Vec<&str>>::new();
    let mut keys = BTreeSet::new();
    for club in clubs {
        validate_key(club.simulation_key)?;
        if !(1..=4).contains(&club.league_tier) || !keys.insert(club.simulation_key) {
            return Err(CoreError::Invalid(
                "Invalid league tier or duplicate club key.",
            ));
        }
        leagues
            .entry(club.league_tier)
            .or_default()
            .push(club.simulation_key);
    }
    if leagues.len() != 4 || leagues.values().any(|clubs| clubs.len() != 18) {
        return Err(CoreError::Invalid(
            "The calendar requires four leagues of 18 clubs.",
        ));
    }

    let mut fixtures = Vec::with_capacity(1_224);
    for (tier, mut clubs) in leagues {
        // UTF-8 string order preserves Unicode scalar order, including non-BMP keys.
        clubs.sort_unstable();
        let mut rotating = (1..18).collect::<Vec<usize>>();
        let mut first_half = Vec::with_capacity(153);
        for q in 0..17 {
            let row = std::iter::once(0)
                .chain(rotating.iter().copied())
                .collect::<Vec<_>>();
            for k in 0..9 {
                let pair = (row[k], row[17 - k]);
                first_half.push(if (q + k) % 2 == 0 {
                    pair
                } else {
                    (pair.1, pair.0)
                });
            }
            rotating.rotate_right(1);
        }
        for (q, date) in dates.iter().enumerate() {
            for k in 0..9 {
                let (left, right) = first_half[(q % 17) * 9 + k];
                let (home, away) = if q < 17 {
                    (clubs[left], clubs[right])
                } else {
                    (clubs[right], clubs[left])
                };
                let round = (q + 1) as u8; // q is bounded by the 34 dates above.
                fixtures.push(ScheduledFixture {
                    fixture_key: format!("season:{start_year}:league-tier:{tier}:round:{round:02}:home:{home}:away:{away}"),
                    league_tier: tier,
                    round,
                    match_date: date.clone(),
                    home_simulation_key: home.to_owned(),
                    away_simulation_key: away.to_owned(),
                });
            }
        }
    }
    Ok(fixtures)
}

/// Order: points, goal difference, goals scored, then club simulation key.
pub fn standings(clubs: &[&str], results: &[MatchScore<'_>]) -> CoreResult<Vec<StandingRow>> {
    let mut rows = BTreeMap::new();
    for &key in clubs {
        validate_key(key)?;
        if rows
            .insert(
                key,
                StandingRow {
                    simulation_key: key.to_owned(),
                    ..StandingRow::default()
                },
            )
            .is_some()
        {
            return Err(CoreError::Invalid("Duplicate standings club key."));
        }
    }
    for score in results {
        if score.home_goals < 0 || score.away_goals < 0 {
            return Err(CoreError::Invalid("Match goals cannot be negative."));
        }
        if score.home_simulation_key == score.away_simulation_key
            || !rows.contains_key(score.home_simulation_key)
            || !rows.contains_key(score.away_simulation_key)
        {
            return Err(CoreError::Invalid(
                "Match clubs must be distinct standings members.",
            ));
        }
        let home = u16::try_from(score.home_goals).map_err(|_| CoreError::Arithmetic)?;
        let away = u16::try_from(score.away_goals).map_err(|_| CoreError::Arithmetic)?;
        record(
            rows.get_mut(score.home_simulation_key)
                .expect("checked member"),
            home,
            away,
        )?;
        record(
            rows.get_mut(score.away_simulation_key)
                .expect("checked member"),
            away,
            home,
        )?;
    }
    let mut rows = rows.into_values().collect::<Vec<_>>();
    rows.sort_by(|a, b| {
        b.points
            .cmp(&a.points)
            .then_with(|| b.goal_difference.cmp(&a.goal_difference))
            .then_with(|| b.goals_for.cmp(&a.goals_for))
            .then_with(|| a.simulation_key.cmp(&b.simulation_key))
    });
    Ok(rows)
}

fn record(row: &mut StandingRow, scored: u16, conceded: u16) -> CoreResult<()> {
    let add = |left: u16, right: u16| left.checked_add(right).ok_or(CoreError::Arithmetic);
    row.played = add(row.played, 1)?;
    row.goals_for = add(row.goals_for, scored)?;
    row.goals_against = add(row.goals_against, conceded)?;
    match scored.cmp(&conceded) {
        std::cmp::Ordering::Greater => {
            row.won = add(row.won, 1)?;
            row.points = add(row.points, 3)?;
        }
        std::cmp::Ordering::Equal => {
            row.drawn = add(row.drawn, 1)?;
            row.points = add(row.points, 1)?;
        }
        std::cmp::Ordering::Less => row.lost = add(row.lost, 1)?,
    }
    row.goal_difference = i32::from(row.goals_for) - i32::from(row.goals_against);
    Ok(())
}

fn validate_key(key: &str) -> CoreResult<()> {
    if key.is_empty() || crate::js_trim(key) != key || key.chars().any(char::is_control) {
        return Err(CoreError::Invalid("Invalid club simulation key."));
    }
    Ok(())
}
