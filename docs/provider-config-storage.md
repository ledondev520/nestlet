# Encrypted durable provider settings

## Contract

API-key Save makes one bounded synthetic model check. After success the original owner session is revalidated; the candidate key, model, enabled state and verification timestamp are encrypted as one AES-256-GCM authenticated envelope. A fresh 96-bit nonce is used for every write, and the schema/domain and monotonic store revision are authenticated as additional data. A FULL-synchronous SQLite transaction commits before the active in-memory configuration changes. Validation, authorization, stale-write or database failure leaves the previous active configuration unchanged. No API returns key bytes, wrapping bytes, encrypted envelopes or secret-derived fingerprints.

The file is created lazily on the first validated Save; schema creation and its authenticated singleton record commit together. An existing zero-byte file, truncated database, or deleted singleton is corruption, never a fresh installation. A failed first write can leave an unusable file; provider initialization then refuses instead of deleting or silently repairing it; the application disables AI while retaining authenticated case access. The credential database has its own application identifier and schema version 1. The application case database remains schema10. Default path: `provider-config.sqlite` beside the case database, normally `/data/provider-config.sqlite` on the persistent volume. `NESTLET_PROVIDER_CONFIG_PATH` may explicitly override it. Files must be owned by the service account, mode0600, non-symlink and single-link, in a mode0700 private directory with trusted ancestors. SQLite uses DELETE journaling, FULL synchronization and secure deletion. Only ciphertext reaches database pages/journals; the encryption key is never written there.

The server necessarily holds decrypted credentials in memory while making provider calls. Encryption at rest does not protect against a compromised service process or an attacker who possesses both the database and wrapping key.

## Required bootstrap, not performed by this change

An operator must separately authorize and provision a stable random 32-byte wrapping-key file. `NESTLET_PROVIDER_WRAPPING_KEY_FILE` points to that file inside the running service. The value is a file path, not a password or secret value. The file must be mode0400 or0600, owned by the service UID, non-symlink and single-link, outside both the case/provider database directories and private asset directory. Ancestor directories cannot be writable by untrusted users. Mount it read-only at a separate path, for example `/run/nestlet-private/provider-wrapping.key`; keep the host source outside the source checkout and case-data volume. Do not expose it in logs, screenshots, rendered configuration, chats or repository files.

No automatic secret generation, host mount change, or production-key migration is performed by this code. Compose passes the path only; the approved operator must add the private read-only bind mount through the existing deployment configuration. Preserve this file across container replacements. A newly generated file on each deploy makes existing saved settings unreadable. Keep a separately controlled recovery copy in an authorized secret vault; never bundle it with the encrypted database backup.

Until bootstrap is ready and no credential DB exists, the server may run with an existing environment-provided key, labeled `server-environment`. Browser Save is unavailable and rejects candidates before spending provider quota. With a valid encrypted saved configuration, it takes precedence over both `DEEPSEEK_API_KEY` and `ENABLE_LIVE_AI`, including a deliberately paused state. Restart does not call the provider or update the saved verification timestamp.

If a credential database exists but its wrapping file is missing, unreadable, wrong, or its ciphertext/schema is corrupt, provider initialization refuses with a generic configuration error. The server clears/disables AI configuration, blocks settings changes and reports an owner-only repair-needed flag; authenticated case read/export remains available. It does not fall back to an environment key or overwrite the encrypted record. Restore the correct wrapping file/database pair through the approved operations process. A lost wrapping file cannot be reconstructed from the ciphertext.

## Migration from the previous RAM-only implementation

Previous browser Save did not persist the key. This release cannot recover a prior RAM-only value after restart and must never inspect process memory/dumps to extract it. The user enters the authorized key again in the authenticated HTTPS owner form after wrapping-key bootstrap. An environment-provided baseline may continue operating until that Save; do not print or inspect its value. Merely seeing configured/enabled status is not evidence that the key has been encrypted. Successful Save must return `keyStorage: encrypted-database` and retain that status after restart.

## Explicit backup and restore lifecycle

Existing case backups and user exports do not include this separate provider credential store or its wrapping key. Do not call them a complete credential backup.

For an authorized credential backup, stop the service cleanly first, preserve the private mode/ownership, and copy only the closed credential database to a protected encrypted-settings backup location. Record a file-integrity digest if needed, never any plaintext credential or wrapping bytes. Store the wrapping file separately under restricted secret-recovery access. Both pieces are necessary for recovery, but must not be packaged together. Plain SQLite copying while the service is running is unsupported; do not copy or ignore a hot journal.

For an authorized restore, stop the service, preserve the currently working encrypted store for rollback, and restore the selected ciphertext database with matching wrapping file and private permissions. Start the service and inspect sanitized owner status: configured, encrypted-database, enabled/paused, and prior verification timestamp. No key-readback endpoint is required. This may restore an older provider key or enabled state; the operator must review account/key validity and later revocations. Normal case restore leaves the current credential store alone.

Encryption and revision authentication do not provide an external anti-rollback anchor: restoring an older valid database with its matching wrapping key is accepted. Complete deletion of the credential database is indistinguishable from an unused installation; when no file/sidecar remains, an explicitly configured environment baseline can be used again. Protect filesystem access, retain backup provenance, and have an operator review any restoration or deletion.

A binary rollback to a release predating this store does not retain the new provider-state semantics: that older server ignores encrypted settings and may use its old environment baseline instead, including a stale enabled state. Preserve both ciphertext and wrapping-key recovery material, and have the approved operator verify the intended AI configuration or leave AI disabled. Do not export the key to plaintext merely to make an old release read it.

Key rotation is not an automatic file overwrite: first establish an approved migration/recovery plan that decrypts with the old wrapping key and re-encrypts with the new one atomically. Replacing only the wrapping file deliberately fails provider initialization and disables AI. No rotation tool or production rotation is claimed by this release.

## Synthetic evidence

Disposable-key tests cover encrypted database bytes, fresh nonces, unchanged application schema, restart restoration, enabled=false persistence, environment precedence, failed validation/write retention, missing bootstrap without a provider call, wrong key, authenticated revision tampering, private file/link checks, stale writers, and offline ciphertext backup/restore. No real credential was read, generated, entered or migrated. Official CI, independent security review, production bootstrap, and an owner-controlled restart check are separate release/acceptance gates.
