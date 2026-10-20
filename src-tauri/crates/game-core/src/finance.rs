use crate::{
    dates::DateOnly,
    money::{checked_add, checked_sub, floor_percent, format_money_euros},
    policy::{evaluate_action, PolicyAction, PolicySnapshot, RuleReport},
    ConstitutionRow, ContractRow, ContractStatus, CoreError, CoreResult, EntityId, LedgerEntryRow,
    LedgerKind, MoneyCents, SafeInt, SquadTier,
};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapacityBreakdown {
    pub initial_allocation_cents: i64,
    pub sale_credit_cents: i64,
    pub prize_credit_cents: i64,
    pub carryover_cents: i64,
    pub incoming_fees_cents: i64,
    pub authorized_cents: i64,
    pub remaining_cents: i64,
}
pub fn transfer_capacity(
    entries: &[LedgerEntryRow],
    campaign_id: &EntityId,
    season_id: &EntityId,
    club_id: &EntityId,
    sales_pct: i64,
    prize_pct: i64,
) -> CoreResult<CapacityBreakdown> {
    let scoped = entries
        .iter()
        .filter(|e| {
            e.campaign_id == *campaign_id && e.season_id == *season_id && e.club_id == *club_id
        })
        .collect::<Vec<_>>();
    let reversed = scoped
        .iter()
        .filter(|e| e.kind == LedgerKind::Reversal)
        .filter_map(|e| e.reverses_entry_id.as_ref())
        .map(EntityId::as_str)
        .collect::<BTreeSet<_>>();
    let (mut initial, mut sales, mut prizes, mut carryover, mut incoming) = (0, 0, 0, 0, 0);
    for entry in scoped {
        if reversed.contains(entry.id.as_str()) {
            continue;
        }
        let target = match entry.kind {
            LedgerKind::InitialAllocation => &mut initial,
            LedgerKind::PlayerSale => &mut sales,
            LedgerKind::PrizeIncome => &mut prizes,
            LedgerKind::ApprovedCarryover => &mut carryover,
            LedgerKind::IncomingFee => &mut incoming,
            LedgerKind::Reversal => continue,
        };
        *target = checked_add(*target, entry.amount_cents.get())?;
    }
    let sale_credit_cents = floor_percent(MoneyCents::new(sales)?, sales_pct)?.get();
    let prize_credit_cents = floor_percent(MoneyCents::new(prizes)?, prize_pct)?.get();
    let authorized_cents = checked_add(
        checked_add(checked_add(initial, sale_credit_cents)?, prize_credit_cents)?,
        carryover,
    )?;
    Ok(CapacityBreakdown {
        initial_allocation_cents: initial,
        sale_credit_cents,
        prize_credit_cents,
        carryover_cents: carryover,
        incoming_fees_cents: incoming,
        authorized_cents,
        remaining_cents: checked_sub(authorized_cents, incoming)?,
    })
}
pub fn format_capacity(cents: Option<SafeInt>) -> CoreResult<String> {
    match cents {
        None => Ok("Unknown".into()),
        Some(value) => Ok(format!(
            "{}{}",
            if value.get() < 0 { "-" } else { "" },
            format_money_euros(MoneyCents::new(
                value.get().checked_abs().ok_or(CoreError::Arithmetic)?
            )?)
        )),
    }
}
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WageTierCommitment {
    pub count: i64,
    pub known_cents: i64,
    pub unknown_count: i64,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WageCommitment {
    pub known_cents: i64,
    pub unknown_count: i64,
    pub by_tier: BTreeMap<String, WageTierCommitment>,
}
pub fn wage_commitment(
    contracts: &[ContractRow],
    campaign_id: &EntityId,
    club_id: &EntityId,
) -> CoreResult<WageCommitment> {
    let mut result = WageCommitment {
        known_cents: 0,
        unknown_count: 0,
        by_tier: ["key", "rotation", "youth", "unknown"]
            .into_iter()
            .map(|tier| (tier.into(), WageTierCommitment::default()))
            .collect(),
    };
    for contract in contracts.iter().filter(|c| {
        c.campaign_id == *campaign_id && c.club_id == *club_id && c.status == ContractStatus::Active
    }) {
        let key = match contract.squad_tier {
            Some(SquadTier::Key) => "key",
            Some(SquadTier::Rotation) => "rotation",
            Some(SquadTier::Youth) => "youth",
            None => "unknown",
        };
        let tier = result.by_tier.get_mut(key).expect("all tiers initialized");
        tier.count = checked_add(tier.count, 1)?;
        if let Some(wage) = contract.weekly_wage_cents {
            tier.known_cents = checked_add(tier.known_cents, wage.get())?;
            result.known_cents = checked_add(result.known_cents, wage.get())?;
        } else {
            tier.unknown_count = checked_add(tier.unknown_count, 1)?;
            result.unknown_count = checked_add(result.unknown_count, 1)?;
        }
    }
    Ok(result)
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WageSummary {
    pub known_cents: MoneyCents,
    pub unknown_count: SafeInt,
}
pub fn format_wage_commitment(wages: WageSummary) -> CoreResult<String> {
    if wages.unknown_count.get() < 0 {
        return Err(CoreError::Invalid("Invalid unknown wage count."));
    }
    if wages.known_cents.get() == 0 && wages.unknown_count.get() > 0 {
        return Ok("Unknown".into());
    }
    let euros = format_money_euros(wages.known_cents);
    Ok(if wages.unknown_count.get() == 0 {
        euros
    } else {
        format!("{euros} · {} unknown", wages.unknown_count.get())
    })
}
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResult {
    pub report: RuleReport,
    pub before_capacity: String,
    pub after_capacity: String,
    pub before_wages: String,
    pub after_wages: String,
}
pub fn preview_action(
    action: &PolicyAction,
    snapshot: &PolicySnapshot,
    constitution: &ConstitutionRow,
    effective_date: &DateOnly,
    wages: WageSummary,
    replaced_wage: Option<MoneyCents>,
) -> CoreResult<PreviewResult> {
    let before_capacity = format_capacity(snapshot.remaining_capacity_cents)?;
    let before_wages = format_wage_commitment(wages)?;
    let mut after_capacity = before_capacity.clone();
    let mut after_wages = before_wages.clone();
    if let PolicyAction::IncomingTransfer {
        fee_cents, is_free, ..
    } = action
    {
        if !(*is_free && fee_cents.get() == 0) {
            after_capacity = match snapshot.remaining_capacity_cents {
                None => "Unknown".into(),
                Some(remaining) if fee_cents.get() > remaining.get() => format!(
                    "Short by {}",
                    format_money_euros(MoneyCents::new(checked_sub(
                        fee_cents.get(),
                        remaining.get()
                    )?)?)
                ),
                Some(remaining) => format_capacity(Some(SafeInt::new(checked_sub(
                    remaining.get(),
                    fee_cents.get(),
                )?)?))?,
            };
        }
    }
    if let PolicyAction::IncomingTransfer {
        weekly_wage_cents, ..
    }
    | PolicyAction::WageChange {
        weekly_wage_cents, ..
    } = action
    {
        let base = match action {
            PolicyAction::WageChange { .. } => replaced_wage
                .map(|old| checked_sub(wages.known_cents.get(), old.get()))
                .transpose()?,
            _ => Some(wages.known_cents.get()),
        };
        // A wage change replaces a known commitment. Without that input, do not
        // invent a projected total or count the proposed wage twice.
        after_wages = match (weekly_wage_cents, base) {
            (Some(wage), Some(base)) if base >= 0 => format_wage_commitment(WageSummary {
                known_cents: MoneyCents::new(checked_add(base, wage.get())?)?,
                ..wages
            })?,
            _ => "Unknown".into(),
        };
    }
    Ok(PreviewResult {
        report: evaluate_action(action, snapshot, constitution, effective_date)?,
        before_capacity,
        after_capacity,
        before_wages,
        after_wages,
    })
}
pub fn preview_outgoing_sale(
    fee: MoneyCents,
    sales_pct: i64,
    snapshot: &PolicySnapshot,
    wages: WageSummary,
    active_wage: Option<MoneyCents>,
) -> CoreResult<PreviewResult> {
    if snapshot.revision.get() < 0 {
        return Err(CoreError::Invalid("Invalid revision."));
    }
    let credit = floor_percent(fee, sales_pct)?;
    let after_wages = match active_wage {
        Some(active) if wages.known_cents.get() >= active.get() => {
            format_wage_commitment(WageSummary {
                known_cents: MoneyCents::new(checked_sub(wages.known_cents.get(), active.get())?)?,
                ..wages
            })?
        }
        _ => "Unknown".into(),
    };
    let remaining = snapshot
        .remaining_capacity_cents
        .map(|r| checked_add(r.get(), credit.get()).and_then(SafeInt::new))
        .transpose()?;
    Ok(PreviewResult {
        report: RuleReport {
            allowed: true,
            verdicts: vec![],
            snapshot_revision: snapshot.revision,
        },
        before_capacity: format_capacity(snapshot.remaining_capacity_cents)?,
        after_capacity: format_capacity(remaining)?,
        before_wages: format_wage_commitment(wages)?,
        after_wages,
    })
}
