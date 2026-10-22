use crate::{
    ability::role_ability,
    calendar::season_dates,
    dates::DateOnly,
    fictional_names as names, generation_settings as settings,
    money::checked_add,
    random::{create_event_stream, EventKind, Mulberry32},
    *,
};
use serde::{Deserialize, Serialize};

pub const PLAYABLE_GENERATOR_VERSION: &str = "2";
pub const LEAGUE_COUNT: usize = 4;
pub const CLUB_COUNT: usize = 72;
pub const OWNED_PLAYER_COUNT: usize = 2880;
pub const FREE_AGENT_COUNT: usize = 120;
pub const PLAYER_COUNT: usize = 3000;
pub const MAX_CAMPAIGN_ID_LENGTH: usize = 64 - "-player-state-3000".len();

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayableWorldInput {
    pub seed: String,
    pub generator_version: String,
    pub campaign_id: EntityId,
    pub start_year: SafeInt,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlayableWorld {
    pub leagues: Vec<LeagueRow>,
    pub clubs: Vec<ClubRow>,
    pub players: Vec<PlayerRow>,
    pub contracts: Vec<ContractRow>,
    pub club_simulation_states: Vec<ClubSimulationStateRow>,
    pub player_simulation_states: Vec<PlayerSimulationStateRow>,
}
pub(crate) fn validate_identity_seed(seed: &str, campaign: &EntityId) -> CoreResult<()> {
    if seed.is_empty() || crate::js_trim(seed) != seed || seed.encode_utf16().count() > 120 {
        return Err(CoreError::Invalid(
            "Seed must contain 1–120 characters without surrounding whitespace.",
        ));
    }
    if campaign.as_str().len() > MAX_CAMPAIGN_ID_LENGTH {
        return Err(CoreError::Invalid(
            "Campaign identity leaves insufficient room for generated IDs.",
        ));
    }
    Ok(())
}
pub(crate) fn persistence_id(
    campaign: &EntityId,
    kind: &str,
    number: usize,
) -> CoreResult<EntityId> {
    let suffix = match kind {
        "league" => format!("league-{number}"),
        "club" | "club-state" => format!("{kind}-{number:02}"),
        _ => format!("{kind}-{number:04}"),
    };
    EntityId::new(format!("{}-{suffix}", campaign.as_str()))
}
pub fn club_key(number: usize) -> CoreResult<String> {
    if !(1..=CLUB_COUNT).contains(&number) {
        return Err(CoreError::Invalid("Choose a club from this world."));
    }
    Ok(format!("club:{number:02}"))
}
pub(crate) fn player_key(number: usize) -> String {
    format!("player:{number:04}")
}
pub fn generate_playable_world(input: &PlayableWorldInput) -> CoreResult<PlayableWorld> {
    if input.generator_version != PLAYABLE_GENERATOR_VERSION {
        return Err(CoreError::Invalid(
            "Unsupported playable generator version.",
        ));
    }
    validate_identity_seed(&input.seed, &input.campaign_id)?;
    season_dates(input.start_year.get())?;
    let world = build_world(
        &input.seed,
        &input.campaign_id,
        input.start_year.get(),
        PLAYABLE_GENERATOR_VERSION,
    )?;
    validate_playable_world(&world, input)?;
    Ok(world)
}
pub fn validate_playable_world(
    world: &PlayableWorld,
    input: &PlayableWorldInput,
) -> CoreResult<()> {
    crate::world_validation::validate(world, input)
}
pub fn market_value_cents(age: i64, ability: i64, potential: i64) -> CoreResult<MoneyCents> {
    settings::value(age, ability, potential)
}
pub fn weekly_wage_cents(age: i64, ability: i64, tier: SquadTier) -> CoreResult<MoneyCents> {
    settings::wage(age, ability, tier)
}

fn draw(rng: &mut Mulberry32, span: usize) -> CoreResult<usize> {
    Ok(rng.next_int(span as i64)? as usize)
}
fn draw_name(rng: &mut Mulberry32) -> CoreResult<String> {
    let syllables = 2 + draw(rng, 2)?;
    let mut given = String::new();
    for _ in 0..syllables {
        given.push_str(names::GIVEN[draw(rng, names::GIVEN.len())?]);
    }
    let family = names::FAMILY[draw(rng, names::FAMILY.len())?];
    let capitalize = |word: &str| format!("{}{}", word[..1].to_ascii_uppercase(), &word[1..]);
    Ok(format!("{} {}", capitalize(&given), capitalize(family)))
}
fn draw_attributes(
    rng: &mut Mulberry32,
    group: PositionGroup,
    prestige: i64,
) -> CoreResult<PlayerAttributes> {
    let mut ratings = [None; 6];
    for (index, (floor, ceiling)) in settings::attribute_windows(group)?.into_iter().enumerate() {
        let start = floor + (ceiling - floor - 24) * prestige / 100;
        ratings[index] = Some(SafeInt::new(start + draw(rng, 25)? as i64)?);
    }
    let [pace, finishing, passing, dribbling, defending, physical] = ratings;
    Ok(PlayerAttributes {
        pace,
        finishing,
        passing,
        dribbling,
        defending,
        physical,
    })
}

fn build_world(
    seed: &str,
    campaign: &EntityId,
    year: i64,
    version: &str,
) -> CoreResult<PlayableWorld> {
    let mut rng = create_event_stream(
        seed,
        "1",
        EventKind::World,
        &[&format!("native-world:{version}")],
    )?;
    let dates = season_dates(year)?;
    let leagues = names::LEAGUES
        .iter()
        .enumerate()
        .map(|(index, (name, country))| {
            Ok(LeagueRow {
                id: persistence_id(campaign, "league", index + 1)?,
                campaign_id: campaign.clone(),
                name: (*name).into(),
                country_code: Some((*country).into()),
                tier: Some(SafeInt::new(index as i64 + 1)?),
            })
        })
        .collect::<CoreResult<Vec<_>>>()?;
    let mut clubs = Vec::with_capacity(CLUB_COUNT);
    for index in 0..CLUB_COUNT {
        let (name, short_name) = names::club_name(index);
        let palette = names::PALETTES[draw(&mut rng, names::PALETTES.len())?];
        clubs.push(ClubRow {
            id: persistence_id(campaign, "club", index + 1)?,
            campaign_id: campaign.clone(),
            league_id: Some(leagues[index / 18].id.clone()),
            name,
            short_name,
            colors: ClubColors {
                primary: palette.0.into(),
                secondary: palette.1.into(),
            },
            prestige: SafeInt::new(20 + draw(&mut rng, 71)? as i64)?,
            academy_tier: SafeInt::new(1 + draw(&mut rng, 5)? as i64)?,
            scouting_region: Some(names::REGIONS[draw(&mut rng, names::REGIONS.len())?].into()),
        });
    }
    let mut assignments = Vec::with_capacity(PLAYER_COUNT);
    for club_index in 0..CLUB_COUNT {
        for local in 0..settings::roster_size(club_index) {
            assignments.push(Some((club_index, local)));
        }
    }
    if assignments.len() != OWNED_PLAYER_COUNT {
        return Err(CoreError::Invalid("Invalid owned roster schedule."));
    }
    assignments.extend(std::iter::repeat_n(None, FREE_AGENT_COUNT));
    let mut players = Vec::with_capacity(PLAYER_COUNT);
    let mut contracts = Vec::with_capacity(OWNED_PLAYER_COUNT);
    let mut profiles = Vec::with_capacity(PLAYER_COUNT);
    let mut wages = [0_i64; CLUB_COUNT];
    for (index, assignment) in assignments.into_iter().enumerate() {
        let number = index + 1;
        let club = assignment.map(|(club, _)| &clubs[club]);
        let position = match assignment {
            Some((_, local)) if local < settings::GUARANTEED.len() => settings::GUARANTEED[local],
            _ => settings::EXTRA_POSITIONS[draw(&mut rng, settings::EXTRA_POSITIONS.len())?],
        };
        let group = position_group_for(position);
        let nationality = names::NATIONALITIES[draw(&mut rng, names::NATIONALITIES.len())?];
        let senior = assignment.is_some_and(|(_, local)| local < 25);
        let age = if senior {
            21 + draw(&mut rng, 14)? as i64
        } else {
            16 + draw(&mut rng, 23)? as i64
        };
        let attributes =
            draw_attributes(&mut rng, group, club.map_or(55, |club| club.prestige.get()))?;
        let ability = role_ability(&attributes, group)?.get();
        let potential = ability
            + draw(
                &mut rng,
                (100 - ability).min(settings::potential_spread(age)) as usize + 1,
            )? as i64;
        let sharpness = SafeInt::new(70 + draw(&mut rng, 26)? as i64)?;
        let tier = settings::tier_for(age, ability);
        let wage = settings::wage(age, ability, tier)?;
        let player_id = persistence_id(campaign, "player", number)?;
        if let Some((club_index, _)) = assignment {
            let seasons = 1 + draw(&mut rng, (2199 - year).min(4) as usize)? as i64;
            contracts.push(ContractRow {
                id: persistence_id(campaign, "contract", number)?,
                campaign_id: campaign.clone(),
                player_id: player_id.clone(),
                club_id: clubs[club_index].id.clone(),
                weekly_wage_cents: Some(wage),
                squad_tier: Some(tier),
                starts_on: Some(dates.start_date.as_str().into()),
                expires_on: Some(
                    DateOnly::parse(&format!("{}-06-30", year + seasons))?
                        .as_str()
                        .into(),
                ),
                status: ContractStatus::Active,
            });
            wages[club_index] = checked_add(wages[club_index], wage.get())?;
        }
        let goalkeeping = if group == PositionGroup::Gk {
            Some(crate::ability::goalkeeper_rating(&attributes)?)
        } else {
            None
        };
        players.push(PlayerRow {
            id: player_id.clone(),
            campaign_id: campaign.clone(),
            club_id: club.map(|club| club.id.clone()),
            name: draw_name(&mut rng)?,
            position_group: group,
            positions: vec![position],
            nationality_code: Some(nationality.into()),
            birth_date: None,
            reported_age: Some(SafeInt::new(age)?),
            age_reference_season_ordinal: Some(SafeInt::new(1)?),
            market_value_cents: Some(settings::value(age, ability, potential)?),
            attributes,
            potential: Some(SafeInt::new(potential)?),
            source: RecordSource::Fictional,
            external_source_id: None,
            is_newgen: false,
        });
        profiles.push(PlayerSimulationStateRow {
            id: persistence_id(campaign, "player-state", number)?,
            campaign_id: campaign.clone(),
            player_id,
            simulation_key: player_key(number),
            fitness: SafeInt::new(100)?,
            sharpness,
            goalkeeping,
            injury_until_date: None,
            suspension_matches: SafeInt::new(0)?,
            status: PlayerLife::Active,
            homegrown_club: assignment.is_some_and(|(_, local)| local < 12),
            homegrown_nation: assignment
                .is_some_and(|(club, _)| names::LEAGUES[club / 18].1 == nationality),
        });
    }
    let club_simulation_states = clubs
        .iter()
        .enumerate()
        .map(|(index, club)| {
            Ok(ClubSimulationStateRow {
                id: persistence_id(campaign, "club-state", index + 1)?,
                campaign_id: campaign.clone(),
                club_id: club.id.clone(),
                simulation_key: club_key(index + 1)?,
                transfer_balance_cents: settings::transfer_balance(club.prestige.get())?,
                wage_budget_weekly_cents: settings::wage_budget(wages[index])?,
            })
        })
        .collect::<CoreResult<Vec<_>>>()?;
    Ok(PlayableWorld {
        leagues,
        clubs,
        players,
        contracts,
        club_simulation_states,
        player_simulation_states: profiles,
    })
}
