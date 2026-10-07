# Independent local acceptance — 2026-10-07

**First-round disposition (historical): final workflow not accepted.** A real local browser exercised the available UI with synthetic inputs. Parsing, human review and English exports work on the tested paths, but the final AI-only contract is not met; live-provider and PDF-import acceptance remain blocked. This is not production certification or an official-form/agency acceptance claim.

**Latest update:** authentication and model restrictions passed on `8b42962`; explicit manual parsing was clarified as intentional. See the second-round results at the end. Live-provider/HTTPS settings remain unverified. Real 30-minute idle HTTP expiry subsequently passed; see the final observation below.

## Snapshot and environment

- Executor: Local Codex, authorized by repository owner `ledondev520`; independent clone and `test/local-codex-acceptance` branch.
- Initial tested runtime: `826202ee7da2b072d544c716cba19ac9cf38d6bf`.
- During acceptance, main advanced to `6678aeaa57c666fcf77b2700653ed391c2034f0d` (documentation only). Those changes were merged as `2618bcc2161681bc283eef38f9e85e30137dc507`; runtime files, dependencies and existing tests are identical to the initial tested snapshot. The updated handoff is preserved.
- OS: macOS 26.4.1, build 25E253. Initial shell/server: Node 23.11.0, npm 11.14.1. Existing bundled Node **24.19.0** was subsequently found; check, baseline tests, development tests and the final new HTTP suite were run with it. Browser sessions used the Node 23 server. Node 24 browser end-to-end coverage is not claimed.
- Browser: Ego Chromium, reported user agent `Chrome/152.0.0.0`; desktop viewport 1470 × 712 and emulated mobile viewport 390 × 844. This is browser viewport emulation, not a physical mobile device.
- `npm ci`: succeeded, 40 packages added, 41 audited, 0 reported vulnerabilities; emitted a `whatwg-encoding` deprecation warning. No manifest/lockfile changes. Installation initially ran under Node 23.
- `pdftotext` was unavailable on PATH and the API reported `pdfEnabled: false`. No parser was fabricated or installed. SheetJS was available and actual XLSX/XLS parsing succeeded.
- Main browser server: loopback only, `ENABLE_LIVE_AI=false`, empty `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL=deepseek-flash`. No credential setup, paid call, outbound message, real case or deployment occurred.

## Commands and counts

Use Node 24 on PATH for reproduction, with Poppler installed separately if PDF import is to be tested:

```sh
npm ci
npm run check
npm test
npm run test:development
node --test test/local-acceptance.test.js
env ENABLE_LIVE_AI=false DEEPSEEK_API_KEY= DEEPSEEK_MODEL=deepseek-flash HOST=127.0.0.1 npm start
```

| Command / evidence class | Result |
| --- | --- |
| `npm run check` | Pass, both Node 23 and 24 |
| `npm test` | 64 total: 58 pass, 0 fail, 6 skipped; same counts on Node 23 and 24 |
| `npm run test:development` | 98 total: 92 pass, 0 fail, 6 skipped; same counts on Node 23 and 24. Includes historical DOM/provider doubles; **not live acceptance** |
| `node --test test/local-acceptance.test.js` | 4 total: 3 pass, **1 fail**, 0 skipped on Node 24. Real loopback HTTP, real parser, no provider/parser mocks |
| Actual browser + downloaded files | Detailed below; not represented by the Node test counts |

All six baseline skips are PDF checks: text extraction, consent/media/origin, blank/no-OCR, encrypted, oversized extracted text, and disguised/corrupt/oversized file rejection. The absent-parser response itself is checked by the existing suite.

The new HTTP suite intentionally remains outside the unchanged package scripts. Its failing authentication assertion is an acceptance requirement, not an implementation fix. Run it explicitly; a green `npm test` does not cover it.

## Acceptance matrix

“Pass” applies only to the stated path. Manual extraction and workbook mapping below are observations of the currently exposed UI, not substitutes for live DeepSeek acceptance.

| Area | Result | Observed evidence / limit |
| --- | --- | --- |
| Initial load | Pass, with contract failure below | Chinese, empty source, no preloaded case or fabricated result. Synthetic-data warning visible; server configuration instructions available through Settings and automatically shown on no-key error. |
| Final extraction flow | **Fail / Blocked** | Explicit local label-extraction button still exists. Authorized live key/consent was not provided; no live request attempted. |
| zh/en toggle | Pass on available path | Input, five reviewed values/confirmations, all three generated draft bodies and an edited English body survived switches unchanged. |
| Review gate / unknowns | Pass on manual path | Untouched and one-of-five reviewed states disabled generation. Unknown PHA stayed empty and generated `[To be confirmed]`. |
| Conflicts | Pass on manual path | Two different `Property:` lines showed both excerpts and disabled confirmation. Editing the value permitted fresh review. |
| Invalidation | Pass on manual path | Editing a confirmed address removed its confirmation and draft; generation disabled. Editing original source disabled both review and draft navigation. |
| Exposed draft types | Pass on manual path | `followup`, `missing-documents`, `status-summary` all generated through the visible selector and downloaded. All English, with unknown placeholder and notices. |
| CSV | Pass, safety prefix changes value intentionally | Unicode, comma, quotes and blank PHA survived actual export/reimport; confirmations were not restored. `=1+1` exported as `'=1+1`; prefix remained on reimport. No formula executed. Wrong header order and extra row rejected. |
| TXT | Pass | Valid UTF-8 imported; bytes `C3 28`, 51,201-byte text and `.json` rejected; valid TXT worked immediately afterward. Errors readable in Chinese. |
| XLSX / legacy XLS | Pass on provided fixture | Both actual fixtures parsed, sheet `Case`, row 2, columns A–E selected in UI. Values `128 Example Lane`, `Example LLC`, `Example Authority`, `CASE-SYNTHETIC-1`, `2100`; source `Case!A2: 128 Example Lane`; all confirmations initially false. |
| Workbook rejection | Pass / Not run | Renamed plain text and truncated ZIP rejected in browser and real HTTP suite. **Encrypted workbook not run:** no independently prepared encrypted XLS/XLSX fixture. |
| PDF import and rejection | **Not run** | Poppler absent, PDF hidden from supported formats; text, corrupt, renamed, encrypted and image-only/no-OCR parsing not exercised. Browser PDF export below is a different capability. |
| TXT export | Pass | Actual downloads for all three types inspected; immutable `DRAFT`, `NOT FOR SUBMISSION` and non-government-form notices retained. |
| Print rendering / PDF contents | Pass for browser print engine | Actual `Page.printToPDF` artifact: one page, English body and three warnings, no application navigation or Chinese notes. Text extracted with pypdf. Print-media screenshot separately inspected. |
| Native print dialog save | **Not run** | PDF generated through the browser print engine, not a manual OS print-dialog save; printer interaction not exercised. |
| Clipboard | Pass / Not run | Real copy action reported success with normal browser permission. Clipboard bytes not independently read. Real permission-denied branch not reproduced; browser security settings left unchanged. |
| Reset / repeated actions | Pass on synchronous path | Cancel reset preserved source, confirm reset emptied it. Repeated missing-key clicks preserved the case and continued to show the blocker. |
| Async races | **Not run in real browser** | No live extraction configured; precise in-flight import/reset timing not exercised in browser. Earlier DOM-only development diagnostics are excluded from acceptance. |
| Layout / keyboard | Pass, bounded | Desktop and 390px input/review/draft had no horizontal overflow. Keyboard Tab/Space reviewed all five fields; labels present; input/button/select focus outline 3px. Not a full assistive-technology audit. |
| Authentication / settings | **Fail / Not run** | Unauthenticated workbook POST returns 200, no session or login/logout UI exists. Login/logout and authenticated paid-route tests not run: implementation/authorized credentials absent. |
| Origin / CSRF boundary | Pass, bounded | Foreign Origin on workbook POST returns 403 `ORIGIN_REJECTED`. This is not a session/CSRF-token acceptance result. |
| No-key / public routes | Pass, bounded | Explicit localized configuration error; no automatic substitute from AI button. API 503 `LIVE_DISABLED`; baseline source/environment/private-path probes denied. No real credential was present to test exposure. |
| Flash-only model | **Fail, configuration/code evidence** | `server.js` accepts arbitrary `DEEPSEEK_MODEL` and forwards `model` without an allowlist. Default Flash is correctly reported. Live rejection of legacy models was not tested. |

## Reproduction and defects

### LC-01 — local extractor remains in final user flow (P1 final-contract blocker)

Owner suggestion: UI/QA owner (`public/app.js`); product owner confirms final-flow requirement.

1. Start the loopback server without a key; open the empty page.
2. Paste `Property: 128 Synthetic Lane` and `PHA: unknown` on separate lines.
3. Select **按标签手动整理**, review all five fields including unknowns, then generate.
4. Actual: a complete template draft can be generated through the exposed local extractor. Expected by the handoff/product contract: final extraction path uses DeepSeek and missing configuration is a blocker, with no local-extractor alternative.

This is an explicit alternative, **not** a silent fallback from the AI button. The AI button itself correctly fails closed. XLS/XLSX mapping also enters review directly; its intended relationship to mandatory AI extraction needs the same owner decision.

### LC-02 — no authentication gate (P1 for newly requested auth acceptance)

Owner suggestion: technical owner (`server.js` and authentication implementation, assigned by owner).

Run `node --test test/local-acceptance.test.js`, or send the synthetic workbook without cookies or Authorization:

```sh
curl -i http://127.0.0.1:4173/api/workbook \
  -H 'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' \
  -H 'X-Document-Consent: synthetic-or-deidentified' \
  --data-binary @test/fixtures/case.xlsx
```

Actual: HTTP 200 with parsed sheets. Expected by the updated authentication criterion: 401/403 before processing without operator authentication. Origin rejection is not authentication. README already discloses the absence of authentication and restricts exposure; this finding does not claim a remote exploit in the loopback-only run.

Sanitized failure output:

```text
FAIL missing authentication fails closed on the document-processing route
AssertionError: Unauthenticated workbook POST returned 200
PASS workbook processing rejects a foreign Origin
PASS actual workbook parser rejects renamed text
PASS actual workbook parser rejects truncated ZIP
tests 4; pass 3; fail 1; skipped 0
```

### LC-03 — model is configurable beyond Flash (P2 contract failure)

Owner suggestion: technical owner (`server.js`). Code inspection: `model` reads arbitrary `DEEPSEEK_MODEL`, `/api/status` reports it, and `providerSuggestions` sends it unchanged. There is no model validation before provider access. Expected: unsupported model configuration fails closed. Reproduce the configuration-only behavior with no key in an isolated loopback process; do not supply a live key or send a paid request.

An offline provider interception originally ran under the **initial** handoff's explicit development-mock allowance and observed `deepseek-chat` passed to that interception. The revised handoff prohibits such acceptance evidence: that diagnostic is **not** counted as acceptance, is not shipped as a provider mock, and establishes no real DeepSeek support or response. The final added suite has no mocks and no credentials.

## Evidence artifacts

All committed files below contain authored synthetic values or the repository's documented synthetic workbook fixture. Screenshots are page-only; no unrelated desktop content or private filesystem paths are included.

- [Empty case and settings](../test/local-acceptance-evidence/initial.png)
- [Mobile review after actual XLS mapping](../test/local-acceptance-evidence/mobile-review.png)
- [Print-media view of edited English artifact](../test/local-acceptance-evidence/print.png)
- [Actual browser-produced PDF](../test/local-acceptance-evidence/printed.pdf)
- Actual TXT downloads: [follow-up](../test/local-acceptance-evidence/followup.txt), [missing documents](../test/local-acceptance-evidence/missing-documents.txt), [status summary](../test/local-acceptance-evidence/status-summary.txt)
- [Actual CSV roundtrip export](../test/local-acceptance-evidence/roundtrip.csv)

Browser automation occasionally reported a detached element after filling a value because the app rerenders on input. The resulting DOM values and invalidation state were inspected before continuing; these receipts were not treated as application failures.

## Remaining owner actions and boundaries

The primary **real AI** workflow remains blocked by unavailable authorized configuration, independently of successful manual/template paths. PDF import is blocked by missing Poppler. Resolve LC-01 and LC-03 with explicit runtime file ownership, implement/clarify the newly added authentication scope, then repeat acceptance on the resulting exact commit with Node 24, Poppler and separately authorized live-provider access. Prepare an encrypted workbook fixture and exercise real async cancellation and native print/clipboard limits separately.

This PR changes only the task record, this report, new acceptance tests and their evidence assets. No runtime fixes, dependency/config changes, deployment, merge or edits to existing QA tests/`docs/validation.md` are included relative to current main. Maintainability note: package scripts deliberately remain unchanged, so the new failing contract test must be invoked explicitly. Rollback is removal of these acceptance-only files and reversal of the task-record update. See [existing validation](validation.md) for the main QA owner's separate evidence.

## Follow-up — 2026-10-07 12:22 Asia/Shanghai

The coordinator's [new handoff comment](https://github.com/ledondev520/nestlet/issues/1#issuecomment-6030762005) requests a fixed, CI-passed revision for the next round. Observed main was `993676bdbd8797919cde187528e01aaa796f1f11`, adding only the separate frontend redesign handoff since `6678aea`; no new runtime revision was supplied. The acceptance branch remains on its recorded runtime; no moving development checkout was tested and no runtime/design ownership was assumed.

**Environment blocker resolved:** installed Poppler 26.09.0 through the existing official Homebrew core formula (`brew install poppler`, automatic Homebrew update and cleanup disabled). This installed/upgraded its OS-level dependencies; no repository manifest, lockfile, runtime, workflow or configuration was changed. `pdftotext -v` succeeds. A real parser-only smoke check on the existing synthetic `test/fixtures/text.pdf` matched all six nonblank lines in `expected.txt` using `pdftotext -layout ... -`. This is environment readiness evidence, **not** a new browser/API PDF-import pass. The first-round skipped counts above remain historical and unchanged pending the fixed retest revision.

The next acceptance will follow these user stories, retaining a precise SHA and separate results for each:

1. First arrival without configuration: empty case, truthful setup path and no fabricated result.
2. Operator sign-in, authorized non-production settings, logout and return. Real model credentials/provider calls remain Not run until separately authorized securely.
3. Actual PDF/CSV/XLSX/XLS import, sheet/row/mapping, missing and conflicting evidence, and human confirmation.
4. Generate, edit, copy, download and print an English working document under both UI locales; no official SFHA acceptance claim.
5. Recovery from invalid files, expired login, provider failure where authorized and reproducible, cancel/reset and stale asynchronous work.

Requested from the coordinator in Issue #1: fixed retest SHA, non-production authentication initialization instructions, a reproducible session-expiry path, and the confirmed decision on whether explicit manual parsing remains. Current evidence describes that route truthfully as deterministic parsing, never a successful AI call; LC-01 remains a snapshot contract finding until that decision is resolved. Check frequency is now ten minutes; comments are posted only for substantive changes.

## Second-round results — fixed runtime `8b42962`, 2026-10-07

Runtime commit: **`8b42962e55305e3cc70b7c20ce5d7e4d74ed13c7`**, PR #5; its GitHub test and actual container-smoke checks were SUCCESS when selected. Merged into this independent acceptance branch at `c3be4de39d7190e60cf5414b89c7d935acb2046c`. Tests/docs are the only local changes relative to that runtime. The coordinator subsequently [confirmed this exact retest baseline and clarified the manual route](https://github.com/ledondev520/nestlet/issues/1#issuecomment-6030996347). No frontend redesign code from PR #4 was pulled into this snapshot.

Environment: Node **24.19.0** for installation, checks, HTTP tests **and browser servers**, npm 11.14.1, Poppler **26.09.0**, same macOS/Chromium as the first round. `npm ci` succeeded (40 packages, 0 reported vulnerabilities). Disposable test-only operator passwords were scrypt-hashed in memory for loopback processes; no user account or actual DeepSeek key was configured. Authentication was real, not a mocked endpoint.

| Check | Second-round result |
| --- | --- |
| `npm run check` | Pass |
| `npm test` | **87 pass, 0 fail, 0 skip**, including actual PDF and encrypted XLS/XLSX parsing, authentication, CSRF and source-linked agency guidance |
| `node --test test/local-acceptance.test.js` | **5 pass, 0 fail, 0 skip**; real configured operator login precedes parser-negative tests. Signed-out assertion is exactly 401 + `AUTH_REQUIRED`, not a broadened status allowance. |
| Legacy model startup | Pass: a real subprocess with `DEEPSEEK_MODEL=deepseek-chat`, no key and AI disabled exits 1 with the Flash-only error. No outbound provider request. |
| Optional real idle-session test | **1 pass, 0 fail, 0 skip**. `node --test test/session-idle.acceptance.js` used 30 real idle minutes; exact timing and limits recorded below. |

### User-story observations in the actual browser

1. **First arrival / sign-in:** unconfigured server shows an empty Chinese case and operator setup instructions. A configured-but-signed-out PDF import opens the sign-in panel without parsing; wrong test password shows a localized error. Correct local development login succeeds. HTTP intentionally exposes no API-key entry field and explains the HTTPS requirement. Revisit preserves the authenticated session but starts a fresh empty case, as documented.
2. **Actual import / recover:** authenticated text PDF produces the six expected synthetic lines; scanned/image-only fixture displays the no-OCR message; encrypted PDF is rejected. Actual password-encrypted XLSX/XLS are rejected with the unencrypted-workbook guidance. A valid PDF imported successfully after these failures. Switching to English produced the corresponding no-OCR message. Actual XLSX row/column mapping again produced all five fixture values with fresh confirmation requirements. Real server baseline tests also cover legacy XLS, corrupt/disguised/oversized inputs and encrypted workbook rejection.
3. **Review / English artifact:** selected worksheet fields were reviewed and generated through the explicit deterministic path, never represented as AI extraction. A follow-up draft stayed English across locale switching. After editing, actual TXT download and browser PDF both retained the three immutable English notices. The PDF contained one page, only the edited English document and notices, with no settings/navigation/SFHA guidance. Real copy action reported success. A 390px authenticated settings/draft view had document scroll width 390px, with no horizontal overflow.
4. **Logout / session loss:** cancelling logout retained the existing draft. Confirming logout cleared source and draft; revisit required sign-in. Independently revoking the disposable real server session through its actual logout endpoint while the page still displayed authenticated state made the next PDF import fail with a sign-in instruction; the previous source remained intact. Signing in and retrying then worked. This is **revoked-session recovery**, not yet a timed-expiry browser pass.
5. **Async reset / locale:** browser network latency was deliberately throttled while still talking to the actual local PDF endpoint (no intercepted/fabricated response). During in-flight upload, reset plus new source preserved `Property: Synthetic Reset Winner` after another delayed real HTTP roundtrip; old content did not revive. Switching locale while another actual PDF request was pending retained English and applied the real parsed text. Missing-key AI action continued to show its explicit blocker and did not substitute manual results.

### Disposition of earlier findings

- **LC-01 resolved by explicit product clarification**, not removal: genuine deterministic manual parsing and workbook mapping are intentional. The observed route is explicitly labeled; failed AI does not silently fall back. Historical observation and earlier contract interpretation above are retained for traceability.
- **LC-02 resolved on this snapshot:** missing operator setup fails closed (503), configured signed-out access fails closed (401), invalid CSRF/origin fails closed (403). Parser-negative tests authenticate before reaching the parser. Real browser login/logout and revoked-session recovery passed.
- **LC-03 resolved on this snapshot:** unsupported model is rejected at startup; independently reproduced without any provider credential or mock.

Remaining **Not run**: actual trusted HTTPS browser key entry/save and model-access check, actual DeepSeek extraction/provider failure, native print-dialog save, clipboard permission-denied case, and timed-expiry browser recovery. No fabricated/provider-double results count toward these. The separate real idle HTTP observation has now passed as recorded below; timed-expiry browser recovery remains untested and cannot be inferred from revocation recovery.

### New bounded follow-ups for the main owners

- **LC-04 — stale setup/deployment prose (P2, docs owner):** README still says the server has no authentication, and its start instructions omit the new operator hash setup; parts of deployment docs also call integration pending. Current `docs/auth-contract.md` is accurate. Bring public getting-started/deployment wording in line with the shipped auth flow; no runtime change needed from this lane.
- **LC-05 — misleading extracted-text limit error (P2, UI owner):** import `test/fixtures/large-text.pdf` (35,717 bytes) while authenticated. It exceeds 50,000 extracted characters, but browser says the file is too large and lists the 5 MB PDF byte limit. It correctly refuses the document, but should distinguish the extracted-character limit and suggest shortening/splitting the text. Exact reproduction is safe with the committed synthetic fixture. Runtime wording remains owned by the main/UI lane.

Second-round evidence (synthetic page content only): [unconfigured setup](../test/local-acceptance-evidence/auth-unconfigured.png), [real authenticated PDF import](../test/local-acceptance-evidence/pdf-import-auth.png), [390px authenticated draft](../test/local-acceptance-evidence/auth-mobile.png), [actual TXT](../test/local-acceptance-evidence/auth-export.txt), [actual browser PDF](../test/local-acceptance-evidence/auth-export.pdf). First-round assets remain unchanged.


## Real idle-session expiry completed — 2026-10-07 13:04 Asia/Shanghai

On unchanged runtime `8b42962e55305e3cc70b7c20ce5d7e4d74ed13c7`, Node 24.19.0 completed `node --test test/session-idle.acceptance.js` with **1 pass, 0 fail, 0 skip**, process exit 0. The actual observation started at `2026-10-07T04:34:04.254Z` (12:34:04 Asia/Shanghai); test duration was **1,801,165.736 ms**, with total runner duration **1,801,306.631 ms**.

The test genuinely signed in to an isolated loopback server, confirmed authenticated settings access (HTTP 200), made no session requests for at least 30 minutes, and then received HTTP **401** with **`AUTH_REQUIRED`**. No accelerated clock, mocked authentication or provider was used. The test's cleanup terminated its own server and the runner exited.

This closes the server-side idle-expiry observation only. It does not certify an eight-hour absolute timeout, the timed-expiry browser interaction, trusted HTTPS key entry or real DeepSeek behavior. LC-04/LC-05 remain pending main-owner coordination; no additional runtime revision or review response was present at this check.

## Follow-up to PR #6 — 2026-10-07 13:35 Asia/Shanghai

Fixed tested revision: **`8715b0d78a8cff0b5ebbbb5ea6db0bacd8137342`**, tested in a detached temporary worktree after that head's test/container CI succeeded. PR #6 subsequently merged as **`b431ea59405cbbf9ab6ec9945010f66f655b1781`**; `git diff` between those two commits is empty (identical tree). This follow-up branch starts from that merged main. Runtime and shared tests were not edited by Local Codex.

- **LC-04 closed for authentication setup prose:** README now describes implemented single-operator authentication, operator hash setup and protected routes; deployment docs separate implementation from production configuration and public HTTPS/provider gates. We did not repeat or certify the reported remote deployment. Minor newly stale prose remains: README still says the helper release PR is unpublished / container checks pending, although #6 is now merged with passing CI; asked the docs owner to refresh that release checkpoint.
- **LC-05 closed:** actual authenticated upload of the original 35,717-byte `large-text.pdf` shows the dedicated **50,000 extracted characters** error in both Chinese and English, distinguishes it from byte size, and suggests split/fewer pages/shorter pasted text. Existing source remains unchanged. A subsequent valid text PDF imports successfully. [Chinese error screenshot](../test/local-acceptance-evidence/pdf-limit-zh.png), [English error screenshot](../test/local-acceptance-evidence/pdf-limit-en.png).
- No model credential, paid request, actual private runtime.env, production account setup or deployment was used. The browser server had a disposable synthetic operator session. The settings-helper tests used only their disposable synthetic files.

### Verification and new LC-06 (P2, shared test owner)

Node 24.19.0, Poppler 26.09.0, macOS 26.4.1:

| Command / condition | Observed result |
| --- | --- |
| Pinned `npm ci` | Pass, 40 packages, 0 reported vulnerabilities |
| `npm run check` | Pass |
| `npm test`, default macOS temporary directory | **96 pass, 6 fail**, 0 skip |
| `npm test`, process-only canonical temporary-directory path | **102 pass, 0 fail**, 0 skip |
| `node --test test/local-acceptance.test.js` | **5 pass, 0 fail**, 0 skip |
| Actual browser PDF limit/error recovery | Pass in both locales, as above |

LC-06 reproduction: run the default suite on macOS when `os.tmpdir()` contains a symlinked ancestor. `test/operator-setup.test.js` constructs its private fixtures under that uncanonicalized root. The helper intentionally rejects symlinked ancestors; six tests that expect to reach a valid file or a later safeguard fail early with:

```text
Error: The target path must not contain symlinks or non-directory parents.
  at readTarget (scripts/operator-setup.js:22)
```

Failing tests concern add/replace operator hash, BOM preservation, confirmation/stale-version guards, public-permission/hard-link guards, and a writable ancestor above a private child. This is a **test-fixture portability problem**; it does not establish that the helper accepted an unsafe production path. All six pass when only the test process receives the canonical existing temporary root. No symlink or writable-parent protection was disabled, and no global environment setting was changed. Reproduction workaround (Node 24 already on PATH):

```sh
env TMPDIR="$(node --input-type=module -e 'import {realpathSync} from "node:fs"; import {tmpdir} from "node:os"; console.log(realpathSync(tmpdir()))')" npm test
```

Suggested owner action: canonicalize the fixture root (`realpath(tmpdir())`) before creating test files or document the safe test-root prerequisite; retain all helper path protections. Shared test changes require their owner's coordination. Findings were posted to [PR #6](https://github.com/ledondev520/nestlet/pull/6#issuecomment-6031674966). The original default-environment failure is retained here rather than replaced by a blanket green claim.

Trusted HTTPS browser settings, live DeepSeek and previously listed unrun checks remain unverified; this narrow follow-up does not cover the pending frontend redesign.

## LC-06 fixed-head macOS verification — 2026-10-07 14:00 Asia/Shanghai

At the coordinator's request, tested PR #8 exact head **`55548513d6a5d66c8920d0fa1882ca0065bc3128`** in a separate detached worktree. Its GitHub test/container checks were SUCCESS when inspected. The only functional test change canonicalizes the fixture root and adds a real symlink-root regression; production path guards are unchanged.

**LC-06 is closed on this tested revision.** Original macOS failure and process-only workaround above are retained as historical evidence. This rerun used the ordinary/default macOS `TMPDIR`, with **no temporary-root environment override**. A read-only check confirmed `tmpdir() !== realpathSync(tmpdir())` is still true, so the system alias that triggered the original failure was still present.

| Command | Actual result |
| --- | --- |
| `npm ci --ignore-scripts` | Pass; 40 packages installed, 0 reported vulnerabilities |
| `npm run check` | Pass on Node 24.19.0 |
| `npm test` | **103 pass, 0 fail, 0 skip**, default macOS temporary directory |
| `node --test test/local-acceptance.test.js` | **5 pass, 0 fail, 0 skip** |

The new regression creates an actual directory symlink, successfully places fixtures under its canonical physical root, and still rejects an aliased production target. No filesystem mocks, weakened security conditions or actual operator configuration was used. No production credential, provider request or deployment was involved. The 30-minute idle observation was not repeated because runtime authentication is unchanged.

Release documentation in this head also refreshes the previously stale helper publication/CI wording. Local verification does not independently certify remote staging, public TLS or live-provider operation. Those gates, and any future case-persistence/redesign acceptance, require their own explicit fixed-revision evidence.

## Independent visual user-story pass — PR #4 `e4179b1`, 2026-10-07

**Exact runtime/design tested:** `e4179b14ae8b2c8051b64d0fad5035d55351d074`, using an independent detached worktree and Node 24.19.0 / Poppler 26.09.0. This was the CI-passed head supplied when the pass started. PR #4 advanced to `289401a` during the work; these observations do **not** certify that later head or its requested follow-up fixes. No design/runtime files were edited in this lane, and the other contributor's checkout was not touched.

`npm ci --ignore-scripts` and syntax checks passed. The full suite passed **102/102** with the previously documented **process-only canonical TMPDIR** workaround because this design snapshot predates the fixture fix. This is not a new default-macOS pass; the default-environment **103/103** result above belongs to PR #8's separate exact revision. No 30-minute test was repeated.

### Actual browser coverage

Both native Google Chrome UI and the managed Chrome browser surface were used. The managed surface's file-chooser upload required an extension file-URL permission; that permission was **not changed**. Actual file uploads were completed through Chrome's native OS file chooser instead. Every selected file came from the repository's synthetic fixture directory; no unrelated files were opened/uploaded.

| User-story portion | Observed result |
| --- | --- |
| Empty bilingual work surface / operator sign-in | Pass: empty Chinese source, real disposable operator login, no real key. Local login explanation and HTTPS-only API-key boundary retained. Password-save prompt dismissed. |
| Actual PDF | Pass: native file picker → consent → real `pdftotext` import, six expected synthetic source lines visible. |
| Actual XLSX | Pass: native file picker → consent → `Case`, row 2, A–E mapping → all five expected values with fresh confirmations. Generation blocked until all five reviewed. |
| Actual legacy XLS | Pass for parsing/preview: native picker and consent produced actual `case.xls` worksheet/row/column selectors. Full second mapping/export cycle not repeated for XLS in this visual pass. |
| Conflict / unknowns | Pass: both conflicting property lines visible; confirmation/generation blocked. Editing resolved conflict. Unknown PHA remained blank and appeared as `[To be confirmed]` in the English draft. |
| Locale preservation | Pass: confirmed field values and review state preserved across zh→en. An edited English follow-up body survived locale change. |
| Invalidation | Pass: editing a reviewed address unconfirmed it, removed the old draft and disabled generation. |
| English follow-up edit/copy/TXT | Pass: edited visible body; actual copy reported success; actual native TXT download inspected for body plus immutable notices. Clipboard bytes not independently read. |
| Native Print / Save PDF | Pass: Chrome's actual print preview and native Save dialog produced a one-page PDF, inspected with pypdf. Browser headers/footers were disabled for this export so only English document/notices remained; the original header/footer setting was restored afterward. No real printer used. |
| Mobile / focus | Pass, bounded: managed browser at 390×844 had scroll width 390 for draft/review; actions remained visible and usable. Tab from draft reached Copy with a visible 2px cinnabar focus outline. Temporary viewport override reset. |
| Other draft types | Selector presence confirmed. Information-request/status-summary end-to-end downloads not completed again in this snapshot: managed download-event observation timed out and the managed tab was closed during tool reset. Earlier first-round type coverage is retained but not promoted to a fresh pass. |

Native PDF and TXT contain `Subject: Synthetic visual acceptance`, the edited English sentence and the three immutable English notices, with no app navigation, internal Chinese text or settings. Native browser UI included unrelated chrome outside the page, so only managed page-only screenshots and the actual generated document artifacts are committed.

Evidence: [Chinese conflict state](../test/local-acceptance-evidence/design-conflict.png), [390px English draft](../test/local-acceptance-evidence/design-mobile-draft.png), [390px invalidated review](../test/local-acceptance-evidence/design-mobile-review.png), [actual native TXT download](../test/local-acceptance-evidence/design-native-export.txt), [actual native print-dialog PDF](../test/local-acceptance-evidence/design-native-print.pdf). The draft screenshot shows a focused textarea; the separate reported Tab focus on Copy was read from actual browser DOM/computed style, not attributed to that screenshot.

No new functional blocker was observed in these paths. This is **not a visual-release approval**: the coordinator's [later review](https://github.com/ledondev520/nestlet/pull/4#issuecomment-6032214779) requests source/metadata contrast changes, wrapping for incoming saved-case controls and a corrected focus screenshot. Those later changes and named-trial/SQLite persistence require combined-build acceptance on a newly supplied exact SHA. Real DeepSeek, trusted HTTPS API-key entry and provider failures remain Not run without separate secure authorization. HTTPS/server activation remains the other coordinator's lane.

## Registration/SQLite baseline preflight — `443675c`, 2026-10-07

Independently tested fixed main **`443675cf566f3af4932b144dd604317b51063402`** (PR #11) in a detached temporary worktree. Its exact PR test and actual-container checks were SUCCESS. Node 24.19.0, Poppler 26.09.0 and ordinary/default macOS temporary-directory environment: `npm ci --ignore-scripts` and `npm run check` passed; `npm test` **146 pass / 0 fail / 0 skip**; `node --test test/local-acceptance.test.js` **5 pass / 0 fail / 0 skip**. Tests use actual disposable SQLite files, sessions, local HTTP and parsers. No production account, database, environment or credential was touched.

This is a functional baseline preflight, **not** complete registration-to-resumed-case browser acceptance. The design lane is resolving its merge with these account/case handlers and owns all subsequent frontend corrections. The complete combined journey must be exercised at its newly supplied fixed SHA, particularly mobile saved-case names, version conflicts, isolation, re-opened review state and English export. Earlier deployed HTTPS health is not evidence this SQLite revision is deployed.

**LC-07 — specified administrator login name unsupported (initialization contract, backend owner):** the human owner explicitly chose an administrator login name in the private local conversation. In this snapshot `auth.js` selects the privileged identity only when the normalized username is `owner` (or omitted); all other names are looked up as ordinary/trial identities. Ordinary registration reserves only `owner`. The current private password helper does not configure the administrator login name. A requested non-`owner` administrator name therefore cannot be provisioned through the documented path; ordinary registration would give it the wrong role.

Requested action before private handoff: the backend owner should define the configured administrator-name contract while keeping the stable internal owner identity/case ownership and forbidding privilege selection at registration. Actual chosen account identifiers and all credential values stay private and are excluded here. This is a compatibility gap against the human's requested onboarding, not a claim that the current ordinary registration route escalates privileges. No auth/runtime fix was made in the acceptance lane. Coordinated in Issue #1 and the nonsecret readiness Issue #9; final owner input waits for that contract and the intended release.


## Ordinary-account browser persistence checkpoint — 7 October 2026, 07:08 UTC

Exact application revision: `443675cf566f3af4932b144dd604317b51063402`. Actual Codex in-app browser on macOS, isolated loopback HTTP server with Node 24.19.0, real scrypt sessions and private SQLite file. Two disposable synthetic accounts; no real account, provider key, mock provider or paid call. Pinned `npm ci --ignore-scripts` passed. The prior 146-test preflight is retained; it was not rerun for this browser-only checkpoint.

**Pass:** ordinary registration signs in and displays ordinary-account permissions without a provider settings form. Explicit manual label organization of synthetic pasted text, confirmation of all five facts (unknown PHA retained), English draft generation, manual draft replacement and explicit Save succeed. After actually stopping and restarting the local server against the same SQLite file, a fresh login lists the saved case. Opening it restores the exact manually edited draft and saved status. Logout clears the current source/draft workspace; registering a second ordinary account shows an empty saved-case list and empty source area, with no first-account material. This is browser evidence of the visible account boundary, not a substitute for direct authorization tests.

Evidence: [restored draft after real restart](../test/local-acceptance-evidence/trial-resume-after-restart.png), [second ordinary account empty](../test/local-acceptance-evidence/trial-second-account-empty.png). Only synthetic material appears in these captures.

Setup corrections, not product defects: the private database path used the canonical macOS `/private/tmp` ancestor and a newly created mode-0700 directory; loopback registration used the documented empty `PUBLIC_ORIGIN` configuration. An explicitly HTTP public origin intentionally disables registration. One browser locator raced the asynchronous login render; the subsequent actual state confirmed login and the remaining journey completed.

**Not run in this checkpoint:** actual file intake/export, duplicate registration/password mismatch, owner workflow, stale concurrent saves, cancel/retry branches, mobile/keyboard continuation, telemetry and live-provider extraction. Earlier parser/export evidence stays tied to its original revisions. This checkpoint does not certify the full combined visual journey or production readiness.

**Password requirement:** the owner again directly confirmed minimum six characters during this run. This frozen main revision still has the old twelve-character checks; existing longer synthetic passwords were used solely to continue independent persistence acceptance. Kimi's PR #4 reports six-character frontend changes, while the coordinated backend fix is pending. Required follow-up remains five rejected, six accepted and existing-password compatibility on the fixed integrated SHA. Do not treat twelve as the accepted product requirement.


## Six-character credentials and administrator alias — 7 October 2026, 07:34 UTC

Independently tested PR #12 head `3bfcaa3dc89fa2e6220ea9dd64c3b8aed8c1cf00` in an isolated detached worktree, Node 24.19.0 on macOS with the ordinary default temporary-directory environment. `npm ci --ignore-scripts` and `npm run check` pass; default suite **179 passed, 0 failed, 0 skipped**. The separately maintained local HTTP/parser acceptance suite also passes **5/5**. No real credentials, provider calls or production changes were used.

The actual HTTP/SQLite/scrypt tests reject five-character administrator login and ordinary registration, accept six-character administrator/ordinary login and registration, reject a wrong six-character password, preserve the 256-character maximum and existing longer credentials. Private administrator/trial helper tests reject five, create usable six-character hashes and preserve unrelated environment settings. Alias tests resolve the configured administrator name to the immutable owner identity, preserve owner cases across alias changes, reject collisions without taking over ordinary accounts, reserve privileged names and deny ordinary-account settings access.

**LC-07 backend contract resolved at this revision:** a configurable administrator alias now exists without changing the stable owner role/identity. This does not claim a real administrator has been initialized. The six-character backend/private-helper requirement passes independent regression execution. PR #4's frontend alignment and the final integrated browser journey remain separate; PR #12 alone does not contain the final frontend. No production rollout, actual model extraction, vision/SSE-provider acceptance or browser telemetry validation is certified by this result.

Coordinator-reported provider evidence (not independently repeated): Issue #9 comment 6033129332 reports model catalog HTTP 200 with deepseek-flash present and one bounded synthetic generation HTTP 200, 362 ms, 21 tokens. It is component-only evidence. No duplicate paid probe is needed, and the previously requested local probe confirmation is no longer required for that check.


## Composite browser screenshots and observed six-character blocker — 7 October 2026, 07:50 UTC

Local test-only merge SHA `2b983da619a3836bea894e09495d78a1890c6dd7`: backend PR #12 `3bfcaa3dc89fa2e6220ea9dd64c3b8aed8c1cf00` plus frontend PR #4 `7b74b227e50a5eaca28fa20043d5a3472da862b4`, merged without conflicts. This is an isolated composite, not a published production release. Pinned install and syntax pass; composite default suite **179/179** with no skips. No frontend/runtime fixes were made by Local Codex.

**Observed P1, confirms already-assigned frontend P1-1:** registering with a valid synthetic username and matching six-character disposable password fails in the browser with the generic six-to-256-character validation error; the same username with a longer synthetic password registers successfully. The frontend still checks `<12` in its submit handler despite its six-character hint. Backend six-character success remains independently established in the preceding checkpoint. Kimi owns the correction; final integrated five/six browser acceptance remains Fail at this composite.

Real-browser progress using only disposable synthetic material: ordinary account registration with a longer password, real XLSX upload via native Chrome/macOS file chooser, workbook preview, selected column mapping, five fact confirmations, English draft generation, explicit case save and visible saved-case list succeeded. Mapped property/owner/rent retained actual workbook values; unmapped PHA/reference stayed empty and appear as unconfirmed placeholders in the draft. This run does not claim all five workbook columns were selected. Logout followed by the configured synthetic administrator alias opens the owner-only settings panel and an empty owner case list. On loopback HTTP the panel truthfully blocks key entry and shows this isolated environment has no provider configured; this is not production configuration evidence.

Screenshots requested by the coordinator, all actual UI and synthetic-only:

- [Homepage/workspace](../test/local-acceptance-evidence/combined-home.png)
- [Login](../test/local-acceptance-evidence/combined-login.png)
- [Signup and observed six-character rejection](../test/local-acceptance-evidence/combined-six-rejected.png)
- [Review after real workbook mapping](../test/local-acceptance-evidence/combined-mapped-review.png)
- [English preview](../test/local-acceptance-evidence/combined-draft.png)
- [Saved cases](../test/local-acceptance-evidence/combined-saved.png)
- [Isolated administrator settings](../test/local-acceptance-evidence/combined-settings.png)

The in-app browser file-picker upload timed out and then became unresponsive; native Chrome plus its actual OS file chooser provided the working upload path. Native screenshots were cropped only to remove browser tabs/toolbars; page contents were not modified. No password was saved to the browser password manager. Task-owned server and native test tab were closed afterward.

**Not run/remaining:** composite TXT/CSV/PDF/XLS positive intake, exports, restart/resume repetition, concurrency/cancel branches, mobile/keyboard and end-to-end telemetry. The known P1-2/P1-3/P1-4 remain with Kimi and were not independently closed by this checkpoint. No chat composer exists in this tested frontend, so live chat streaming/images are not accepted. No live key, provider call or production action occurred in this browser run.


## Frontend password and positive file-import fixes — 7 October 2026, 08:08 UTC

Exact isolated composite `93caef8af6037988c8f8b4b06b72f78d5b66a248`: backend PR #12 `d1bcbdd01e674bd7810e6cb2e0bda470710627be` plus frontend PR #4 `ace9222c9a7edf639703731ffa177ee99cf52d0c`. Clean local-only merge, no runtime modifications by Local Codex. Node24/macOS pinned install and syntax pass, default suite **187 passed, 0 failed, 0 skipped**.

**P1-1 closed on this composite:** actual in-app browser registration rejects a five-character synthetic password with the localized error, accepts matching six-character entries, signs in with the ordinary role, logs out and signs in again using that six-character password. Native Chrome independently signs in to the same disposable account with the six-character password. Real HTTP/scrypt/SQLite, no provider or synthetic login response.

**P1-2 closed for the positive TXT/CSV/PDF paths on this composite:** native Chrome/macOS file picker imports actual repository synthetic samples with the unchanged real parser. PDF imports 593 characters and shows the success message; TXT replaces it with 470 characters after the real replacement confirmation; CSV then imports 197 characters after confirmation. Each shows “材料已载入，请选择提取方式”, without the former fileStart ReferenceError/false import-failure status. No private files or provider request were used. This does not claim all malformed-file recovery branches were rerun.

Evidence: [five rejected](../test/local-acceptance-evidence/fixed-five-rejected.png), [six registered](../test/local-acceptance-evidence/fixed-six-registered.png), [PDF imported](../test/local-acceptance-evidence/fixed-pdf-import.png), [CSV imported](../test/local-acceptance-evidence/fixed-csv-import.png). Native captures have only browser chrome cropped away. No test credential was saved to the password manager. Local browser tabs, app process and disposable worktree were cleaned up.

**Still open:** workflow creation media-type/body and asynchronous identity/promise lifecycle concerns recorded by the integration reviewer at Issue #3 comment6033584628; no telemetry completeness claim. Conversation homepage and final expanded persistence flow are not implemented in this tested frontend. This checkpoint does not certify deployment, real administrator setup or email delivery. Local email-feature authorization remains pending and was not treated as a reason to stop browser QA.


## Sequential browser telemetry — 7 October 2026, 08:15 UTC

Exact local-only composite `200a58dd8076f53072fc56bd8b2545a0b2364df7`: backend PR #12 `b68e857bcedc7fe1d2f8914db4bf96fff9eb56aa` plus frontend PR #4 `5381f13bebcf74f1a3026302459e44878e1038fe`. Pinned install passes. This checkpoint exercises actual browser interaction and actual persisted SQLite metadata; no source changes or mocked request responses. The unchanged backend's prior 187-test result remains tied to the preceding composite; no fresh whole-suite claim is made here.

An isolated synthetic administrator signs in with six characters, enters marked synthetic source text, uses explicit manual organization, confirms five facts, generates and edits an English draft, and saves the case. Read-only inspection of the actual local telemetry tables finds **one workflow and nine client events**: input.paste, five review.confirm, draft.generate, draft.edit and case.save. Server case-list/create events also persist. The save client event shares the actual request identifier with request.case_create; client wait was 12 ms and server processing 2 ms for this one synthetic request. These are separate measurements, not a benchmark.

Unique synthetic source/property/owner/reference/draft markers and the disposable password do not appear in either telemetry table. This is a bounded marker check, not exhaustive assurance of all payloads, files or logs. Successful workflow adoption and repeated client-event persistence demonstrate the corrected workflow-create request and reuse path works against the real server. Evidence: [sanitized SQLite-derived event summary](../test/local-acceptance-evidence/telemetry-sequential-events.json), [corresponding saved case](../test/local-acceptance-evidence/telemetry-case-saved.png).

The remaining P2 stale business-response correlation race from Issue #3 comment6033794883 remains open; no delayed identity-switch regression was run here. Active/background/idle timing accuracy, cancellation/retry, all failure outcomes and complete journey telemetry remain unverified. No provider call, actual credential, real customer material or production action was used. The local app process, test page and disposable database/worktree were cleaned up.
