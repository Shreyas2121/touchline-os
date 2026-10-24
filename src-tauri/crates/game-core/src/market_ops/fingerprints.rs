//! Canonical fingerprint material, including replay reconstruction.
use super::context::{club_key, invalid, loaded, player_key, tier_name, validate_clock};
use super::planning::{plan_slots, tick_seed, Slot};
use super::types::MarketCommand;
use crate::calendar::market_key;
use crate::market::MARKET_ENGINE_VERSION;
use crate::{CampaignRow, CommandError, EntityId, SafeInt, SnapshotTables};

fn identities(slots: &[Slot]) -> Vec<(String, String, i64, i64, String, String, i64)> {
    let mut rows = slots
        .iter()
        .map(|slot| {
            (
                slot.buyer_key.clone(),
                slot.player_key.clone(),
                slot.fee,
                slot.wage,
                tier_name(slot.tier).to_owned(),
                if slot.settle { "settle" } else { "offer" }.to_owned(),
                slot.valuation,
            )
        })
        .collect::<Vec<_>>();
    rows.sort();
    rows
}

fn stored_identities(
    tables: &SnapshotTables,
    campaign: &CampaignRow,
    date: &str,
    seed: i64,
) -> Vec<(String, String, i64, i64, String, String, i64)> {
    let mut rows = Vec::new();
    for negotiation in tables.negotiations.iter().filter(|row| {
        row.campaign_id == campaign.id && row.opened_on == date && row.event_seed.get() == seed
    }) {
        let Some(buyer) = tables
            .club_simulation_states
            .iter()
            .find(|row| row.campaign_id == campaign.id && row.club_id == negotiation.buyer_club_id)
        else {
            continue;
        };
        let Some(player) = tables
            .player_simulation_states
            .iter()
            .find(|row| row.campaign_id == campaign.id && row.player_id == negotiation.player_id)
        else {
            continue;
        };
        let offer = tables.offers.iter().any(|offer| {
            offer.campaign_id == campaign.id
                && offer.negotiation_id.as_ref() == Some(&negotiation.id)
        });
        let valuation = negotiation
            .qualification
            .as_ref()
            .map(|row| row.valuation_cents.get())
            .unwrap_or(0);
        rows.push((
            buyer.simulation_key.clone(),
            player.simulation_key.clone(),
            negotiation.fee_cents.get(),
            negotiation.wage_cents.get(),
            tier_name(negotiation.squad_tier).to_owned(),
            if offer { "offer" } else { "settle" }.to_owned(),
            valuation,
        ));
    }
    rows.sort();
    rows
}

pub fn material(tables: &SnapshotTables, command: &MarketCommand) -> Result<String, CommandError> {
    match command {
        MarketCommand::Run(request) => {
            validate_clock(
                &request.source_date,
                &request.source_boundary_key,
                &request.now,
                request.expected_revision,
            )?;
            let (campaign, season, clock) = loaded(tables, &request.campaign_id)?;
            let operation = market_key(season.id.as_str(), &request.source_date);
            let seed = tick_seed(clock, season, &request.source_date)?;
            let proposals = if tables
                .simulation_receipts
                .iter()
                .any(|row| row.campaign_id == campaign.id && row.operation_key == operation)
            {
                stored_identities(tables, campaign, &request.source_date, seed)
            } else {
                identities(&plan_slots(tables, &request.campaign_id)?)
            };
            serde_json::to_string(&(
                "market",
                campaign.id.as_str(),
                request.expected_revision.get(),
                request.source_date.as_str(),
                request.source_boundary_key.as_deref(),
                MARKET_ENGINE_VERSION,
                clock.root_seed.as_str(),
                proposals,
            ))
            .map_err(|_| invalid("Market input could not be encoded."))
        }
        MarketCommand::Close(request) => simple_material(
            tables,
            &request.campaign_id,
            request.expected_revision,
            &request.source_date,
            &request.source_boundary_key,
            &request.now,
            "close",
        ),
        MarketCommand::Propose(request) => {
            let (campaign, _, clock) = loaded(tables, &request.campaign_id)?;
            let player = player_key(tables, &campaign.id, &request.player_id)?;
            let buyer = club_key(tables, &campaign.id, &campaign.managed_club_id)?;
            serde_json::to_string(&(
                "proposal",
                campaign.id.as_str(),
                request.expected_revision.get(),
                request.source_date.as_str(),
                request.source_boundary_key.as_deref(),
                MARKET_ENGINE_VERSION,
                clock.root_seed.as_str(),
                buyer,
                player,
                request.fee_cents.get(),
                request.wage_cents.get(),
                tier_name(request.squad_tier),
            ))
            .map_err(|_| invalid("Proposal input could not be encoded."))
        }
        MarketCommand::RespondNegotiation(request) => simple_material(
            tables,
            &request.campaign_id,
            request.expected_revision,
            &request.source_date,
            &request.source_boundary_key,
            &request.now,
            &format!("respond:{}", request.negotiation_id.as_str()),
        ),
        MarketCommand::RejectOffer(request) => simple_material(
            tables,
            &request.campaign_id,
            request.expected_revision,
            &request.source_date,
            &request.source_boundary_key,
            &request.now,
            &format!("reject:{}", request.offer_id.as_str()),
        ),
    }
}

fn simple_material(
    tables: &SnapshotTables,
    campaign_id: &EntityId,
    revision: SafeInt,
    date: &str,
    boundary: &Option<String>,
    now: &str,
    kind: &str,
) -> Result<String, CommandError> {
    validate_clock(date, boundary, now, revision)?;
    let (campaign, _, clock) = loaded(tables, campaign_id)?;
    serde_json::to_string(&(
        kind,
        campaign.id.as_str(),
        revision.get(),
        date,
        boundary.as_deref(),
        MARKET_ENGINE_VERSION,
        clock.root_seed.as_str(),
    ))
    .map_err(|_| invalid("Market input could not be encoded."))
}
