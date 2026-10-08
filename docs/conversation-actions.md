# Reviewable conversation actions

Backend candidate based on `0ad91847`, October 7, 2026. This is a read-only proposal and explicit-application contract, not live-model or deployed-product acceptance. No schema, authentication policy, role grant, finalization, external delivery or official submission is added.

## Flow and ownership

1. A saved-conversation chat request may opt in with `actionConsent: true`. Without that flag the prepare tools are absent. `libraryConsent` remains independent: opting into preparation does not enable library search/read.
2. The server gives the provider bounded server-owned case/version and complete saved-message IDs. `prepare_case_suggestion` and `prepare_answer_draft` only validate/read and return previews; they cannot write or call an apply API.
3. SSE `proposal` data is `{requestId, proposal}`. It is tentative until the enclosing stream successfully completes. The frontend must discard it on interruption, cancellation, identity/case/conversation changes, and must never derive authorization from model prose.
4. A human reviews the preview and explicitly applies it through the existing authenticated, CSRF/origin-protected case APIs. The server re-reads the target and source, rechecks ownership, association, complete-message state and optimistic version, and derives provenance itself.

The current still-streaming assistant answer has no complete saved-message ID. A draft preparation may reference only an already complete persisted assistant answer. Current complete user messages can support fact suggestions. No local-only or interrupted message can execute an action.

## Request and response

Standalone preview: `POST /api/cases/:caseId/conversation-actions/prepare`.

Common request fields:
- `action`: `prepare_case_suggestion` or `prepare_answer_draft`
- `expectedVersion`: positive case version
- `sourceConversationId`, `sourceMessageId`: persisted same-case source IDs

Fact preparation also accepts `factChanges` and/or `changes`, mapping existing canonical fact/detail keys to `{value}`. No model-supplied confirmation, owner, source prose, resolution, arbitrary key or not-applicable status is accepted. Draft preparation accepts only a supported `kind`; content and title are server-derived from the complete source message. Non-English CJK text is conservatively rejected for this English-draft route.

Response `{proposal}` includes the common identity/version fields, normalized `request`, `requiresExplicitApply: true`, `conflicts`, and `apply: {method, path, body: {conversationAction: request}}`. Fact previews add `confirm: false`, `preview: [{group,key,before,after,confirmed,conflict}]`, and server-derived changes. Draft previews add `kind`, `title`, `status: 'draft'`, and content with an UNREVIEWED banner.

Consumers must validate the action and active scope and derive the apply route themselves, rather than trusting arbitrary event URLs:
- Facts: `PATCH /api/cases/:caseId/document-context`, body `{conversationAction: request}`
- Draft: `POST /api/cases/:caseId/artifacts`, body `{conversationAction: request}`

Success uses the existing `{case, readiness, ...}` or `{artifact}` response. These requests cannot include legacy confirmation/final/status fields alongside the action envelope. Normal manual review and document editing remain separate existing APIs.

## Confirmation and conflicts

Application always uses `confirm: false`; unchanged confirmed values retain their existing confirmation and provenance. Changed confirmed values and existing unresolved `conflict: true` evidence are flagged in the preview and block the whole suggestion with `DOCUMENT_CONTEXT_CONFLICT`/409. They require the ordinary explicit review editor. An old `expectedVersion` returns `CASE_CONFLICT`/409 without writes.

Document details retain the existing structured `sourceMessageId`; canonical facts retain a bounded server-generated message/conversation source description because their existing schema has no source-message foreign key. No new foreign-key claim or schema is introduced.

## Atomic draft retries

SQLite `BEGIN IMMEDIATE` covers source/version revalidation, same-source/body lookup, and insertion. Deduplication applies to both the new action path and legacy source-linked draft POSTs. Identity is authenticated user + case + kind + draft status + source conversation/message + exact content. Title changes alone do not create a new version. Source-free drafts, changed bodies and different kinds remain distinct.

An exact retry returns the immutable original artifact, including its original snapshot and source-case version. If the case later changes, that artifact may be stale; retry does not silently manufacture a fresh snapshot. A stale request version is rejected before lookup. This is bounded same-source/content idempotency, not a blanket claim of exactly-once delivery or atomicity with frontend state.

## Limits and evidence

Prepare and library reads share the existing three-round/six-call/24,000-character tool result budget. The library receives the remaining combined budget before issuing source references; an over-budget read yields a bounded error without committing a citation. No provider retry or new paid call is introduced.

Synthetic tests cover actual HTTP/authentication/owner isolation, no-write prepare/cancel, explicit unconfirmed saves and source persistence, unchanged confirmations and unresolved conflicts, stale versions, invalid fields, incomplete/missing sources, concurrent independent SQLite processes, exact retries/reopen, and mixed prepare/read exhaustion. Authored SSE fixtures separately test tentative proposal events and completion; they are not live-provider acceptance. Frontend/browser integration, real provider tools, container runtime and production acceptance require separate verification.

## Desktop conversation review UI

The chat composer offers a per-message, default-off preview permission. It adds `actionConsent:true` only for the explicitly selected send and resets it immediately. `proposal` SSE envelopes are bounded and checked against the active case, conversation, action/request fields and derived endpoint; preview rows must match the exact values to be applied. Draft content remains plain text.

Proposal buttons remain disabled throughout streaming and history refresh. They become available only after the parser exhausts a successful stream with a matching request and terminal conversation ID. Interrupted, malformed, foreign-scope and cancelled streams discard the proposals. A case/account/conversation transition clears the cards and aborts outstanding requests.

Applying uses the existing synchronous chat operation lock and a fixed current-case PATCH/POST route. It sends only `{conversationAction:request}`. Cancel discards only the preview. Existing conflicts, including unconfirmed conflicting evidence, block apply. A successful suggestion remains unreviewed; an answer is saved only as a draft. Known 4xx rejection explains the problem without replay. An uncertain or malformed write response disables replay and directs the user to inspect saved facts or document versions. Source and workflow navigation retain the established unsaved-edit checks.

The UI does not persist pending proposal authority across reloads. Request a new preview from the saved conversation when necessary. Model output cannot supply arbitrary destinations, confirmation flags or final-document status.
