# Native foundations

The core exposes pure models and functions for the native application services.
It has no storage, platform, network, ambient clock or ambient RNG dependency.
NM-G04 adds rules and previews; no persisted clock advancement or IPC feature is
enabled by this crate.

- `money` parses integer euro cents, formats unknown/signed capacities and performs
  checked arithmetic. Percentage credits use exact integer flooring, including at
  the JavaScript safe-integer limit. Unsafe totals and invalid percentages fail.
- `finance` scopes ledger and wage calculations by campaign and club/season,
  excludes reversed ledger effects, preserves unknown wages, and produces policy
  and financial previews. Wage changes replace the known previous commitment;
  callers supply `replaced_wage` from authoritative state. Without that input the
  projected wage total is unknown. Incoming transfers add their proposed wage.
- `dates` validates Gregorian dates (1900–2199), UTC timestamps, bounded day
  arithmetic and exact/estimated/unknown age. No current system date is consulted.
- `policy` implements Balanced, Strict and disabled Custom presets, typed action
  parsing, evidence/remedies and blocking/warning verdicts. Offer qualification
  uses checked i128 products for exact ratios. Registration distinguishes explicit
  exemptions, unknown eligibility, duplicates and competition quotas.
- `selection` defines formation slot identities/groups and pure draft operations.
  Moves remove previous positions and replace occupied slots; benches allow at
  most 12 players. Roster validation detects duplicates, foreign players and slots.
  SVG coordinates and drawing stay in the UI.
- `guards` exposes typed scope, active-season, managed-player, mode, Challenge and
  optimistic-revision checks for later services to compose. They do not mutate
  data. Required service enforcement arrives with the corresponding write guides.
- `random` uses explicit UTF-16/FNV seed hashing and wrapping Mulberry32 as a chosen
  deterministic algorithm. Event namespaces and ordered JSON fingerprints separate
  logical operations. No guarantee of compatibility with previous TypeScript
  worlds or logic is required by DEC-003. Random integer spans must be positive.
- `calendar` validates clock/season pairs and previews July → summer deadline →
  kickoff. Consuming the deadline closes the window on the same date; a consumed
  kickoff reports match simulation unavailable. These APIs return values without
  writing a clock or inventing future fixtures.

Money, IDs and safe integers have validated public constructors; existing saved-row
types are public for native services. New pure types are not IPC commands. Existing
snapshot DTOs and generated bindings remain unchanged.

From `src-tauri`, run `cargo test -p game-core --test foundations --locked` for
native arithmetic, finance, policy, eligibility, selection, date, randomness,
calendar and guard properties. Synthetic NM-G01 rows supply test data without
using old business-rule output as an oracle. Source import compatibility remains
covered separately by snapshot and SQLite tests. `crate_boundary` also checks all
core source modules against forbidden platform/time/randomness dependencies.
