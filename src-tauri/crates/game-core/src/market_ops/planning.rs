//! Pure market inputs and ordered proposals; no authoritative writes.
use super::context::{
    club_by_key, constitution, core, deadline_on, invalid, loaded, money, number, open_status,
    player_by_key, rule_of, zero,
};
use super::window::{expire_noncompulsory, offer_still_qualifies};
use crate::ability::role_ability;
use crate::calendar::market_key;
use crate::dates::DateOnly;
use crate::finance::wage_commitment;
use crate::market::plan_openings;
use crate::market::resolve_terms;
use crate::market::Agreement;
use crate::market::MarketClub;
use crate::market::MarketPlayer;
use crate::market::MarketSeedInputs;
use crate::market::TermProposal;
use crate::market::MARKET_ENGINE_VERSION;
use crate::policy::Qualification;
use crate::random::derive_event_seed;
use crate::random::EventKind;
use crate::settlement;
use crate::settlement::MovementIds;
use crate::{
    CampaignRow, CommandError, ContractStatus, EntityId, NegotiationQualification, NegotiationRow,
    NegotiationStatus, PlayerLife, SeasonRow, SimulationStateRow, SnapshotTables, SquadTier,
    VersionOne,
};
use std::collections::BTreeMap;
use std::collections::BTreeSet;

pub(super) struct Slot {
    pub(super) buyer_key: String,
    pub(super) player_key: String,
    pub(super) buyer_id: EntityId,
    pub(super) seller_id: Option<EntityId>,
    pub(super) player_id: EntityId,
    pub(super) fee: i64,
    pub(super) wage: i64,
    pub(super) tier: SquadTier,
    pub(super) valuation: i64,
    pub(super) buyer_prestige: i64,
    pub(super) seller_prestige: i64,
    pub(super) counter_count: i64,
    pub(super) compulsory: bool,
    pub(super) settle: bool,
    pub(super) needs_ledger: bool,
    pub(super) needs_registration: bool,
}

fn market_players(
    tables: &SnapshotTables,
    campaign: &CampaignRow,
    season: &SeasonRow,
    today: &DateOnly,
) -> Result<Vec<MarketPlayer>, CommandError> {
    let mut minutes = BTreeMap::<String, (i64, i64, i64)>::new();
    for appearance in tables
        .simulated_appearances
        .iter()
        .filter(|row| row.campaign_id == campaign.id)
    {
        let in_season = tables.fixtures.iter().any(|fixture| {
            fixture.id == appearance.fixture_id
                && fixture.campaign_id == campaign.id
                && fixture.season_id == season.id
        });
        if !in_season {
            continue;
        }
        let entry = minutes
            .entry(appearance.player_id.as_str().to_owned())
            .or_insert((0, 0, 0));
        entry.0 += appearance.minutes.get();
        entry.1 += appearance.rating.get();
        entry.2 += 1;
    }
    let mut players = Vec::new();
    for player in tables
        .players
        .iter()
        .filter(|row| row.campaign_id == campaign.id)
    {
        let Some(sim) = tables.player_simulation_states.iter().find(|row| {
            row.campaign_id == campaign.id
                && row.player_id == player.id
                && row.status == PlayerLife::Active
        }) else {
            continue;
        };
        let age = if let Some(birth) = &player.birth_date {
            let birth = DateOnly::parse(birth).map_err(invalid)?;
            crate::dates::age_in_whole_years(&birth, today).map_err(core)?
        } else if let Some(reported) = player.reported_age {
            reported.get()
        } else {
            continue;
        };
        if !(16..=38).contains(&age) {
            continue;
        }
        let Ok(ability) = role_ability(&player.attributes, player.position_group) else {
            continue;
        };
        let Some(market_value) = player.market_value_cents else {
            continue;
        };
        let contract = tables.contracts.iter().find(|row| {
            row.campaign_id == campaign.id
                && row.player_id == player.id
                && row.status == ContractStatus::Active
        });
        let (seller_key, seller_prestige) = if let Some(club_id) = &player.club_id {
            let state = tables
                .club_simulation_states
                .iter()
                .find(|row| row.campaign_id == campaign.id && &row.club_id == club_id);
            let club = tables
                .clubs
                .iter()
                .find(|row| row.campaign_id == campaign.id && &row.id == club_id);
            match (state, club) {
                (Some(state), Some(club)) => (
                    Some(state.simulation_key.clone()),
                    Some(club.prestige.get()),
                ),
                _ => continue,
            }
        } else if contract.is_some() {
            continue;
        } else {
            (None, None)
        };
        let (season_minutes, rating_sum, appearance_count) = minutes
            .get(player.id.as_str())
            .copied()
            .unwrap_or((0, 0, 0));
        players.push(MarketPlayer {
            simulation_key: sim.simulation_key.clone(),
            position_group: player.position_group,
            age: Some(age),
            ability: Some(ability.get()),
            market_value_cents: Some(market_value.get()),
            seller_simulation_key: seller_key,
            seller_prestige,
            current_wage_cents: contract
                .and_then(|row| row.weekly_wage_cents)
                .map(|wage| wage.get()),
            current_tier: contract.and_then(|row| row.squad_tier),
            season_minutes,
            rating_sum,
            appearance_count,
        });
    }
    Ok(players)
}

fn market_clubs(
    tables: &SnapshotTables,
    campaign: &CampaignRow,
    players: &[MarketPlayer],
) -> Result<Vec<MarketClub>, CommandError> {
    let managed = tables
        .club_simulation_states
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.club_id == campaign.managed_club_id)
        .map(|row| row.simulation_key.clone())
        .ok_or_else(|| invalid("Managed club simulation key is missing."))?;
    let mut clubs = Vec::new();
    for state in tables
        .club_simulation_states
        .iter()
        .filter(|row| row.campaign_id == campaign.id)
    {
        if state.simulation_key == managed {
            continue;
        }
        let wages =
            wage_commitment(&tables.contracts, &campaign.id, &state.club_id).map_err(core)?;
        if wages.unknown_count > 0 {
            continue;
        }
        let (reserved_fee, reserved_wage, open_buys) = tables
            .negotiations
            .iter()
            .filter(|row| {
                row.campaign_id == campaign.id
                    && row.buyer_club_id == state.club_id
                    && open_status(row.status)
            })
            .fold((0_i64, 0_i64, 0_i64), |total, row| {
                (
                    total.0 + row.reserved_cents.get(),
                    total.1 + row.reserved_wage_cents.get(),
                    total.2 + 1,
                )
            });
        let spendable = (state.transfer_balance_cents.get() - reserved_fee).max(0);
        let wage_room =
            (state.wage_budget_weekly_cents.get() - wages.known_cents - reserved_wage).max(0);
        let _ = players;
        clubs.push(MarketClub {
            simulation_key: state.simulation_key.clone(),
            prestige: tables
                .clubs
                .iter()
                .find(|club| club.campaign_id == campaign.id && club.id == state.club_id)
                .map(|club| club.prestige.get())
                .unwrap_or(0),
            spendable_cents: spendable,
            wage_room_cents: wage_room,
            open_buy_count: open_buys,
        });
    }
    Ok(clubs)
}

pub(super) fn plan_slots(
    tables: &SnapshotTables,
    campaign_id: &EntityId,
) -> Result<Vec<Slot>, CommandError> {
    let mut scratch = tables.clone();
    let campaign_for_expiry = loaded(&scratch, campaign_id)?.0.id.clone();
    let today_for_expiry = loaded(&scratch, campaign_id)?.2.current_date.clone();
    expire_noncompulsory(&mut scratch, &campaign_for_expiry, &today_for_expiry, true);
    let (campaign, season, clock) = loaded(&scratch, campaign_id)?;
    let campaign = campaign.clone();
    let season = season.clone();
    let root_seed = clock.root_seed.clone();
    let current_date = clock.current_date.clone();
    let today = DateOnly::parse(&current_date).map_err(invalid)?;
    let players = market_players(&scratch, &campaign, &season, &today)?;
    let clubs = market_clubs(&scratch, &campaign, &players)?;
    let managed = scratch
        .club_simulation_states
        .iter()
        .find(|row| row.campaign_id == campaign.id && row.club_id == campaign.managed_club_id)
        .ok_or_else(|| invalid("Managed club simulation key is missing."))?
        .simulation_key
        .clone();
    let constitution = constitution(&scratch, &campaign.id)?;
    let qualifying = rule_of(constitution);
    let version = constitution.version;
    let mut compulsory = BTreeSet::new();
    for offer in scratch
        .offers
        .iter()
        .filter(|offer| offer.campaign_id == campaign.id)
    {
        if offer_still_qualifies(offer, constitution)? {
            if let Some(player) = scratch
                .player_simulation_states
                .iter()
                .find(|row| row.campaign_id == campaign.id && row.player_id == offer.player_id)
            {
                compulsory.insert(player.simulation_key.clone());
            }
        }
    }
    let mut open_pairs = BTreeSet::new();
    for negotiation in scratch
        .negotiations
        .iter()
        .filter(|row| row.campaign_id == campaign.id && open_status(row.status))
    {
        let buyer = scratch
            .club_simulation_states
            .iter()
            .find(|row| row.campaign_id == campaign.id && row.club_id == negotiation.buyer_club_id);
        let player = scratch
            .player_simulation_states
            .iter()
            .find(|row| row.campaign_id == campaign.id && row.player_id == negotiation.player_id);
        if let (Some(buyer), Some(player)) = (buyer, player) {
            open_pairs.insert((buyer.simulation_key.clone(), player.simulation_key.clone()));
        }
    }
    let operation = market_key(season.id.as_str(), today.as_str());
    let bids = plan_openings(
        &clubs,
        &players,
        &managed,
        &MarketSeedInputs {
            root_seed,
            operation_key: operation,
            stream_version: MARKET_ENGINE_VERSION.into(),
        },
        qualifying,
        &compulsory,
        &open_pairs,
    )
    .map_err(core)?;
    let mut slots = Vec::new();
    for (index, bid) in bids.into_iter().enumerate() {
        let Some(player) = players
            .iter()
            .find(|row| row.simulation_key == bid.player_key)
        else {
            continue;
        };
        let seller_managed = player.seller_simulation_key.as_deref() == Some(managed.as_str());
        let current_wage = player.current_wage_cents.unwrap_or(bid.wage_cents);
        let buyer = clubs
            .iter()
            .find(|club| club.simulation_key == bid.buyer_key);
        let Some(buyer_club) = buyer else { continue };
        let agreement = resolve_terms(TermProposal {
            fee_cents: bid.fee_cents,
            wage_cents: bid.wage_cents,
            tier: bid.tier,
            valuation_cents: bid.valuation_cents,
            current_wage_cents: current_wage,
            current_tier: player.current_tier,
            seller_is_managed: seller_managed,
            buyer_is_ai: true,
            spendable_cents: buyer_club.spendable_cents,
            wage_room_cents: buyer_club.wage_room_cents,
        })
        .map_err(core)?;
        let Agreement::Agreed {
            fee_cents,
            wage_cents,
            tier,
            counter_count,
        } = agreement
        else {
            continue;
        };
        if fee_cents > buyer_club.spendable_cents || wage_cents > buyer_club.wage_room_cents {
            continue;
        }
        let seller_prestige = player.seller_prestige.unwrap_or(0);
        let compulsory_bid = seller_managed
            && qualifying.is_some_and(|rule| {
                crate::policy::offer_qualifies(
                    money(fee_cents).unwrap_or(zero()),
                    Some(money(bid.valuation_cents).unwrap_or(zero())),
                    Some(number(buyer_club.prestige).unwrap_or(number(0).unwrap())),
                    Some(number(seller_prestige).unwrap_or(number(0).unwrap())),
                    rule,
                )
                .ok()
                    == Some(Qualification::Qualifies)
            });
        if compulsory_bid
            && (fee_cents > buyer_club.spendable_cents || wage_cents > buyer_club.wage_room_cents)
        {
            continue;
        }
        let buyer_id = club_by_key(&scratch, &campaign.id, &bid.buyer_key)?
            .club_id
            .clone();
        let player_id = player_by_key(&scratch, &campaign.id, &bid.player_key)?
            .player_id
            .clone();
        let seller_id = player
            .seller_simulation_key
            .as_deref()
            .map(|key| club_by_key(&scratch, &campaign.id, key).map(|row| row.club_id.clone()))
            .transpose()?;
        let negotiation_id = EntityId::new(format!("tick-negotiation-{index:02}")).map_err(core)?;
        let deadline = deadline_on(&today)?;
        let end = season
            .end_date
            .clone()
            .ok_or_else(|| invalid("Season end is missing."))?;
        scratch.negotiations.push(NegotiationRow {
            id: negotiation_id.clone(),
            campaign_id: campaign.id.clone(),
            season_id: season.id.clone(),
            player_id: player_id.clone(),
            buyer_club_id: buyer_id.clone(),
            seller_club_id: seller_id.clone(),
            status: NegotiationStatus::Agreed,
            fee_cents: money(fee_cents)?,
            reserved_cents: money(fee_cents)?,
            wage_cents: money(wage_cents)?,
            reserved_wage_cents: money(wage_cents)?,
            squad_tier: tier,
            expires_on: end,
            counter_count: number(counter_count)?,
            opened_on: today.as_str().to_owned(),
            deadline_on: deadline,
            resolved_on: None,
            engine_version: VersionOne,
            event_seed: number(i64::from(
                derive_event_seed(
                    &scratch
                        .simulation_states
                        .iter()
                        .find(|row| row.campaign_id == campaign.id)
                        .unwrap()
                        .root_seed,
                    "1",
                    EventKind::Market,
                    &[&market_key(season.id.as_str(), today.as_str())],
                )
                .map_err(core)?,
            ))?,
            qualification: Some(NegotiationQualification {
                fee_cents: money(fee_cents)?,
                valuation_cents: money(bid.valuation_cents)?,
                buyer_prestige: number(buyer_club.prestige)?,
                seller_prestige: number(seller_prestige)?,
                constitution_version: version,
                compulsory: number(i64::from(compulsory_bid))?,
            }),
        });
        let mut needs_ledger = false;
        let mut needs_registration = false;
        if !seller_managed {
            let request = settlement::SettleTransferRequest {
                campaign_id: campaign.id.clone(),
                expected_revision: campaign.revision,
                negotiation_id: negotiation_id.clone(),
                source_date: today.as_str().to_owned(),
                source_boundary_key: scratch
                    .simulation_states
                    .iter()
                    .find(|row| row.campaign_id == campaign.id)
                    .and_then(|row| row.last_boundary_key.clone()),
                transfer_id: EntityId::new(format!("tick-transfer-{index:02}")).map_err(core)?,
                contract_id: EntityId::new(format!("tick-contract-{index:02}")).map_err(core)?,
                ledger_ids: if fee_cents > 0 {
                    vec![
                        EntityId::new(format!("tick-ledger-{index:02}a")).map_err(core)?,
                        EntityId::new(format!("tick-ledger-{index:02}b")).map_err(core)?,
                    ]
                } else {
                    Vec::new()
                },
                registration_id: None,
                receipt_id: EntityId::new(format!("tick-receipt-{index:02}")).map_err(core)?,
                audit_id: EntityId::new(format!("tick-audit-{index:02}")).map_err(core)?,
                action_id: EntityId::new(format!("tick-action-{index:02}")).map_err(core)?,
                now: "2026-01-01T00:00:00.000Z".into(),
            };
            let plan = match settlement::settlement_plan(&scratch, &request) {
                Ok(plan) => plan,
                Err(_) => {
                    scratch.negotiations.pop();
                    continue;
                }
            };
            needs_ledger = plan.needs_ledger;
            needs_registration = plan
                .registration
                .as_ref()
                .is_some_and(|row| row.existing_id.is_none());
            let mut ids = MovementIds {
                transfer_id: request.transfer_id.clone(),
                contract_id: request.contract_id.clone(),
                ledger_ids: request.ledger_ids.clone(),
                registration_id: if needs_registration {
                    Some(EntityId::new(format!("tick-registration-{index:02}")).map_err(core)?)
                } else {
                    None
                },
                action_id: request.action_id.clone(),
                now: request.now.clone(),
            };
            if needs_registration {
                request_registration(&mut ids);
            }
            if settlement::apply_movement(&mut scratch, &plan, &ids).is_err() {
                return Err(invalid("The market tick could not reserve a bid."));
            }
        }
        slots.push(Slot {
            buyer_key: bid.buyer_key,
            player_key: bid.player_key,
            buyer_id,
            seller_id,
            player_id,
            fee: fee_cents,
            wage: wage_cents,
            tier,
            valuation: bid.valuation_cents,
            buyer_prestige: buyer_club.prestige,
            seller_prestige,
            counter_count,
            compulsory: compulsory_bid,
            settle: !seller_managed,
            needs_ledger,
            needs_registration,
        });
    }
    Ok(slots)
}

fn request_registration(ids: &mut MovementIds) {
    let _ = ids;
}

pub(super) fn tick_seed(
    clock: &SimulationStateRow,
    season: &SeasonRow,
    date: &str,
) -> Result<i64, CommandError> {
    Ok(i64::from(
        derive_event_seed(
            &clock.root_seed,
            "1",
            EventKind::Market,
            &[&market_key(season.id.as_str(), date)],
        )
        .map_err(core)?,
    ))
}
