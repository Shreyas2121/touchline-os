//! Qualification and expiry rules shared by planning and commits.
use super::context::{constitution, core, invalid, loaded, number, open_status, zero};
use crate::dates::DateOnly;
use crate::policy::evaluate_action;
use crate::policy::qualifying_stored_offer_count;
use crate::policy::PolicyAction;
use crate::policy::PolicySnapshot;
use crate::{
    CommandError, ConstitutionRow, EntityId, NegotiationStatus, OfferRow, OfferStatus,
    SnapshotTables,
};
use std::collections::BTreeSet;

pub fn window_is_blocked(
    tables: &SnapshotTables,
    campaign_id: &EntityId,
) -> Result<bool, CommandError> {
    let (campaign, _, clock) = loaded(tables, campaign_id)?;
    let Ok(constitution) = constitution(tables, &campaign.id) else {
        let open = tables.offers.iter().any(|offer| {
            offer.campaign_id == campaign.id
                && offer.status == OfferStatus::Open
                && offer.seller_club_id.as_ref() == Some(&campaign.managed_club_id)
        });
        return if open {
            Err(invalid("Constitution is missing."))
        } else {
            Ok(false)
        };
    };
    let count =
        qualifying_stored_offer_count(&tables.offers, &campaign.managed_club_id, constitution)
            .map_err(core)?;
    let report = evaluate_action(
        &PolicyAction::WindowClose {
            unresolved_qualifying_offers: number(count as i64)?,
        },
        &PolicySnapshot {
            revision: campaign.revision,
            remaining_capacity_cents: None,
        },
        constitution,
        &DateOnly::parse(&clock.current_date).map_err(invalid)?,
    )
    .map_err(core)?;
    Ok(!report.allowed)
}

pub(super) fn offer_still_qualifies(
    offer: &OfferRow,
    constitution: &ConstitutionRow,
) -> Result<bool, CommandError> {
    if offer.status != OfferStatus::Open {
        return Ok(false);
    }
    Ok(qualifying_stored_offer_count(
        std::slice::from_ref(offer),
        offer
            .seller_club_id
            .as_ref()
            .unwrap_or(&offer.bidder_club_id),
        constitution,
    )
    .map_err(core)?
        > 0
        && offer.seller_club_id.is_some())
}

pub fn expire_noncompulsory(
    tables: &mut SnapshotTables,
    campaign_id: &EntityId,
    on: &str,
    due_only: bool,
) {
    let Ok(constitution) = constitution(tables, campaign_id) else {
        return;
    };
    let constitution = constitution.clone();
    let managed = tables
        .campaigns
        .iter()
        .find(|row| &row.id == campaign_id)
        .map(|row| row.managed_club_id.clone());
    let qualifying_negotiations = tables
        .offers
        .iter()
        .filter(|offer| {
            &offer.campaign_id == campaign_id
                && offer_still_qualifies(offer, &constitution).unwrap_or(false)
        })
        .filter_map(|offer| {
            offer
                .negotiation_id
                .as_ref()
                .map(|id| id.as_str().to_owned())
        })
        .collect::<BTreeSet<_>>();
    for negotiation in &mut tables.negotiations {
        if &negotiation.campaign_id != campaign_id || !open_status(negotiation.status) {
            continue;
        }
        if qualifying_negotiations.contains(negotiation.id.as_str()) {
            continue;
        }
        let agreed_purchase = negotiation.status == NegotiationStatus::Agreed
            && managed.as_ref() == Some(&negotiation.buyer_club_id);
        if due_only && agreed_purchase {
            continue;
        }
        if due_only && negotiation.deadline_on.as_str() > on {
            continue;
        }
        negotiation.status = NegotiationStatus::Expired;
        negotiation.reserved_cents = zero();
        negotiation.reserved_wage_cents = zero();
        negotiation.resolved_on = Some(on.to_owned());
    }
    for offer in &mut tables.offers {
        if &offer.campaign_id != campaign_id || offer.status != OfferStatus::Open {
            continue;
        }
        if offer_still_qualifies(offer, &constitution).unwrap_or(false) {
            continue;
        }
        if due_only
            && offer
                .deadline_on
                .as_deref()
                .is_some_and(|deadline| deadline > on)
        {
            continue;
        }
        offer.status = OfferStatus::Expired;
        offer.resolved_on = Some(on.to_owned());
    }
}
