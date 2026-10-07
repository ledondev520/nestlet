# Consented library retrieval in chat

Candidate implementation, October 7, 2026. This extends the existing authenticated `/api/chat` stream. It does not add a coding agent, SDK, arbitrary network tool or write action. The model remains `deepseek-flash`, with `thinking:{type:'disabled'}`. The [official tool-call guide](https://api-docs.deepseek.com/guides/tool_calls/) and [Chat Completions contract](https://api-docs.deepseek.com/api/create-chat-completion/) describe assistant function calls followed by matching tool messages; application validation remains mandatory.

## Request and capability

`POST /api/chat` accepts optional `libraryConsent:boolean`. Omission or false uses the existing ordinary-chat path and does not construct a library tool session. Other consent, same-origin, login, CSRF, ownership, quota and deduplication requirements remain.

The UI must offer a separate unchecked request-level choice explaining that relevant saved-record excerpts will be sent to DeepSeek. Saving a private file is not this consent. Do not cache or restore this permission after session expiry/account changes. Older backends reject unknown request fields, so omit the field when false.

`GET /api/status` exposes `libraryRetrievalEnabled:true` and `libraryLimits:{rounds:3,calls:6,resultChars:24000,timeoutMs:90000}`. A missing/false capability must not silently downgrade a requested lookup. A validated opt-in response also has `X-Library-Retrieval:enabled`; this acknowledges support, not that a lookup occurred.

The server creates exactly one tool session from the authenticated user ID. Browser/model-supplied ownership is never accepted. At most three tool rounds, two calls per round, six total calls and 24,000 serialized result characters are allowed. There are at most four provider requests, with tool_choice:none on the final budget-limited request. These are bounded continuation requests, never automatic paid retries. The same whole-request 90-second signal covers provider waiting, tool execution and stream backpressure. The ordinary path is unchanged.

## Stream events

Existing `conversation`, provider `delta`, `done` and `error` events remain. Hidden reasoning, raw arguments, SQL, paths, credentials and provider error prose are not forwarded.

`activity` contains only:

- phase: searching | reading | retrieving
- state: started | completed | error
- optional count: integer 0..8, on completed results
- optional code: a fixed LIBRARY_* error, on errors

The underlying reads are synchronous and bounded, so started/completed events may arrive together after a round. Do not fabricate intermediate progress or thinking text.

`sources` occurs at most once per request before done/error when verified references exist:

`{requestId,items:[...],appendix:string}`

Each item contains sourceId S1..S48, kind client/case/asset/artifact, owned record id, positive version, title up to160 characters, titleTruncated and retrievalState metadata/read/unavailable. Optional allowlisted fields are caseId, clientId, createdAt, updatedAt, status draft/final, isStale, needsRegeneration, sourceCaseVersion, currentCaseVersion, truncated, and up to six excerpts `{offset,endOffset,textLength,offsetBasis:'sanitized-extracted-text-characters'}`. There are no arbitrary URLs or record bodies in this event.

The appendix is at most16,000 characters; the complete event is at most64,000 serialized characters. Retrieval provider text is capped at48,000 characters so total stored assistant text remains within64,000. Append `sources.appendix` to the visible assistant text exactly once per requestId. Normal delta events do not include the appendix. Match source requestId against done/error requestId.

## Honest durable references

The server independently appends the same plain-text source block exactly once before saving the assistant message. It includes the server request ID, issued label, kind/id/version, available date/title, retrieval state, truncation/staleness/regeneration qualifiers, relevant case versions and sanitized character ranges. A shortened title is explicitly marked. Only the server-issued reference set can populate this block; model-invented `[S999]` references are rejected, including labels split across stream chunks.

The appendix is English operational metadata even when the conversation UI is Chinese. It does not certify agency approval, eligibility, factual completeness or an exhaustive search. Metadata-only and unavailable sources are not represented as full document reads.

No new message column or schema migration is required. Reloaded history shows the immutable plain-text appendix; it must not pretend transient structured citation cards were persisted. Any future record-opening action must recheck current ownership and status. A disconnect may prevent delivery of the sources event, while its appendix is still retained in the interrupted saved message and becomes visible on reload.

A preamble such as “I will check” followed by tools and an empty final round is incomplete, never done. On failure/cancellation, received text and issued source metadata are preserved with failed/interrupted state when storage succeeds. Done remains conditional on durable completion; database failure produces CHAT_SAVE_FAILED. No case fact is automatically confirmed or changed.

## Stable library errors

LIBRARY_CONTEXT_INVALID, LIBRARY_CONSENT_REQUIRED, LIBRARY_ARGUMENT_INVALID, LIBRARY_TOOL_UNKNOWN, LIBRARY_NOT_FOUND, LIBRARY_SENSITIVE_DATA, LIBRARY_UNAVAILABLE, LIBRARY_RESULT_LIMIT, LIBRARY_TOOL_LIMIT, LIBRARY_ABORTED, LIBRARY_TIMEOUT, LIBRARY_UNVERIFIED_CITATION.

Individual missing/unsafe/unavailable tool records become sanitized tool results, not successful reads. Structural/budget/cancellation failures end the stream honestly. Existing chat/auth/case errors still apply. Operational telemetry continues to use request.chat; no query, filename, excerpt or tool argument is added to logs.

## Evidence boundary

`agent-library-tools.test.js` uses real temporary SQLite records. `test/library-chat-protocol.test.js` uses real SQLite, real local HTTP streams and authored provider-protocol fixtures, including a test-only fetch redirect for full route checks. It covers owner isolation, sensitive-data blocking, limits, ordinary-path compatibility, cancellation, invented references and exact-once appendix persistence after success/failure/disconnect. These fixtures are explicitly not DeepSeek responses or live-provider acceptance. No real API key or paid request is used.
