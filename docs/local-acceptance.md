# Independent local acceptance — 2026-10-07

**Disposition: final workflow not accepted.** A real local browser exercised the available UI with synthetic inputs. Parsing, human review and English exports work on the tested paths, but the final AI-only contract is not met; live-provider and PDF-import acceptance remain blocked. This is not production certification or an official-form/agency acceptance claim.

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
