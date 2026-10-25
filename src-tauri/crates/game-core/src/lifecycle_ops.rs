//! Bounded lifecycle previews and prepared writes. No storage or UI dependencies.
use crate::{
    dates::{age_in_whole_years, validate_timestamp, DateOnly},
    lifecycle::*,
    policy::{evaluate_action, qualifying_stored_offer_count, PolicyAction, PolicySnapshot},
    progression::AdvanceOutcome,
    schedule::{schedule_season, standings, MatchScore, ScheduleClub},
    *,
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};
use ts_rs::TS;

fn invalid(e: impl ToString) -> CommandError {
    CommandError::Validation {
        message: e.to_string(),
    }
}
fn conflict() -> CommandError {
    CommandError::Conflict {
        message: "The saved lifecycle preview changed. Refresh and try again.".into(),
    }
}
fn n(v: i64) -> Result<SafeInt, CommandError> {
    SafeInt::new(v).map_err(invalid)
}
fn money(v: i64) -> Result<MoneyCents, CommandError> {
    MoneyCents::new(v).map_err(invalid)
}
fn row<T: serde::de::DeserializeOwned>(v: serde_json::Value) -> Result<T, CommandError> {
    serde_json::from_value(v).map_err(invalid)
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LifecycleIdCounts {
    pub players: usize,
    pub player_states: usize,
    pub contracts: usize,
    pub registrations: usize,
    pub ledger: usize,
    pub fixtures: usize,
    pub seasons: usize,
    pub settlements: usize,
    pub objectives: usize,
    pub snapshots: usize,
}
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LifecycleIds {
    pub players: Vec<EntityId>,
    pub player_states: Vec<EntityId>,
    pub contracts: Vec<EntityId>,
    pub registrations: Vec<EntityId>,
    pub ledger: Vec<EntityId>,
    pub fixtures: Vec<EntityId>,
    pub seasons: Vec<EntityId>,
    pub settlements: Vec<EntityId>,
    pub objectives: Vec<EntityId>,
    pub snapshots: Vec<EntityId>,
}
impl LifecycleIds {
    pub fn counts(&self) -> LifecycleIdCounts {
        LifecycleIdCounts {
            players: self.players.len(),
            player_states: self.player_states.len(),
            contracts: self.contracts.len(),
            registrations: self.registrations.len(),
            ledger: self.ledger.len(),
            fixtures: self.fixtures.len(),
            seasons: self.seasons.len(),
            settlements: self.settlements.len(),
            objectives: self.objectives.len(),
            snapshots: self.snapshots.len(),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LifecycleRequest {
    pub campaign_id: EntityId,
    pub season_id: EntityId,
    pub expected_revision: SafeInt,
    pub source_date: String,
    #[serde(deserialize_with = "crate::nulls::nullable")]
    pub source_boundary_key: Option<String>,
    pub input_fingerprint: String,
    pub ids: LifecycleIds,
    pub receipt_id: EntityId,
    pub audit_id: EntityId,
    pub action_id: EntityId,
    pub now: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AttributePreview {
    pub player_id: EntityId,
    pub name: String,
    pub before: PlayerAttributes,
    pub after: PlayerAttributes,
    pub before_value_cents: Option<MoneyCents>,
    pub after_value_cents: MoneyCents,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RosterPreview {
    pub name: String,
    pub kind: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClubLifecycleCounts {
    pub club_id: EntityId,
    pub developed: usize,
    pub renewed: usize,
    pub released: usize,
    pub retired: usize,
    pub intake: usize,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ObjectivePreview {
    pub kind: ObjectiveKind,
    pub target_position: SafeInt,
    pub reward_cents: MoneyCents,
    pub outcome: ObjectiveOutcome,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LifecyclePreview {
    pub campaign_id: EntityId,
    pub season_id: EntityId,
    pub revision: SafeInt,
    pub source_date: String,
    pub source_boundary_key: Option<String>,
    pub input_fingerprint: String,
    pub closing_label: String,
    pub id_counts: LifecycleIdCounts,
    pub attributes: Vec<AttributePreview>,
    pub roster: Vec<RosterPreview>,
    pub clubs: Vec<ClubLifecycleCounts>,
    pub objectives: Vec<ObjectivePreview>,
    pub managed_position: Option<SafeInt>,
    pub prize_cents: MoneyCents,
    pub objective_bonus_cents: MoneyCents,
    pub carryover_cents: MoneyCents,
    pub allocation_cents: MoneyCents,
}

pub struct PreparedLifecycle {
    pub fingerprint_material: String,
    pub after: SnapshotTables,
}
struct Plan {
    preview: LifecyclePreview,
    changes: Vec<(EntityId, DevelopmentChange)>,
    rosters: Vec<(EntityId, RosterPlan)>,
    fixtures: Vec<schedule::ScheduledFixture>,
    table: Vec<serde_json::Value>,
    registrations: Vec<RegistrationSlot>,
}
struct RegistrationSlot {
    key: String,
    homegrown_club: Option<bool>,
    homegrown_nation: Option<bool>,
    age_exempt: bool,
    provenance: RecordSource,
}
fn registrations(
    t: &SnapshotTables,
    c: &CampaignRow,
    s: &SeasonRow,
    roster: &RosterPlan,
    date: &str,
) -> Result<Vec<RegistrationSlot>, CommandError> {
    let constitution = t
        .constitutions
        .iter()
        .find(|x| x.campaign_id == c.id)
        .expect("constitution");
    let quota = constitution.rules.iter().find_map(|r| {
        if let ConstitutionRule::RegistrationQuota {
            enabled: true,
            roster_limit,
            minimum_homegrown,
            age_exemption_under,
            competition_key,
        } = r
        {
            if competition_key == "league" {
                Some((
                    roster_limit.get(),
                    minimum_homegrown.get(),
                    age_exemption_under.map(SafeInt::get),
                ))
            } else {
                None
            }
        } else {
            None
        }
    });
    let threshold = quota.and_then(|q| q.2);
    let mut slots = Vec::new();
    for reg in t.registrations.iter().filter(|r| {
        r.season_id == s.id
            && r.status == RegistrationStatus::Registered
            && r.competition_key == "league"
    }) {
        let Some(player) = t
            .players
            .iter()
            .find(|p| p.id == reg.player_id && p.club_id.as_ref() == Some(&c.managed_club_id))
        else {
            continue;
        };
        let ps = t
            .player_simulation_states
            .iter()
            .find(|ps| ps.player_id == player.id)
            .expect("state");
        if ps.status != PlayerLife::Active
            || roster.retired.contains(&ps.simulation_key)
            || roster.released.contains(&ps.simulation_key)
            || !(roster
                .renewed
                .iter()
                .any(|r| r.simulation_key == ps.simulation_key)
                || t.contracts.iter().any(|x| {
                    x.player_id == player.id
                        && x.status == ContractStatus::Active
                        && x.expires_on.as_deref().is_some_and(|end| end >= date)
                }))
        {
            continue;
        }
        slots.push(RegistrationSlot {
            key: ps.simulation_key.clone(),
            homegrown_club: reg.homegrown_club,
            homegrown_nation: reg.homegrown_nation,
            age_exempt: age(player, date)?
                .zip(threshold)
                .is_some_and(|(age, under)| age < under),
            provenance: reg.provenance,
        });
    }
    slots.sort_by(|a, b| {
        (b.homegrown_club == Some(true) || b.homegrown_nation == Some(true))
            .cmp(&(a.homegrown_club == Some(true) || a.homegrown_nation == Some(true)))
            .then(a.key.cmp(&b.key))
    });
    if let Some((limit, minimum, _)) = quota {
        let homegrown = slots
            .iter()
            .filter(|s| {
                !s.age_exempt
                    && (s.homegrown_club == Some(true) || s.homegrown_nation == Some(true))
            })
            .count();
        if homegrown < minimum as usize {
            slots.clear();
        } else {
            let mut used = 0;
            slots.retain(|s| {
                if s.age_exempt {
                    true
                } else {
                    used += 1;
                    used <= limit
                }
            });
        }
    }
    slots.extend(roster.intake.iter().map(|p| RegistrationSlot {
        key: p.simulation_key.clone(),
        homegrown_club: Some(true),
        homegrown_nation: Some(true),
        age_exempt: threshold.is_some_and(|under| 16 < under),
        provenance: RecordSource::Generated,
    }));
    Ok(slots)
}
fn loaded<'a>(
    t: &'a SnapshotTables,
    id: &EntityId,
) -> Result<(&'a CampaignRow, &'a SeasonRow, &'a SimulationStateRow), CommandError> {
    let c = t
        .campaigns
        .iter()
        .find(|c| &c.id == id)
        .ok_or_else(|| invalid("Campaign not found."))?;
    if c.mode != CampaignMode::Standalone {
        return Err(invalid(
            "Only standalone careers can run lifecycle commands.",
        ));
    }
    if c.status != CampaignStatus::Active {
        return Err(invalid(
            "Restore the career before running lifecycle commands.",
        ));
    }
    let s = t
        .seasons
        .iter()
        .find(|s| s.id == c.active_season_id)
        .ok_or_else(|| invalid("Active season not found."))?;
    let clock = t
        .simulation_states
        .iter()
        .find(|s| s.campaign_id == c.id)
        .ok_or_else(|| invalid("Saved game clock is missing."))?;
    Ok((c, s, clock))
}
fn age(p: &PlayerRow, date: &str) -> Result<Option<i64>, CommandError> {
    if let Some(b) = &p.birth_date {
        Ok(Some(
            age_in_whole_years(
                &DateOnly::parse(b).map_err(invalid)?,
                &DateOnly::parse(date).map_err(invalid)?,
            )
            .map_err(invalid)?,
        ))
    } else {
        Ok(p.reported_age.map(SafeInt::get))
    }
}
fn key<'a>(t: &'a SnapshotTables, id: &EntityId) -> Result<&'a str, CommandError> {
    t.club_simulation_states
        .iter()
        .find(|c| &c.club_id == id)
        .map(|c| c.simulation_key.as_str())
        .ok_or_else(|| invalid("Club simulation key is missing."))
}
fn qualifying(
    t: &SnapshotTables,
    campaign: &EntityId,
    season: &EntityId,
) -> Result<usize, CommandError> {
    let c = t
        .campaigns
        .iter()
        .find(|c| &c.id == campaign)
        .ok_or_else(|| invalid("Campaign not found."))?;
    let constitution = t
        .constitutions
        .iter()
        .find(|x| &x.campaign_id == campaign)
        .ok_or_else(|| invalid("Constitution not found."))?;
    let offers = t
        .offers
        .iter()
        .filter(|o| &o.season_id == season)
        .cloned()
        .collect::<Vec<_>>();
    qualifying_stored_offer_count(&offers, &c.managed_club_id, constitution).map_err(invalid)
}
pub fn material(
    t: &SnapshotTables,
    r: &LifecycleRequest,
    season_end: bool,
) -> Result<String, CommandError> {
    let (_, _, clock) = loaded(t, &r.campaign_id)?;
    let played = t
        .fixtures
        .iter()
        .filter(|f| {
            f.season_id == r.season_id
                && f.status == FixtureStatus::Played
                && f.match_date <= r.source_date
        })
        .count();
    Ok(json!([
        r.campaign_id,
        r.season_id,
        r.expected_revision,
        r.source_date,
        r.source_boundary_key,
        DEVELOPMENT_ENGINE_VERSION,
        clock.root_seed,
        played,
        qualifying(t, &r.campaign_id, &r.season_id)?,
        season_end
    ])
    .to_string())
}
fn plan(t: &SnapshotTables, id: &EntityId, season_end: bool) -> Result<Plan, CommandError> {
    let (c, s, clock) = loaded(t, id)?;
    let fixtures = t
        .fixtures
        .iter()
        .filter(|f| f.season_id == s.id)
        .collect::<Vec<_>>();
    if season_end {
        if clock.phase != CalendarPhase::Review
            || fixtures.len() != 1224
            || fixtures.iter().any(|f| f.status != FixtureStatus::Played)
        {
            return Err(invalid(
                "Finish every league fixture before the season can roll over.",
            ));
        }
    } else {
        let halfway = fixtures
            .iter()
            .find(|f| f.round.get() == 17)
            .map(|f| f.match_date.as_str());
        if clock.phase != CalendarPhase::League
            || halfway != Some(clock.current_date.as_str())
            || clock.last_boundary_key.as_deref()
                != Some(
                    format!("season:{}:matchday:{}", s.id.as_str(), clock.current_date).as_str(),
                )
        {
            return Err(invalid(
                "Development is applied after the halfway matchday.",
            ));
        }
    }
    let constitution = t
        .constitutions
        .iter()
        .find(|x| x.campaign_id == c.id)
        .ok_or_else(|| invalid("Constitution not found."))?;
    if season_end {
        let count = qualifying(t, &c.id, &s.id)?;
        let report = evaluate_action(
            &PolicyAction::SeasonRollover {
                unresolved_qualifying_offers: n(count as i64)?,
            },
            &PolicySnapshot {
                revision: c.revision,
                remaining_capacity_cents: None,
            },
            constitution,
            &DateOnly::parse(&clock.current_date).map_err(invalid)?,
        )
        .map_err(invalid)?;
        if !report.allowed {
            return Err(invalid(
                "Accept the qualifying offer before the season can roll over.",
            ));
        }
    }
    let period = if season_end {
        DevelopmentPeriod::SeasonEnd
    } else {
        DevelopmentPeriod::Midseason
    };
    let mut changes = Vec::new();
    let mut attributes = Vec::new();
    let mut clubs = t
        .clubs
        .iter()
        .map(|club| ClubLifecycleCounts {
            club_id: club.id.clone(),
            developed: 0,
            renewed: 0,
            released: 0,
            retired: 0,
            intake: 0,
        })
        .collect::<Vec<_>>();
    let fixture_ids = fixtures
        .iter()
        .filter(|f| season_end || f.match_date <= clock.current_date)
        .map(|f| f.id.as_str())
        .collect::<BTreeSet<_>>();
    let mut minutes = BTreeMap::<&str, i64>::new();
    for a in &t.simulated_appearances {
        if fixture_ids.contains(a.fixture_id.as_str()) {
            let v = minutes.entry(a.player_id.as_str()).or_default();
            *v = money::checked_add(*v, a.minutes.get()).map_err(invalid)?;
        }
    }
    for p in &t.players {
        let state = t
            .player_simulation_states
            .iter()
            .find(|x| x.player_id == p.id)
            .ok_or_else(|| invalid("Player simulation state is missing."))?;
        let already = t
            .development_snapshots
            .iter()
            .find(|d| {
                d.player_id == p.id
                    && d.season_id == s.id
                    && d.period == DevelopmentPeriod::Midseason
            })
            .map_or(0, |d| d.points.get().max(0));
        let role = t
            .development_plans
            .iter()
            .find(|d| d.player_id == p.id && d.season_id == s.id && d.status == OpenClosed::Open)
            .and_then(|d| d.target_role.clone());
        if let Some(change) = plan_development(&DevelopmentInput {
            age: age(p, &clock.current_date)?,
            potential: p.potential.map(SafeInt::get),
            attributes: p.attributes.clone(),
            position_group: p.position_group,
            target_role: role,
            minutes: *minutes.get(p.id.as_str()).unwrap_or(&0),
            already_applied: already,
            period,
            status: state.status,
        })
        .map_err(invalid)?
        {
            if let Some(club) = clubs
                .iter_mut()
                .find(|x| Some(&x.club_id) == p.club_id.as_ref())
            {
                club.developed += 1;
            }
            if p.club_id.as_ref() == Some(&c.managed_club_id) && attributes.len() < 40 {
                attributes.push(AttributePreview {
                    player_id: p.id.clone(),
                    name: p.name.clone(),
                    before: p.attributes.clone(),
                    after: change.after.clone(),
                    before_value_cents: p.market_value_cents,
                    after_value_cents: money(change.after_value_cents)?,
                });
            }
            changes.push((p.id.clone(), change));
        }
    }
    let mut preview = LifecyclePreview {
        campaign_id: c.id.clone(),
        season_id: s.id.clone(),
        revision: c.revision,
        source_date: clock.current_date.clone(),
        source_boundary_key: clock.last_boundary_key.clone(),
        input_fingerprint: String::new(),
        closing_label: s.label.clone(),
        id_counts: LifecycleIdCounts {
            snapshots: changes.len(),
            ..Default::default()
        },
        attributes,
        roster: Vec::new(),
        clubs,
        objectives: Vec::new(),
        managed_position: None,
        prize_cents: money(0)?,
        objective_bonus_cents: money(0)?,
        carryover_cents: money(0)?,
        allocation_cents: money(0)?,
    };
    let mut result = Plan {
        preview: preview.clone(),
        changes,
        rosters: Vec::new(),
        fixtures: Vec::new(),
        table: Vec::new(),
        registrations: Vec::new(),
    };
    if season_end {
        let year = DateOnly::parse(
            s.start_date
                .as_deref()
                .ok_or_else(|| invalid("Season dates are missing."))?,
        )
        .map_err(invalid)?
        .year()
            + 1;
        calendar::season_dates(year)
            .map_err(|_| invalid("The next season is outside the supported years."))?;
        let schedule_clubs = t
            .clubs
            .iter()
            .map(|club| {
                Ok(ScheduleClub {
                    simulation_key: key(t, &club.id)?,
                    league_tier: t
                        .leagues
                        .iter()
                        .find(|l| Some(&l.id) == club.league_id.as_ref())
                        .and_then(|l| l.tier)
                        .ok_or_else(|| invalid("The calendar requires four leagues of 18 clubs."))?
                        .get(),
                })
            })
            .collect::<Result<Vec<_>, CommandError>>()?;
        result.fixtures = schedule_season(year, &schedule_clubs).map_err(invalid)?;
        let managed_key = key(t, &c.managed_club_id)?;
        for tier in 1..=4 {
            let keys = schedule_clubs
                .iter()
                .filter(|x| x.league_tier == tier)
                .map(|x| x.simulation_key)
                .collect::<Vec<_>>();
            let mut scores = Vec::new();
            for f in fixtures.iter().filter(|f| {
                t.leagues
                    .iter()
                    .any(|l| l.id == f.league_id && l.tier.map(SafeInt::get) == Some(tier))
            }) {
                let m = t
                    .simulated_matches
                    .iter()
                    .find(|m| m.fixture_id == f.id)
                    .ok_or_else(|| invalid("A played fixture has no result."))?;
                scores.push(MatchScore {
                    home_simulation_key: key(t, &f.home_club_id)?,
                    away_simulation_key: key(t, &f.away_club_id)?,
                    home_goals: m.home_goals.get(),
                    away_goals: m.away_goals.get(),
                });
            }
            for (index, standing) in standings(&keys, &scores)
                .map_err(invalid)?
                .iter()
                .enumerate()
            {
                let position = index as i64 + 1;
                let prize = league_prize(position).map_err(invalid)?;
                if standing.simulation_key == managed_key {
                    preview.managed_position = Some(n(position)?);
                    preview.prize_cents = money(prize)?;
                }
                result.table.push(json!({"clubKey":standing.simulation_key,"leagueTier":tier,"position":position,"points":standing.points,"goalDifference":standing.goal_difference,"goalsFor":standing.goals_for,"prizeCents":prize}));
            }
        }
        let position = preview
            .managed_position
            .ok_or_else(|| invalid("Managed club is missing."))?
            .get();
        let mut bonus = 0;
        for (kind, target, reward, _) in objective_awards() {
            let met = position <= target;
            if met {
                bonus = money::checked_add(bonus, reward).map_err(invalid)?;
            }
            preview.objectives.push(ObjectivePreview {
                kind,
                target_position: n(target)?,
                reward_cents: money(reward)?,
                outcome: if met {
                    ObjectiveOutcome::Met
                } else {
                    ObjectiveOutcome::Missed
                },
            });
        }
        preview.objective_bonus_cents = money(bonus)?;
        if let Some(ConstitutionRule::SellToBuy {
            sales_reinvestment_pct,
            prize_reinvestment_pct,
            carryover_pct,
            initial_allocation_cents,
            ..
        }) = constitution
            .rules
            .iter()
            .find(|r| matches!(r, ConstitutionRule::SellToBuy { enabled: true, .. }))
        {
            let capacity = finance::transfer_capacity(
                &t.ledger_entries,
                &c.id,
                &s.id,
                &c.managed_club_id,
                sales_reinvestment_pct.get(),
                prize_reinvestment_pct.get(),
            )
            .map_err(invalid)?;
            preview.carryover_cents =
                money::floor_percent(money(capacity.remaining_cents.max(0))?, carryover_pct.get())
                    .map_err(invalid)?;
            preview.allocation_cents = *initial_allocation_cents;
        }
        let caps = constitution.rules.iter().find_map(|r| {
            if let ConstitutionRule::WageTierCap {
                enabled: true,
                key_weekly_cap_cents,
                rotation_weekly_cap_cents,
                youth_weekly_cap_cents,
            } = r
            {
                Some(TierCaps {
                    key_weekly_cap_cents: key_weekly_cap_cents.get(),
                    rotation_weekly_cap_cents: rotation_weekly_cap_cents.get(),
                    youth_weekly_cap_cents: youth_weekly_cap_cents.get(),
                })
            } else {
                None
            }
        });
        let mut roster_inputs = Vec::new();
        for club in &t.clubs {
            let state = t
                .club_simulation_states
                .iter()
                .find(|x| x.club_id == club.id)
                .ok_or_else(|| invalid("Club state is missing."))?;
            let mut players = Vec::new();
            for p in t
                .players
                .iter()
                .filter(|p| p.club_id.as_ref() == Some(&club.id))
            {
                let ps = t
                    .player_simulation_states
                    .iter()
                    .find(|x| x.player_id == p.id)
                    .ok_or_else(|| invalid("Player state is missing."))?;
                let contract = t
                    .contracts
                    .iter()
                    .find(|x| x.player_id == p.id && x.status == ContractStatus::Active);
                players.push(RosterPlayer {
                    simulation_key: ps.simulation_key.clone(),
                    age: age(p, &clock.current_date)?,
                    position_group: p.position_group,
                    attributes: result
                        .changes
                        .iter()
                        .find(|(id, _)| id == &p.id)
                        .map_or_else(|| p.attributes.clone(), |(_, x)| x.after.clone()),
                    potential: p.potential.map(SafeInt::get),
                    weekly_wage_cents: contract
                        .and_then(|x| x.weekly_wage_cents)
                        .map(MoneyCents::get),
                    expires_on: contract.and_then(|x| x.expires_on.clone()),
                    status: ps.status,
                });
            }
            roster_inputs.push(ClubRosterInput {
                simulation_key: state.simulation_key.clone(),
                academy_tier: club.academy_tier.get(),
                wage_budget_weekly_cents: state.wage_budget_weekly_cents.get(),
                managed: club.id == c.managed_club_id,
                players,
            });
        }
        let mut ordered = t.clubs.iter().collect::<Vec<_>>();
        ordered.sort_by(|a, b| key(t, &a.id).unwrap().cmp(key(t, &b.id).unwrap()));
        for (club, roster) in ordered.into_iter().zip(
            plan_roster(
                &roster_inputs,
                s.end_date
                    .as_deref()
                    .ok_or_else(|| invalid("Season end is missing."))?,
                year,
                &clock.root_seed,
                s.id.as_str(),
                caps,
            )
            .map_err(invalid)?,
        ) {
            let counts = preview
                .clubs
                .iter_mut()
                .find(|x| x.club_id == club.id)
                .expect("club counts");
            counts.renewed = roster.renewed.len();
            counts.released = roster.released.len();
            counts.retired = roster.retired.len();
            counts.intake = roster.intake.len();
            if club.id == c.managed_club_id {
                for (kind, keys) in [
                    ("retired", roster.retired.clone()),
                    (
                        "renewed",
                        roster
                            .renewed
                            .iter()
                            .map(|r| r.simulation_key.clone())
                            .collect(),
                    ),
                    ("released", roster.released.clone()),
                ] {
                    for k in keys {
                        let ps = t
                            .player_simulation_states
                            .iter()
                            .find(|x| x.simulation_key == k)
                            .expect("planned player");
                        let p = t
                            .players
                            .iter()
                            .find(|p| p.id == ps.player_id)
                            .expect("player");
                        preview.roster.push(RosterPreview {
                            name: p.name.clone(),
                            kind: kind.into(),
                        });
                    }
                }
                preview
                    .roster
                    .extend(roster.intake.iter().map(|p| RosterPreview {
                        name: p.name.clone(),
                        kind: "intake".into(),
                    }));
            }
            result.rosters.push((club.id.clone(), roster));
        }
        preview.roster.truncate(80);
        let intake = result
            .rosters
            .iter()
            .map(|(_, r)| r.intake.len())
            .sum::<usize>();
        let renewals = result
            .rosters
            .iter()
            .map(|(_, r)| r.renewed.len())
            .sum::<usize>();
        let managed = result
            .rosters
            .iter()
            .find(|(id, _)| id == &c.managed_club_id)
            .expect("managed roster");
        result.registrations = registrations(
            t,
            c,
            s,
            &managed.1,
            calendar::season_dates(year)
                .map_err(invalid)?
                .start_date
                .as_str(),
        )?;
        let registrations = result.registrations.len();
        let objective_count = objective_awards()
            .iter()
            .filter(|(k, _, _, _)| {
                !t.board_objectives
                    .iter()
                    .any(|o| o.season_id == s.id && o.kind == *k)
            })
            .count()
            + 3;
        preview.id_counts = LifecycleIdCounts {
            players: intake,
            player_states: intake,
            contracts: intake + renewals,
            registrations,
            ledger: 72
                + preview
                    .objectives
                    .iter()
                    .filter(|o| o.outcome == ObjectiveOutcome::Met)
                    .count()
                + usize::from(preview.carryover_cents.get() > 0)
                + usize::from(preview.allocation_cents.get() > 0),
            fixtures: 1224,
            seasons: 1,
            settlements: 1,
            objectives: objective_count,
            snapshots: result.changes.len(),
        };
        if t.players.len() + intake > 8000 {
            return Err(invalid("The squad list cannot grow past 8000 players."));
        }
    }
    if t.development_snapshots.len() + preview.id_counts.snapshots > 16000 {
        return Err(invalid("Development history cannot grow past 16000 rows."));
    }
    result.preview = preview;
    Ok(result)
}

pub fn preview(
    t: &SnapshotTables,
    id: &EntityId,
    season_end: bool,
) -> Result<LifecyclePreview, CommandError> {
    Ok(plan(t, id, season_end)?.preview)
}

pub fn preview_material(
    t: &SnapshotTables,
    p: &LifecyclePreview,
    season_end: bool,
) -> Result<String, CommandError> {
    let (_, _, clock) = loaded(t, &p.campaign_id)?;
    let played = t
        .fixtures
        .iter()
        .filter(|f| {
            f.season_id == p.season_id
                && f.status == FixtureStatus::Played
                && f.match_date <= p.source_date
        })
        .count();
    Ok(json!([
        p.campaign_id,
        p.season_id,
        p.revision,
        p.source_date,
        p.source_boundary_key,
        DEVELOPMENT_ENGINE_VERSION,
        clock.root_seed,
        played,
        qualifying(t, &p.campaign_id, &p.season_id)?,
        season_end
    ])
    .to_string())
}
fn operation(r: &LifecycleRequest, end: bool) -> String {
    format!(
        "season:{}:{}",
        r.season_id.as_str(),
        if end {
            "rollover"
        } else {
            "development:midseason"
        }
    )
}
pub fn replay(
    t: &SnapshotTables,
    r: &LifecycleRequest,
    end: bool,
) -> Result<Option<AdvanceOutcome>, CommandError> {
    let (c, _, clock) = loaded(t, &r.campaign_id)?;
    let op = operation(r, end);
    if let Some(receipt) = t.simulation_receipts.iter().find(|x| x.operation_key == op) {
        if receipt.input_fingerprint != r.input_fingerprint {
            return Err(conflict());
        }
        return Ok(Some(AdvanceOutcome {
            campaign_id: c.id.clone(),
            revision: c.revision,
            replayed: true,
            receipt_id: receipt.id.clone(),
            operation_key: op,
            current_date: clock.current_date.clone(),
            phase: clock.phase,
            last_boundary_key: clock.last_boundary_key.clone(),
        }));
    }
    Ok(None)
}
pub fn recheck(t: &SnapshotTables, r: &LifecycleRequest, end: bool) -> Result<(), CommandError> {
    let (c, s, clock) = loaded(t, &r.campaign_id)?;
    if c.revision != r.expected_revision
        || s.id != r.season_id
        || clock.current_date != r.source_date
        || clock.last_boundary_key != r.source_boundary_key
    {
        return Err(conflict());
    }
    if end {
        let fixtures = t
            .fixtures
            .iter()
            .filter(|f| f.season_id == s.id)
            .collect::<Vec<_>>();
        if clock.phase != CalendarPhase::Review
            || fixtures.len() != 1224
            || fixtures.iter().any(|f| f.status != FixtureStatus::Played)
        {
            return Err(conflict());
        }
        if qualifying(t, &c.id, &s.id)? > 0 {
            return Err(invalid(
                "Accept the qualifying offer before the season can roll over.",
            ));
        }
    } else {
        let halfway = t
            .fixtures
            .iter()
            .find(|f| f.season_id == s.id && f.round.get() == 17)
            .map(|f| f.match_date.as_str());
        if clock.phase != CalendarPhase::League
            || halfway != Some(r.source_date.as_str())
            || r.source_boundary_key.as_deref()
                != Some(format!("season:{}:matchday:{}", s.id.as_str(), r.source_date).as_str())
        {
            return Err(conflict());
        }
    }
    Ok(())
}
/// Assign caller-owned identities to deterministic slots before entering SQLite.
pub fn prepare(
    t: &SnapshotTables,
    r: &LifecycleRequest,
    end: bool,
) -> Result<PreparedLifecycle, CommandError> {
    validate_timestamp(&r.now).map_err(invalid)?;
    DateOnly::parse(&r.source_date).map_err(invalid)?;
    let fingerprint_material = material(t, r, end)?;
    if replay(t, r, end)?.is_some() {
        return Ok(PreparedLifecycle {
            fingerprint_material,
            after: t.clone(),
        });
    }
    recheck(t, r, end)?;
    let p = plan(t, &r.campaign_id, end)?;
    if r.ids.counts() != p.preview.id_counts {
        return Err(invalid("Lifecycle ID counts do not match the preview."));
    }
    let mut ids = BTreeSet::new();
    let existing = serde_json::to_value(t).map_err(invalid)?;
    let existing_ids = existing
        .as_object()
        .expect("snapshot tables")
        .values()
        .filter_map(|table| table.as_array())
        .flatten()
        .flat_map(|row| [row["id"].as_str(), row["actionId"].as_str()])
        .flatten()
        .collect::<BTreeSet<_>>();
    for id in [&r.receipt_id, &r.audit_id, &r.action_id]
        .into_iter()
        .chain(r.ids.players.iter())
        .chain(r.ids.player_states.iter())
        .chain(r.ids.contracts.iter())
        .chain(r.ids.registrations.iter())
        .chain(r.ids.ledger.iter())
        .chain(r.ids.fixtures.iter())
        .chain(r.ids.seasons.iter())
        .chain(r.ids.settlements.iter())
        .chain(r.ids.objectives.iter())
        .chain(r.ids.snapshots.iter())
    {
        if !ids.insert(id.as_str()) || existing_ids.contains(id.as_str()) {
            return Err(invalid("Lifecycle IDs must be new and unique."));
        }
    }
    let (c, s, clock) = loaded(t, &r.campaign_id)?;
    let mut after = t.clone();
    if end {
        for n in after.negotiations.iter_mut().filter(|n| {
            matches!(
                n.status,
                NegotiationStatus::Proposed
                    | NegotiationStatus::Countered
                    | NegotiationStatus::Agreed
            )
        }) {
            n.status = NegotiationStatus::Expired;
            n.resolved_on = s.end_date.clone();
            n.reserved_cents = money(0)?;
            n.reserved_wage_cents = money(0)?;
        }
        for o in after
            .offers
            .iter_mut()
            .filter(|o| o.status == OfferStatus::Open)
        {
            o.status = OfferStatus::Expired;
            o.resolved_on = s.end_date.clone();
        }
    }
    let period = if end {
        DevelopmentPeriod::SeasonEnd
    } else {
        DevelopmentPeriod::Midseason
    };
    for ((player_id, change), id) in p.changes.iter().zip(&r.ids.snapshots) {
        let player = after
            .players
            .iter_mut()
            .find(|x| &x.id == player_id)
            .expect("planned player");
        let state = after
            .player_simulation_states
            .iter_mut()
            .find(|x| &x.player_id == player_id)
            .expect("planned state");
        let b = &change.before;
        let a = &change.after;
        let snapshot = DevelopmentSnapshotRow {
            id: id.clone(),
            campaign_id: c.id.clone(),
            season_id: s.id.clone(),
            player_id: player_id.clone(),
            period,
            before_pace: b.pace.unwrap(),
            before_finishing: b.finishing.unwrap(),
            before_passing: b.passing.unwrap(),
            before_dribbling: b.dribbling.unwrap(),
            before_defending: b.defending.unwrap(),
            before_physical: b.physical.unwrap(),
            after_pace: a.pace.unwrap(),
            after_finishing: a.finishing.unwrap(),
            after_passing: a.passing.unwrap(),
            after_dribbling: a.dribbling.unwrap(),
            after_defending: a.defending.unwrap(),
            after_physical: a.physical.unwrap(),
            before_value_cents: player
                .market_value_cents
                .unwrap_or(money(change.before_value_cents)?),
            after_value_cents: money(change.after_value_cents)?,
            before_status: state.status,
            after_status: state.status,
            points: n(change.points)?,
            engine_version: VersionOne,
        };
        after.development_snapshots.push(snapshot);
        player.attributes = change.after.clone();
        player.market_value_cents = Some(money(change.after_value_cents)?);
        if let Some(gk) = change.goalkeeping {
            state.goalkeeping = Some(n(gk)?);
        }
    }
    let mut refs = vec![OutcomeRef::Boundary {
        key: operation(r, end),
    }];
    if end {
        let year = DateOnly::parse(s.start_date.as_deref().expect("validated date"))
            .map_err(invalid)?
            .year()
            + 1;
        let dates = calendar::season_dates(year).map_err(invalid)?;
        let next = &r.ids.seasons[0];
        let settlement = &r.ids.settlements[0];
        let mut contracts = r.ids.contracts.iter();
        let mut players = r.ids.players.iter();
        let mut states = r.ids.player_states.iter();
        for (club_id, roster) in &p.rosters {
            for (keys, retired) in [(&roster.retired, true), (&roster.released, false)] {
                for k in keys {
                    let ps = after
                        .player_simulation_states
                        .iter_mut()
                        .find(|x| &x.simulation_key == k)
                        .expect("planned state");
                    let player_id = ps.player_id.clone();
                    if retired {
                        ps.status = PlayerLife::Retired;
                    }
                    after
                        .players
                        .iter_mut()
                        .find(|p| p.id == player_id)
                        .expect("player")
                        .club_id = None;
                    for contract in after
                        .contracts
                        .iter_mut()
                        .filter(|x| x.player_id == player_id && x.status == ContractStatus::Active)
                    {
                        contract.status = ContractStatus::Ended;
                    }
                    if retired {
                        for snapshot in after.development_snapshots.iter_mut().filter(|d| {
                            d.player_id == player_id
                                && d.season_id == s.id
                                && d.period == DevelopmentPeriod::SeasonEnd
                        }) {
                            snapshot.after_status = PlayerLife::Retired;
                        }
                    }
                }
            }
            for renewal in &roster.renewed {
                let player_id = after
                    .player_simulation_states
                    .iter()
                    .find(|x| x.simulation_key == renewal.simulation_key)
                    .expect("planned state")
                    .player_id
                    .clone();
                for contract in after
                    .contracts
                    .iter_mut()
                    .filter(|x| x.player_id == player_id && x.status == ContractStatus::Active)
                {
                    contract.status = ContractStatus::Ended;
                }
                after.contracts.push(ContractRow {
                    id: contracts.next().expect("counted contract").clone(),
                    campaign_id: c.id.clone(),
                    player_id,
                    club_id: club_id.clone(),
                    weekly_wage_cents: Some(money(renewal.weekly_wage_cents)?),
                    squad_tier: Some(renewal.squad_tier),
                    starts_on: Some(renewal.starts_on.clone()),
                    expires_on: Some(renewal.expires_on.clone()),
                    status: ContractStatus::Active,
                });
            }
            for intake in &roster.intake {
                let id = players.next().expect("counted player");
                let state = states.next().expect("counted state");
                let value = generation::market_value_cents(
                    16,
                    ability::role_ability(&intake.attributes, intake.position_group)
                        .map_err(invalid)?
                        .get(),
                    intake.potential,
                )
                .map_err(invalid)?;
                after.players.push(PlayerRow {
                    id: id.clone(),
                    campaign_id: c.id.clone(),
                    club_id: Some(club_id.clone()),
                    name: intake.name.clone(),
                    position_group: intake.position_group,
                    positions: vec![intake.position],
                    nationality_code: Some(intake.nationality_code.clone()),
                    birth_date: Some(format!("{}-07-01", year - 16)),
                    reported_age: Some(n(16)?),
                    age_reference_season_ordinal: Some(n(s.ordinal.get() + 1)?),
                    market_value_cents: Some(value),
                    attributes: intake.attributes.clone(),
                    potential: Some(n(intake.potential)?),
                    source: RecordSource::Generated,
                    external_source_id: None,
                    is_newgen: true,
                });
                let gk = if intake.position_group == PositionGroup::Gk {
                    Some(ability::goalkeeper_rating(&intake.attributes).map_err(invalid)?)
                } else {
                    None
                };
                after
                    .player_simulation_states
                    .push(PlayerSimulationStateRow {
                        id: state.clone(),
                        campaign_id: c.id.clone(),
                        player_id: id.clone(),
                        simulation_key: intake.simulation_key.clone(),
                        fitness: n(100)?,
                        sharpness: n(80)?,
                        goalkeeping: gk,
                        injury_until_date: None,
                        suspension_matches: n(0)?,
                        status: PlayerLife::Active,
                        homegrown_club: true,
                        homegrown_nation: true,
                    });
                after.contracts.push(ContractRow {
                    id: contracts.next().expect("counted contract").clone(),
                    campaign_id: c.id.clone(),
                    player_id: id.clone(),
                    club_id: club_id.clone(),
                    weekly_wage_cents: Some(money(intake.weekly_wage_cents)?),
                    squad_tier: Some(SquadTier::Youth),
                    starts_on: Some(intake.starts_on.clone()),
                    expires_on: Some(intake.expires_on.clone()),
                    status: ContractStatus::Active,
                });
            }
        }
        let closing = after
            .seasons
            .iter_mut()
            .find(|x| x.id == s.id)
            .expect("closing season");
        closing.status = SeasonStatus::Closed;
        closing.closed_at = Some(r.now.clone());
        after.seasons.push(SeasonRow {
            id: next.clone(),
            campaign_id: c.id.clone(),
            label: format!("{year}/{:02}", (year + 1) % 100),
            ordinal: n(s.ordinal.get() + 1)?,
            status: SeasonStatus::Active,
            start_date: Some(dates.start_date.as_str().into()),
            end_date: Some(dates.end_date.as_str().into()),
            opened_at: r.now.clone(),
            closed_at: None,
        });
        after.season_settlements.push(SeasonSettlementRow {
            id: settlement.clone(),
            campaign_id: c.id.clone(),
            season_id: s.id.clone(),
            next_season_id: next.clone(),
            engine_version: VersionOne,
            settled_on: dates.start_date.as_str().into(),
            managed_position: p.preview.managed_position.expect("managed position"),
            prize_cents: p.preview.prize_cents,
            objective_bonus_cents: p.preview.objective_bonus_cents,
            carryover_cents: p.preview.carryover_cents,
            allocation_cents: p.preview.allocation_cents,
            table_json: serde_json::to_string(&p.table).map_err(invalid)?,
        });
        let mut objective_ids = r.ids.objectives.iter();
        let mut ledger_ids = r.ids.ledger.iter();
        for (kind, target, reward, award) in objective_awards() {
            let outcome = if p.preview.managed_position.unwrap().get() <= target {
                ObjectiveOutcome::Met
            } else {
                ObjectiveOutcome::Missed
            };
            if let Some(o) = after
                .board_objectives
                .iter_mut()
                .find(|o| o.season_id == s.id && o.kind == kind)
            {
                o.outcome = outcome;
            } else {
                after.board_objectives.push(BoardObjectiveRow {
                    id: objective_ids.next().expect("objective count").clone(),
                    campaign_id: c.id.clone(),
                    season_id: s.id.clone(),
                    club_id: c.managed_club_id.clone(),
                    kind,
                    target_position: n(target)?,
                    reward_cents: money(reward)?,
                    outcome,
                    engine_version: VersionOne,
                });
            }
            after.board_objectives.push(BoardObjectiveRow {
                id: objective_ids.next().expect("objective count").clone(),
                campaign_id: c.id.clone(),
                season_id: next.clone(),
                club_id: c.managed_club_id.clone(),
                kind,
                target_position: n(target)?,
                reward_cents: money(reward)?,
                outcome: ObjectiveOutcome::Pending,
                engine_version: VersionOne,
            });
            if outcome == ObjectiveOutcome::Met {
                award_ledger(
                    &mut after,
                    ledger_ids.next().expect("ledger count"),
                    c,
                    s,
                    next,
                    settlement,
                    dates.start_date.as_str(),
                    &c.managed_club_id,
                    reward,
                    Some(award),
                    LedgerKind::PrizeIncome,
                )?;
            }
        }
        for standing in &p.table {
            let club = t
                .club_simulation_states
                .iter()
                .find(|cs| Some(cs.simulation_key.as_str()) == standing["clubKey"].as_str())
                .expect("standing club");
            award_ledger(
                &mut after,
                ledger_ids.next().expect("ledger count"),
                c,
                s,
                next,
                settlement,
                dates.start_date.as_str(),
                &club.club_id,
                standing["prizeCents"].as_i64().expect("prize"),
                Some(AwardKind::LeaguePrize),
                LedgerKind::PrizeIncome,
            )?;
        }
        for (amount, kind) in [
            (p.preview.allocation_cents, LedgerKind::InitialAllocation),
            (p.preview.carryover_cents, LedgerKind::ApprovedCarryover),
        ] {
            if amount.get() > 0 {
                award_ledger(
                    &mut after,
                    ledger_ids.next().expect("ledger count"),
                    c,
                    s,
                    next,
                    settlement,
                    dates.start_date.as_str(),
                    &c.managed_club_id,
                    amount.get(),
                    None,
                    kind,
                )?;
            }
        }
        for (f, id) in p.fixtures.iter().zip(&r.ids.fixtures) {
            let home = t
                .club_simulation_states
                .iter()
                .find(|c| c.simulation_key == f.home_simulation_key)
                .expect("home club");
            let away = t
                .club_simulation_states
                .iter()
                .find(|c| c.simulation_key == f.away_simulation_key)
                .expect("away club");
            let league = t
                .leagues
                .iter()
                .find(|l| l.tier.map(SafeInt::get) == Some(f.league_tier))
                .expect("league");
            after.fixtures.push(FixtureRow {
                id: id.clone(),
                campaign_id: c.id.clone(),
                season_id: next.clone(),
                league_id: league.id.clone(),
                round: n(f.round as i64)?,
                match_date: f.match_date.as_str().into(),
                home_club_id: home.club_id.clone(),
                away_club_id: away.club_id.clone(),
                fixture_key: f.fixture_key.clone(),
                status: FixtureStatus::Scheduled,
            });
        }
        for (slot, id) in p.registrations.iter().zip(&r.ids.registrations) {
            let state = after
                .player_simulation_states
                .iter()
                .find(|s| s.simulation_key == slot.key)
                .expect("player state");
            after.registrations.push(RegistrationRow {
                id: id.clone(),
                campaign_id: c.id.clone(),
                season_id: next.clone(),
                player_id: state.player_id.clone(),
                competition_key: "league".into(),
                status: RegistrationStatus::Registered,
                homegrown_club: slot.homegrown_club,
                homegrown_nation: slot.homegrown_nation,
                age_exempt: Some(slot.age_exempt),
                provenance: slot.provenance,
            });
        }
        let clock = after
            .simulation_states
            .iter_mut()
            .find(|x| x.campaign_id == c.id)
            .expect("clock");
        clock.active_season_id = next.clone();
        clock.current_date = dates.start_date.as_str().into();
        clock.phase = CalendarPhase::Preseason;
        clock.last_boundary_key = None;
        after
            .campaigns
            .iter_mut()
            .find(|x| x.id == c.id)
            .expect("campaign")
            .active_season_id = next.clone();
        refs = vec![OutcomeRef::Settlement {
            id: settlement.clone(),
        }];
    }
    let revision = guards::next_revision(c.revision).map_err(invalid)?;
    let campaign = after
        .campaigns
        .iter_mut()
        .find(|x| x.id == c.id)
        .expect("campaign");
    campaign.revision = revision;
    campaign.updated_at = r.now.clone();
    after.simulation_receipts.push(SimulationReceiptRow {
        id: r.receipt_id.clone(),
        campaign_id: c.id.clone(),
        operation_key: operation(r, end),
        input_revision: r.expected_revision,
        input_fingerprint: r.input_fingerprint.clone(),
        event_seed: n(random::derive_event_seed(
            &clock.root_seed,
            DEVELOPMENT_ENGINE_VERSION,
            random::EventKind::Development,
            &[&operation(r, end)],
        )
        .map_err(invalid)? as i64)?,
        simulation_version: VersionOne,
        outcome_refs: refs,
        created_at: r.now.clone(),
    });
    after.audit_events.push(AuditEventRow{id:r.audit_id.clone(),campaign_id:c.id.clone(),season_id:Some(s.id.clone()),action_id:r.action_id.clone(),action_type:if end{AuditAction::SeasonSettle}else{AuditAction::DevelopmentApply},created_at:r.now.clone(),summary:if end{"Settled the season and opened the next season."}else{"Applied halfway player development."}.into(),payload:row(json!({"operationKey":operation(r,end),"inputFingerprint":r.input_fingerprint,"revision":revision}))?});
    Ok(PreparedLifecycle {
        fingerprint_material,
        after,
    })
}
#[allow(clippy::too_many_arguments)]
fn award_ledger(
    t: &mut SnapshotTables,
    id: &EntityId,
    c: &CampaignRow,
    s: &SeasonRow,
    next: &EntityId,
    settlement: &EntityId,
    date: &str,
    club: &EntityId,
    amount: i64,
    award: Option<AwardKind>,
    kind: LedgerKind,
) -> Result<(), CommandError> {
    t.ledger_entries.push(LedgerEntryRow {
        id: id.clone(),
        campaign_id: c.id.clone(),
        season_id: next.clone(),
        club_id: club.clone(),
        kind,
        amount_cents: money(amount)?,
        effective_on: date.into(),
        source_action_id: settlement.clone(),
        reverses_entry_id: None,
        note: None,
        earning_season_id: award.map(|_| s.id.clone()),
        settlement_id: award.map(|_| settlement.clone()),
        award_kind: award,
    });
    if award.is_some() {
        let state = t
            .club_simulation_states
            .iter_mut()
            .find(|x| &x.club_id == club)
            .expect("club state");
        state.transfer_balance_cents = money(
            money::checked_add(state.transfer_balance_cents.get(), amount).map_err(invalid)?,
        )?;
    }
    Ok(())
}
