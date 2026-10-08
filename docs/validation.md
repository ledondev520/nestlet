# Nestlet validation

Checkpoint: 2026-10-07. This is a development checkpoint, not final acceptance. Deployment and real-browser integration remain separate; rerun after the final source freeze.

## Conversational review guidance, 2026-10-08

Branch `fix/chat-review-guidance`, based on `bbd240c`. A live synthetic conversation on that base described the materials editor as the conflict-resolution path despite the existing in-chat human review controls. It reused historical messages; historical influence is plausible, not proven. Inspection found that the action-enabled prompt did not describe the current in-chat review path.

This bounded change updates instructions only: prefer the supported in-chat review after a successful preparation and complete saved answer; preserve fresh targeted human confirmation, conflict evidence review, single-detail correction limits, optional manual editing, and truthful save/card claims. General guidance also excludes unsolicited document drafts, invented sender representation/authority, and internal API/field jargon. No schema, endpoint, tool capability, UI write path, or provenance changes.

- `npm ci`, `npm run check`, `npm run build`, and `git diff --check`: passed. Build retains its existing chunk-size warning.
- Focused conversation-action tests: **17/17 passed**. The new synthetic provider-protocol test checks outbound instructions, unchanged historical messages, no invented proposal event, and no case mutation. It does not prove model obedience.
- `npm test`: **397/397 passed** after building assets. The initial fresh-clone run was **396/397** because the production entry-point test correctly returned 503 before a frontend build.
- `npm run test:frontend`: **319/319 passed**, including real local HTTP/SQLite and React DOM fixtures.
- Independent correctness/maintainability review found no blocking issues; its separate action/review/HTTP/React DOM run passed **31/31**.
- Focused Chromium action/review browser tests were attempted but **both blocked before test execution** by this container’s Chromium launch restrictions (read-only crash-report directory and process-singleton socket permission). No browser pass is claimed for this change.
- No real provider request or deployment was performed. A later authorized live turn must establish whether actual model wording improves, including when old replies remain in history. Rollback is a revert of this prompt/test/documentation commit; no data rollback is needed.

## Chat source navigation and read-only lookup, 2026-10-07

Branch `fix/chat-source-navigation`, based on `0ad9184`. Explicit lookup uses existing authenticated GET endpoints to find saved customers and case titles without an AI call, conversation write, or case creation. Search results and structured live retrieval sources offer explicit case selection, fresh version/ownership/association checks, private original links, and text-only historical artifact inspection. App owns case changes and guards unsaved chat/material/document edits. No IDs or URLs are parsed from assistant prose; saved reply citations remain text-only.

- `npm run check`: passed
- `npm test`: **325/325 passed**, zero failed/skipped
- `npm run test:frontend`: **284/284 passed**, zero failed/skipped
- `npm run build`: passed; existing bundle-size advisory remains
- Six real HTTP/SQLite + React-DOM tests cover duplicate-title customer choices, malformed IDs, stale versions/associations, cross-user 404 and controlled 403, exact original bytes, escaped historical artifact content/stale labels, repeated clicks, cancellation, hidden/account/case changes, dirty-editor decline/approval, read-only search/empty results, and actual empty-App lookup with live AI disabled. The App retrieval test uses controlled SSE envelopes; it is not provider acceptance.
- Added a Playwright scenario for actual UI lookup, exact selection and dirty guards. The targeted browser command attempted this and the existing chat workflow scenario, but Chromium failed **before either test body** with `socket() failed: Operation not permitted`. Approved escalation produced the same launch failure. Browser interactions/screenshots remain **not run**; the command failed at environment launch, not a proven product assertion failure.
- Dependencies already present in this task were reused; `npm ls --depth=0` verified installed package versions. No install, live provider, deployed service, auth/schema/security or document-export changes were made.

Remaining boundaries: ordinary AI first-send still uses the existing durable case/conversation creation flow. Users needing lookup only use the explicit read-only lookup. Full natural-language action planning, combined-branch browser acceptance, remote CI, production acceptance and deployment are not established by this checkpoint. Rollback: revert the source-navigation commit; no data migration is required.

## Official-reference React migration regression, 2026-10-07

Based on exact main `73255d90826e4934b1f0f489d3ed836e076096ed`, the existing official-source registry was previously reachable only in the legacy UI. The promoted React root now exposes a compact bilingual reference disclosure in chat/materials/documents, separate from case facts. Chat sends an allowlisted reference ID; the server supplies bounded registry observations and explicit case-applicability/version uncertainty to both ordinary and library-assisted requests. No new source assertions, official-form mapping, model, network tool, schema or authorization behavior is added. The registry's recorded check dates are reused, not a claim of fresh source verification in this change.

- `npm run check`: passed
- `npm run build`: passed; existing single-bundle size advisory remains
- `npm test`: **312/312 passed**, zero failed/skipped
- `npm run test:frontend`: **224/224 passed**, zero failed/skipped
- Root React-DOM plus real HTTP/SQLite regression verifies reference availability, both interface languages, unchanged case/readiness on selection, English supplementary generation without invented agency facts, and case-switch reset. The ordinary/library HTTP protocol test verifies server-owned guidance reaches the upstream request; that upstream is an authored local fixture, not DeepSeek
- `npm ci --ignore-scripts --offline` could not complete because one package was absent from the local cache. Checks reused the existing dependency tree from an isolated worktree with the identical lockfile SHA-256, and `npm ls --depth=0` passed. No dependency/lockfile changes or install scripts were run
- No browser, live provider, email, production service, push, merge or deployment was used for this candidate. Real-browser visual/keyboard/mobile review and real-provider source fidelity remain separate acceptance gates. Generated final correspondence remains supplementary and does not certify an official packet or agency acceptance

React/shadcn foundation checkpoint (09:33 UTC): production build and seven API/build contracts pass. This is a component preview, not a completed business-page migration. The combined baseline has one legacy localization failure; supported-browser and Docker validation remain pending. See [exact migration evidence](shadcn-migration.md).
## Artifact invalidation regression, 10:29 UTC

Based on exact main `2fc15f216714d0331a82456edb1d97b9f76f8498`, the new actual-HTTP/SQLite plus development-DOM test first reproduced the reported defect: after opening a final, clearing property, reviewing the unknown and successfully saving, the interface incorrectly remained `Unsaved changes`. A clean preview now exits the opened-artifact editing identity when facts/review state change. Stored artifact versions are untouched. A genuinely edited document remains available as a draft until explicitly saved as a new version.

- `npm run check`: passed
- `npm test`: strict **231/231 passed**, unchanged evidence tier
- `node --test test/artifact-invalidation.integration.test.js test/library-ui.test.js test/localization-contract.test.js`: **14/14 passed**. The new lifecycle test uses real HTTP, sessions and disposable SQLite; it executes DOM events in JSDOM, not a browser. Existing library diagnostics use explicit response doubles and remain separately labeled
- The new lifecycle test verifies the formerly blocked completion/regeneration path, original immutable content, stale historical metadata, and retention/saving of actual unsaved document edits
- `test/artifact-invalidation.browser.mjs` contains the same end-to-end checks for an independently authorized Chromium environment. Local execution was **blocked before page interaction** by the container's `socket() ... Operation not permitted` restriction; the supported escalation retry had the same result. No browser pass is claimed

For the browser script, use a separately installed official Playwright test runner and its Chromium, then run `node --test test/artifact-invalidation.browser.mjs`. If the runner is installed outside this checkout, `NESTLET_PLAYWRIGHT_MODULE` may identify its module; `NESTLET_CHROMIUM_EXECUTABLE` may identify an already installed Chromium executable. These are optional test-only inputs, not production dependencies or application configuration. The script creates only disposable synthetic accounts/data and makes no model request. The default CI retains strict tests and adds the independently labeled actual-HTTP/DOM lifecycle regression; real-browser acceptance remains a separate gate.

## Strict acceptance command

Engineering integration checkpoint, **09:27 UTC**: strict **231/231 passed, 0 failed/skipped**, and syntax passes after both frontend engineering owners froze their scoped changes. The prior missing error maps are resolved in this candidate. Its app.js SHA256 is `90df9e4b34fc622c1358816e821db0c895d4d31da793238a047fcdbfb2576950`, based on local integration `4a015b7030596401cd3c70243f41f38c6ff69d52` plus engineering edits awaiting commit. The one new strict test exercises actual first-action server-created workflow headers through case/conversation/no-key chat and verifies case/user/request linkage without private content in logs.

Separately, **13 development DOM diagnostics passed** (8 chat lifecycle,5 library). They use explicit response/stream scheduling doubles and simulated image decode. They are excluded from strict231, not real-browser/provider evidence, and are not part of the user's no-mock end-to-end acceptance claim. The actual browser handoff is [engineering-browser-acceptance.md](engineering-browser-acceptance.md). The user extended the final checkpoint to **14:00 UTC / 22:00 Shanghai**. Real upstream streaming/vision, final browser lifecycle, email and deployment remain separate pending evidence.


`npm test` runs the strict core, HTTP parser/authentication, agency registry, private setup, localization, SQLite storage, case-isolation, web-registration, telemetry, administrator-alias/password, and bounded case-chat suites listed in `package.json`. Historical development doubles are excluded.

Historical frozen Linux run at **08:48 UTC, October 7, 2026: 230 total, 229 passed, 1 failed, 0 skipped** in default `npm test`; `npm run check` passes. The one failure is the new backend-error bilingual inventory (`test/localization-contract.test.js:76`, first unresolved code `CHAT_TOO_LARGE`); the current frontend has not completed the expanded error mapping. It is not skipped or weakened. Runtime was frozen by backend/storage owners, with no installation or duplicate aggregate overlapping this run. This is the worktree based on `8959bb9f82f6c7d2e1ea0ba0d616a04498ab6a2a`, with subsequent reviewed persistence/freshness fixes awaiting the integrator's commit.

Historical checkpoints remain: 07:20 strict179/179; QA additions187/187 on `3ed564218ac1592f7d85ea83b928fe95991aa850`; 08:28 development snapshot221 total/219 pass/2 fail (UI inventory plus obsolete schema2 assertion). The schema assertion is now correctly3 and actual schema migrations are tested. Earlier146/146 and132/132 checkpoints did not include the newer scope. See [the scenario-level matrix](acceptance-matrix-2026-10-07.md) for exact evidence layers, historical browser SHAs and open journey gaps.

A separate concurrent review run briefly reported workbook unavailability while `npm ci` replaced dependencies. The final result above was rerun after installation finished and concurrent testing stopped; no source fix or weaker assertion was used. Do not run tests against a working tree while its dependencies are being replaced.

LC-06 portability follow-up, 05:41 UTC: canonicalized only test fixture roots and added a real symlink-root regression that still asserts production rejects aliased targets. Linux strict suite: **103 passed, 0 failed, 0 skipped**, including 11 setup tests. Syntax passes. The prior macOS default-TMPDIR failure remains historical evidence; the corrected default-macOS rerun is pending Local Codex. Runtime security guards are unchanged.

This command uses real core functions, disposable actual HTTP servers, actual PDF/XLS/XLSX bytes, and installed real document parsers. It does not replace fetch, HTTP responses, provider calls, or file-reading functions. Server processes use disposable operator test credentials with real scrypt verification, and are deliberately configured without an API key and with live AI disabled. Parser tests log in and send real session/CSRF tokens. The suite verifies that unavailable live extraction is reported truthfully. Test source text and files contain authored non-personal examples only.

## Coverage established by strict tests

### Core behavior: 52 tests

- Five-field extraction, missing/unknown values, verbatim source snippets, repeated-label conflicts
- Exact required field keys, explicit boolean confirmation, unresolved conflict and control-character draft gates
- Unknown placeholders, all three English templates, purpose labels and human-review boundaries
- CSV quoting, BOM, empty cases, notice metadata, malformed shape rejection, row-injection flattening and formula-prefix neutralization
- Source-substring/value validation for supplied suggestions, malformed/duplicate input, preservation of both sides of deterministic conflicts
- Explicit spreadsheet row/column mapping, source-cell provenance, unmapped unknowns, fresh human-review state, and rejection of hidden/blocked/duplicate/out-of-range selections

### Real HTTP, file parsing and sample downloads: 27 tests

- Real server status identifies configured model `deepseek-flash`, reports no configured key/live capability, and returns a disabled error without substituting fabricated fields
- Basic security headers, every shipped browser dependency (including the agency-guidance module), static MIME types, and restricted source/environment paths
- Actual local PDF text extraction; consent, MIME, origin and size checks; blank/vector no-text, encrypted, corrupt, disguised, and overlong extracted-text failures
- Actual `.xlsx` and binary `.xls` preview, including exact string values
- Actual XLSX cached-formula, hyperlink, merged-cell and hidden-row suppression; hidden-sheet identification
- Actual XLS hyperlink/merge suppression and hidden-sheet identification. Formula and hidden-row metadata were not retained by the legacy fixture writer, so those legacy paths are not claimed tested
- Workbook consent/MIME/origin/byte-limit checks, CSV disguised as Excel, corrupt packages, and complete 413 response for an oversized chunked upload

- Actual hidden-column and 200-row/50-column preview limits, 13-worksheet rejection, and real encrypted XLSX/XLS rejection. Encrypted public test files include source attribution, SHA-256 and MIT license in `test/fixtures/README.md`

- All five public sample URLs return actual TXT/CSV/PDF/XLSX/XLS bytes with correct MIME and attachment filenames. Downloaded bytes are then read by the actual matching parser, including authenticated PDF/Excel upload; synthetic labels and an unknown agency are retained

### Real authentication/session HTTP: 9 tests

- Actual scrypt password verification, HttpOnly/SameSite/Secure cookie attributes, session-only CSRF disclosure
- Missing/foreign Origin and invalid-password rejection; non-HTTPS public sign-in rejection
- Missing/wrong/Unicode CSRF rejection; same-origin settings check
- Actual PDF/XLSX bytes rejected when signed out or without CSRF, and parsed with an authorized session
- No-key live extraction and connection-test refusal, with no simulated provider result
- HTTP settings refusal even after permitted local-development sign-in
- Logout revokes the actual server session and expires its cookie
- Unconfigured and malformed authentication fail closed for every file/AI/settings route, including loopback
- Ten actual failed login attempts trigger the configured rate limit

These tests configure an HTTPS public origin while talking to the local upstream over HTTP, as a reverse-proxy application-layer check. They do not prove a TLS deployment.

### Agency-guidance registry: 4 tests

- Explicit agency selection and an unknown fallback; the research default does not assign the case agency
- Bilingual reference records, official HTTPS host allowlist, and unconfirmed acceptance status
- Printed expiration metadata never becomes a current-validity or acceptance determination
- Returned registry objects cannot mutate the underlying source records

These are registry behavior checks, not a fresh independent legal/government compliance review.

### Private operator setup: 11 tests

Real temporary files and actual scrypt derivation verify addition/replacement of exactly the operator hash, preservation of unrelated bytes/BOM/CRLF, private 0600 mode, atomic inode replacement and temporary-file cleanup. Failure paths cover unconfirmed/mismatched/invalid input, stale versions, public permissions, writable directories and ancestors (including an untrusted sticky ancestor above a private child), hard links and symlinks, duplicate declarations, malformed UTF-8, multiline values, NUL/lone-CR content, size limits, invalid paths and noninteractive CLI refusal. Fixture roots are canonicalized before creation so an OS temporary-directory alias does not relax production symlink guards. This was reproduced with a real symlink on Linux; macOS certification remains an independent platform check. No production configuration file or real user credential is used.

### Localization source contract: 5 tests

The actual zh/en dictionaries have matching keys and array lengths. English copy contains no Chinese prose. **4/5 pass, 1 fails:** the emitted-code inventory now includes case-records/document-context/chat and exposes missing mappings for the expanded UI. The first unresolved code at08:48 is CHAT_TOO_LARGE. Matching old dictionaries does not prove new customer/chat error UX is complete. Unknown errors resolve to localized copy keys; raw backend error/message/stack content is not rendered. LC05 explicitly verifies that PDF `TEXT_TOO_LARGE` takes priority over generic HTTP 413, with bilingual 50,000-character split/fewer-pages guidance distinct from the 5 MiB binary limit. The actual 35,717-byte PDF fixture still returns `TEXT_TOO_LARGE`. This is source-contract inspection, not browser rendering or event-flow evidence.

### Actual SQLite storage: 12 tests

Real file-backed SQLite verifies schema identity, private ownership/modes, stable named-user IDs and credential rotation, owner/user-scoped operations, reopen/fresh-process durability, optimistic version conflict/rollback, strict bounded payloads, canonical fact order, SQL metacharacters as data, durable deletion, the 100-case-per-user cap, and refusal of unrelated schemas or unsafe files without destructive migration or permission changes.

### Actual case HTTP and roles: 10 tests

- Real owner and two named-trial logins bind server-side identity; trial/signed-out status hides owner-only settings metadata
- Trial users receive 403 on settings read/write/connection checks even with valid CSRF and forged identity headers
- Every pair of distinct users, including owner versus trial users, receives 404 for foreign case read/update/delete; list responses contain only own-case metadata
- Versioned saves/deletes reject stale clients, and two actual concurrent writes with one version allow exactly one update
- Authentication, CSRF and Origin failures preserve stored content; bounded malformed, credential-bearing, extra-key and falsely reviewed payloads are rejected
- Cases and named identities survive an actual server stop/reopen; old sessions do not
- Real password rotation immediately invalidates that user's old sessions while preserving user ID, cases and other users' sessions
- One actual trial account can create 100 cases, is denied the 101st, can update existing records and can create again after deleting one

Every HTTP test process uses its own canonical temporary database path; no checkout/default or production database is used.

### Private trial-user provisioning: 7 tests

Actual private SQLite and real scrypt cover creation, sanitized metadata, role restriction, rotation preserving identity/cases, confirmation/password/username/stale-file guards, permissions/writable-ancestor/link rejection, missing or unrelated targets without byte replacement, and noninteractive CLI refusal without password echo or database changes. Interactive PTY and Docker execution are separate packaging evidence.

### Actual web-registration lifecycle: 15 tests

- Six separate real HTTP cases verify each password length6,7,8,9,10,11 through registration, logout, login and owner-settings rejection
- Registration creates a real ordinary (`trial` internally) session, saves a reviewed case, survives logout/login and an actual server stop/reopen with stable account and case identity
- Two web-registered accounts cannot read/update/delete each other's cases or manage provider settings; owner administration also does not grant case access
- Reserved owner names, requested roles, missing/extra fields, invalid usernames and mismatched/invalid passwords are rejected without accounts or session cookies
- Configured administration, exact Origin and HTTPS outside local development are enforced; malformed JSON, unsupported media and the 4 KiB request limit are checked
- Concurrent duplicate normalized usernames produce exactly one real identity; the sixth signup attempt is rate-limited
- The 100th ordinary identity succeeds and the 101st is refused. Two actual processes racing for the final slot admit exactly one identity; credential rotation remains possible at capacity

The first account-cap regression returned 201 for the 101st user. That failure was preserved until the storage creation transaction was fixed; the successful sequential and two-process checks above were run afterward. No provider response or registration result was simulated.

### Telemetry SQLite, privacy and bounds: 8 tests

- Actual schema1→3 migration preserves every original users/cases column, credential hash, stable identity and case version; newly added client_id remains null rather than inventing a customer
- Fixed metadata shape rejects arbitrary text, filenames, credentials, URLs, exception details and client-supplied authoritative timing/status
- Workflow/case binding checks both owners, permits idempotent rebinding to the same case, and rejects another case; request correlation requires the same user and workflow
- Actual rate windows, descending pagination and query whitelist enforce their specified limits
- Actual SQLite writes enforce 200 events/workflow, 2,000/user, 20,000 globally and 100 workflows/user; oldest metadata is removed without deleting case contents
- Chat metadata can truthfully retain HTTP200 with outcome=failure, roundtripping actual SQLite; this is a metadata contract test, not a live stream
- Actual dated SQLite fixtures older than 30 days are removed on read and startup. No clock is replaced or accelerated

### Actual HTTP telemetry: 10 tests

- Server-generated request IDs correlate only to the owning workflow; administrators can read cross-user metadata but still cannot read customer case bodies
- Real delayed/chunked request delivery produces measured server elapsed time; client active/wait measurements remain independent and cannot overwrite it
- Foreign workflow headers are ignored for tracking while the authorized business save succeeds; explicit foreign/rebinding attempts fail
- Real SQLite `BEFORE INSERT` failure on telemetry events leaves successful case creation/update committed. Dedicated telemetry writes report their own 503 error
- Actual auth/CSRF/Origin, fixed-field, batch-count/byte-limit, pagination and per-user rate boundaries are enforced
- Real PDF/Excel parsing and a genuinely disabled extraction attempt record only fixed backend outcomes and timing; no document content or filename appears in returned metadata
- Workflow creation explicitly requires JSON `{}`; the prior UI request shape without Content-Type/body fails415, while the correct actual request succeeds201
- A genuinely no-key chat request emits scoped request.chat failure timing with no message/document text
- An actually aborted request produces one cancelled 499 event, does not create a case, and is not double-recorded on close

These tests establish backend telemetry contracts. Browser step instrumentation and any administrator dashboard are separate work and are not claimed present or verified here. Client dwell time is self-reported activity, never proof of a stall. The new schema cannot be opened by the older schema1-only application; deployment rollback must account for that independently.

### Administrator alias and password boundary: 8 tests

The implementation owner's actual HTTP/private-helper tests were independently rerun unchanged. They cover configured alias binding to the immutable owner, legacy login compatibility, reserved administrator names, collision refusal and session invalidation, private alias persistence, and the user-requested password boundary: 5 characters rejected, 6 accepted, 256 accepted, 257 rejected. Older longer passwords remain usable.

### Bounded chat input and pure SSE parsing: 7 tests

These are **parser/input tests using authored byte fixtures, not a live provider conversation**. They verify strict roles/consent/options and history limits, sensitive-pattern rejection, actual tracked PNG bytes and image count/size restrictions, rejection of remote image URLs and unsupported WebP/PDF payloads, bounded untrusted own-case context with explicit source/field truncation markers and without automatically attaching drafts, incremental split-UTF-8/CRLF SSE parsing, omission of reasoning_content, valid stop/DONE completion, and refusal of malformed, incomplete, tool, truncated or oversized streams. Additional checks reject explicit non-assistant SSE roles before yielding any content; bounded stored history excludes incomplete replies and preserves the unavailable-image notice even when excerpting long text. The shipped accepted image types are PNG and JPEG; actual model image understanding is unverified.

### Actual chat HTTP barriers without a key: 5 tests

Real sessions, CSRF and Origin checks protect `/api/chat`; a request without any Origin header is explicitly rejected. A foreign case returns 404 before provider availability checks; no foreign content is exposed. With an authorized own-case request and no configured key, the endpoint returns explicit 503 JSON with no fabricated answer or SSE and leaves the case unchanged. Client system roles/options, absent consent, overlong text, obvious sensitive identifiers and invalid/disguised image inputs are rejected before a provider call.

No API key, provider call, paid conversation, upstream network mock, simulated token animation or claimed native-vision result is used in this acceptance. Browser chat composition, actual native streaming, disconnect cancellation against a real provider and account entitlement still need separately authorized live acceptance.

### Reviewed document context: 13 tests

Actual pure functions validate canonical context/provenance, one-step explicit confirmation, preservation of already confirmed facts against model suggestions, bilingual missing-item questions and type-specific readiness. Minimal real recipient/department contact suffices; optional date/salutation/attachments do not create repeat gates. Generated final supplementary documents omit DRAFT/NOT FOR SUBMISSION labels but retain precise nonofficial/no-approval boundaries; drafts remain marked. Known placeholders, unresolved critical fields and unreviewed CJK prose block finalization; reviewed proper names remain verbatim. These checks do not establish legal compliance or model factual accuracy.

### Customer/case/conversation/artifact HTTP: 17 tests

Real owner/ordinary sessions and disposable SQLite verify literal Unicode-aware own-customer search, duplicate labels, bounded queries, CSRF/Origin, foreign IDs including administrator isolation, optimistic customer/case versions and backward-compatible omission of new fields. Multiple conversations and immutable artifact versions persist; actual TXT download bytes match saved content. Real logout/process restart/login restores customer/case/conversation/artifact IDs. Explicit answers update facts/context once; unresolved or incomplete-source finals are rejected. Canonical review timestamps/resolved issues cannot be injected through legacy CRUD. Questions retain explicit pending/confirmed/resolved states and require conclusions. No-key persistent chat fails truthfully.

Actual chunked-body mutations spanning a concurrent case deletion return404 without resurrection. Withdrawing or correcting a legacy reviewed fact archives its prior draft exactly once in the same transaction, clears the stale active draft and preserves previous immutable history. Changed-case final artifacts expose stale/regeneration metadata and reject download409 until a new version is generated. Authored complete/interrupted/failed SQLite messages are provenance-guard fixtures, **not generated provider answers or proof of live-stream cancellation**.

### Library storage and schema3 migration: 10 tests

Eight actual library-storage tests cover user-scoped search/relationships, context and question compatibility, message ordering/idempotency/image-presence-only metadata, immutable artifact provenance and freshness, atomic legacy-draft archival with failure rollback, reserved paid-turn row/byte capacity across restart, final-source restrictions, process reopen and cascade deletion. Two independent schema3 tests verify genuine schema2 telemetry CHECK rebuilding, existing records and AUTOINCREMENT high-water preservation, refusal of unsupported schema4, and transactional rollback on migration DDL failure. Together with12 existing storage tests, the storage owner's frozen set is22/22.

### Real-time idle-session expiry: 1 separate long-running test

**Passed.** A real authenticated session received no requests for 30 minutes, then the actual server rejected it with 401 `AUTH_REQUIRED`. Observation began 2026-10-07 04:22:20.111 UTC; completion was approximately 04:52:21 UTC. Test duration: 1,801,203 ms. Command: `node --test test/session-idle.acceptance.js`. No clock, session, HTTP or crypto behavior was mocked. This long-running check is separate from the fast suite. Its later temporary-SQLite isolation adjustment was syntax-checked only; the 30-minute observation was not rerun and remains evidence of the earlier checkpoint.

## Historical development checks, excluded from acceptance

`test/development-provider.test.js` contains isolated provider-response doubles. `test/app.test.js` uses jsdom with simulated browser-only services. They remain in the separately named `test:development` command as historical development diagnostics and have not been rerun or maintained after the no-mock acceptance requirement and auth redesign; their counts are not included above and they are not evidence of live AI, real-browser behavior, or no-mock acceptance.

Earlier reports of 86 passing tests included such development doubles. That count must not be presented as final no-mock acceptance or a successful real DeepSeek connection.

## Still unverified / pending

- Real provider chat/vision, native upstream streaming and browser chat UX are not verified by the parser/guard tests
- Frontend workflow instrumentation and administrator telemetry UI are not covered by this backend acceptance
- Historical Local Codex browser registration/save/restart/isolation evidence exists for older SHAs (linked in the matrix); these UI flows on the latest combined build remain separate acceptance. The HTTP lifecycle tests above do not establish browser rendering, keyboard behavior or deployment TLS
- The integrator separately verified one authorized real DeepSeek catalog/generation component probe, and the existing key is privately configured. This suite did not repeat it. Full application extraction, durable chat/SSE and vision remain unrun; do not ask for the key again or equate the component probe with the web journey
- Real browser interaction, desktop/mobile pixels, keyboard focus, complete zh-CN/English switching, output download/clipboard/print artifacts, and async reset/cancel behavior: **not established by this suite**
- Paid trial-AI quota enforcement is not exercised end-to-end without a real authorized provider call; no provider call is simulated in this suite
- Eight-hour absolute session expiry is not time-tested; the real 30-minute idle expiry check passed separately
- Latest deployment SHA/administrator initialization, real customer-library UI, clipboard/print artifacts, email verification/recovery and final integrated lifecycle remain separate checks

A direct cloud-browser loopback navigation was blocked; no alternate route was used to bypass it. Browser checks must run in the separately authorized browser environment or remain explicitly unverified.

## Limits

Source-substring validation does not prove semantic truth or discover every contradiction. Sensitive-identifier pattern checks are not comprehensive de-identification. PDF text extraction does not verify reading order or official form fields; no OCR is supported. CSV prefix bytes are tested, but actual Excel/Google Sheets formula execution has not been exercised. Named-trial access can be revoked by rotating the credential; no account-disable endpoint is implemented in this scope. These tests establish neither agency-specific compliance nor production security/privacy readiness. No real customer records, housing decisions, external communication, or official submissions were used.

## Private originals / schema4 candidate — October 7, 2026, 10:11 UTC

On the dedicated private-assets feature branch based on 8a7f5de:

- `npm run check`: passed; all new server/parser/operations modules included
- `npm test`: 250 tests, 249 passed, one known existing legacy bilingual-route fallback failure (`CHAT_TOO_LARGE` in `test/localization-contract.test.js`); frontend/integration lane owns that mapping. No full-release pass is claimed
- New private-assets coverage: 20 passing tests with real disposable SQLite, HTTP sessions, original byte uploads/downloads, real Poppler/SheetJS/PNG/JPEG parsing, PNG malformed-filter/palette/Adam7 rejection, Unicode literal search, ordinary/admin isolation, CSRF/Origin/explicit-save checks, quotas (including actual 51×5 MiB stored files), unsafe symlink/hardlink paths, digest corruption, process restart and preserving originals when a case is deleted
- Genuine baseline schema3 DDL migration to schema4 preserved users/customers/cases/conversations/messages/artifacts/telemetry rows exactly; failure rollback and future-schema fail-closed checks passed. Existing schema1/2 migration checks now target schema4 and passed
- Manual backup, verify, restore-to-new-directory after simulated source loss, exact-user export without credential tables, corrupt/missing/unexpected snapshot rejection, CLI execution and orphan reporting without deletion passed using synthetic data
- FTS5 was directly verified available in Node24; bounded Unicode-normalized literal substring SQL search was deliberately selected for this version. No FTS query language, semantic search, OCR or automatic AI library access is claimed
- Existing parser resource limits remain; image decoding runs in an isolated process with stripped environment, timeout/address/CPU/heap and pixel/decode-memory limits. No private file/model transmission or third-party viewer is involved

This is local backend evidence. The standalone feature branch does not include the separately owned Docker allowlist/COPY or React changes. Integrated image startup, real-browser PDF/image preview/CSP, end-to-end UI, exact-SHA release CI and deployment remain separate verification. No production files, credentials or database were read or modified; no backup job was scheduled and no deployment was performed.

### Private-assets integration follow-up — October 7, 2026, 10:22 UTC

- Merged main `2fc15f2` into the asset branch without conflict; its legacy bilingual fallback fix removed the prior failure. Final local `npm run check` and `npm test`: **254/254 passed**
- Added actual interrupted HTTP-stream checks: two held uploads exhaust the processing slots, cancellation releases both, no partial original is retained, and a later complete upload downloads correctly
- Added a checked-in live-write SQLite backup/restore test with another real connection committing originals during the backup
- Independent read-only review separately exercised 7,805 original files (including five concurrent uploads), an 8.57 MB inventory manifest, full verification and new-directory restore successfully. The original 8 MiB metadata ceiling was increased to 64 MiB to fit the full bounded account inventory
- Pre-upgrade schema3 backup now remains schema3, creates no source assets directory and leaves the entire source SQLite file byte-identical. Restore into a separate directory remains schema3; a subsequent real schema4 migration rehearsal there preserves the old case/version. CLI output is redacted verification/schema/count metadata only, suitable for deployment logs; source paths, filenames, user IDs and manifest contents are not printed
- Restore output must be outside its source snapshot and cannot already exist; backup/export output cannot be nested under source originals

No API/server/storage/package contracts changed in this follow-up. The separate runtime/frontend integration and exact release checks remain required. Timeout/decompression-bomb adversarial tests and non-Linux/no-prlimit equivalent native-memory enforcement remain unverified; no cross-platform hard-resource-limit claim is made.

### October 7, 2026 — atomic generic case-update draft preservation

Isolated branch based on main `2fc15f216714d0331a82456edb1d97b9f76f8498`. New `test/legacy-draft-preservation.test.js` passes 9/9 using actual disposable SQLite files and authenticated HTTP, including concurrent writer processes, optimistic conflicts, cross-user denial, archive/update triggers that force rollback, capacity failure, exact text/provenance retention and response metadata. No provider doubles, paid calls or production records are used. On this isolated candidate, `npm run check` passed and the full default `npm test` passed 240/240 with 0 skipped. Pinned dependency installation succeeded with an explicit temporary npm cache after the default cache path was unavailable. These results are not a browser/deployment or real-provider acceptance claim.

### October 7, 2026 — opt-in bounded chat retrieval

Isolated candidate based on unified head `d3a762d05c1a3a12c9c567421ee18b0fb0e50651`, with the reviewed library helper. Pinned install completed with `npm ci --ignore-scripts` and a temporary npm cache. `npm run check` passed; the expanded default suite passed **287/287, 0 skipped**. This includes 12 real-SQLite helper tests and 11 explicitly isolated local-HTTP/provider-protocol fixture tests. The latter exercise actual authenticated chat HTTP, SQLite persistence, cancellation, rollback/error behavior and exact-once source appendices, but are not DeepSeek or paid-provider acceptance.

Independent read-only review reproduced assistant-insert failure/deduplication and a shortened test deadline in an isolated copy, then reported no remaining blocker on the frozen runtime bytes. Live provider tool calling, actual retrieval UI/browser acceptance and deployment remain separate release gates. No production API credential or paid call was used for this work.

## Chat / sign-in polish, October 7, 2026

Local Codex removed repeated chat consent/footnote/footer prose under the owner's explicit UI request, changed the thread/composer layout and added remembered username/password-manager-compatible native inputs. The opt-in rememberMe flag preserves a session through idle periods within the existing eight-hour absolute expiry. Server restart still invalidates in-memory sessions.

Validation: 266 backend tests and 158 frontend tests passed under Node 24.18.0 with an owned, canonical TMPDIR (the default macOS temporary directory fails this repository's permission checks). Build and syntax checks passed. Actual loopback browser login with a public disposable fixture, refresh recovery and 390px no-horizontal-overflow checks passed. Production password-manager save prompts and a live paid-model call are not established by these checks.

Independent Standards and Spec reviews found no release blockers; duplicate control copy and the session contract documentation were corrected. Seven existing real-browser acceptance tests passed, including bilingual 320/390px layouts and account isolation. An additional controlled-React keyboard test passed for Enter versus Shift+Enter/IME; this is not a physical IME-device test.
## Email-first backend checkpoint, 2026-10-07 12:29 UTC

Schema5 backend work is isolated from the frontend rollout. New registrations require email and verification; username-only public registration is intentionally removed. Existing usernames, administrator aliases and saved records remain compatible. See [email authentication](email-auth.md) for contract/security/rollback details.

- Syntax checks and production frontend build: passed; frontend build is the unchanged base UI and does not certify the new email interface
- Backend aggregate before the final small loopback-compatibility addition: 282/282 passed. The initial clean-worktree run failed the promoted-root static check because build assets were absent; building resolved it without changing the assertion
- Focused real HTTP/SQLite/migration checks: 32/32 passed. Verification/reset HTTP fixtures explicitly seed synthetic accepted challenges; they do not send mail or establish real inbox delivery
- Existing frontend suite: 156/156 passed against the unchanged base UI, not the forthcoming email UI
- Separate `npm run test:email-contracts`: 53/53 passed with explicitly simulated provider delivery. Adapter signing, receipt validation, bounded timeout/response, sanitization, generic responses, pending accounts, trusted fragments, bind and reset are covered; these are not real-provider evidence
- Historical schema4→5 migration preserves all old users/data/schema objects and foreign keys. Failed migration rolls back; schema6 fails closed. Actual child-process token/email races admit only one winner. Persistent quotas and session credential fingerprints are tested
- Independent security review identified quota consumption after per-IP rejection and lost registration resend state after uncertain mail. Both were fixed with dedicated regressions
- No real credentials read, configured or transmitted; no actual email sent. New email browser acceptance, combined-final-SHA CI and production service acceptance remain separate required gates
- Existing schema4 binaries cannot open schema5. Do not reuse the schema4-only code rollback helper or restore a backup without a separate authorized recovery decision

### Email backend integration with chat retrieval and remembered sessions, 12:36 UTC

Rebased backend runtime `d857037` onto resolved retrieval/main integration `431909f`. Preserved upstream library tools/retrieval and exact session semantics: normal idle30 minutes, remembered idle8 hours, absolute8 hours, process-local sessions. The login API accepts strictly Boolean rememberMe and retains verified-email/legacy identity selection. Tests additionally prove reset revokes normal and remembered sessions, leaves another user's session valid, and a credential rotation during asynchronous login prevents a stale remembered cookie. Restart still revokes all cookies.

Integrated local checks passed: syntax, build, **308/308 backend**, **53/53 explicitly simulated email-service contracts**, and **201/201 existing frontend**. This is not the new email frontend/browser or actual inbox acceptance. No production service configuration or real mail send occurred. Both independent security findings from the first review were rechecked as fixed with three focused regressions.


## Interface copy sweep, October 7, 2026

At the owner's request, local Codex reviewed chat, material intake, customer/file directories, documents, account settings and shared recovery states. Removed implementation-status commentary and redundant permanent notes in both languages. Runtime failures still describe the required next action; unsaved edits, conflicts, file limitations and incomplete responses remain distinguishable.

Material extraction now starts from the explicitly named DeepSeek action without a second consent checkbox. Changing source text or uploading files never starts a provider request; the existing request validation and the consent field remain. Updated the controlled React test to verify this trigger and retained its failure/no-fallback assertions.

Validation: 158 frontend tests passed. Production build passed. Browser smoke, bilingual responsive flows, stored files/documents and account isolation are tested with the existing seven-test suite on a disposable local service. No production material or live provider call was used for validation.

## Combined email release candidate, 2026-10-07 12:53 UTC

Combined the email frontend/backend with the resolved framework base `2d5d0d6` (including the owner's shorter copy and existing native-autofill/remembered-session behavior). Required local checks pass: JavaScript syntax, production React build, **311 backend tests**, **223 frontend/API/React DOM tests**, **53 explicitly simulated mail contracts**, real HTTP email/legacy/format fixtures, and the HTTP/DOM artifact lifecycle. Playwright discovers **13 scenarios**; official Chromium and container acceptance are still pending for the final published head.

New real HTTP/SQLite/React coverage verifies explicit activation, email login, reset, stable identity, token replay rejection and old-session revocation with deliberately seeded accepted synthetic challenges. Separate simulated-transport HTTP fixtures cover generic enrollment/resend/forgot, actual cooldown/rate rules and binding. Neither establishes real DirectMail or inbox delivery. No production signup, recipient send or credential entry was performed by this implementation work.

Review found and fixed same-URL Back traversal retaining a captured link, schema5 backups not requiring the originals directory when empty, and missing Docker-context allowances for the four new email modules. Legacy enrollment now links to the root email flow instead of posting the removed username-registration contract. Owner recovery stays private-bootstrap-only. Manual snapshot restoration's password/token consequences are explicit in email-auth.md.

An extra run of the old sample-driven `test/app.test.js` reports three failures. The same three failures were independently reproduced on unchanged framework base `2d5d0d6`; that deprecated development suite assumes the retired local/sample extraction flow. It is not included in current required acceptance and was not altered to claim a pass. Current required suites pass as stated above. Local Docker/Chromium execution was not available/run; official CI remains authoritative for those gates.

## Customer/case browser candidate, 2026-10-07 15:03 UTC

Added four provider-free Chromium scenarios on base `73255d90826e4934b1f0f489d3ed836e076096ed`; see [the precise customer/case evidence boundary](../test/frontend-browser/CUSTOMER-CASES.md). The candidate covers UI-created linked customers/cases, reviewed facts, a resolved question, final/edited-draft versions, exact original bytes, real private-fixture server restart and fresh login, empty-conversation selection, role isolation, two-tab conflicts, offline save retention and explicit retry. Two trial identities are privately seeded legacy fixtures; three empty conversations use normal authenticated HTTP, with no fabricated messages or provider responses.

Local results: the new real HTTP/SQLite restart and isolation contract passed repeatedly; existing product/email/format fixture checks passed; syntax and production build passed; backend **311/311** and frontend **223/223** passed. Playwright discovers **17 scenarios in six files**. Independent static review found no definite selector/flow blocker. **The four new Chromium scenarios have not run here**: the executor does not support standalone browser execution and no bypass was attempted. Exact-commit official CI must establish their actual browser result. Existing bundle-size warning remains. No production navigation, live provider/email call, UI/backend product change, push, merge or deployment occurred in this local candidate task.

### Customer/case official CI and main integration, 2026-10-07 15:33 UTC

[Official browser run 37643281521](https://github.com/ledondev520/nestlet/actions/runs/37643281521) passed **17/17 Chromium scenarios**, with zero failures/errors/skips in downloaded JUnit, including all four new customer/case tests. PR head `dbdfcbb44bdfaf4f612ecebe93fe3332bd8a42dc` and actual PR checkout `37bc10b2f51e1c8de7664ea8a12d00dfb097b857` have the identical verified source tree `cbc0b25b60a61adf9fa8e82f11be6ae59582cbe8`. This proves the exercised isolated Node/SQLite/assets restart with fresh sign-in, customer/case/version recovery, conflicts and offline retention. Empty conversations remain API-created; live chat/provider, genuine mail and production host/container restart or restore remain untested by this suite.

Merged official-guidance main `6b357266ff5548785479d08c5d219dafa6b277a2` into the browser candidate without conflicts, preserving both prior evidence sections. Combined local verification passed: syntax, production build, **312/312 backend**, **224/224 frontend**, **53/53 explicitly simulated email contracts**, **1/1 real HTTP/DOM artifact lifecycle**, all four standalone product/email/format/customer fixture checks, and browser discovery of 17 scenarios. Workflow YAML verification confirms the only workflow changes add the customer fixture command and correct the evidence-summary wording; permissions, triggers, environment and existing gates remain unchanged. Fresh official CI is required for the integrated head; the earlier Chromium pass is not inherited. No PR merge or deployment was performed by this test task.

### 2026-10-07 — explicit chat-original retention, isolated local component

The isolated retention component reuses the existing private asset API, preserving exact selected PNG/JPEG originals in the same saved case with explicit consent. It does not retain unselected images or change historical chat metadata. Twelve new tests cover adapter validation, development React DOM races/retries/cancel, and actual local HTTP/SQLite/private-file persistence, response-loss reconciliation, restart/search, and per-user isolation. `npm run check`, 312 backend tests, 236 frontend tests, and the standalone branch build passed. Identical-lock installed dependencies were reused without an install. This does not yet establish entry-point integration, real browser, provider, CI, or deployment acceptance. See [the retention contract and detailed evidence](../frontend/features/chat/ORIGINAL-RETENTION.md).

## 2026-10-07: local conversation-to-case bridge and integrated original retention

Implemented against base `5335312` with the explicit original-retention module. Chat now has same-case materials/document continuation, a read-only saved-readiness panel, append-only unreviewed message handoff, and explicit source-linked draft-only answer saving. The existing case/fact/document editors remain the owners of their buffers, confirmation gates and optimistic versions. No schema/provider/auth/release-helper changes were made.

Local evidence uses synthetic inputs only:

- `workflow.http-dom.test.js`: actual React DOM events, real local HTTP and SQLite, with authored saved conversation content rather than a provider response. Passed source-review cancel/append, unsaved material/composer/document preservation, known confirmed fact reuse, missing-answer confirmation, real final generation, exact source-linked draft storage, double-click prevention, deliberately truncated committed HTTP 201 response reconciliation, pre-write cancel, real concurrent-update 409, late old-case response rejection and process restart persistence
- Focused controlled DOM/model tests separately cover malformed/untrusted/incomplete/oversized messages, account/case scope, duplicate source append, and uncertain/truncated-201 new-case creation without a duplicate POST
- Integrated image-original module retains exact selected File bytes only on explicit save; its separate actual HTTP/SQLite/DOM evidence is recorded above
- `npm run check`, `npm run build`, `npm run test:frontend` (244/244), `npm test` (312/312), and `npm run test:email-contracts` (53/53) passed. Pinned dependencies were reused from a sibling with an identical lockfile; no new install or dependency was added. The build continues to report the existing large-chunk advisory
- A new official-CI Playwright gate (`chat-workflow.spec.js`) covers first-save image retention plus same-case review/generation and 390px navigation. Local test listing passed. Chromium execution was deliberately not attempted in the blocked local standalone environment

This is local implementation evidence, not a published or deployed release. Exact-combination official CI browser execution, real provider/vision/SSE acceptance and production rollout remain separate gates. No live AI or email was sent by this work.

A separate read-only review found the malformed-success classification edge. It was fixed with an explicit known pre-commit rejection allowlist and independently rechecked; no remaining material blocker was found within this bridge scope. This review did not run a browser.

## Prepared owner-controlled administrator capability, 2026-10-07 16:47 UTC

Separate local schema6 branch based on `5335312`; not merged, published or deployed. An independent verified-email account can receive a reversible, owner-granted administrator capability while retaining its own ID, email, password recovery and user-scoped cases/files. The bootstrap owner remains immutable and uses its environment password. Administrators receive bounded read-only operational diagnostics; account grants, provider settings and global telemetry remain owner-only. New grants require a verified email. No real account grant, credential entry, email or model-provider call was made.

Local evidence on this candidate: syntax checks and production build passed; **325/325 backend**, **253/253 frontend** and **53/53 explicitly simulated email-contract tests** passed. The 29 new frontend model/React-JSDOM checks use synthetic API fixtures, not browser or production acceptance. Actual HTTP/SQLite tests cover owner-only permission management, CSRF/Origin, registration self-promotion rejection, exact replay and stale-ABA protection, immediate grant/revoke on existing cookies, restart, recovery session invalidation, own/foreign case/customer/conversation/artifact/workflow/original-file reads and mutation denials. The append-only minimal audit is atomic with each grant/revoke and failed audit insertion rolls back access.

A genuine populated schema5 fixture matches all 42 schema objects in the baseline's fresh database. Migration preserves preexisting user/email/data rows, DDL, foreign keys and telemetry sequence; repeated opens and two simultaneous startup processes leave no automatic grants. Late migration failure rolls back all new DDL; schema7 fails closed without source byte/file-set or journal-mode changes. Real private-data backup tests preserve a pre-upgrade schema5 snapshot, migrate only an isolated restored drill to6, then round-trip administrator state, audit, email actions/rate limits and original bytes through schema6 snapshot/restore. The pre5 rollback snapshot and source remain unchanged. Nestlet's own backup helper recognizes schemas1–6 and rejects future7. No independent deployment/maintenance helper was changed.

Independent local read-only backend review found no blocking security/correctness issue and independently checked hostile cross-user HTTP operations. It also identified and resolved a fixture-aging hazard by using current synthetic timestamps. Both new backend modules are explicitly included in Docker runtime COPY and the context allowlist, covered by a source-contract test. **An actual Docker build/start, real Chromium UI flows, final App/settings mounting and exact-SHA official CI remain unrun**. The existing bundle-size warning remains. This local preparation does not establish production release readiness and is separate from the schema4→5 email release.

Dependency note: the offline `npm ci --ignore-scripts` attempt could not complete because the npm cache lacked a pinned package. For the reported local checks, an existing installed dependency tree from an identical package-lock.json was copied into this disposable worktree. No successful fresh dependency install is claimed. See [the permission/API/migration contract](account-administration.md) and [isolated frontend integration](../frontend/features/account-administration/README.md).

## Dedicated official-reference browser scenario preparation, 2026-10-07

Test-only continuation from exact main `5335312fd53becaad4bfccace5c1f3e39c6bf4f2`: one new `test/frontend-browser/agency-guidance.spec.js` scenario exercises the existing reference panel across chat/materials/documents, both interface languages and 320/390/1280-pixel viewports. Native disclosure/selector keyboard interaction, focus order, overflow, displayed source cautions, unchanged real case/readiness data, and zero provider/business-write requests are asserted. It reuses the existing private synthetic fixture and introduces no UI/backend/fixture behavior or response doubles.

Local evidence: build and syntax passed; Playwright discovery lists 18 scenarios; existing actual-HTTP fixture and customer-case checks passed; backend 312/312 and frontend 224/224 passed. The unchanged dependency tree was reused from the identical locked dependency set, with `npm ls --depth=0` passing. No standalone browser, deployed service, model provider, merge or deployment was used. The new browser scenario remains unrun until its exact published candidate earns an official Chromium CI result. Existing source-check dates are not freshly verified by this work. Kimi's visual review and live-provider source fidelity remain separate.

## Unified local schema6 candidate, 2026-10-07 17:08 UTC

Combined the conversation/material/document bridge, explicit chat-original retention, owner-controlled account administration, PR24 official-reference browser scenario, and PR25 value-preserving chat-radius tokens on an isolated branch based on `5335312`. App/settings now mounts the capability-gated owner roster and bounded diagnostics, with inactive navigation clearing privileged panels. Owner, Administrator and Ordinary user access labels are distinct; bootstrap-owner recovery wording no longer incorrectly describes delegated administrator accounts.

The mounted App/settings integration passed actual HTTP/SQLite/React DOM verification with disposable synthetic identities: verified registration through disclosed simulated mail transport, immutable owner/unverified legacy restrictions, cancel without PUT, leaving/re-entering settings discards pending permission intent, one explicit versioned grant, fresh roster read, same-cookie delegated diagnostics without roster/provider requests, one revoke/audit event, and account-switch/ordinary cleanup. No real account permissions, provider keys, genuine mail or model calls were used.

Final local aggregate checks passed: `npm run check`, production Vite build, **277/277 frontend**, **325/325 backend**, **53/53 simulated email contracts**, **1/1 additional actual HTTP/DOM artifact-invalidation integration**, and all four standalone product/email/formats/customer HTTP fixture checks. Dependencies remain unchanged and were reused from an identical locked tree. The Vite large-chunk advisory remains.

The two container SQLite smoke scripts previously pinned schema5. Their expectations now match this candidate’s schema6, including capability/audit tables and immutable-audit triggers, and the unauthenticated container smoke includes all three new admin GET routes. The real schema1→6 migration script and the SQLite write/read smoke passed locally in a fresh private test directory; these do not establish Docker image/container acceptance. The independent active schema4→5 deployment/maintenance helper was not changed.

Playwright discovery lists **20 scenarios**, including new integrated chat/original-retention and account-administration gates plus the PR24 reference scenario. Browser source/syntax checks passed; **Chromium and Docker execution, exact-SHA official CI, publication and deployment are NOT RUN here**. Docker CLI is absent in this authoring environment, and Chrome execution remains reserved for official CI. This schema6 candidate is separate from the independent `5335312` source candidate for the schema4→5 rollout. A schema6 database cannot be used with a schema5 binary; the documented pre-upgrade snapshot/restore and explicit release gates remain mandatory.

### PR26 first official CI result and label assertion correction

For head `f93099504908c4245bfc9b15e3adca8d73248762`, official [Node checks 37658510035](https://github.com/ledondev520/nestlet/actions/runs/37658510035) and [Docker/container checks 37658510372](https://github.com/ledondev520/nestlet/actions/runs/37658510372) passed. The actual checkout was PR merge `a7db14cb8e61bc33bf452496b89397c70ae49caf`; GitHub Git-data reads verified that its tree and the head tree are both `13a3ca0909af1dea9134c2401611da4f7ff44e29`.

[Official browser run 37658510816](https://github.com/ledondev520/nestlet/actions/runs/37658510816) completed **19/20** scenarios. The new integrated owner/delegated account UI, chat-image/case/document path, and official-reference scenario passed. The older customer-case scenario stopped at its obsolete access-label assertion (`Ordinary account` / `Administrator`). The product now deliberately distinguishes `Ordinary user` / `Administrator` / `Owner`. The assertion now targets the dedicated `account-access` element and checks the correct ordinary/owner labels; no product behavior or permission gate changed. A fresh exact-head official browser result is still required before declaring the whole suite passed. No local Chromium run or production action was used.

### Local follow-up: saved case title refresh, 2026-10-07

A separate unpublished branch based on `1bad360` fixes the stale chat toolbar title after a same-case rename. The existing account/case-scoped progress read now supplies only its validated saved title to Chat; it does not reload conversation history, replace the selected conversation, or clear unsaved inputs. No request/storage/schema contract changed.

The new focused actual HTTP/SQLite/React DOM test reproduced the stale title on the base, then passed after the patch. It renames and saves through Materials, returns to Chat without reloading, verifies the title and selected conversation, and preserves both an unsent chat question and a later unsaved material draft. Syntax, Vite build, **278/278 frontend** and **325/325 backend** checks passed. No local Chromium, provider call, publication or deployment was performed. PR26’s branch remains at `1bad360`; its earlier official CI result does not certify this unpublished follow-up.

### Desktop document export follow-up, 2026-10-07

A bounded test-only follow-up on `0ad9184` adds repeated export and unsaved-edit gating assertions to the existing real HTTP/SQLite/React DOM document integration. Copy, TXT payload and print-page text remain byte-for-byte equal to the saved preview on two successive actions, without extra artifact versions. Unsaved edits disable download, print and final generation; existing stale-final 409 and preserved-editor assertions still pass. Clipboard, download initiation and popup printing in this integration are captured side effects, not real OS/browser acceptance.

Added `test/frontend-browser/document-exports.spec.js` for the supported desktop Chromium gate. It uses the actual synthetic-account UI/HTTP/SQLite fixture and covers unreviewed-final rejection, the chat-to-document bridge, confirmed generation, repeated clipboard/TXT exports, draft saving, literal HTML-looking print text, print-media/PDF rendering, version-switch cancel/accept, and stale-final rejection. Syntax and Playwright discovery passed. **The new browser scenario was NOT RUN locally**: the coordinator reported a denied Chromium IPC launch in this environment; this lane did not retry or bypass that restriction. Native print-dialog/paper/PDF completion remains unverified, and even the prepared headless PDF assertion would only certify rendering, not an OS save dialog.

Checks passed: `npm run check`, `npm run build`, focused documents **22/22**, expanded HTTP/DOM integration **1/1**, aggregate frontend **278/278**, backend **325/325**, and `git diff --check`. The build retains its existing large-chunk warning; the development DOM harness emits React act warnings. An interrupted fresh `npm ci` and offline cache miss prevented a clean reinstall; the dependency tree was copied from the coordinator's validated independent checkout only after an exact lockfile comparison. No dependencies or product code changed. No model/provider call, genuine email delivery, production-data access, merge or deployment occurred. Publication and official exact-SHA browser acceptance remain outstanding.
## October 7, 2026 — conversation-action backend candidate

Isolated candidate based on `0ad91847`; no merge, deployment, credentials or live-provider calls. Adds read-only source-bound prepare tools and explicit unconfirmed application using the existing owner-scoped case APIs; no schema/auth policy changes. See [conversation action contract](conversation-actions.md).

- `npm ci --ignore-scripts --cache /tmp/nestlet-actions-npm-cache`: passed after the default npm cache path was unavailable.
- `npm run check` and `npm run build`: passed. Build retains the existing large-chunk warning.
- New action tests plus existing library-tool/protocol tests: 39 passed, 0 skipped. Real disposable HTTP/SQLite and concurrent independent processes are distinguished from authored provider-protocol fixtures.
- Existing frontend unit/DOM suite: 278 passed, 0 skipped; this does not establish new proposal UI or real-browser acceptance.
- Full aggregate initially failed two static-serving checks before a production frontend build existed. After build, only the new-error bilingual audit failed; the separate frontend owner is adding its explicit mappings. This candidate alone is not a full aggregate pass until that integration is checked.
- Actual Docker runtime, new frontend browser flow and live-provider tool execution: not run. Docker is not available in this executor. Packaging allowlist/COPY declarations include the new runtime module.

## Integrated desktop conversational proposals, 2026-10-07 23:49 UTC

Isolated local candidate combines the reviewed source navigation, test-only desktop document export coverage, provenance-bound backend proposals, and new desktop chat review UI. No schema or authentication policy change, visual redesign, publication, merge or deployment was performed.

- Syntax checks and production build passed. The existing bundle-size advisory remains.
- Combined backend suite: **342/342** passed; frontend suite: **292/292** passed; disclosed simulated email-contract suite: **53/53** passed. New action-focused frontend tests: **8/8** passed, including actual loopback HTTP, SQLite, React StrictMode DOM and a disclosed controlled chat SSE fixture. This is not a live provider response or Chromium acceptance.
- Covered per-send consent reset, cancel with zero writes, proposal blocking until successful terminal stream, exact case/conversation/request binding, double-apply prevention, persisted unreviewed provenance, reviewed and unconfirmed conflict blocking, draft-only saving, stale-version rejection, lost-write uncertainty without replay, stale account completion suppression and preservation of unsent input.
- Independent code review found and verified fixes for React StrictMode effect replay, already-unconfirmed conflicts and terminal conversation binding; its combined backend/frontend/localization focused suite passed **30/30**.
- Source-navigation and document-export test commits are included; the new browser scenarios remain **NOT RUN** here. The previously reported Chromium IPC launch denial was respected without retry or alternate browser route. Exact-commit official CI, Chromium rendering, real provider tool execution, live-account journeys and production rollout remain separate gates.
- Existing pinned dependencies were reused from the backend candidate with an identical lockfile. No dependency package or lockfile change was introduced by the UI work.

### PR28 frontend container-input repair, 2026-10-07 23:58 UTC

The first exact-head container CI exposed a packaging omission: the new browser-side proposal validator imports root `document-context.js`, but the Docker frontend build stage had not copied that file. Its sole transitive dependency, `public/core.js`, was already included. The minimal repair adds `COPY document-context.js ./` to that stage; the Docker context allowlist and runtime stage already include it.

A new regression constructs an isolated source tree using the frontend stage's actual COPY declarations and runs Vite against that restricted tree with the same pinned installed dependencies. It reproduced the missing-module failure before the fix and passed afterward. This checks build inputs without claiming an actual Docker image/container run. The nine packaging/action-focused checks, syntax checks, full-worktree production build, **293/293 frontend** checks and diff checks passed with zero skipped tests. New exact-head official container/browser results are still required; no merge or deployment was performed.

### Official proposal-browser gate prepared, 2026-10-08 00:02 UTC

Added `test/frontend-browser/conversation-actions.spec.js` to close the proposal UI's Chromium coverage gap. It uses a disposable real server, authentication, case creation, prepare/apply endpoints and SQLite. **Provider behavior is mocked explicitly:** a browser-only controlled ReadableStream supplies authored SSE packets, the chat-enabled status is a UI fixture, and source messages are authored directly into the disposable fixture database. No live key or real provider request is used; this scenario cannot establish provider/tool-selection quality.

The scenario checks preview-disabled-before-completion, reset one-message consent, complete-stream gating, cancel with zero apply writes, explicit unreviewed application, retained unsent input, and a real saved unresolved conflict that blocks application. It captures desktop screenshots and checks visible control overflow and the normal CSP/error monitor. Syntax and official Playwright discovery pass (**23 scenarios in 12 files**). Local Chromium execution was not attempted because the previously reported IPC restriction remains in force. Execution evidence must come from the new exact-head official CI result; previous 22-scenario runs do not cover this addition.

### Case API fixture port ownership, 2026-10-08 00:24 UTC

The first backend attempt of main run `37706056254` at `2e1354ef591975160885d9461910bf00f67742e8` failed on the case API server restart with `EADDRINUSE`; subsequent connection failures were cascades. The same-SHA rerun passed, which does not erase the initial failure. The fixture had closed its temporary port reservation before spawning the server, leaving a competing-bind window.

The test-only repair starts the actual server with loopback `PORT=0`, observes its actual `listening` event through a preload, and reports the kernel-selected address over child IPC. No production source, security behavior, retries, provider calls, dependency or lockfile changes were introduced. Startup failures clean up the child and event listeners. Other test fixtures were not migrated by this bounded change.

- A separate local fault-injection preload deterministically claimed the baseline reservation's released port before the launch callback. Baseline reproduced `EADDRINUSE` (0/10 passed); the fixed fixture passed under the same injector (11/11). This is disclosed synthetic socket contention, not a provider or HTTP mock.
- The checked-in regression exercises three rounds of four simultaneous actual servers, separate SQLite databases, distinct live ports and HTTP status responses; the existing authenticated persistence/session-revocation restart remains covered.
- Ten repeated focused suites passed **110/110**. Syntax checks, production build, and full backend suite passed **343/343**, with zero skipped tests. The build retains the existing chunk-size advisory. Identical-lockfile pinned installed dependencies were reused from the base checkout rather than reinstalling.
- These are local fixture/backend results. No browser, live-provider, deployment, or new exact-head remote CI acceptance is claimed. Revert the test-only commit to roll back; no data migration is involved.
## 2026-10-08 — Independent password eye controls

- Reported issue: the detached “Show password” control was unclear and confirmation stayed masked. The previous first-field toggle passes its native-autofill React DOM fixture; this does not reproduce or rule out the reported live-browser no-response symptom.
- Replaced the detached text button with an in-field Lucide eye/eye-off button for each password input. Password and confirmation toggle independently; login, reset and current-password binding use the same component. Both start masked, preserve native values/autofill, keep input labels/help, expose bilingual action labels, `aria-controls` and `aria-pressed`, and use 44px controls with reserved input padding. Native button focus/keyboard behavior and `type="button"` avoid accidental submission.
- Passed: `npm run check`, `npm run build`, `npm run test:frontend` (296/296), and `npm test` (342/342). Frontend coverage includes synthetic React/JSDOM toggling in both languages, no credential submission/storage, mode-change clearing, pending-request disabling, native autofill, and real Node HTTP reset submission after both fields toggle. HTTP evidence uses disposable SQLite/credentials and does not prove real email delivery.
- Dependency limitation: fresh `npm ci --ignore-scripts` was interrupted by the execution environment; an offline retry had a cache miss. Local tests used the existing dependency installation from an identical package-lock. Fresh locked installation remains a CI gate.
- Added `test/frontend-browser/password-visibility.spec.js` (two discoverable Playwright tests) for 320px width, actual 44px hit targets, visible icons, independent values, mouse/Space/Enter, focus, no POST, overflow and CSP checks. Local Chromium is unavailable under this executor's IPC restrictions; these browser checks are prepared for the official CI runner, not claimed passed locally. The production page and real user-entered credentials were not inspected or modified.
- No API, authentication policy, database or deployment changes. Rollback: revert this UI/test commit; no data rollback is needed. Live exact-release acceptance remains separate.
## 2026-10-08 — registration verification session continuation (pre-release)

- Registration-only verification now consumes the accepted one-time proof and creates its ordinary identity transactionally; session preparation refusal rolls back both. New-session activation and prior-session revocation happen only after SQLite COMMIT succeeds. Successful confirmation issues the existing normal HttpOnly/SameSite session (Secure on HTTPS), rotates away the presented cookie, and enters the workspace without another login/password step.
- Local `npm run check`, `npm run build`, `npm test` (345/345), and `npm run test:email-contracts` (53/53) passed. Node/SQLite HTTP coverage verifies exact-origin POST, one-winner claims, malformed/expired/replayed proofs, cookie flags, session replacement and owner isolation. Bind/owner-bind/reset never create a registration session. A first backend run preceded building assets and failed only the missing-root-build check; the built rerun passed.
- Local frontend DOM/service coverage passed; the final count and immutable revision are recorded in the PR. The real HTTP + DOM fixture verifies direct signed-in continuation and later reset revocation. Controlled-response tests additionally cover abandoned claims and capability-refresh failure.
- Official Playwright email journeys now assert immediate workspace entry and separate-browser continuation without `/api/login`; opening links still requires explicit confirmation, and replay cannot sign another browser in. Local Chromium could not launch because its process-singleton socket is blocked by the executor, including the approved escalation attempt. This is **browser not run**, not a browser acceptance pass. Official CI browser execution remains required.
- No real email, provider, production-account, live-password, grant, deployment or schema changes were performed. Pending real-provider/inbox evidence is unchanged. Code-only rollback remains schema6-compatible and clears in-memory sessions on restart.
## 2026-10-08 — Conversational fact review, isolated schema7 draft

- Schema7 adds durable, own-user conversational review intents. Explicit chat replies can atomically save reviewed facts without a Materials-page hop; unchanged reviewed values do not need another question. Existing read-only proposal/unconfirmed-apply contracts remain.
- `npm run check` and `npm run build` passed. Build retains the existing >500 kB chunk warning.
- Full backend suite passed 355/355 with `--test-concurrency=4`. An earlier unrestricted run encountered the existing reserve-then-release HTTP-port race; bounded rerun passed. This includes competing receipt consumers in separate Node processes and invalidation by a newer completed turn.
- `npm run test:frontend` passed 297/297. Included 8 combined real React DOM/HTTP/SQLite proposal/review tests. Providers are synthetic; no live provider success is claimed.
- New migration tests use populated schema6 and verify old rows/DDL, reopen, immutable bindings, rollback on late migration failure, schema7 backup/verification, and future8 refusal. Existing historical migration/backup expected-current-version assertions advance to7; the historical fixtures remain unchanged.
- Official Playwright test was attempted using `/usr/bin/chromium`; startup failed before tests ran with singleton `socket() ... Operation not permitted`. An approved escalated retry hit the same platform restriction. Real-browser acceptance remains an open release gate; no passing screenshot is claimed.
- No production database migration, data restore, live account/provider call, merge or deployment occurred. See `docs/conversation-review.md` for API, trust boundary, bounded correction behavior, replay, undo and schema rollback constraints.

- Docker COPY-subset regressions passed for frontend build and runtime storage/schema7 startup. The existing real-SQLite container migration smoke also passed against a disposable private local directory (not a Docker image), preserving schema1 data and original bytes through schema7.

### Independent review recovery fix, 2026-10-08

Independent review identified a lost-prepare-response gap: the UI retained its human answer only after question preparation returned, so a committed preparation with a dropped response could not complete on retry. The exact answer and client-message UUID are now captured before any request; retry reuses the question request UUID and original answer. New real HTTP/React DOM tests cover both correction and cancellation after the prepare response is lost. Combined proposal/review DOM suite passed **9/9**, full frontend **298/298**, and production build passed. This changes no backend/schema contract. Chromium remains unexecuted because of the documented runtime restriction.
### October 8, 2026 — live draft source-selection repair candidate

A reported live turn selected a persisted user-message ID for `prepare_answer_draft`, could not identify an earlier complete English answer, and contradicted saved draft versions. The prior context exposed IDs and roles without an explicit content mapping or saved artifact status. The candidate adds bounded same-scope source excerpts, eligibility and saved-version metadata, an eligible-ID draft tool schema, and recoverable wrong-role feedback. No source substitution, automatic case write, confirmation or schema change is introduced. English-only document instructions supplement the unchanged fail-closed English validator.

Focused local tests exercise older eligible sources surviving recent user/bilingual/interrupted turns, saved original and edited version metadata, bounded catalogues, ownership and case isolation, wrong-role retry, exact provenance, no eligible source, and provider payload grounding. Provider output is authored protocol evidence, not a claim of live model success. UI no-card messaging and deployed full-journey retest remain separate integration gates.

Final candidate local checks: pinned `npm ci --ignore-scripts --offline` succeeded; `npm run check`, `npm run build`, all 346 backend tests and all 293 frontend tests passed. The first backend run before building correctly failed the missing production-interface asset check (345/346); after building, the complete suite passed twice. No live provider calls, production changes, schema migrations or independent browser acceptance were performed for this candidate.

## 2026-10-08 — Reviewed functional integration candidate

Combined exact source PR29/30/33/34/36 on main2e1354e in an isolated worktree. All source commits are preserved; only append-only validation text needed conflict resolution. Fresh locked installation, syntax checks and production build passed. Full combined backend **363/363**, frontend **303/303**, simulated-email contracts **54/54**, and real HTTP/DOM artifact invalidation **1/1** passed, zero skipped. Playwright discovery reports **27 scenarios in14 files**. Build retains its preexisting chunk-size advisory.

No live-provider/mail request, production migration, backup/restore, merge or deployment was performed. Docker is absent and local Chromium execution is restricted; exact combined official CI, independent review and release rehearsal remain gates. The [source manifest and schema6→7 plan](reviewed-functional-integration.md) preserve the existing operations route and forbid automatic old-binary restart after candidate start.

## 2026-10-08 — durable login sessions / schema8 candidate

Local isolated candidate based on `05923a88156d8d2d1c497d22c3ef56414452d063`; this is not production-release evidence.

- `npm ci --ignore-scripts`, `npm run check`, `npm run build`: passed
- `npm test`: 379/379 passed
- `npm run test:frontend`: 303/303 passed
- `npm run test:email-contracts`: 54/54 passed, explicitly simulated mail transport
- `node --test test/artifact-invalidation.integration.test.js`: 1/1 passed using actual HTTP/DOM
- New durable-session coverage: raw bearer absent from SQLite; original cookie and CSRF usable after actual server restart; signup verification replay rejected; logout/reset and owner-credential rotation remain revoked across restart; all untouched owner cookies are revoked on startup after ENV rotation, even if that ENV credential is later reverted; current administrator permission refreshed; original idle/absolute expiry preserved; five-session eviction atomic; real session-insert and deferred-COMMIT failures roll back signup/account/proof and previous-session replacement; touch/delete errors fail closed; logout through another connection cannot be resurrected
- Schema8 fixture coverage: genuine populated schema7 additive migration/reopen, original rows/DDL/FKs/sequences/files preserved, late migration rollback, unchanged schema7 snapshot/restore, schema8 snapshot-session preservation and restore-session purge, future9 rejection without writes/sidecars under DELETE and WAL modes
- Existing container SQLite lifetime and schema1→8 migration smoke scripts also passed locally against private disposable directories; these local executions are not Docker/container acceptance
- Independent read-only security/correctness review completed. It found an owner-ENV rollback revival edge case, which was fixed with startup-wide reconciliation and a focused regression. Container schema assertions were updated. Final review found no remaining blocking code issues.

No live mail/model/provider calls, deployment, production migration or user credentials were used. Docker is unavailable in this workspace; exact-SHA remote container CI remains a release gate. Initial schema8 migration cannot restore previously RAM-only login sessions; later routine restarts preserve valid sessions. Disaster restore deliberately requires sign-in to prevent session resurrection. See [durable-session release/recovery notes](durable-login-sessions.md).

### Schema8 draft PR CI follow-up

The first PR38 run passed container CI but exposed two test-contract gaps before backend/browser completion: customer browser fixtures still required the old restart-logout behavior, and the integrated Settings DOM test clicked before authenticated navigation was ready on the CI runner. The follow-up retains logged-out-cookie rejection and foreign-account isolation, explicitly requires unchanged user/CSRF and authenticated browser navigation after restart, and waits for actual authenticated Settings readiness. All three real-HTTP browser fixture checks pass locally. Local Chromium launch was blocked by the cloud sandbox's process-singleton socket restriction before a page could execute; no bypass was attempted. Real-browser acceptance remains the official CI gate.

## 2026-10-08 — compact owner model-key settings (implementation, not deployment)

- Extracted the existing owner-only settings flow into a shared form and added a top-right model popover with a hover hint, keyboard/click entry, Escape/outside dismissal, and collision-aware positioning. The settings deep link exposes the same popover; only one form surface can be active. No endpoint or alternate-model input is exposed.
- The sole editable field is a password-type API key. Explicit “Save and enable AI” uses the existing protected settings endpoint. Pause/resume and model-access checking remain explicit secondary actions. Saving alone does not claim validation or chat completion. Key text clears on submission/dismissal/navigation; settings status is reread on each open. Existing server allowlist, HTTPS, role, storage and CSRF boundaries are unchanged.
- Synthetic DOM coverage verifies blank key reads, no implicit writes, explicit save/clear, ambiguous failure sanitization, model-access check labeling, owner gating, and popover Escape/close/navigation clearing. Added browser fixture coverage for 1280px English, 390px Chinese and 320px English, deep-link continuity, focus return, outside dismissal, layout and errors.
- Final checks passed after review corrections: pinned `npm ci`, `npm run check`, `npm run build`, 304 frontend tests and 379 backend tests; browser discovery finds 31 tests including the four new settings cases. Independent review found and corrected duplicate stale settings surfaces and collision handling for the settings-page hover hint.
- Local Playwright could not launch Chromium: environment policy rejected its singleton socket before any UI assertions ran, including the approved escalation attempt. These four browser cases are **unverified locally**, not passed; the existing official browser CI and final integrated browser review remain gates. No real API keys, provider traffic, production configuration, schema migration or deployment were performed.
- Rollback: revert this UI commit; there are no database or server-contract changes.
## 2026-10-08 — remembered library permission / schema9 backend candidate

Candidate backend based on `7354803`, in an isolated worktree. All grants/accounts/material below are disposable synthetic fixtures. No actual customer authorization, live model request, production migration, push, merge, or deployment was performed for this entry.

- `npm ci --ignore-scripts`: passed, pinned dependencies installed
- `npm run check`: passed after final session/revocation changes
- `npm run build`: passed, existing bundle-size warning remains
- `npm test`: **396/396 passed** after the final backend changes and built frontend assets. The initial pre-build run had 390/391 pass with only the expected missing-build entrypoint 503; this was corrected by the normal build, not by weakening the test
- Real local HTTP/session/SQLite with authored provider SSE: exact-origin/CSRF/session requirements; strict input/scope/version validation; no provider calls from legacy checkbox-only, absent, denied, stale or foreign-account grants; persisted decline; atomic racing choices; read-only action-wrapper non-bypass
- Stream checks: same-account revoke stops an active request while another account completes; revoke after a tool read blocks a later provider request; cross-tab logout and credential rotation stop active/silent streams; read-then-revoke/logout emits no late sources, proposals, private title, or done event
- Session regression: non-touching in-flight validation neither rewrites last-used time nor prolongs idle expiry; previous durable-session tests continue to pass
- Schema9 storage: owner/account isolation, reopen persistence, provider id/endpoint/model/policy/category invalidation, monotonic revoke/regrant revision protection, failed-write rollback, account-delete cascade
- Genuine populated schema8 fixture → schema9: all previous rows/DDL/FKs/sequences/session records/original bytes retained; new permission table empty; schema9 migration conflict rolls back; backup is non-mutating; restore resets sessions and all permission decisions only in the restored copy; untouched schema8 snapshot remains a valid rollback source; future schema10 refused

Browser acceptance, exact-SHA CI/container acceptance, independent review closure, old-binary downgrade refusal rehearsal and any release remain separate gates. See [library permission contract and recovery](library-permission.md). Provider fixtures are not live DeepSeek acceptance.

### Schema9 packaging follow-up

The consent module is now explicitly present in both Docker runtime COPY and the deny-by-default build context. Docker-input tests passed 2/2, including a real runtime-module subset import that opens schema9 and confirms owner consent is unset. The existing container SQLite lifetime write/read and genuine schema1→9 migration smoke scripts also passed when executed locally in a fresh private disposable directory; schema9 table presence, empty permission records, original data, private modes and reopen are checked. All three modified smoke scripts pass syntax checking. Docker itself is unavailable here, so these are local input/SQLite checks, not an image build or container acceptance. The runtime container smoke now explicitly checks the consent module and fail-closed GET/PUT permission routes.

## 2026-10-08 — Chat permission simplification / schema9 candidate

Code candidate `7759f282c472145f372d4670c1bc0a21eabc1e38` (based on schema8 main `7354803`). The composer contains neither per-message checkbox. Read-only proposals default on; explicit apply/review gates remain. Saved-library retrieval requires an explicit, revocable account/provider/policy/category grant and exact grant revision. Existing accounts remain unset. Account settings exposes opt-in/revocation; ordinary chat remains usable after decline.

Observed local evidence:

- `npm ci --ignore-scripts`, `npm run check`, and `npm run build`: passed. Vite reports the existing bundle-size advisory.
- `npm run test:frontend`: 309/309 passed, including actual React/DOM first-use allow/decline/cancel, input retention, account change, provider mismatch, policy API failure and permission-version payload checks. These are DOM-emulator/protocol tests, not real-browser acceptance.
- `npm test`: 396/396 passed, including real loopback HTTP/SQLite account/provider isolation, strict same-origin/CSRF writes, stale grants, policy/version invalidation, revoke during tool/provider waits, exact originating-session checks, cross-tab logout and credential invalidation, and suppression of late sources/proposals after revoke. Provider responses in these tests are explicit synthetic doubles; no live model call or real-account grant occurred.
- Runtime COPY input tests pass with `library-consent-storage.js` included. Local SQLite lifetime and schema1→9 migration smoke pass, and container-smoke script syntax passes. Docker is unavailable locally; actual image/container acceptance remains the official CI gate.
- A disposable old-binary rehearsal using immutable `7354803:storage.js` rejected schema9 in DELETE and WAL modes without changing bytes/files/modes. An untouched schema8 snapshot created before migration restored and reopened with that old storage, preserving a synthetic case and schema8. This is local synthetic recovery evidence, not production backup/restore.

Actual local Chromium could not launch: sandbox IPC rejected its socket before any page interaction, including an approved retry. No browser flow or screenshot is claimed from those attempts. The official GitHub Chromium workflow is the required remaining browser gate. Three added viewport tests (1280, 390 and 320 px) cover first-use notice, Escape/cancel, decline, remembered allow, revocation and no composer checkboxes using real browser/HTTP/SQLite with synthetic accounts and a controlled unavailable-provider response. The existing proposal and conversational review browser journeys were updated to use default read-only proposals.

Independent boundary review was requested against the combined candidate; report its final result and exact CI SHA separately. This entry does not authorize or claim deployment, production schema migration, real-provider acceptance, or automatic application of model suggestions. See [permission contract](library-permission.md) and [UI flow](chat-permission-flow.md).

### Official CI follow-up, 2026-10-08

At exact head `7759f282c472145f372d4670c1bc0a21eabc1e38`, official Node checks and Docker/container smoke passed. [Chromium run 37726953144](https://github.com/ledondev520/nestlet/actions/runs/37726953144) completed with 29/30 passing, including all three new library-permission viewport journeys and the action/fact-review journeys. The sole failure was an obsolete file-format test expecting the removed library checkbox to exist. Its assertion now requires zero composer checkboxes, unchanged server permission `{decision:'unset',version:0}`, and no provider requests; the rest of the actual parsing and input-preservation journey is retained. The corrected exact-head Chromium rerun remains required; this is not an all-green browser claim.

## 2026-10-08 — Actual Inbox entry integration candidate

The existing production AccountWorkspace now owns the Inbox shell; preview and root share the same App entry. Stable sidebar portals preserve chat workflow/search state. Scoped read adapters repair canonical readiness, stale case/account/locale response handling and historical artifact labels. Mobile drawers have one active modal, close controls, inert background, focus containment/return and stable hidden portal hosts. Existing semantic source/dirty/document tests now select the named workspace navigation rather than the first nav element.

Combined local check/build passed; backend396/frontend317/email54/artifact1 passed (including the additional actual-HTTP Inbox adapter test). Schema9/durable-session/permission focused25 pass, including restore invalidation. Official combined CI is pending. Local Chromium was blocked before assertions by its singleton socket permission; no bypass, screenshot or local browser pass is claimed. See [integration and direct7→9 recovery plan](inbox-real-entry-integration.md). Deployment and merge remain separate review/authorization gates.

### Inbox first combined Chromium findings and follow-up

Exact10179fb official checks/container passed; [browser run37729368537](https://github.com/ledondev520/nestlet/actions/runs/37729368537) passed27/43 and failed16. Failures grouped into mobile navigation clipping, a fixed-width agency selector exceeding the right sidebar, a delayed permission/drawer overlap (Radix's dialog had no aria-modal attribute), three Chinese scenarios using an English-only test navigation helper, and one document test scoped to the action's old center location. These are not an all-green browser result.

The follow-up keeps viewport/focus assertions intact: wrap navigation, constrain sidebar controls, make the actual permission dialog explicitly modal and recognize the shared open-dialog marker, and use localized named navigation/current sidebar action locations. The skip link now focuses the workspace without changing route. After actual screenshot review, root also requested concise sidebar field labels/count with expandable full questions and a full-width search field/compact search button. Existing facts, conflicts, guards, read-only behavior and provenance remain; compact explanatory detail is still accessible. A new exact-head official browser run is required, including all populated screenshots and the delayed-permission race.

### Bounded viewport usability follow-up

Exact29f208d passed all43 official Chromium scenarios, but actual screenshot review found a three-row mobile header and a composer outside the visible long-conversation viewport. That green run was therefore not treated as final visual acceptance. The bounded frontend-only follow-up keeps secondary account/language/settings controls in a mobile account popover, retains model access in the single-row header, and makes the thread scroll independently while composer actions remain anchored. It adds explicit Chinese system-sans fallbacks and viewport-only captures with input/send geometry assertions after thread scrolling and a reduced-height keyboard-like viewport. This resize test is not a physical-device soft-keyboard claim. Screenshot fixtures explicitly mark the UI-only liveEnabled flag; no real provider request occurs. No backend, database schema or deployment change is included.
