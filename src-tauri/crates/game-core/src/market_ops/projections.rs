//! Read-only market previews and transfer-board projection.
use super::context::{constitution, invalid, loaded, number, open_status};
use super::planning::plan_slots;
use super::types::{
    CompletedTransferView, IncomingOfferView, MarketAction, MarketPreview, OutgoingNegotiationView,
    TransferBoard,
};
use super::window::{offer_still_qualifies, window_is_blocked};
use crate::calendar;
use crate::calendar::MarketDue;
use crate::calendar::ACCEPT_QUALIFYING_OFFER;
use crate::dates::DateOnly;
use crate::settlement;
use crate::{
    CommandError, EntityId, NegotiationRow, NegotiationStatus, OfferStatus, SnapshotTables,
};

fn name_of(tables: &SnapshotTables, campaign: &EntityId, id: &EntityId, club: bool) -> String {
    if club {
        tables
            .clubs
            .iter()
            .find(|row| &row.campaign_id == campaign && &row.id == id)
            .map(|row| row.name.clone())
            .unwrap_or_else(|| "Unknown club".into())
    } else {
        tables
            .players
            .iter()
            .find(|row| &row.campaign_id == campaign && &row.id == id)
            .map(|row| row.name.clone())
            .unwrap_or_else(|| "Unknown player".into())
    }
}

pub fn preview(
    tables: &SnapshotTables,
    campaign_id: &EntityId,
) -> Result<MarketPreview, CommandError> {
    let (campaign, _, clock) = loaded(tables, campaign_id)?;
    let due = calendar::market_due(
        clock,
        tables
            .seasons
            .iter()
            .find(|row| row.id == campaign.active_season_id)
            .ok_or_else(|| invalid("Active season not found."))?,
    )
    .map_err(invalid)?;
    let mut view = MarketPreview {
        campaign_id: campaign.id.clone(),
        revision: campaign.revision,
        from_date: clock.current_date.clone(),
        source_boundary_key: clock.last_boundary_key.clone(),
        action: MarketAction::None,
        allowed: false,
        reason: None,
        negotiation_count: number(0)?,
        offer_count: number(0)?,
        transfer_count: number(0)?,
        contract_count: number(0)?,
        ledger_count: number(0)?,
        registration_count: number(0)?,
    };
    match due {
        Some(MarketDue::Tick) => {
            let slots = plan_slots(tables, campaign_id)?;
            view.action = MarketAction::Run;
            view.allowed = true;
            if calendar::transfer_window_on(&DateOnly::parse(&clock.current_date).map_err(invalid)?)
                == Some(calendar::TransferWindow::Winter)
            {
                view.reason = Some(calendar::RUN_MARKET_BEFORE_MATCHDAY.into());
            }
            view.negotiation_count = number(slots.len() as i64)?;
            view.offer_count = number(slots.iter().filter(|slot| !slot.settle).count() as i64)?;
            view.transfer_count = number(slots.iter().filter(|slot| slot.settle).count() as i64)?;
            view.contract_count = view.transfer_count;
            view.ledger_count =
                number(slots.iter().filter(|slot| slot.needs_ledger).count() as i64 * 2)?;
            view.registration_count =
                number(slots.iter().filter(|slot| slot.needs_registration).count() as i64)?;
        }
        Some(MarketDue::Close) => {
            view.action = MarketAction::Close;
            if window_is_blocked(tables, campaign_id)? {
                view.allowed = false;
                view.reason = Some(ACCEPT_QUALIFYING_OFFER.into());
            } else {
                view.allowed = true;
                view.reason = Some(calendar::CLOSE_WINDOW_BEFORE_MATCHDAY.into());
            }
        }
        None => {}
    }
    Ok(view)
}

fn movement_shape(
    tables: &SnapshotTables,
    campaign_id: &EntityId,
    negotiation: &NegotiationRow,
) -> Result<(i64, bool), CommandError> {
    let plan = settlement::settlement_plan(
        tables,
        &settlement::SettleTransferRequest {
            campaign_id: campaign_id.clone(),
            expected_revision: number(0)?,
            negotiation_id: negotiation.id.clone(),
            source_date: "2026-07-01".into(),
            source_boundary_key: None,
            transfer_id: negotiation.id.clone(),
            contract_id: negotiation.id.clone(),
            ledger_ids: Vec::new(),
            registration_id: None,
            receipt_id: negotiation.id.clone(),
            audit_id: negotiation.id.clone(),
            action_id: negotiation.id.clone(),
            now: "2026-01-01T00:00:00.000Z".into(),
        },
    )?;
    Ok((
        if plan.needs_ledger { 2 } else { 0 },
        plan.registration
            .as_ref()
            .is_some_and(|row| row.existing_id.is_none()),
    ))
}

pub fn transfer_board(
    tables: &SnapshotTables,
    campaign_id: &EntityId,
) -> Result<TransferBoard, CommandError> {
    let (campaign, season, _) = loaded(tables, campaign_id)?;
    let constitution = constitution(tables, &campaign.id)?;
    let mut incoming = Vec::new();
    for offer in tables.offers.iter().filter(|row| {
        row.campaign_id == campaign.id
            && row.season_id == season.id
            && row.status == OfferStatus::Open
            && row.seller_club_id.as_ref() == Some(&campaign.managed_club_id)
    }) {
        let Some(negotiation_id) = &offer.negotiation_id else {
            continue;
        };
        let Some(negotiation) = tables
            .negotiations
            .iter()
            .find(|row| &row.id == negotiation_id)
        else {
            continue;
        };
        let qualifies = offer_still_qualifies(offer, constitution)?;
        incoming.push(IncomingOfferView {
            offer_id: offer.id.clone(),
            negotiation_id: negotiation_id.clone(),
            player_name: name_of(tables, &campaign.id, &offer.player_id, false),
            bidder_name: name_of(tables, &campaign.id, &offer.bidder_club_id, true),
            fee_cents: offer.fee_cents,
            wage_cents: negotiation.wage_cents,
            squad_tier: negotiation.squad_tier,
            term: negotiation.expires_on.clone(),
            deadline: offer
                .deadline_on
                .clone()
                .unwrap_or_else(|| negotiation.deadline_on.clone()),
            compulsory: if qualifies { "Compulsory" } else { "Ordinary" }.into(),
            reject_allowed: !qualifies,
            ledger_count: number(i64::from(offer.fee_cents.get() > 0) * 2)?,
            needs_registration: false,
        });
    }
    let mut outgoing = Vec::new();
    for negotiation in tables.negotiations.iter().filter(|row| {
        row.campaign_id == campaign.id
            && row.season_id == season.id
            && row.buyer_club_id == campaign.managed_club_id
            && open_status(row.status)
    }) {
        let seller = negotiation
            .seller_club_id
            .as_ref()
            .map(|id| name_of(tables, &campaign.id, id, true))
            .unwrap_or_else(|| "Free agent".into());
        let qualifying = tables.offers.iter().any(|offer| {
            offer.negotiation_id.as_ref() == Some(&negotiation.id)
                && offer_still_qualifies(offer, constitution).unwrap_or(false)
        });
        let shape = movement_shape(tables, &campaign.id, negotiation);
        outgoing.push(OutgoingNegotiationView {
            negotiation_id: negotiation.id.clone(),
            player_name: name_of(tables, &campaign.id, &negotiation.player_id, false),
            seller_name: seller,
            fee_cents: negotiation.fee_cents,
            wage_cents: negotiation.wage_cents,
            squad_tier: negotiation.squad_tier,
            status: negotiation.status,
            deadline: negotiation.deadline_on.clone(),
            can_withdraw: !qualifying,
            can_settle: negotiation.status == NegotiationStatus::Agreed && shape.is_ok(),
            ledger_count: number(shape.as_ref().map(|row| row.0).unwrap_or(0))?,
            needs_registration: shape.map(|row| row.1).unwrap_or(false),
        });
    }
    let mut completed = Vec::new();
    for transfer in tables.transfers.iter().filter(|row| {
        row.campaign_id == campaign.id
            && row.season_id == season.id
            && (row.from_club_id.as_ref() == Some(&campaign.managed_club_id)
                || row.to_club_id.as_ref() == Some(&campaign.managed_club_id))
    }) {
        let other = if transfer.from_club_id.as_ref() == Some(&campaign.managed_club_id) {
            transfer.to_club_id.clone()
        } else {
            transfer.from_club_id.clone()
        };
        completed.push(CompletedTransferView {
            transfer_id: transfer.id.clone(),
            player_name: name_of(tables, &campaign.id, &transfer.player_id, false),
            other_club: other
                .as_ref()
                .map(|id| name_of(tables, &campaign.id, id, true))
                .unwrap_or_else(|| "Free agent".into()),
            fee_cents: transfer.fee_cents,
            kind: transfer.kind,
            effective_on: transfer.effective_on.clone(),
        });
    }
    Ok(TransferBoard {
        incoming,
        outgoing,
        completed,
    })
}
