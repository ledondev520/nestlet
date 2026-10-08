# Inbox real-entry integration candidate

Prepared 2026-10-08. This is a review candidate, not a deployment. The deployed predecessor is05923a8/schema7; main7354803/schema8 has not been used to claim a production upgrade.

## Exact sources and ownership

- Main73548035a07adafab9ed63213e8c6ea451f25dbb baseline (schema8 durable sessions).
- PR39 frozen5bc8321fae36c8184839a5c54fe53fa1b97ea720: Inbox visual foundation. Runtime ownership was explicitly released in [the takeover ACK](https://github.com/ledondev520/nestlet/pull/39#issuecomment-6052127709).
- PR40 exact21e8750fe90b8282e4b5f921df63efc81cda0cf7: owner-only compact model-key popover.
- PR41 exact7759f282c472145f372d4670c1bc0a21eabc1e38 plus test follow-up43593f0ddaea5687c05b0c9e4981533dcbec41ca: first-use library permission, checkbox-free ordinary chat and schema9.

The actual production App/AccountWorkspace remains the only authenticated case/workspace owner. All original callbacks, workspace epochs, first-save adoption, mounted visited editors, dirty confirmations, source scoping, auth-link handling, draft recovery and session lifecycle remain. Preview now imports the same entry rather than maintaining a separate implementation.

Chat workflow and lookup retain their feature state/handlers and use stable sidebar portal hosts. Hidden/inactive portals are not focusable. The permission dialog stays in ChatPage with its original active/interruption behavior. Model settings and library permissions coexist; no alternate provider/endpoint controls are introduced.

Read-only rail/context reads use immediate render-time scope checks, request-generation and abort fences, bounded deadlines and explicit error/retry states. Readiness uses the saved case's document kind and localized missing questions. Facts preserve reviewed/conflict distinctions; historical artifacts remain labeled. A successful current-session business write invalidates read snapshots, without publishing payloads or interpreting ambiguous responses as success.

## Planned direct schema7→9 release handoff

Do not reuse an old schema8 helper against schema9. No helper dispatch or production command is part of this candidate.

1. Reconfirm actual live predecessor05923a8/schema7, its exact image/tree, private storage/assets and healthy service. Reject unexpected state. Pin the final reviewed merged app SHA and a separately reviewed maintenance helper/digest.
2. Through only the existing authorized Nestlet operations channel, lease/concurrency and dedicated Compose scope, build a credential-free isolated candidate image. Fresh schema9 must contain empty durable sessions and library permissions; protected endpoints fail closed. Preserve unrelated service/configuration bytes.
3. Before downtime, verify space for backup and all independent drill copies. Stop only Nestlet, then create/verify an untouched schema7 SQLite backup using the consistent backup API plus referenced immutable originals; never copy only a live database file while ignoring WAL. Keep the private recovery point outside logs/Git/chat.
4. Restore into a separate new drill directory and run the exact candidate's7→8→9 migration. Compare every old row, DDL, foreign key, sequence and original byte. Only the reviewed session/permission schema additions and version changes are allowed. Reopen must be stable. Migration grants no library permission and creates no authenticated session. Strict preservation must fail safely if startup telemetry retention changes old rows.
5. Exercise disposable durable-session and grant/revocation/receipt flows. Back up schema9 and restore separately. Backup preserves the snapshot; restore deliberately clears sessions and permission choices, requiring a fresh login and fresh first-use decision. Verify all other business rows, conversational-review receipts and originals remain intact. Restoring the schema7 snapshot must retain schema7 and remain compatible with the exact old binary. Old7 must refuse migrated9 unchanged; candidate9 must refuse future10 unchanged, in DELETE and WAL cases.
6. Only after root review, complete exact-SHA CI, image/host rehearsal and explicit release authorization, update the reviewed image tag and mark candidate start attempted before recreation. Verify image/schema/modules/health, actual HTTPS/auth boundaries, permissions remaining unset until chosen, retained history/originals and root-entry browser behavior before advancing the pointer.

Before any candidate start, failure may resume the verified old7 image only after checking the stopped live dataset is intact schema7. After any candidate start attempt, never automatically restart old7 or old8, regardless of a superficial version reading. Preserve storage and recovery copies for a compatible forward fix or separately authorized recovery. Never lower user_version, delete schema objects, prune volumes, overwrite live storage or automatically restore.

A prior snapshot recovery can lose later writes and revive old account/credential/email-action state. Review the recovery point and security/data-loss effects before a separate cutover. Same-server backups do not provide off-host disaster recovery. Existing schema7 process-local sessions will not survive the first upgrade; new schema9 sessions can survive ordinary restarts, but restores intentionally invalidate them and reset library decisions.

## Evidence boundaries

Local combined backend396, frontend317, email54 and artifact1 passed; schema9/durable-session/permission focused25 passed. Four canonical Inbox adapter tests additionally pass, including actual authenticated HTTP and zero writes during reads. Build/check passed. Genuine schema7→current tests preserve every historical row/DDL/sequence/original; schema9 restore tests check cleared sessions/permission decisions and unchanged business data.

A local Chromium attempt stopped before assertions because the environment denied its singleton socket. No local screenshot or real-browser pass is claimed. Official combined test/browser/container CI and independent review remain required. Browser scenarios include real-entry dirty guards, stable editor retention, drawer focus/viewport behavior, and authored synthetic populated chat/artifact captures at1280/390/320 in both languages. Authored messages/provider fixtures are explicitly synthetic, not live model quality or production acceptance. No actual key, model call, email send, private customer material, production migration or deployment is included.
