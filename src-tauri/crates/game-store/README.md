# Native SQLite store

`Store::open` starts one connection worker with an eight-request queue. Its blocking
methods belong on the native adapter's blocking executor, not the UI thread.
Tauri startup manages its lifetime; IPC and gameplay services still wait for NM-G06
and subsequent guides. The shell continues to report those services unavailable.

`database_path` takes Tauri's app-local data directory. Production uses
`touchline.sqlite3` directly under that directory; development and test profiles use
their own subdirectories. Integration tests inject temporary paths and never use
application saves.

SQLite schema 1 starts independently of IndexedDB 1/2. Its only predecessor is an
empty SQLite schema 0; there is no earlier native application schema to upgrade.
Migration is transactional, records `schemaMigrations`, and refuses unknown schemas
or nonempty unversioned databases. Foreign keys remain enabled, including deferred
campaign/season/managed-club cycles. All source scalar fields have individual typed
SQL columns; colors, attributes, rules, lineups, audit payloads and other nested
collections use JSON columns. `mapping.rs` explicitly maps all 23 source arrays.

Import parses, checks limits/types/references/identities/revision and computes the
actual input bytes' SHA-256 before queueing. Only source v1 missing legacy/sandbox
metadata and simulation arrays are normalized. A single immediate transaction
inserts all rows and a separate `transportImports` receipt. Exact-byte retries return
the original campaign ID and imported revision, even after later play. Different
content with an existing campaign ID is refused. No gameplay audit or revision is
added. Deleting a campaign cascades its owned rows and transport receipts.

Export reads every campaign array and its revision in one read transaction. Envelope
ID/time are explicit caller inputs. The returned typed snapshot has SQLite origin
and schema 1; serialization and final validation happen after the read transaction.

Online backup uses a separate, exclusively created sibling staging file. It checks
SQLite integrity, foreign keys, migration metadata and every campaign's DTOs after
closing/reopening that file, syncs it, then replaces the destination by rename. A
failure leaves the previous destination intact. Live database/sidecar destinations
and destinations with active journals are refused. The backup has a 30-second
deadline, and uses SQLite's backup API to include committed WAL pages. Destination
files must be closed before replacement; dialogs/file selection are NM-G06 work.

Dependencies introduced here: pinned rusqlite 0.40.2 (`bundled`, `backup`) and sha2
0.11.1, verified against their published APIs and the pinned Rust/MSVC toolchain.
See [rusqlite backup](https://docs.rs/rusqlite/0.40.2/rusqlite/backup/index.html),
[SHA-256](https://docs.rs/sha2/0.11.1/sha2/), and
[deferred SQLite foreign keys](https://www.sqlite.org/foreignkeys.html#fk_deferred).

Run `cargo test -p game-store --locked` from `src-tauri` for real temporary-file
schema/import/retry/rollback/export/backup/concurrency tests against the independently
committed TypeScript fixtures. Browser compatibility fixtures and source schemas are
unchanged. Continue, native generation and gameplay writes remain later guides.
