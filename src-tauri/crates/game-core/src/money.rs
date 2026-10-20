use crate::{CoreError, CoreResult, MoneyCents, SafeInt};

pub const INVALID_MONEY: &str = "Enter a non-negative euro amount with at most two decimal places.";

pub fn parse_money_cents(input: &str) -> CoreResult<MoneyCents> {
    let text = crate::js_trim(input);
    let text = text.strip_prefix('€').map_or(text, crate::js_trim);
    let mut parts = text.split('.');
    let whole = parts.next().unwrap_or("");
    let fraction = parts.next();
    if parts.next().is_some()
        || whole.is_empty()
        || whole.len() > 13
        || !whole.bytes().all(|c| c.is_ascii_digit())
        || (whole.len() > 1 && whole.starts_with('0'))
        || fraction.is_some_and(|part| {
            part.is_empty() || part.len() > 2 || !part.bytes().all(|c| c.is_ascii_digit())
        })
    {
        return Err(CoreError::Invalid(INVALID_MONEY));
    }
    let whole = whole
        .parse::<i64>()
        .map_err(|_| CoreError::Invalid(INVALID_MONEY))?;
    let fraction = match fraction {
        Some(part) => {
            part.parse::<i64>()
                .map_err(|_| CoreError::Invalid(INVALID_MONEY))?
                * if part.len() == 1 { 10 } else { 1 }
        }
        None => 0,
    };
    MoneyCents::new(
        whole
            .checked_mul(100)
            .and_then(|value| value.checked_add(fraction))
            .ok_or(CoreError::Arithmetic)?,
    )
}

pub fn format_money_euros(cents: MoneyCents) -> String {
    let whole = (cents.get() / 100).to_string();
    let mut grouped = String::new();
    for (index, c) in whole.chars().enumerate() {
        if index > 0 && (whole.len() - index).is_multiple_of(3) {
            grouped.push(',');
        }
        grouped.push(c);
    }
    format!("€{grouped}.{:02}", cents.get() % 100)
}
pub fn format_money_unknown(cents: Option<MoneyCents>) -> String {
    cents.map_or_else(|| "Unknown".into(), format_money_euros)
}
pub fn checked_add(left: i64, right: i64) -> CoreResult<i64> {
    SafeInt::new(left)?;
    SafeInt::new(right)?;
    Ok(SafeInt::new(left.checked_add(right).ok_or(CoreError::Arithmetic)?)?.get())
}
pub fn checked_sub(left: i64, right: i64) -> CoreResult<i64> {
    SafeInt::new(left)?;
    SafeInt::new(right)?;
    Ok(SafeInt::new(left.checked_sub(right).ok_or(CoreError::Arithmetic)?)?.get())
}

/// Exact nonnegative integer flooring; every returned amount is JS-safe.
pub fn floor_percent(cents: MoneyCents, percent: i64) -> CoreResult<MoneyCents> {
    if !(0..=100).contains(&percent) {
        return Err(CoreError::Invalid("Invalid percentage."));
    }
    let product = cents
        .get()
        .checked_mul(percent)
        .ok_or(CoreError::Arithmetic)?;
    MoneyCents::new(product / 100)
}
