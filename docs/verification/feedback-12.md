# Feedback 12: source coverage and promise handling

The Rust boundary integration test recursively discovers `.rs` files under
`game-core/src`, including `progression.rs`, `matchday.rs`, `match_engine.rs` and
nested market modules. Discovery failures fail the test. Fixtures check nested
discovery, rejection of a forbidden filesystem import, acceptance of pure code
and exclusion of non-Rust files. Filesystem access stays in integration tests.
The scanner retains its existing token checks; it is not a Rust syntax parser.

ESLint uses `tsconfig.app.json` for application and test sources, and
`tsconfig.node.json` for tool configuration and browser tests. Both projects
enable `no-floating-promises` and `no-misused-promises` with their default checks.
Existing import restrictions remain enabled.

The separate audit of intentional `void` calls found:

- UI event/effect entry points generally call async functions that catch failures
  and update error state. Offer recording, rejection and acceptance had only
  `finally` cleanup; all three now catch unexpected failures and allow retry.
- Native read effects have a promise rejection handler. Planning/player loader
  callbacks are consumed by that hook. Migration callbacks are awaited by the
  migration runner. Native editor send callbacks handle errors in the management
  panel. Campaign reload callbacks are awaited by their callers.
- Navigation promises and campaign success callbacks are now awaited within error
  handling, including opening an already saved career.
- The native adapter's negative type examples are inside a function that is never
  invoked. Other non-promise `void` expressions discard unused values.

Validation: full ESLint and TypeScript checks; focused offer, career refresh,
native management, workspace and boundary tests; Rust boundary integration tests;
workspace Clippy with warnings denied; formatting checks on changed sources.
