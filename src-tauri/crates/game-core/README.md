# Native foundations

Standalone is the only campaign model ([DEC-006](../../../DECISIONS.md)). The core has one playable generator (`2`), Challenge/Sandbox rule choices and native standalone creation, management and progression. Unsupported creation/edit variants do not deserialize; no manual generator, historical reader or compatibility API remains. Portable snapshots accept SQLite origin/source schema 2 with 21 standalone collections and a required clock.

The core exposes pure models and functions for the native application services.
It has no storage, platform, network, ambient clock or ambient RNG dependency.
Pure progression plans support July 1 to the summer deadline and September 1 kickoff; application/storage services commit them atomically. No Tauri command or persistence runs in this crate.

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
types are public for native services. New pure types are not IPC commands. Standalone DTOs generate the frontend bindings.

From `src-tauri`, run `cargo test -p game-core --test foundations --locked` for
native arithmetic, finance, policy, eligibility, selection, date, randomness,
calendar and guard properties. Synthetic NM-G01 rows supply test data without
using old business-rule output as an oracle. Supported standalone snapshot integrity is covered by native snapshot and SQLite tests. Unknown modes and unsupported formats are rejected without normalization. `crate_boundary` also checks all
core source modules against forbidden platform/time/randomness dependencies.

NM-G05 adds native generators and pure career preparation:

- `generate_playable_world` accepts native generator `2`: 4 leagues, 18 clubs per
  league, 2,880 owned players and 120 free agents. Rosters cycle from 36 to 44
  players. Each club's first 20 slots guarantee two goalkeepers, six defenders,
  seven midfielders and five forwards; its first 25 are seniors, and the first 12
  have explicit fictional club-homegrown status. Both board presets and all four
  supported formations have a feasible registration, XI and seven-player bench.
- The standalone stream identity is `world/native-world:2`. Only
  seed/version choose football content. Campaign IDs scope persistence identities;
  the explicit 1900–2198 start year determines July–June dates and contract bounds.
  Contract lengths are clipped at the supported date ceiling in 2199. Per DEC-003,
  version labels do not promise the previous JavaScript world or draw order.
- Role weights live in `ability`; complete six-attribute ratings are required.
  Each attribute is drawn from a 25-value window shifted by prestige.
  Potential ranges from role ability through at most +15 (age ≤23) or
  +8 (older), capped at 100. Goalkeepers have a separate declared profile rating.
- The fictional age factor is `max(50, 100 - 3 * abs(age - 27))`. Value is the floor
  of `(ability * 5,000,000 + upside * 2,000,000 * youthMultiplier) * ageFactor / 100`
  cents, where upside is potential minus ability and the multiplier is 2 through
  age 23. Wages use 2,000/12,000/25,000 cents per ability point for Youth/Rotation/Key,
  apply the same age factor, then cap at the Strict tier ceilings. Ages ≤21 are
  Youth; other players with ability ≥70 are Key, with the remainder Rotation.
- Each owned player has one active, complete contract; free agents have none.
  Club transfer funds are `100,000,000 + prestige * 4,000,000` cents. Weekly wage
  budgets cover current commitments plus `max(100,000, floor(commitment / 5))`.
  These club funds are distinct from the managed board's opening allocation.
- `prepare_standalone_career` validates settings, explicit IDs and audit timestamp
  before returning a `PreparedCareer`. The result has one revision-0 campaign,
  active season, July 1 clock, constitution, opening allocation, initialization
  receipt and audit. Retry fingerprints exclude generated IDs and audit time;
  selected club, seed, year, rules and preset remain part of the identity.
- `validate_prepared_career` checks world legality and exact initialization headers
  for the supplied settings. `into_tables` maps the result to the 21 standalone-row
  arrays for the app/store atomic creation service; import uses saved rows directly.

Run `cargo test -p game-core --test generation --locked` for complete native worlds,
repeated serialized output, Unicode seeds, alternate campaign/year inputs, all
mode/preset combinations, representative club selections and malformed-world or
initialization rejection. These tests assert native invariants, not old-world parity.

NM-G07 adds pure management actions in `management.rs`. The store calls these
against a scoped snapshot inside its write transaction, then validates the full
result before writing changed rows. Action fingerprints and saved audits make a
retry return the current persisted revision. New actions advance revision and
append one audit; deletion returns no surviving revision or fictitious audit.
Challenge constitutions are locked. Standalone player
and club edits are forbidden. Registration derives standalone homegrown facts
and age in Rust. Constitution versions are immutable, and changing an opening
allocation cannot issue a second allocation, including after reversal.

P07-G07a removed manual-mode variants, the unused generator/demo, compatibility-only commands and import normalization. Tests use supported standalone inputs. Constitution edits never create an allocation; initialization, scope, revision and progression guards remain authoritative.
