# Expanded persistent journey: independent acceptance queue

Prepared 7 October 2026 against the published contracts at PR #12 `fa964c4a97ea5500d40b86cb9350973fa9f9dbff`: `docs/customer-case-api.md` and `docs/document-context.md`. These are planned checks, **all Not run for the new endpoints** until a fixed runnable backend/frontend is handed off. Prior username/password, case persistence, file and telemetry results remain tied to their exact recorded SHAs.

## Setup and evidence boundary

Use a task-owned detached composite, Node24, loopback real HTTP, private mode-0700 directory with real SQLite, two disposable ordinary accounts and an isolated owner. Retain no provider key or real customer data. Read status/capability gates before calling new endpoints. Existing six-character boundary acceptance is retained unless its code changes. Record component and integration source SHAs separately. Do not alter root-owned server/storage or Kimi-owned frontend. Do not run a paid chat probe without direct applicable authorization; an absent key is an honest negative-path test, never a synthetic successful provider response.

## HTTP/SQLite checks once the fixed implementation is available

| Check | Concrete assertion | Evidence |
| --- | --- | --- |
| E01 Migration and compatibility | Schema1/2 synthetic users/cases/versions/telemetry survive additive migration; old-client updates omitting clientId/documentContext preserve those values; no invented customer binding | Before/after safe IDs/counts, actual SQLite and HTTP |
| E02 Customer isolation/search | Accounts A/B each create a synthetic Johnny record; literal mixed-case substring search and lists return only the current user's record; foreign IDs give404, including owner access | Actual HTTP statuses and isolated query results |
| E03 Case association/concurrency | Own clientId binds; foreign ID rejected; concurrent expectedVersion update gives409 and does not overwrite; reassociation and explicit null behave as documented | Reloaded records and optimistic versions |
| E04 Consolidated confirmed context | One explicit confirmation stores server timestamp and provenance; normal suggestions cannot overwrite confirmed answers; explicit edit revokes confirmation; unchanged resolved answers survive restart | HTTP and actual database restart |
| E05 Context provenance ownership | Same-case own message may be referenced; malformed, foreign-case/user and nonexistent message IDs rejected; context string is data only | Exact safe error codes, no cross-record changes |
| E06 Readiness/draft/final | Missing required facts produce localized targeted questions; incomplete draft remains saveable; final rejects unresolved critical fields and placeholders; optional absent fields omitted | Readiness JSON and artifact status |
| E07 Exact artifact bytes | Final preview/copy/TXT contains the same server content, without legacy DRAFT/NOT FOR SUBMISSION wrappers or unsupported de-identification claims; supplied date vs preparation date remains truthful | UTF-8 equality/hashes; actual browser copy/download; print visual check separately |
| E08 Immutable versions and sources | New saves append versions; old content remains unchanged; stale case version rejected; final provenance accepts only complete own-case source messages | Artifact list/read/download and safe metadata |
| E09 Persistent conversations | Multiple conversations stay bound to the correct case/user; reload/restart restores saved turns with truthful complete/interrupted/failed state; no raw image bytes persist | Actual HTTP/SQLite; live provider positive branch separately authorized |
| E10 Retry and failure integrity | Duplicate clientMessageId returns409; missing provider/auth errors do not fabricate assistant completion; saved user turn or partial failure follows published semantics | Actual failure response and reloaded conversation |
| E11 Protected mutations | Missing/wrong session, CSRF and exact Origin are rejected on each route family; unknown keys/overlimits rejected; lists/search bounded | Focused real HTTP negative matrix |
| E12 Delete and privacy | UI says conversations/artifacts are also removed; cancel preserves all; confirm removes only the disposable selected case and its children; customer/other-user data unchanged | Actual browser + own synthetic data queries |

## Browser journey once the matching frontend is available

Create/select synthetic customer → multiple cases → new/resumed conversation → add supported material → answer only unresolved required questions → consolidated confirmation → generate/edit explicit draft/final artifact → preview/copy/TXT/print → reopen customer document list → restart/relogin/resume without repeating resolved questions. Exercise 390px and 320px reflow, keyboard focus, cancel and duplicate-submit recovery. Confirm source/draft/final labels describe actual processing and do not imply official submission or eligibility approval.

True SSE deltas, stop/retry and image interpretation require genuine provider output when authorized; local unit stream fixtures cannot establish that capability. Missing routes or composer remain Not implemented/Not run. Email verification/recovery is a separate pending implementation/authorization lane and must not be silently substituted with username registration.

## Release handoff

Report each E01–E12 as Pass/Fail/Not run/Blocked at its exact revision, with only synthetic evidence. Route frontend defects to Kimi and server/storage defects to root with reproduction and minimum retest. Retain open stale-response telemetry race and timing limits until actually closed. Schema3 rollback must not run the migrated database under a schema1-only image. Production credentials, deployment, provider evidence and private administrator setup are separate from these local results.
