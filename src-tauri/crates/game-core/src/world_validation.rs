use crate::{
    ability::role_ability,
    calendar::season_dates,
    dates::DateOnly,
    generation::{self, PlayableWorld, PlayableWorldInput},
    generation_settings as settings,
    money::checked_add,
    policy::{
        constitution_preset, evaluate_action, PolicyAction, PolicySnapshot, Preset,
        RegistrationPlayer,
    },
    selection::{formation_slots, lineup_problems, LineupDraft},
    *,
};
use std::collections::{BTreeMap, BTreeSet};

fn invalid() -> CoreError {
    CoreError::Invalid("Generated world is incomplete or violates native world invariants.")
}
fn require(condition: bool) -> CoreResult<()> {
    if condition {
        Ok(())
    } else {
        Err(invalid())
    }
}
fn model<T>(result: Result<T, SnapshotError>) -> CoreResult<()> {
    result.map(|_| ()).map_err(|_| invalid())
}
fn unique<'a>(ids: impl Iterator<Item = &'a EntityId>) -> CoreResult<()> {
    let mut seen = BTreeSet::new();
    for id in ids {
        require(seen.insert(id.as_str()))?;
    }
    Ok(())
}
pub(crate) fn validate(world: &PlayableWorld, input: &PlayableWorldInput) -> CoreResult<()> {
    require(input.generator_version == generation::PLAYABLE_GENERATOR_VERSION)?;
    generation::validate_identity_seed(&input.seed, &input.campaign_id)?;
    let dates = season_dates(input.start_year.get())?;
    require(
        world.leagues.len() == 4
            && world.clubs.len() == 72
            && world.players.len() == 3000
            && world.contracts.len() == 2880
            && world.club_simulation_states.len() == 72
            && world.player_simulation_states.len() == 3000,
    )?;
    unique(
        world
            .leagues
            .iter()
            .map(|r| &r.id)
            .chain(world.clubs.iter().map(|r| &r.id))
            .chain(world.players.iter().map(|r| &r.id))
            .chain(world.contracts.iter().map(|r| &r.id))
            .chain(world.club_simulation_states.iter().map(|r| &r.id))
            .chain(world.player_simulation_states.iter().map(|r| &r.id)),
    )?;
    let leagues = world
        .leagues
        .iter()
        .map(|r| (r.id.as_str(), r))
        .collect::<BTreeMap<_, _>>();
    let clubs = world
        .clubs
        .iter()
        .map(|r| (r.id.as_str(), r))
        .collect::<BTreeMap<_, _>>();
    let players = world
        .players
        .iter()
        .map(|r| (r.id.as_str(), r))
        .collect::<BTreeMap<_, _>>();
    for league in &world.leagues {
        model(crate::validate::validate_league(league))?;
        require(
            league.campaign_id == input.campaign_id
                && league.country_code.is_some()
                && league.tier.is_some(),
        )?;
        require(
            world
                .clubs
                .iter()
                .filter(|c| c.league_id.as_ref() == Some(&league.id))
                .count()
                == 18,
        )?;
    }
    let mut names = BTreeSet::new();
    let mut abbreviations = BTreeSet::new();
    for club in &world.clubs {
        model(crate::validate::validate_club(club))?;
        require(
            club.campaign_id == input.campaign_id
                && club
                    .league_id
                    .as_ref()
                    .is_some_and(|id| leagues.contains_key(id.as_str()))
                && (20..=90).contains(&club.prestige.get())
                && names.insert(&club.name)
                && abbreviations.insert(&club.short_name),
        )?;
    }
    let mut contracts = BTreeMap::new();
    for contract in &world.contracts {
        model(crate::validate::validate_contract(contract))?;
        let player = players
            .get(contract.player_id.as_str())
            .ok_or_else(invalid)?;
        let age = player.reported_age.ok_or_else(invalid)?.get();
        let ability = role_ability(&player.attributes, player.position_group)?.get();
        let tier = settings::tier_for(age, ability);
        let expiry = DateOnly::parse(contract.expires_on.as_deref().ok_or_else(invalid)?)?;
        require(
            contract.campaign_id == input.campaign_id
                && player.club_id.as_ref() == Some(&contract.club_id)
                && clubs.contains_key(contract.club_id.as_str())
                && contract.status == ContractStatus::Active
                && contracts
                    .insert(contract.player_id.as_str(), contract)
                    .is_none(),
        )?;
        require(
            contract.squad_tier == Some(tier)
                && contract.weekly_wage_cents == Some(settings::wage(age, ability, tier)?)
                && contract.starts_on.as_deref() == Some(dates.start_date.as_str())
                && expiry >= dates.end_date
                && expiry.year() - input.start_year.get() <= 4
                && expiry.as_str().ends_with("-06-30"),
        )?;
    }
    let mut profiles = BTreeMap::new();
    let mut keys = BTreeSet::new();
    for profile in &world.player_simulation_states {
        model(crate::validate::validate_player_state(profile))?;
        require(
            profile.campaign_id == input.campaign_id
                && players.contains_key(profile.player_id.as_str())
                && profiles
                    .insert(profile.player_id.as_str(), profile)
                    .is_none()
                && keys.insert(&profile.simulation_key),
        )?;
        require(
            profile.fitness.get() == 100
                && (70..=95).contains(&profile.sharpness.get())
                && profile.injury_until_date.is_none()
                && profile.suspension_matches.get() == 0
                && profile.status == PlayerLife::Active,
        )?;
    }
    let mut free = 0;
    for (index, player) in world.players.iter().enumerate() {
        model(crate::validate::validate_player(player))?;
        require(
            player.campaign_id == input.campaign_id
                && player.positions.len() == 1
                && player.position_group != PositionGroup::Unknown
                && player.birth_date.is_none()
                && player.age_reference_season_ordinal.map(SafeInt::get) == Some(1)
                && player.source == RecordSource::Fictional
                && player.external_source_id.is_none()
                && !player.is_newgen
                && player.nationality_code.is_some(),
        )?;
        let age = player.reported_age.ok_or_else(invalid)?.get();
        require((16..=38).contains(&age))?;
        let ability = role_ability(&player.attributes, player.position_group)?.get();
        let potential = player.potential.ok_or_else(invalid)?.get();
        require(
            (ability..=(ability + settings::potential_spread(age)).min(100)).contains(&potential)
                && player.market_value_cents == Some(settings::value(age, ability, potential)?),
        )?;
        let profile = profiles.get(player.id.as_str()).ok_or_else(invalid)?;
        require(profile.simulation_key == generation::player_key(index + 1))?;
        require(
            profile.goalkeeping
                == if player.position_group == PositionGroup::Gk {
                    Some(crate::ability::goalkeeper_rating(&player.attributes)?)
                } else {
                    None
                },
        )?;
        let prestige = match &player.club_id {
            None => {
                free += 1;
                require(
                    !contracts.contains_key(player.id.as_str())
                        && !profile.homegrown_club
                        && !profile.homegrown_nation,
                )?;
                55
            }
            Some(club_id) => {
                let club = clubs.get(club_id.as_str()).ok_or_else(invalid)?;
                require(contracts.contains_key(player.id.as_str()))?;
                let country =
                    &leagues[club.league_id.as_ref().ok_or_else(invalid)?.as_str()].country_code;
                require(profile.homegrown_nation == (player.nationality_code == *country))?;
                club.prestige.get()
            }
        };
        let attrs = [
            player.attributes.pace,
            player.attributes.finishing,
            player.attributes.passing,
            player.attributes.dribbling,
            player.attributes.defending,
            player.attributes.physical,
        ];
        for (rating, (floor, ceiling)) in attrs
            .into_iter()
            .zip(settings::attribute_windows(player.position_group)?)
        {
            let start = floor + (ceiling - floor - 24) * prestige / 100;
            require((start..=start + 24).contains(&rating.ok_or_else(invalid)?.get()))?;
        }
    }
    require(free == 120)?;
    let mut states = BTreeMap::new();
    let mut keys = BTreeSet::new();
    for state in &world.club_simulation_states {
        require(
            state.campaign_id == input.campaign_id
                && clubs.contains_key(state.club_id.as_str())
                && states.insert(state.club_id.as_str(), state).is_none()
                && keys.insert(&state.simulation_key),
        )?;
    }
    for (index, club) in world.clubs.iter().enumerate() {
        let roster = world
            .players
            .iter()
            .filter(|p| p.club_id.as_ref() == Some(&club.id))
            .collect::<Vec<_>>();
        require(
            roster.len() == settings::roster_size(index)
                && roster
                    .iter()
                    .filter(|p| p.reported_age.is_some_and(|a| a.get() >= 21))
                    .count()
                    >= 25,
        )?;
        let commitment = world
            .contracts
            .iter()
            .filter(|c| c.club_id == club.id)
            .try_fold(0_i64, |total, c| {
                checked_add(total, c.weekly_wage_cents.ok_or_else(invalid)?.get())
            })?;
        let state = states.get(club.id.as_str()).ok_or_else(invalid)?;
        require(
            state.simulation_key == generation::club_key(index + 1)?
                && state.transfer_balance_cents == settings::transfer_balance(club.prestige.get())?
                && state.wage_budget_weekly_cents == settings::wage_budget(commitment)?
                && state.wage_budget_weekly_cents.get() > commitment,
        )?;
        validate_opening_roster(&roster, &profiles, &input.campaign_id, &dates.start_date)?;
    }
    Ok(())
}

fn validate_opening_roster(
    roster: &[&PlayerRow],
    profiles: &BTreeMap<&str, &PlayerSimulationStateRow>,
    campaign: &EntityId,
    start: &DateOnly,
) -> CoreResult<()> {
    // Reserved opening slots are 20 seniors with 2 GK / 6 DEF / 7 MID / 5 FWD.
    // Use the real policy and lineup checks, rather than treating raw counts as readiness.
    let opening = &roster[..20];
    require(
        opening
            .iter()
            .all(|p| p.reported_age.is_some_and(|age| age.get() >= 21)),
    )?;
    let players = opening
        .iter()
        .map(|player| {
            let profile = profiles[player.id.as_str()];
            RegistrationPlayer {
                player_id: player.id.clone(),
                status: RegistrationStatus::Registered,
                homegrown_club: Some(profile.homegrown_club),
                homegrown_nation: Some(profile.homegrown_nation),
                age_exempt: Some(false),
                age: player.reported_age,
            }
        })
        .collect::<Vec<_>>();
    for preset in [Preset::Balanced, Preset::Strict] {
        let constitution = ConstitutionRow {
            id: EntityId::new("opening-readiness")?,
            campaign_id: campaign.clone(),
            version: SafeInt::new(1)?,
            rules: constitution_preset(preset),
            updated_at: format!("{}T00:00:00.000Z", start.as_str()),
        };
        let action = PolicyAction::Registration {
            competition_key: "league".into(),
            players: players.clone(),
        };
        require(
            evaluate_action(
                &action,
                &PolicySnapshot {
                    revision: SafeInt::new(0)?,
                    remaining_capacity_cents: None,
                },
                &constitution,
                start,
            )?
            .allowed,
        )?;
    }
    let roster_ids = roster.iter().map(|p| p.id.as_str()).collect::<Vec<_>>();
    for formation in [
        Formation::F433,
        Formation::F4231,
        Formation::F442,
        Formation::F352,
    ] {
        let mut used = BTreeSet::new();
        let mut starters = Vec::new();
        for (slot, group) in formation_slots(formation) {
            let player = opening
                .iter()
                .find(|p| p.position_group == *group && !used.contains(p.id.as_str()))
                .ok_or_else(invalid)?;
            used.insert(player.id.as_str());
            starters.push(LineupStarter {
                player_id: player.id.clone(),
                slot: (*slot).into(),
                role: None,
            });
        }
        let bench = opening
            .iter()
            .filter(|p| !used.contains(p.id.as_str()))
            .take(7)
            .map(|p| p.id.as_str().into())
            .collect::<Vec<_>>();
        require(bench.len() == 7)?;
        require(
            lineup_problems(
                &LineupDraft {
                    name: "Opening readiness".into(),
                    formation,
                    starters,
                    bench_player_ids: bench,
                },
                &roster_ids,
            )
            .is_empty(),
        )?;
    }
    Ok(())
}
