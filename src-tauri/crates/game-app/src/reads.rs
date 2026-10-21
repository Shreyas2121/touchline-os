use game_core::{
    dates::{display_age, AgeDisplay, DateOnly},
    finance::*,
    policy::*,
    queries::*,
    *,
};
use game_store::{ScreenRead, Store, StoreError};

pub fn store_error(error: StoreError) -> CommandError {
    match error {
        StoreError::NotFound => validation("This campaign or record was not found."),
        StoreError::Collision(_) => validation(
            "A different save already uses this campaign ID. Import cannot overwrite it.",
        ),
        StoreError::Invalid(_) | StoreError::UnsupportedSchema(_) => {
            validation("The file or query is invalid or unsupported.")
        }
        _ => CommandError::Internal {
            message: "The native storage operation failed. Your existing saves were preserved."
                .into(),
        },
    }
}
pub fn validation(message: &str) -> CommandError {
    CommandError::Validation {
        message: message.into(),
    }
}
fn core_error(error: CoreError) -> CommandError {
    validation(&error.to_string())
}
fn report(label: &str, result: RuleReport) -> NativeReport {
    NativeReport {
        label: label.into(),
        allowed: result.allowed,
        verdicts: result
            .verdicts
            .into_iter()
            .map(|v| NativeVerdict {
                code: v.code,
                message: v.message,
                remedy: v.remedy,
            })
            .collect(),
    }
}
fn finance(read: &ScreenRead) -> CoreResult<(NativeFinance, PolicySnapshot, WageSummary)> {
    let campaign = &read.model.rows.campaigns[0];
    let constitution = read
        .financial
        .constitutions
        .iter()
        .max_by_key(|c| c.version.get());
    let (sales, prizes) = constitution
        .and_then(|c| {
            c.rules.iter().find_map(|r| match r {
                ConstitutionRule::SellToBuy {
                    sales_reinvestment_pct,
                    prize_reinvestment_pct,
                    ..
                } => Some((sales_reinvestment_pct.get(), prize_reinvestment_pct.get())),
                _ => None,
            })
        })
        .unwrap_or((0, 0));
    let capacity = transfer_capacity(
        &read.financial.ledger_entries,
        &campaign.id,
        &campaign.active_season_id,
        &campaign.managed_club_id,
        sales,
        prizes,
    )?;
    let wages = wage_commitment(
        &read.financial.contracts,
        &campaign.id,
        &campaign.managed_club_id,
    )?;
    let summary = WageSummary {
        known_cents: MoneyCents::new(wages.known_cents)?,
        unknown_count: SafeInt::new(wages.unknown_count)?,
    };
    let snapshot = PolicySnapshot {
        revision: campaign.revision,
        remaining_capacity_cents: if constitution.is_some() {
            Some(SafeInt::new(capacity.remaining_cents)?)
        } else {
            None
        },
    };
    let tiers = wages
        .by_tier
        .into_iter()
        .map(|(key, tier)| {
            Ok((
                key,
                format_wage_commitment(WageSummary {
                    known_cents: MoneyCents::new(tier.known_cents)?,
                    unknown_count: SafeInt::new(tier.unknown_count)?,
                })?,
            ))
        })
        .collect::<CoreResult<_>>()?;
    Ok((
        NativeFinance {
            capacity: format_capacity(snapshot.remaining_capacity_cents)?,
            wages: format_wage_commitment(summary)?,
            tiers,
        },
        snapshot,
        summary,
    ))
}
pub fn read_screen(store: &Store, query: ScreenQuery) -> Result<ScreenModel, CommandError> {
    let read = store.screen(query).map_err(store_error)?;
    let (finance, snapshot, _) = finance(&read).map_err(core_error)?;
    let mut model = read.model;
    model.finance = Some(finance);
    let season = model
        .rows
        .seasons
        .iter()
        .find(|s| s.id == model.rows.campaigns[0].active_season_id);
    model.player_facts = model
        .rows
        .players
        .iter()
        .map(|player| {
            let profile = model
                .rows
                .player_simulation_states
                .iter()
                .find(|p| p.player_id == player.id);
            let age = match season
                .map(|s| display_age(player, s))
                .unwrap_or(AgeDisplay::Unknown)
            {
                AgeDisplay::Exact { years } => years.to_string(),
                AgeDisplay::Estimated { years } => format!("~{years} (estimated)"),
                AgeDisplay::Unknown => "Unknown".into(),
            };
            PlayerFact {
                player_id: player.id.clone(),
                age,
                availability: profile
                    .map_or("Unknown", |p| {
                        if p.injury_until_date.as_ref().is_some_and(|date| {
                            model
                                .rows
                                .simulation_states
                                .first()
                                .is_some_and(|clock| date >= &clock.current_date)
                        }) {
                            "Injured"
                        } else if p.suspension_matches.get() > 0 {
                            "Suspended"
                        } else {
                            "Available"
                        }
                    })
                    .into(),
                homegrown_club: profile.map(|p| p.homegrown_club),
                homegrown_nation: profile.map(|p| p.homegrown_nation),
            }
        })
        .collect();
    for lineup in &model.rows.lineups {
        let draft = selection::LineupDraft {
            name: lineup.name.clone(),
            formation: lineup.formation,
            starters: lineup.starters.clone(),
            bench_player_ids: lineup
                .bench_player_ids
                .iter()
                .map(|id| id.as_str().into())
                .collect(),
        };
        let ids = read
            .selection
            .players
            .iter()
            .map(|p| p.id.as_str())
            .collect::<Vec<_>>();
        let problems = selection::lineup_problems(&draft, &ids);
        model.reports.push(NativeReport {
            label: lineup.name.clone(),
            allowed: problems.is_empty(),
            verdicts: problems
                .into_iter()
                .map(|p| NativeVerdict {
                    code: format!("{p:?}"),
                    message: format!("Saved lineup: {p:?}"),
                    remedy: "Review the saved selection when native editing is available.".into(),
                })
                .collect(),
        });
    }
    if let (Some(constitution), Some(season)) = (
        model
            .rows
            .constitutions
            .iter()
            .max_by_key(|c| c.version.get()),
        season,
    ) {
        if !read.selection.registrations.is_empty() && season.start_date.is_some() {
            let keys = read
                .selection
                .registrations
                .iter()
                .map(|r| r.competition_key.clone())
                .collect::<std::collections::BTreeSet<_>>();
            for key in keys {
                let players = read
                    .selection
                    .registrations
                    .iter()
                    .filter(|r| r.competition_key == key)
                    .map(|r| {
                        let player = read.selection.players.iter().find(|p| p.id == r.player_id);
                        let profile = read
                            .selection
                            .player_simulation_states
                            .iter()
                            .find(|p| p.player_id == r.player_id);
                        let age = player.and_then(|p| match display_age(p, season) {
                            AgeDisplay::Exact { years } | AgeDisplay::Estimated { years } => {
                                SafeInt::new(years).ok()
                            }
                            _ => None,
                        });
                        RegistrationPlayer {
                            player_id: r.player_id.clone(),
                            status: r.status,
                            homegrown_club: profile.map(|p| p.homegrown_club).or(r.homegrown_club),
                            homegrown_nation: profile
                                .map(|p| p.homegrown_nation)
                                .or(r.homegrown_nation),
                            age_exempt: r.age_exempt,
                            age,
                        }
                    })
                    .collect();
                let action = PolicyAction::Registration {
                    competition_key: key.clone(),
                    players,
                };
                model.reports.push(report(
                    &key,
                    evaluate_action(
                        &action,
                        &snapshot,
                        constitution,
                        &DateOnly::parse(
                            season.start_date.as_deref().expect("checked season date"),
                        )
                        .map_err(core_error)?,
                    )
                    .map_err(core_error)?,
                ));
            }
        }
    }
    Ok(model)
}
pub fn preview(store: &Store, query: PreviewQuery) -> Result<NativePreview, CommandError> {
    query.action.validate().map_err(core_error)?;
    if matches!(
        query.action,
        PolicyAction::Registration { .. } | PolicyAction::SeasonRollover { .. }
    ) {
        return Err(validation(
            "Use the authoritative saved registration report. Season rollover is unavailable.",
        ));
    }
    let read = store
        .screen(ScreenQuery {
            campaign_id: query.campaign_id,
            screen: Screen::Finance,
            page: SafeInt::new(0).map_err(core_error)?,
            search: String::new(),
            all_players: false,
        })
        .map_err(store_error)?;
    if read.model.revision != query.expected_revision {
        return Err(validation("This preview is stale. Reload the campaign."));
    }
    let (_, snapshot, wages) = finance(&read).map_err(core_error)?;
    let constitution = read
        .model
        .rows
        .constitutions
        .iter()
        .max_by_key(|c| c.version.get())
        .ok_or_else(|| validation("This campaign has no saved constitution."))?;
    let result = preview_action(
        &query.action,
        &snapshot,
        constitution,
        &DateOnly::parse(&query.effective_date).map_err(core_error)?,
        wages,
        None,
    )
    .map_err(core_error)?;
    Ok(NativePreview {
        revision: read.model.revision,
        report: report("Action preview", result.report),
        before_capacity: result.before_capacity,
        after_capacity: result.after_capacity,
        before_wages: result.before_wages,
        after_wages: result.after_wages,
    })
}
