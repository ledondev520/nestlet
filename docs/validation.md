# Nestlet validation

Checkpoint: 2026-10-07. This is a development checkpoint, not final acceptance. Deployment and real-browser integration remain separate; rerun after the final source freeze.

## Strict acceptance command

`npm test` runs only `test/core.test.js`, `test/server.test.js`, and `test/auth.test.js`.

Current result: **83 passed, 0 failed, 0 skipped**: 52 core behavior tests, 22 real HTTP/file-parser tests, and 9 real authentication/session tests. `npm run check` also passes.

This command uses real core functions, disposable actual HTTP servers, actual PDF/XLS/XLSX bytes, and installed real document parsers. It does not replace fetch, HTTP responses, provider calls, or file-reading functions. Server processes use disposable operator test credentials with real scrypt verification, and are deliberately configured without an API key and with live AI disabled. Parser tests log in and send real session/CSRF tokens. The suite verifies that unavailable live extraction is reported truthfully. Test source text and files contain authored non-personal examples only.

## Coverage established by strict tests

### Core behavior: 52 tests

- Five-field extraction, missing/unknown values, verbatim source snippets, repeated-label conflicts
- Exact required field keys, explicit boolean confirmation, unresolved conflict and control-character draft gates
- Unknown placeholders, all three English templates, purpose labels and human-review boundaries
- CSV quoting, BOM, empty cases, notice metadata, malformed shape rejection, row-injection flattening and formula-prefix neutralization
- Source-substring/value validation for supplied suggestions, malformed/duplicate input, preservation of both sides of deterministic conflicts
- Explicit spreadsheet row/column mapping, source-cell provenance, unmapped unknowns, fresh human-review state, and rejection of hidden/blocked/duplicate/out-of-range selections

### Real HTTP and file parsing: 22 tests

- Real server status identifies configured model `deepseek-flash`, reports no configured key/live capability, and returns a disabled error without substituting fabricated fields
- Basic security headers, every shipped browser dependency (including the agency-guidance module), static MIME types, and restricted source/environment paths
- Actual local PDF text extraction; consent, MIME, origin and size checks; blank/vector no-text, encrypted, corrupt, disguised, and overlong extracted-text failures
- Actual `.xlsx` and binary `.xls` preview, including exact string values
- Actual XLSX cached-formula, hyperlink, merged-cell and hidden-row suppression; hidden-sheet identification
- Actual XLS hyperlink/merge suppression and hidden-sheet identification. Formula and hidden-row metadata were not retained by the legacy fixture writer, so those legacy paths are not claimed tested
- Workbook consent/MIME/origin/byte-limit checks, CSV disguised as Excel, corrupt packages, and complete 413 response for an oversized chunked upload

- Actual hidden-column and 200-row/50-column preview limits, 13-worksheet rejection, and real encrypted XLSX/XLS rejection. Encrypted public test files include source attribution, SHA-256 and MIT license in `test/fixtures/README.md`

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

## Historical development checks, excluded from acceptance

`test/development-provider.test.js` contains isolated provider-response doubles. `test/app.test.js` uses jsdom with simulated browser-only services. They remain in the separately named `test:development` command as historical development diagnostics and have not been rerun or maintained after the no-mock acceptance requirement and auth redesign; their counts are not included above and they are not evidence of live AI, real-browser behavior, or no-mock acceptance.

Earlier reports of 86 passing tests included such development doubles. That count must not be presented as final no-mock acceptance or a successful real DeepSeek connection.

## Still unverified / pending

- Real DeepSeek authentication, entitlement, live `deepseek-flash` responses and quality: **not run; secure API configuration required**
- Real browser interaction, desktop/mobile pixels, keyboard focus, complete zh-CN/English switching, output download/clipboard/print artifacts, and async reset/cancel behavior: **not established by this suite**
- Real 30-minute idle-session expiry: separate real-time check is running; not included in the fast suite count. Eight-hour absolute expiry is not time-tested
- End-to-end deployed service and externally reachable reverse-proxy configuration

A direct cloud-browser loopback navigation was blocked; no alternate route was used to bypass it. Browser checks must run in the separately authorized browser environment or remain explicitly unverified.

## Limits

Source-substring validation does not prove semantic truth or discover every contradiction. Sensitive-identifier pattern checks are not comprehensive de-identification. PDF text extraction does not verify reading order or official form fields; no OCR is supported. CSV prefix bytes are tested, but actual Excel/Google Sheets formula execution has not been exercised. These tests establish neither agency-specific compliance nor production security/privacy readiness. No real customer records, housing decisions, external communication, or official submissions were used.
