//! Local, sanitized diagnostics at error translation boundaries.
use std::sync::atomic::{AtomicU64, Ordering};

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

pub struct Diagnostic<'a, E: ?Sized> {
    pub correlation_id: u64,
    pub operation: &'a str,
    pub category: &'a str,
    pub cause: &'a E,
}

/// Typed causes remain available to a local sink. Default output excludes raw
/// messages, paths and saved content.
pub fn report<E: ?Sized>(operation: &str, category: &str, cause: &E) {
    emit(operation, category, cause, local);
}

pub fn local<E: ?Sized>(event: Diagnostic<'_, E>) {
    eprintln!(
        "touchline diagnostic id={} operation={} category={}",
        event.correlation_id, event.operation, event.category
    );
}

pub fn emit<E: ?Sized>(
    operation: &str,
    category: &str,
    cause: &E,
    sink: impl FnOnce(Diagnostic<'_, E>),
) {
    sink(Diagnostic {
        correlation_id: NEXT_ID.fetch_add(1, Ordering::Relaxed),
        operation,
        category,
        cause,
    });
}
