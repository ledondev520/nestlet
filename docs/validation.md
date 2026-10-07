# Nestlet validation

Checkpoint: 2026-10-07. This is a development checkpoint, not final acceptance. Deployment and real-browser integration remain separate; rerun after the final source freeze.

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
