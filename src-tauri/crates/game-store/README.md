# Native standalone SQLite store

`Store::open` starts one connection worker with an eight-request queue. Call its blocking methods from the native adapter's blocking executor. Rust owns scoped queries, validation, revisions, logical receipts and atomic writes. No SQL or arbitrary filesystem API crosses IPC.

The product uses fresh standalone schema 2, initialized by `migrations/0002_standalone.sql`. It contains 21 standalone collections plus schema and transport-import metadata. Campaigns allow only standalone mode; manual match journals and appearances are absent. Earlier database versions and nonempty unversioned files are refused without migration, deletion or conversion. Tests verify the rejected file remains byte-for-byte intact. Existing user files are never reset by cleanup.

`database_path` uses the stable Tauri app-local directory. Production uses `touchline.sqlite3`; development and test profiles have separate subdirectories. Integration tests use temporary files exclusively.

Portable snapshots accept only SQLite origin/source schema 2 and explicit standalone contracts. Required mode, rule choice, generator, seed and clock metadata are validated; there is no browser-v1 normalization or historical-save reader. Import validates limits, identities, numeric ranges, references and revision before one immediate transaction. A separate SHA-256 transport receipt makes exact-byte retries harmless after later management or progression. Different-content collisions refuse.

Export reads all 21 collections and their campaign revision in one transaction. Online backup includes committed WAL pages, validates the staged file after reopen and preserves the previous destination on failure. Live database/sidecar destinations are refused. File selection is owned by native dialogs.

Creation prepares the supported 72-club/3,000-player world outside the write transaction, then rechecks identities and receipts at commit. Management and Continue reload a consistent scoped snapshot, run pure core validation and commit changed rows with audit/receipt/revision together. Continue stops at September 1 kickoff. Demo reset targets only the standalone demo; other careers remain unchanged.

Run `cargo test -p game-store --locked` from `src-tauri`. Real-file tests cover constraints, supported snapshot round trips, concurrent retries, read isolation, partial-insert and late-audit failures, rollback, backup/reopen, scoped deletion/reset and unsupported inputs. The native fixtures under `src-tauri/fixtures` are independent standalone inputs; captured browser fixtures remain historical references, outside the supported import contract.

Dependencies remain pinned rusqlite 0.40.2 (`bundled`, `backup`) and sha2 0.11.1. No dependency or lockfile change was required by P07-G07a.
