# Durable login sessions (schema8 candidate)

Routine service release/restart should not require a user to repeat login while their session is still valid. The server now uses the existing private SQLite database for sessions. This is an additive schema7→8 migration: one session table, index and credential-revocation trigger. Existing business tables and rows are retained. No new authentication service, credential grant or cookie permission is introduced.

## Authentication contract

- The browser keeps the existing random 256-bit bearer cookie. SQLite stores only its SHA-256 digest, not the bearer. It also stores the account ID, original identity role, credential fingerprint, CSRF value and session timestamps. The CSRF value alone cannot authenticate a request. The database remains private, outside public assets, with the existing owner-only filesystem policy.
- Cookie attributes remain Path=/, HttpOnly, SameSite=Strict, Max-Age=28800 and Secure for HTTPS. There is no local-storage token or URL-token login.
- Existing deadlines remain: ordinary sessions expire after 30 minutes idle; remember-me avoids that idle cutoff; all sessions expire after 8 hours from original creation. Restart never resets either timestamp. Authenticated requests durably update last-used time.
- Existing account credentials and role are checked again on every authenticated request. Administrator capability is read fresh rather than embedded in the session. Logout deletes the exact session; password changes delete all ordinary-account sessions transactionally. Missing/deleted accounts, invalid operator setup, alias collisions and credential mismatches fail closed. Owner credentials still come from the approved environment configuration.
- The per-account five-session and global 512-session limits remain. Eviction and insertion commit together. Storage errors fail the request; there is no fallback to transient sessions or authentication bypass.
- Signup proof, account creation, new durable session and replacement of a presented old session share the same SQLite transaction. No cookie is returned before that transaction commits. Session-write or deferred-COMMIT failure rolls back all of them, leaving the proof retryable and old session usable. Verification replay remains rejected.

## Release, backup and recovery

Before any authorized migration release, take and verify an untouched schema7 backup with the established private-data tool and rehearse migration/restore on a separate copy. Run exact-candidate CI and independent review. Use the existing release channel only after authorization; these implementation changes are not deployment evidence.

The first schema8 deployment cannot recover tokens from the old process's RAM. People with only old RAM sessions may need to sign in once during this transition. Later ordinary releases/restarts using the same persistent database preserve unexpired sessions. Expired sessions, explicit logout, credential changes and disaster recovery still require sign-in.

The backup tool recognizes schemas1–8 without migrating the source. A schema8 backup retains session records as part of a consistent SQLite snapshot. Its restore operation deliberately deletes sessions only in the newly restored copy: otherwise restoring an earlier snapshot could resurrect a logged-out or revoked bearer. The immutable source snapshot is unchanged. Do not bypass this invalidation with a manual database copy. Restoring business data also restores its historical state; reconcile newer writes before switching service data.

Schema7 binaries refuse schema8. Do not edit user_version or drop tables to force old code onto a migrated database. A code rollback requiring schema7 needs an explicitly authorized restore from the preserved pre-upgrade snapshot and an assessment of post-upgrade writes. Keep the running service stopped during that data switch. Restored users sign in again; original assets and business records follow the existing verified inventory/restore procedure.

## Evidence boundaries

Tests use real SQLite, real scrypt, actual subprocess restart and local HTTP. Email proofs and accounts are synthetic; no mail, model provider or live production request is made. Frontend design is unchanged. Production migration, actual trusted-HTTPS browser behavior across deployed restart, and sustained multi-process load remain separate acceptance gates. Sessions rely on the same durable volume as business data; this is not a replicated session-service implementation.
