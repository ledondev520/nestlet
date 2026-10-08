# Private original-file operations: manual backup, restore and export

Implementation/test scope, 2026-10-07. These commands are prepared and tested with genuine disposable SQLite databases and synthetic bytes. They have not been run against production data, scheduled, deployed or connected to external storage.

## What persistence does and does not protect

`NESTLET_DB_PATH` names the private SQLite database; `NESTLET_ASSETS_PATH` optionally names the private originals directory. Default originals path is the `assets` subdirectory beside the database. Both must stay outside the public/static root. Directories are 0700, files 0600, owned by the service account, with no symlinks or hardlinks. SQLite stores owner IDs, case/customer associations, immutable metadata, extracted text and normalized search text. The UUID-derived `.blob` files retain original bytes. The binary directory and database must be treated as one dataset.

A Docker volume survives process/container recreation; that is persistence, not a backup. A second copy on the same server protects against an accidental bad edit but not server/disk loss. This release prepares an explicit local copy only. Off-host/encrypted storage, rotation, recovery-time/recovery-point targets, retention and automatic scheduling require a separate reviewed decision. No private bytes are sent to third parties by these commands. CLI stdout is safe-count metadata only; do not print manifest contents into deployment logs.

Backups contain all user records, password hashes and private documents. Keep them in an owner-only directory under the same authorized service account; do not attach them to issues/chat, add them to Git, serve them through HTTP or send them to model providers. Keep environment/provider credentials separate: they are not included in SQLite snapshots. There is no application-level encryption claim.

## Manual backup

Run only from an authorized private terminal using the Node24 application runtime. Example paths below are placeholders, never production defaults:

```sh
node scripts/private-data.js backup \
  --db /private/data/nestlet.sqlite \
  --assets /private/data/assets \
  --output /private/backups/nestlet-2026-10-07-new
node scripts/private-data.js verify --input /private/backups/nestlet-2026-10-07-new
```

Output must not already exist. The command uses SQLite's consistent backup API, then copies exactly the immutable originals referenced by that snapshot. An upload commits metadata only after the original has been fsynced; immutable originals are never automatically removed. This makes a consistent snapshot possible while the service runs. Every original is checked for owner/mode/link safety, size and SHA-256, and the completed backup is verified against SQLite integrity, foreign keys, the database digest and the inventory manifest. The backup contains `nestlet.sqlite`, `assets/<uuid>.blob`, and `manifest.json`.

An operation in progress or failed retains an `INCOMPLETE` marker and must not be used for restore. There is no success if a referenced file is missing, unsafe or corrupt. Unreferenced files (for example after a process crash between binary write and DB commit, or a concurrent later upload) are counted in `unreferencedFiles`; they are not deleted. Investigate them with a verified data owner before deciding what to retain. An ordinary later upload can also appear unreferenced relative to an earlier snapshot.

The tool recognizes Nestlet schema1–9 and never migrates a source database. For a pre-upgrade schema3 backup it records schemaVersion:3, snapshots all existing tables unchanged and uses an empty original-file inventory; the supplied source assets path may not exist and is not created. A schema4 or later source requires its existing private originals directory. Schema6 snapshots preserve the administrator capability and append-only audit tables. A schema5 snapshot must remain unchanged for pre-schema6 rollback; rehearse schema5→6 only in a separate restored copy. Schema7 snapshots additionally preserve conversational review intents and receipts. For every schema5+ restore, all pending and provider-accepted registration/binding/reset actions are cleared only in the restored copy; fresh links are required, while accounts, password hashes, verified email bindings and mail rate limits retain their snapshot values. Password changes after that snapshot are not retained and must be assessed before cutover. Schema8 snapshots also preserve hashed session records; the restore command deliberately clears those records in the restored copy so a prior logout or credential reset cannot be undone by restoration. Schema9 snapshots preserve remembered library choices; restore clears those choices in the restored copy so revoked grants cannot reappear. Unsupported schema10 is rejected before a snapshot/restore destination is created. Keep an untouched schema6 snapshot for a separately authorized pre-schema7 recovery; schema6 binaries refuse migrated schema7. See [schema7 integration release gates](reviewed-functional-integration.md). See [administrator release gates](account-administration.md). The returned `verified:true` means only this copy verified at that moment. Preserve enough free disk space for the entire database and originals plus a separate restore drill. Do not mistake free-space failure or an incomplete directory for a backup.

## Restore drill and explicit cutover

```sh
node scripts/private-data.js restore \
  --input /private/backups/nestlet-2026-10-07-new \
  --output /private/recovery/nestlet-drill-new
```

Restore first verifies the full backup, then creates a new private data directory. It refuses any existing output directory, including the live directory, and never overwrites/deletes the live database or originals. The redacted CLI response reports only verification, schema version and counts, never private paths/filenames/IDs. Restored paths are `<output>/nestlet.sqlite` and `<output>/assets`. Start an isolated test instance with those two environment values, sign in using an approved test/operator workflow, and verify representative accounts, customers/cases/history, text search and byte-identical downloads. The automated synthetic restore test also simulates source loss after backup and opens the restored database through the actual storage interface.

Before a schema3→4 upgrade, stop the service briefly, run the candidate image’s backup command with the live data volume mounted read-only and a separate new private backup destination, verify schemaVersion:3, restore to a separate drill directory, then run the new storage code only against that drill copy. Keep the original snapshot at schema3 for rollback. The automated test checks source bytes stay identical before/after backup and the rehearsal. Do not use a schema4-only snapshot to promise compatibility with an old schema3 image.

A real cutover is an operator decision: stop the service, preserve the current dataset unchanged, verify the selected recovery point, configure both restored paths (or an independently reviewed volume swap), start the exact schema-compatible release, and check health/auth/own-user retrieval. Never run an old schema3 binary against migrated schema4 data: it deliberately fails closed. Do not point a restored database at an unrelated originals directory. Do not prune volumes as a rollback procedure.

## Exact-user portable original-file export

```sh
node scripts/private-data.js export \
  --db /private/data/nestlet.sqlite \
  --assets /private/data/assets \
  --user <exact-user-UUID-or-owner> \
  --output /private/exports/user-assets-new
```

This is an explicit private operator CLI, not an administrator HTTP endpoint. It requires an exact user ID, selects only that user's asset inventory/text, and copies that user's original bytes. It excludes the user table, credential hashes, other users' assets and non-asset case/chat data. The manifest maps original filenames/MIME and case/customer IDs to UUID `.blob` files and includes the extracted-text limitations. It is an original-file export, not a full-account export or a promised customer download format. Transmission to any recipient still requires appropriate authorization.

## Retention and deletion

No original-file DELETE endpoint, automatic pruning or scheduled retention is introduced. Deleting a case preserves its originals, detaches that case ID and keeps the last customer association. Original association changes use version checks. Bytes and extracted text are immutable once committed. Failed uncommitted uploads can discard their own temporary bytes; acknowledged saved originals are never automatically deleted. A future removal workflow needs explicit product decisions about confirmation, trash/recovery, retention and backups before implementation.

Schema8 release and rollback details: [durable login sessions](durable-login-sessions.md). Never replace a running database with a historical snapshot as a routine release step. Recovery requires an explicit decision about writes since that snapshot; use the verified restore utility and keep its session invalidation behavior.

Schema9 consent and recovery details: [remembered library permission](library-permission.md). Restore deliberately resets both sessions and remembered library choices.
