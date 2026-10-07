# Owner-controlled administrator capability

## Local implementation status

2026-10-07: this schema6 feature is prepared on a separate local branch based on `5335312`. It is not deployed or merged and must not be included implicitly in the independent schema4→5 email-authentication release. No real account was created or granted privileges by this implementation work. The frontend module is now mounted in the unified local candidate’s Account and settings surface. Actual HTTP/SQLite/React DOM integration is verified; exact-combination official CI, Chromium and deployment acceptance remain separate gates.

## Permission contract

Authentication identities remain exactly `owner` or `trial`. The immutable bootstrap owner keeps ID/username `owner`, a NULL database password, and its environment-owned password. The existing configured login alias or verified owner email still signs in to that same identity.

An ordinary account has its own ID, verified email, credential, sessions, password recovery and records. The owner may explicitly grant that account an administrator capability after email verification. A grant does not rename the account, change its `trial` identity role, copy the owner identity, change credentials, or move data. Newly registered accounts always start ordinary and registration accepts no role/capability field. Legacy named accounts still sign in and can bind an email before becoming eligible for a grant.

| Capability | Ordinary | Administrator | Bootstrap owner |
| --- | --- | --- | --- |
| Own cases, customers, conversations and original files | Yes | Yes | Yes |
| Another user's cases/files, including direct IDs | No | No | No |
| Bounded operational diagnostics | No | Yes | Yes |
| Provider settings, credentials and global telemetry | No | No | Existing owner controls |
| Account roster and permission audit | No | No | Yes |
| Grant/revoke administrator capability | No | No | Yes, excluding owner |

Operational diagnostics are read-only process readiness: model name, live-enabled flag, parser availability, process uptime and four bounded in-flight request counts. They contain no account roster, customer data, paths, provider secrets, email delivery configuration or global telemetry. This initial administrator capability grants no app-metadata write permission. Existing trial AI quotas remain in force for administrator accounts.

## Implementation and API

- `account-administration.js`: immutable-owner checks, explicit permission projection and strict desired-state validation
- `account-administration-storage.js`: additive schema6 DDL, owner-only account/audit queries and transactional capability changes
- `auth.js`: normal credential/session validation first; capability fetched afresh for each request, never trusted from a cookie or cached session role
- `server.js`: owner-only roster/change/audit endpoints and capability-gated diagnostics
- `frontend/features/account-administration/`: isolated bilingual React owner panel and diagnostics module

`GET /api/admin/accounts` is owner-only and returns at most the existing 101-account bound. Allowlisted fields are ID, username, identity role, verified email/time, creation time, administrator flag, capability version and grant eligibility. Password hashes, challenges and case data are not selected.

`PUT /api/admin/accounts/:id/administrator` requires the authenticated bootstrap owner, valid CSRF, approved Origin and HTTPS except loopback development. Its exact JSON body is `{ "administrator": true, "expectedVersion": 0 }` (desired boolean, never toggle). Extra fields are rejected; ID `owner` is immutable. Only already-created trial accounts can be targeted. New grants require a verified email. Revocation does not depend on email binding.

The response is `{ account, changed }`. A successful state change increments that account's capability version. A same-version no-op is harmless. An exact lost-response replay, when the latest version is exactly expectedVersion+1 and the desired state is already present, returns unchanged without another audit. Older versions or an intervening revoke/regrant conflict with HTTP409. The browser does not retry writes automatically: uncertain results/conflicts require a fresh read and new confirmation.

`GET /api/admin/account-audit?before=123&limit=50` is owner-only, newest-first, bounded to 100 rows per page, and returns `events` plus `nextBefore`. The append-only audit records only event ID, owner actor ID, target ID, desired boolean, resulting version and time. Grant/revoke and its audit commit atomically; audit failure rolls back the permission change. No names, emails, passwords, tokens, request bodies, IPs or case content are recorded in this audit.

`GET /api/admin/diagnostics` is owner/administrator-only. Status and login responses add `administrator`, `canManageAccounts` and `canViewDiagnostics`; `role` remains owner/trial. Server-side authorization is authoritative even if a tab has stale UI state. Grant/revoke applies to an existing cookie on its next request. Password recovery still invalidates all sessions via credential fingerprint, preserves account identity and retained capability, and requires the new credential for a new session.

## Frontend integration boundary

The unified candidate mounts the module inside the existing session provider on the authenticated Account and settings surface. Do not infer administrator status from `role === 'trial'`; use the returned capability fields. Owner controls must additionally require `userId === 'owner'` and `role === 'owner'`. The panel does not write permissions from edit/toggle events: users choose an account, review its explicit permission scope and confirm the desired grant/revoke. Session changes, inactivity, unmount and page exit clear/abort pending work. A sent write may still complete after abort; reload is the authority when returning.

No App, chat, intake, source-retention or existing account/provider-settings files are owned by this feature's isolated UI lane. See its README for exact component exports and acceptance evidence.

## Schema6 and rollback gate

Migration5→6 adds `user_capabilities` and `account_capability_audit`, with audit immutability triggers. It does not rebuild any earlier table or change user IDs, emails, credentials, customer rows, original-file metadata, email actions or rate limits. Missing capability rows mean ordinary. No account gains administrator privilege during migration. Existing owner permissions are derived from the immutable owner identity.

The Nestlet private-data tool in this branch recognizes schemas1–6. It snapshots/restores the whole database, including capability and audit rows, without migrating the source. Unsupported schema7 fails closed. Do not modify the independently managed deployment helper or active4→5 release to install this feature implicitly.

Before any future release:

1. Finish the independently reviewed schema5 email release and real email-flow evidence
2. Review and integrate the feature and its owner/administrator navigation
3. Run aggregate checks and actual browser grant/revoke/session-switch/error flows against the final integrated SHA
4. Take and verify a schema5 database + original-files snapshot; restore it to an isolated drill; migrate only that drill to6; verify identity, records, emails and originals
5. Independently verify a schema6 snapshot/restore and the exact deployment tool/image compatibility
6. Obtain the applicable publication/deployment authorization and make any real grant only via the explicit owner UI

A schema5 binary refuses a schema6 database. Never decrement `user_version` or run ad-hoc role updates to roll back. Keep the pre-upgrade schema5 snapshot intact; rollback requires a stopped-service restore to an approved destination and accounting for records written after the snapshot. A schema6 snapshot is not a schema5 rollback artifact.
