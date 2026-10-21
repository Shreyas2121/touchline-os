use crate::{
    dates::DateOnly, nulls::nullable, ConstitutionRow, ConstitutionRule, CoreError, CoreResult,
    EntityId, MoneyCents, OfferRow, OfferStatus, RegistrationStatus, SafeInt, SquadTier,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Preset {
    Balanced,
    Strict,
    Custom,
}
pub fn constitution_preset(preset: Preset) -> Vec<ConstitutionRule> {
    let strict = preset == Preset::Strict;
    let enabled = preset != Preset::Custom;
    let s = |value| SafeInt::new(value).expect("constant preset integer");
    let m = |value| MoneyCents::new(value).expect("constant preset money");
    vec![
        ConstitutionRule::SellToBuy {
            enabled,
            sales_reinvestment_pct: s(if strict { 50 } else { 70 }),
            prize_reinvestment_pct: s(if strict { 50 } else { 100 }),
            carryover_pct: s(0),
            initial_allocation_cents: m(if strict { 200_000_000 } else { 500_000_000 }),
        },
        ConstitutionRule::MaxSigningAge {
            enabled,
            max_age: s(if strict { 23 } else { 26 }),
            free_transfers_exempt: !strict,
        },
        ConstitutionRule::WageTierCap {
            enabled,
            key_weekly_cap_cents: m(if strict { 2_250_000 } else { 4_500_000 }),
            rotation_weekly_cap_cents: m(if strict { 1_000_000 } else { 2_000_000 }),
            youth_weekly_cap_cents: m(if strict { 250_000 } else { 500_000 }),
        },
        ConstitutionRule::PrestigeBidSale {
            enabled,
            required_fee_numerator: s(if strict { 2 } else { 3 }),
            required_fee_denominator: s(if strict { 1 } else { 2 }),
            require_higher_prestige: true,
        },
        ConstitutionRule::RegistrationQuota {
            enabled,
            roster_limit: s(if strict { 20 } else { 25 }),
            minimum_homegrown: s(if strict { 10 } else { 8 }),
            age_exemption_under: Some(s(21)),
            competition_key: "league".into(),
        },
    ]
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegistrationPlayer {
    pub player_id: EntityId,
    pub status: RegistrationStatus,
    #[serde(deserialize_with = "nullable")]
    pub homegrown_club: Option<bool>,
    #[serde(deserialize_with = "nullable")]
    pub homegrown_nation: Option<bool>,
    #[serde(deserialize_with = "nullable")]
    pub age_exempt: Option<bool>,
    #[serde(deserialize_with = "nullable")]
    pub age: Option<SafeInt>,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ts_rs::TS)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum PolicyAction {
    IncomingTransfer {
        fee_cents: MoneyCents,
        #[serde(deserialize_with = "nullable")]
        age: Option<SafeInt>,
        is_free: bool,
        #[serde(deserialize_with = "nullable")]
        weekly_wage_cents: Option<MoneyCents>,
        #[serde(deserialize_with = "nullable")]
        squad_tier: Option<SquadTier>,
    },
    WageChange {
        #[serde(deserialize_with = "nullable")]
        weekly_wage_cents: Option<MoneyCents>,
        #[serde(deserialize_with = "nullable")]
        squad_tier: Option<SquadTier>,
    },
    RejectOffer {
        fee_cents: MoneyCents,
        #[serde(deserialize_with = "nullable")]
        market_value_cents: Option<MoneyCents>,
        #[serde(deserialize_with = "nullable")]
        bidder_prestige: Option<SafeInt>,
        #[serde(deserialize_with = "nullable")]
        seller_prestige: Option<SafeInt>,
    },
    SeasonRollover {
        unresolved_qualifying_offers: SafeInt,
    },
    Registration {
        competition_key: String,
        players: Vec<RegistrationPlayer>,
    },
}
fn optional_range(value: Option<SafeInt>, maximum: i64) -> CoreResult<()> {
    if value.is_some_and(|v| !(0..=maximum).contains(&v.get())) {
        return Err(CoreError::Invalid("Action is not valid."));
    }
    Ok(())
}
impl PolicyAction {
    pub fn validate(&self) -> CoreResult<()> {
        match self {
            Self::IncomingTransfer { age, .. } => optional_range(*age, 99)?,
            Self::RejectOffer {
                bidder_prestige,
                seller_prestige,
                ..
            } => {
                optional_range(*bidder_prestige, 100)?;
                optional_range(*seller_prestige, 100)?;
            }
            Self::SeasonRollover {
                unresolved_qualifying_offers,
            } if unresolved_qualifying_offers.get() < 0 => {
                return Err(CoreError::Invalid("Action is not valid."))
            }
            Self::Registration {
                competition_key,
                players,
            } => {
                if !(1..=40).contains(&competition_key.encode_utf16().count()) {
                    return Err(CoreError::Invalid("Action is not valid."));
                }
                for player in players {
                    optional_range(player.age, 99)?;
                }
            }
            _ => {}
        }
        Ok(())
    }
}
pub fn parse_policy_action(value: Value) -> CoreResult<PolicyAction> {
    let action: PolicyAction =
        serde_json::from_value(value).map_err(|_| CoreError::Invalid("Action is not valid."))?;
    action.validate()?;
    Ok(action)
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PolicySnapshot {
    pub revision: SafeInt,
    #[serde(deserialize_with = "nullable")]
    pub remaining_capacity_cents: Option<SafeInt>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum Severity {
    Block,
    Warn,
    Info,
}
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleVerdict {
    pub rule_id: String,
    pub severity: Severity,
    pub code: String,
    pub message: String,
    pub evidence: BTreeMap<String, Value>,
    pub remedy: String,
}
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleReport {
    pub allowed: bool,
    pub verdicts: Vec<RuleVerdict>,
    pub snapshot_revision: SafeInt,
}
fn verdict(
    rule: &str,
    code: &str,
    message: impl Into<String>,
    evidence: Value,
    remedy: &str,
) -> RuleVerdict {
    RuleVerdict {
        rule_id: rule.into(),
        severity: Severity::Block,
        code: code.into(),
        message: message.into(),
        evidence: evidence
            .as_object()
            .expect("evidence object")
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
        remedy: remedy.into(),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Qualification {
    Qualifies,
    DoesNotQualify,
    Unknown,
}
#[derive(Debug, Clone, Copy)]
pub struct QualificationRule {
    pub required_fee_numerator: SafeInt,
    pub required_fee_denominator: SafeInt,
    pub require_higher_prestige: bool,
}
pub fn offer_qualifies(
    fee: MoneyCents,
    market: Option<MoneyCents>,
    bidder: Option<SafeInt>,
    seller: Option<SafeInt>,
    rule: QualificationRule,
) -> CoreResult<Qualification> {
    optional_range(bidder, 100)?;
    optional_range(seller, 100)?;
    if rule.required_fee_numerator.get() < 1 || rule.required_fee_denominator.get() < 1 {
        return Err(CoreError::Invalid("Invalid qualification ratio."));
    }
    let (Some(market), Some(bidder), Some(seller)) = (market, bidder, seller) else {
        return Ok(Qualification::Unknown);
    };
    // Two safe integers fit exactly in i128; this matches the source's BigInt comparison.
    let left = i128::from(fee.get())
        .checked_mul(i128::from(rule.required_fee_denominator.get()))
        .ok_or(CoreError::Arithmetic)?;
    let right = i128::from(market.get())
        .checked_mul(i128::from(rule.required_fee_numerator.get()))
        .ok_or(CoreError::Arithmetic)?;
    Ok(
        if left >= right && (!rule.require_higher_prestige || bidder.get() > seller.get()) {
            Qualification::Qualifies
        } else {
            Qualification::DoesNotQualify
        },
    )
}
pub fn count_unresolved_qualifying_offers(
    offers: &[OfferRow],
    campaign_id: &EntityId,
    market: &BTreeMap<String, Option<MoneyCents>>,
    prestige: &BTreeMap<String, Option<SafeInt>>,
    seller: Option<SafeInt>,
    rule: QualificationRule,
) -> CoreResult<usize> {
    let mut count = 0;
    for offer in offers
        .iter()
        .filter(|offer| offer.campaign_id == *campaign_id && offer.status == OfferStatus::Open)
    {
        if offer_qualifies(
            offer.fee_cents,
            market.get(offer.player_id.as_str()).copied().flatten(),
            prestige
                .get(offer.bidder_club_id.as_str())
                .copied()
                .flatten(),
            seller,
            rule,
        )? == Qualification::Qualifies
        {
            count += 1;
        }
    }
    Ok(count)
}

pub fn evaluate_action(
    action: &PolicyAction,
    snapshot: &PolicySnapshot,
    constitution: &ConstitutionRow,
    _effective_date: &DateOnly,
) -> CoreResult<RuleReport> {
    action.validate()?;
    if snapshot.revision.get() < 0 {
        return Err(CoreError::Invalid("Invalid revision."));
    }
    crate::validate::validate_constitution(constitution)
        .map_err(|_| CoreError::Invalid("Invalid constitution."))?;
    let mut verdicts = Vec::new();
    // Source verdict order is capacity, age, wage, prestige, then registration.
    if let PolicyAction::IncomingTransfer {
        fee_cents,
        age,
        is_free,
        ..
    } = action
    {
        let free = *is_free && fee_cents.get() == 0;
        if constitution
            .rules
            .iter()
            .any(|r| matches!(r, ConstitutionRule::SellToBuy { enabled: true, .. }))
            && !free
        {
            let evidence = json!({"feeCents":fee_cents,"remainingCapacityCents":snapshot.remaining_capacity_cents});
            if snapshot.remaining_capacity_cents.is_none() {
                verdicts.push(verdict(
                    "SELL_TO_BUY",
                    "INSUFFICIENT_DATA",
                    "Transfer capacity is unknown, so this fee cannot be checked.",
                    evidence,
                    "Save a constitution that posts an opening allocation.",
                ));
            } else if snapshot
                .remaining_capacity_cents
                .is_some_and(|capacity| fee_cents.get() > capacity.get())
            {
                verdicts.push(verdict(
                    "SELL_TO_BUY",
                    "FEE_EXCEEDS_CAPACITY",
                    "The fee is above the remaining transfer capacity.",
                    evidence,
                    "Record a completed sale, raise the allocation, or lower the fee.",
                ));
            }
        }
        if let Some(ConstitutionRule::MaxSigningAge {
            max_age,
            free_transfers_exempt,
            ..
        }) = constitution
            .rules
            .iter()
            .find(|r| matches!(r, ConstitutionRule::MaxSigningAge { enabled: true, .. }))
        {
            let evidence = json!({"age":age,"maxAge":max_age});
            match age {
                None => verdicts.push(verdict("MAX_SIGNING_AGE","INSUFFICIENT_DATA","Age is unknown, so this signing cannot be checked.",evidence,"Enter a birth date or an estimated age on the player.")),
                Some(age) if age.get() > max_age.get() && !(free && *free_transfers_exempt) => verdicts.push(verdict("MAX_SIGNING_AGE","AGE_ABOVE_CAP",format!("Age {} is above the cap of {}.",age.get(),max_age.get()),evidence,"Choose a younger player, use an exempt free transfer, or change the constitution.")),
                _ => {}
            }
        }
    }
    if let PolicyAction::IncomingTransfer {
        weekly_wage_cents,
        squad_tier,
        ..
    }
    | PolicyAction::WageChange {
        weekly_wage_cents,
        squad_tier,
    } = action
    {
        if let Some(ConstitutionRule::WageTierCap {
            key_weekly_cap_cents,
            rotation_weekly_cap_cents,
            youth_weekly_cap_cents,
            ..
        }) = constitution
            .rules
            .iter()
            .find(|r| matches!(r, ConstitutionRule::WageTierCap { enabled: true, .. }))
        {
            let cap = squad_tier.map(|tier| match tier {
                SquadTier::Key => *key_weekly_cap_cents,
                SquadTier::Rotation => *rotation_weekly_cap_cents,
                SquadTier::Youth => *youth_weekly_cap_cents,
            });
            let mut evidence = json!({"weeklyWageCents":weekly_wage_cents,"squadTier":squad_tier});
            if let Some(cap) = cap {
                evidence["capCents"] = json!(cap);
            }
            if weekly_wage_cents.is_none() {
                verdicts.push(verdict(
                    "WAGE_TIER_CAP",
                    "INSUFFICIENT_DATA",
                    "Weekly wage is unknown, so the tier cap cannot be checked.",
                    evidence,
                    "Enter a weekly wage.",
                ));
            } else if squad_tier.is_none() {
                verdicts.push(verdict(
                    "WAGE_TIER_CAP",
                    "INSUFFICIENT_DATA",
                    "Squad tier is unknown, so the wage cap cannot be checked.",
                    evidence,
                    "Choose Key, Rotation, or Youth.",
                ));
            } else if cap
                .zip(*weekly_wage_cents)
                .is_some_and(|(cap, wage)| wage.get() > cap.get())
            {
                let tier = match squad_tier {
                    Some(SquadTier::Key) => "Key",
                    Some(SquadTier::Rotation) => "Rotation",
                    _ => "Youth",
                };
                verdicts.push(verdict(
                    "WAGE_TIER_CAP",
                    "WAGE_ABOVE_TIER_CAP",
                    format!("The weekly wage is above the {tier} cap."),
                    evidence,
                    "Lower the wage, change the tier, or change the constitution.",
                ));
            }
        }
    }
    if let Some(ConstitutionRule::PrestigeBidSale {
        required_fee_numerator,
        required_fee_denominator,
        require_higher_prestige,
        ..
    }) = constitution
        .rules
        .iter()
        .find(|r| matches!(r, ConstitutionRule::PrestigeBidSale { enabled: true, .. }))
    {
        if let PolicyAction::RejectOffer {
            fee_cents,
            market_value_cents,
            bidder_prestige,
            seller_prestige,
        } = action
        {
            let rule = QualificationRule {
                required_fee_numerator: *required_fee_numerator,
                required_fee_denominator: *required_fee_denominator,
                require_higher_prestige: *require_higher_prestige,
            };
            let mut evidence = json!({"feeCents":fee_cents,"marketValueCents":market_value_cents,"bidderPrestige":bidder_prestige,"sellerPrestige":seller_prestige});
            match offer_qualifies(
                *fee_cents,
                *market_value_cents,
                *bidder_prestige,
                *seller_prestige,
                rule,
            )? {
                Qualification::Unknown => {
                    let mut warning = verdict(
                        "PRESTIGE_BID_SALE",
                        "UNKNOWN_VALUATION",
                        "Valuation or prestige is unknown, so this bid needs a manual review.",
                        evidence,
                        "Enter the market value and both prestige figures.",
                    );
                    warning.severity = Severity::Warn;
                    verdicts.push(warning);
                }
                Qualification::Qualifies => {
                    evidence["requiredFeeNumerator"] = json!(required_fee_numerator);
                    evidence["requiredFeeDenominator"] = json!(required_fee_denominator);
                    verdicts.push(verdict(
                        "PRESTIGE_BID_SALE",
                        "QUALIFYING_OFFER",
                        "This bid qualifies and cannot be rejected while the rule is on.",
                        evidence,
                        "Accept the bid, or change the constitution in an audited update.",
                    ));
                }
                _ => {}
            }
        }
        if let PolicyAction::SeasonRollover {
            unresolved_qualifying_offers,
        } = action
        {
            if unresolved_qualifying_offers.get() > 0 {
                verdicts.push(verdict(
                    "PRESTIGE_BID_SALE",
                    "UNRESOLVED_QUALIFYING_OFFER",
                    "A qualifying offer is still unresolved.",
                    json!({"unresolvedQualifyingOffers":unresolved_qualifying_offers}),
                    "Accept the qualifying offer, or change the constitution in an audited update.",
                ));
            }
        }
    }
    if let PolicyAction::Registration {
        competition_key,
        players,
    } = action
    {
        if let Some(ConstitutionRule::RegistrationQuota {
            competition_key: rule_key,
            roster_limit,
            minimum_homegrown,
            age_exemption_under,
            ..
        }) = constitution
            .rules
            .iter()
            .find(|r| matches!(r, ConstitutionRule::RegistrationQuota { enabled: true, .. }))
        {
            if competition_key == rule_key {
                registration_verdicts(
                    players,
                    *roster_limit,
                    *minimum_homegrown,
                    *age_exemption_under,
                    &mut verdicts,
                );
            }
        }
    }
    Ok(RuleReport {
        allowed: !verdicts.iter().any(|v| v.severity == Severity::Block),
        verdicts,
        snapshot_revision: snapshot.revision,
    })
}

fn registration_verdicts(
    players: &[RegistrationPlayer],
    roster_limit: SafeInt,
    minimum_homegrown: SafeInt,
    age_exemption_under: Option<SafeInt>,
    verdicts: &mut Vec<RuleVerdict>,
) {
    let mut seen = BTreeSet::new();
    let duplicate = players
        .iter()
        .find(|player| !seen.insert(player.player_id.as_str()));
    if let Some(player) = duplicate {
        verdicts.push(verdict(
            "REGISTRATION_QUOTA",
            "DUPLICATE_PLAYER",
            "This registration list names a player twice.",
            json!({"playerId":player.player_id}),
            "Remove the duplicate player.",
        ));
    }
    for player in players
        .iter()
        .filter(|player| player.status == RegistrationStatus::Unknown)
    {
        verdicts.push(verdict(
            "REGISTRATION_QUOTA",
            "INSUFFICIENT_DATA",
            "Registration status is unknown.",
            json!({"playerId":player.player_id}),
            "Choose Registered or Ineligible.",
        ));
    }
    let mut registered_count = 0;
    let mut homegrown_count = 0;
    for player in players
        .iter()
        .filter(|player| player.status == RegistrationStatus::Registered)
    {
        let exempt = match player.age_exempt {
            Some(value) => Some(value),
            None => player
                .age
                .zip(age_exemption_under)
                .map(|(age, under)| age.get() < under.get()),
        };
        match exempt {
            None => {
                verdicts.push(verdict("REGISTRATION_QUOTA","INSUFFICIENT_DATA","Age is unknown, so this registration cannot be checked.",json!({"playerId":player.player_id,"age":player.age,"ageExemptionUnder":age_exemption_under}),"Enter a birth date or an estimated age, or set the age exemption."));
                continue;
            }
            Some(true) => continue,
            _ => {}
        }
        let homegrown =
            player.homegrown_club == Some(true) || player.homegrown_nation == Some(true);
        if !homegrown && (player.homegrown_club.is_none() || player.homegrown_nation.is_none()) {
            verdicts.push(verdict(
                "REGISTRATION_QUOTA",
                "INSUFFICIENT_DATA",
                "Homegrown eligibility is unknown.",
                json!({"playerId":player.player_id}),
                "Set the club and nation homegrown flags.",
            ));
            continue;
        }
        registered_count += 1;
        if homegrown {
            homegrown_count += 1;
        }
    }
    if registered_count > roster_limit.get() {
        verdicts.push(verdict(
            "REGISTRATION_QUOTA",
            "ROSTER_ABOVE_LIMIT",
            format!(
                "The registered list is above the roster limit of {}.",
                roster_limit.get()
            ),
            json!({"registeredCount":registered_count,"rosterLimit":roster_limit}),
            "Remove a registered player or change the constitution.",
        ));
    }
    if homegrown_count < minimum_homegrown.get() {
        verdicts.push(verdict(
            "REGISTRATION_QUOTA",
            "HOMEGROWN_BELOW_MINIMUM",
            format!(
                "Homegrown players are below the minimum of {}.",
                minimum_homegrown.get()
            ),
            json!({"homegrownCount":homegrown_count,"minimumHomegrown":minimum_homegrown}),
            "Mark more homegrown players or change the constitution.",
        ));
    }
}
