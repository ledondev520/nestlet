# Nestlet validation

Checkpoint: 2026-10-07. This is a development checkpoint, not final acceptance. Authentication and deployment integration are still changing; rerun after the final source freeze.

## Strict acceptance command

`npm test` runs only `test/core.test.js` and `test/server.test.js`.

Current result: **69 passed, 0 failed, 0 skipped**: 52 core behavior tests and 17 real HTTP/file-parser tests. `npm run check` also passes.

This command uses real core functions, disposable actual HTTP servers, actual PDF/XLS/XLSX bytes, and installed real document parsers. It does not replace fetch, HTTP responses, provider calls, or file-reading functions. The server process is deliberately configured without an API key and with live AI disabled, so the suite verifies that unavailable live extraction is reported truthfully. Test source text and files contain authored non-personal examples only.

## Coverage established by strict tests

### Core behavior: 52 tests

- Five-field extraction, missing/unknown values, verbatim source snippets, repeated-label conflicts
- Exact required field keys, explicit boolean confirmation, unresolved conflict and control-character draft gates
- Unknown placeholders, all three English templates, purpose labels and human-review boundaries
- CSV quoting, BOM, empty cases, notice metadata, malformed shape rejection, row-injection flattening and formula-prefix neutralization
- Source-substring/value validation for supplied suggestions, malformed/duplicate input, preservation of both sides of deterministic conflicts
- Explicit spreadsheet row/column mapping, source-cell provenance, unmapped unknowns, fresh human-review state, and rejection of hidden/blocked/duplicate/out-of-range selections

### Real HTTP and file parsing: 17 tests

- Real server status identifies configured model `deepseek-flash`, reports no configured key/live capability, and returns a disabled error without substituting fabricated fields
- Basic security headers, static MIME type, and restricted source/environment paths
- Actual local PDF text extraction; consent, MIME, origin and size checks; blank/vector no-text, encrypted, corrupt, disguised, and overlong extracted-text failures
- Actual `.xlsx` and binary `.xls` preview, including exact string values
- Actual XLSX cached-formula, hyperlink, merged-cell and hidden-row suppression; hidden-sheet identification
- Actual XLS hyperlink/merge suppression and hidden-sheet identification. Formula and hidden-row metadata were not retained by the legacy fixture writer, so those legacy paths are not claimed tested
- Workbook consent/MIME/origin/byte-limit checks, CSV disguised as Excel, corrupt packages, and complete 413 response for an oversized chunked upload

## Historical development checks, excluded from acceptance

`test/development-provider.test.js` contains isolated provider-response doubles. `test/app.test.js` uses jsdom with simulated browser-only services. They remain in the separately named `test:development` command as development diagnostics; their counts are not included above and they are not evidence of live AI, real-browser behavior, or no-mock acceptance.

Earlier reports of 86 passing tests included such development doubles. That count must not be presented as final no-mock acceptance or a successful real DeepSeek connection.

## Still unverified / pending

- Real DeepSeek authentication, entitlement, live `deepseek-flash` responses and quality: **not run; secure API configuration required**
- Real browser interaction, desktop/mobile pixels, keyboard focus, complete zh-CN/English switching, output download/clipboard/print artifacts, and async reset/cancel behavior: **not established by this suite**
- New operator-auth/session/CSRF/settings routes: implementation and strict HTTP tests pending
- Workbook preview truncation and excessive-sheet limits: additional real fixtures pending
- End-to-end deployed service and externally reachable reverse-proxy configuration

A direct cloud-browser loopback navigation was blocked; no alternate route was used to bypass it. Browser checks must run in the separately authorized browser environment or remain explicitly unverified.

## Limits

Source-substring validation does not prove semantic truth or discover every contradiction. Sensitive-identifier pattern checks are not comprehensive de-identification. PDF text extraction does not verify reading order or official form fields; no OCR is supported. CSV prefix bytes are tested, but actual Excel/Google Sheets formula execution has not been exercised. These tests establish neither agency-specific compliance nor production security/privacy readiness. No real customer records, housing decisions, external communication, or official submissions were used.
