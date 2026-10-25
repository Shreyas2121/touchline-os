//! Pure continuation of an actual post-settlement squad. No extra calendars,
//! stored matches, or SQLite writes are needed to certify two more aged years.
use game_core::{
    dates::{age_in_whole_years, display_age, AgeDisplay, DateOnly},
    lifecycle::{plan_roster, ClubRosterInput, RosterPlayer, TierCaps},
    ConstitutionRule, ContractStatus, PlayerLife, PositionGroup, SnapshotTables,
};
use std::collections::BTreeMap;

fn age_on(basis: &(Option<DateOnly>, i64), date: &str, opening_year: i64) -> i64 {
    let date = DateOnly::parse(date).unwrap();
    basis
        .0
        .as_ref()
        .map_or(basis.1 + date.year() - opening_year, |birth| {
            age_in_whole_years(birth, &date).unwrap()
        })
}

fn assert_floor(club: &ClubRosterInput, date: &str) {
    let contracted = club
        .players
        .iter()
        .filter(|p| {
            p.status == PlayerLife::Active && p.expires_on.as_deref().is_some_and(|end| end >= date)
        })
        .collect::<Vec<_>>();
    assert!(
        contracted.len() >= 16,
        "{} on {date}: {} contracted players",
        club.simulation_key,
        contracted.len()
    );
    for (group, minimum) in [
        (PositionGroup::Gk, 2),
        (PositionGroup::Def, 1),
        (PositionGroup::Mid, 1),
        (PositionGroup::Fwd, 1),
    ] {
        assert!(
            contracted
                .iter()
                .filter(|p| p.position_group == group)
                .count()
                >= minimum,
            "{} on {date}: missing {group:?}",
            club.simulation_key
        );
    }
    let wages = contracted
        .iter()
        .map(|p| p.weekly_wage_cents.expect("known generated wage"))
        .sum::<i64>();
    assert!(
        wages <= club.wage_budget_weekly_cents,
        "{} on {date}: wages {wages} exceed {}",
        club.simulation_key,
        club.wage_budget_weekly_cents
    );
}

pub fn roster_floor_holds_after_rollover_and_two_planned_years(t: &SnapshotTables) {
    let campaign = &t.campaigns[0];
    let opening = &t.simulation_states[0].current_date;
    let opening_year = DateOnly::parse(opening).unwrap().year();
    let season = t
        .seasons
        .iter()
        .find(|s| s.id == campaign.active_season_id)
        .unwrap();
    let mut birthdays = BTreeMap::new();
    let mut clubs = Vec::new();
    for club in &t.clubs {
        let state = t
            .club_simulation_states
            .iter()
            .find(|s| s.club_id == club.id)
            .unwrap();
        let mut players = Vec::new();
        for player in t
            .players
            .iter()
            .filter(|p| p.club_id.as_ref() == Some(&club.id))
        {
            let ps = t
                .player_simulation_states
                .iter()
                .find(|s| s.player_id == player.id)
                .unwrap();
            assert_eq!(ps.status, PlayerLife::Active);
            let contracts = t
                .contracts
                .iter()
                .filter(|c| c.player_id == player.id && c.status == ContractStatus::Active)
                .collect::<Vec<_>>();
            assert_eq!(
                contracts.len(),
                1,
                "{} must have one active contract",
                player.name
            );
            let contract = contracts[0];
            assert_eq!(contract.club_id, club.id);
            assert!(contract.starts_on.as_deref().unwrap() <= opening.as_str());
            assert!(contract.expires_on.as_deref().unwrap() >= opening.as_str());
            let age = match display_age(player, season) {
                AgeDisplay::Exact { years } | AgeDisplay::Estimated { years } => years,
                AgeDisplay::Unknown => panic!("seeded age must be known"),
            };
            let birth = player
                .birth_date
                .as_deref()
                .map(DateOnly::parse)
                .transpose()
                .unwrap();
            birthdays.insert(ps.simulation_key.clone(), (birth, age));
            players.push(RosterPlayer {
                simulation_key: ps.simulation_key.clone(),
                age: Some(age),
                position_group: player.position_group,
                attributes: player.attributes.clone(),
                potential: player.potential.map(|n| n.get()),
                weekly_wage_cents: contract.weekly_wage_cents.map(|m| m.get()),
                expires_on: contract.expires_on.clone(),
                status: ps.status,
            });
        }
        clubs.push(ClubRosterInput {
            simulation_key: state.simulation_key.clone(),
            academy_tier: club.academy_tier.get(),
            wage_budget_weekly_cents: state.wage_budget_weekly_cents.get(),
            managed: club.id == campaign.managed_club_id,
            players,
        });
    }
    for retired in t
        .player_simulation_states
        .iter()
        .filter(|s| s.status == PlayerLife::Retired)
    {
        assert!(t
            .players
            .iter()
            .find(|p| p.id == retired.player_id)
            .unwrap()
            .club_id
            .is_none());
        assert!(!t
            .contracts
            .iter()
            .any(|c| c.player_id == retired.player_id && c.status == ContractStatus::Active));
    }
    assert_eq!(clubs.len(), 72);
    clubs.sort_by(|a, b| a.simulation_key.cmp(&b.simulation_key));
    let caps = t.constitutions[0].rules.iter().find_map(|r| match r {
        ConstitutionRule::WageTierCap {
            enabled: true,
            key_weekly_cap_cents,
            rotation_weekly_cap_cents,
            youth_weekly_cap_cents,
        } => Some(TierCaps {
            key_weekly_cap_cents: key_weekly_cap_cents.get(),
            rotation_weekly_cap_cents: rotation_weekly_cap_cents.get(),
            youth_weekly_cap_cents: youth_weekly_cap_cents.get(),
        }),
        _ => None,
    });
    let mut player_rows = t.players.len();
    assert!(player_rows <= 8000);
    for club in &clubs {
        assert_floor(club, opening);
    }
    for year in opening_year..opening_year + 2 {
        let closing = format!("{}-06-30", year + 1);
        let next = format!("{}-07-01", year + 1);
        for club in &mut clubs {
            for player in &mut club.players {
                player.age = Some(age_on(
                    &birthdays[&player.simulation_key],
                    &closing,
                    opening_year,
                ));
            }
        }
        let input = clubs.clone();
        let season = if year == opening_year {
            campaign.active_season_id.as_str().to_owned()
        } else {
            format!("planned-season-{year}")
        };
        let plans = plan_roster(
            &clubs,
            &closing,
            year + 1,
            &t.simulation_states[0].root_seed,
            &season,
            caps,
        )
        .unwrap();
        assert_eq!(clubs, input, "planning is pure");
        assert_eq!(
            plans,
            plan_roster(
                &clubs,
                &closing,
                year + 1,
                &t.simulation_states[0].root_seed,
                &season,
                caps
            )
            .unwrap()
        );
        for (club, plan) in clubs.iter_mut().zip(plans) {
            club.players.retain(|p| {
                !plan.retired.contains(&p.simulation_key)
                    && !plan.released.contains(&p.simulation_key)
            });
            for renewed in plan.renewed {
                assert_eq!(renewed.starts_on, next);
                let player = club
                    .players
                    .iter_mut()
                    .find(|p| p.simulation_key == renewed.simulation_key)
                    .unwrap();
                player.weekly_wage_cents = Some(renewed.weekly_wage_cents);
                player.expires_on = Some(renewed.expires_on);
            }
            player_rows += plan.intake.len();
            for intake in plan.intake {
                assert_eq!(intake.starts_on, next);
                let birth = DateOnly::parse(&format!("{}-07-01", year + 1 - 16)).unwrap();
                assert!(birthdays
                    .insert(intake.simulation_key.clone(), (Some(birth), 16))
                    .is_none());
                club.players.push(RosterPlayer {
                    simulation_key: intake.simulation_key,
                    age: Some(16),
                    position_group: intake.position_group,
                    attributes: intake.attributes,
                    potential: Some(intake.potential),
                    weekly_wage_cents: Some(intake.weekly_wage_cents),
                    expires_on: Some(intake.expires_on),
                    status: PlayerLife::Active,
                });
            }
            for player in &mut club.players {
                player.age = Some(age_on(
                    &birthdays[&player.simulation_key],
                    &next,
                    opening_year,
                ));
            }
            assert_floor(club, &next);
        }
        // Historical retirees and released players remain in the global count.
        assert!(player_rows <= 8000);
        eprintln!(
            "pure roster continuation {next}: 72 viable clubs, {player_rows} retained player rows"
        );
    }
}
