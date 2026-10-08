# Reviewed functional integration and schema6→7 release plan

Prepared 2026-10-08. This is a candidate and release plan, not a merge, migration, restore or deployment claim. Root review and exact combined CI remain release gates. The concurrent Inbox visual redesign is excluded.

## Source manifest

Base main: `2e1354ef591975160885d9461910bf00f67742e8`.

- [PR29](https://github.com/ledondev520/nestlet/pull/29): `56b40dc0f83e37a3323123270733e92c85155731`, real ephemeral test-server port ownership
- [PR30](https://github.com/ledondev520/nestlet/pull/30): `04ce08945804fedef0a346220babc7011349633d`, independent in-field password eye controls
- [PR33](https://github.com/ledondev520/nestlet/pull/33): `690dbecd0077869e8c7b5a348c900c3b84516fc4`, registration email proof commits before new session activation
- [PR34](https://github.com/ledondev520/nestlet/pull/34): `6921b657223b758945b05c21c5d1d2ab4e30371a`, conversational human review with schema7 durable intents and receipts
- [PR36](https://github.com/ledondev520/nestlet/pull/36): `6ab7446a30a80788e75c723133025761b9c40956`, draft tools grounded in eligible saved conversation evidence

Source heads are retained as ancestors through merge commits. Code merged without conflicts; append-only validation conflicts retained each source's dated evidence and its limitations. Integration adds only this plan and a correction to the backup manual's supported schema range. No generic “missing action” notice was added: valid read-only turns must remain uncluttered; any future failure notice must derive from an actual proposal failure/outcome.

## Combined data and authority flow

Email verification stages a fresh ordinary-user session and activates it only after the registration transaction commits. Opening the link alone does not consume proof. Bind/reset never establish a registration session. Each password input retains its own visibility state.

Chat exposes eligible own-case conversation source references, keeping real source text available to the provider. Missing draft details remain missing rather than making a tool schema impossible to call. Tool proposals do not write facts. A separate direct human answer to the exact visible question may create a versioned fact review; immutable source/answer provenance and receipt commit atomically. Saved intents and receipts survive restart; in-memory login sessions do not.

## Planned existing-operations handoff

Use only the existing Nestlet maintenance transport, lease/concurrency mechanism, exact-source/image verification, private environment handling and isolated Compose service. A schema6-only release helper is not automatically compatible with schema7: prepare and review its dedicated successor, exact predecessor and candidate pins, helper digest, schema gates and failure handler first. Do not modify the Jiesong application or select a new access path.

1. Revalidate deployed predecessor identity, schema6, private database/assets ownership, healthy exact image, target source CI and browser acceptance. Record exact image IDs and preserve the previous release/configuration reference. Reject unexpected identity/schema. Keep provider/mail secrets out of code, arguments, logs and evidence.
2. Build the exact candidate. On a disposable network-isolated fresh database, require schema7, module imports, empty review-intent state, health, and fail-closed unauthenticated routes. Check space for all recovery/drill copies before downtime.
3. Stop only Nestlet under the existing maintenance lease. Use the SQLite backup API and referenced immutable originals to create a new private schema6 recovery point; verify integrity, foreign keys, digest and byte inventory. Verify with the compatible predecessor and candidate tools. Never copy only the main database file while ignoring committed WAL.
4. Restore to a separate new drill directory. Start candidate storage there to migrate6→7, never against the snapshot or live dataset. Require unchanged prior rows, DDL and sequence high-water marks; allow only the new review-intent table/indexes/trigger and user_version. Check reopen stability. Startup telemetry retention can alter old rows: a strict preservation drill must fail safely if it does; do not weaken the check or manipulate the clock.
5. Exercise disposable review/receipt replay and undo constraints, back up migrated7, restore to another new directory and compare rows, schema and original bytes. Require old6 to refuse restored7 without modifying it; require candidate7 to refuse future8 before persistent changes. Reverify the untouched pre6 recovery point. No real mail or provider call belongs in this rehearsal.
6. Only after root approves the final package and every gate passes, change only the reviewed image-tag value and mark candidate start attempted before recreating Nestlet with the preserved volume. Verify exact image, health, schema7, modules, email configuration flags and protected boundaries before advancing the release pointer.
7. Separately verify authenticated HTTPS browser flows through the established authorized account path: verification continuation, independent eyes, own-user saved history, grounded proposals, conversational confirmation/correction/undo and originals. Credential entry remains user-controlled. Browser fixtures do not prove real inbox delivery, live model quality or production acceptance.

## Failure, rollback and session constraints

Before candidate start, failure may resume only the verified predecessor after confirming the stopped live dataset remains intact at schema6. After any candidate start attempt, never automatically restart a schema6 binary, even if a superficial version check still says6. Preserve data/recovery copies for a schema7-compatible forward fix or separately authorized recovery.

Never lower user_version, delete new schema objects, prune/remove volumes, overwrite live data, or restore automatically. An explicit older snapshot cutover can lose later case/review writes and revive passwords, one-time email actions or grants; assess those security effects and recovery point first. Restore database and originals together to a separate verified location, using the exact compatible image. Same-server copies do not establish off-host disaster recovery.

Service recreation invalidates process-local sessions and RAM-only provider settings; privately configured server settings remain the existing operations responsibility. Users may need to sign in again after deployment. Verification auto-login reduces the registration flow's extra login; it does not make sessions durable across restart. Do not infer proof replay or credential reset from a lost response.

## Local combined evidence

Fresh `npm ci --ignore-scripts`, `npm run check` and production build passed. Backend363, frontend303, simulated-email contracts54 and real HTTP/DOM artifact invalidation1 all passed with zero skips. Browser discovery finds27 scenarios in14 files. These counts include synthetic fixtures and simulated provider/mail responses, not live-provider or genuine-mail acceptance. Docker is absent in this executor and local Chromium is restricted; exact combined official browser/container CI is required. See dated validation records for individual source limitations.
