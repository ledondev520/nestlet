# Conversational fact review (schema7 draft)

The case suggestion tool remains read-only. A human can answer the visible question in chat or click “Correct, save these facts”, rather than apply an unreviewed suggestion and visit Materials again. Already-reviewed unchanged values are excluded. The separate unreviewed-apply path remains available.

## Trust and data flow

1. A complete saved chat turn produces the existing provenance-bound proposal. The UI displays its exact fields, old/new values and conflicts. Incomplete streams cannot proceed.
2. A fresh, explicit human answer starts `POST /api/cases/:case/conversation-reviews` with `conversationAction`, a stable UUID `clientRequestId`, and `locale`. The server re-reads the own-user case, source and conversation and records its deterministic question. It does not update facts. The returned intent's exact value set must match the displayed proposal before the UI submits the answer.
3. `POST /api/cases/:case/conversation-reviews/:intent/reply` accepts only `conversationId`, `expectedVersion`, UUID `clientMessageId`, and direct `answer` text. Literal confirm/cancel phrases are deterministic. A single-field question also accepts “改为 …”, “更正为 …”, or “change to …”. Quoted answers, model authorization claims, attachments and document text do not authorize review. Multiple fields needing correction require a narrower question, rather than inferred parsing.
4. Only a single visible proposal may target the ordinary composer. With multiple proposals the human must target a particular question. The server permits one pending question per conversation, and requires its immutable prompt to still be the latest message. A new completed turn can invalidate an older pending question, never answer it implicitly. Questions expire after 15 minutes. A restart cannot convert a global “yes” into authority; the UI must have the explicit question context.
5. The immutable human answer, exact selected fact/document-context changes, draft archival and durable receipt commit in one synchronous SQLite transaction. Every changed field cites the human answer, source message, question and conversation. No issue, identity-verification, agency approval, final-artifact or submission flag is inferred. The existing generation/readiness gates remain.

`GET /api/cases/:case/conversation-reviews/:intent` reads receipt state. Repeating the exact answer UUID/text returns that receipt, including after process restart. A changed answer under that key fails. The UI keeps the exact request on a lost response and provides safe reconciliation. If the case changed after the original answer, the UI identifies the result as historical, not current review.

`POST /api/cases/:case/conversation-reviews/:intent/undo` takes conversation ID, the applied case version and a new stable client message ID. It restores only the prior fact/document-context snapshot, preserves the immutable audit and refuses any intervening case change. Archived drafts remain archived; undo does not resurrect a stale draft. Cancel does not mutate case facts. Unsent composer text survives button actions and failures.

These write endpoints are not model tools. They use the existing authenticated session, own-user lookup, same-origin and CSRF enforcement. The route hook is contained in `case-records.js`; no server/auth/session change is required.

## Schema7 and rollback

Additive `conversation_review_intents` stores exact request/rows, owner/case/conversation/version, immutable prompt, expiry, state, answer receipt, and optional fact/context undo snapshot. Bindings cannot be updated. One partial unique index prevents two active questions in the same conversation. Capacity is bounded to 500 intents and 4 MiB of request/row/snapshot metadata per user; existing message/case limits still apply. Case/conversation deletion cascades the dependent intent; original source messages remain immutable under normal operation.

Schema6 data and DDL are preserved. Startup migrates under the existing write transaction; failure rolls back the whole migration. Future schema8 is refused before persistent pragmas. Backup/verification tooling accepts schema1–7 and snapshots receipts with the database. No automatic downgrade, restore, production migration or release is performed by this draft. Schema6 binaries must not open a migrated database; rollback needs a schema7-compatible application or an explicitly approved recovery procedure.

The transaction helper supports only synchronous composition. Async callbacks/thenables are rejected, and a nested failure dooms the outer commit even if caught. Auth code keeps its normal outer transaction commit boundary.

## Evidence, 2026-10-08

- Real disposable SQLite and HTTP: scoped session/origin/CSRF, literal-answer trust boundary, version/expiry/newer-message guards, duplicate requests, server restart, competing processes, undo/cancel and injected receipt failure rollback.
- Real React DOM + HTTP + SQLite: single ordinary-composer answer, one-click save, direct correction, quote rejection, original input preservation and lost-response receipt reconciliation.
- Full backend/React suites and build/check results are recorded in `validation.md`.
- Official Playwright Chromium test is authored in `test/frontend-browser/conversation-fact-review.spec.js`, with synthetic provider SSE explicitly labeled. It covers desktop chat confirmation, correction, undo and mobile lost-response reconciliation. In this executor Chromium aborts before test execution because local singleton sockets are denied; an approved escalated retry reached the same restriction. No browser pass or live provider acceptance is claimed.
