# Nestlet QA checkpoint

Date: 2026-10-07. This checkpoint covers the current source tree at the time of the run; rerun after integration changes.

## Execution

- `npm run check`: passed JavaScript syntax checks
- `npm test`: 86 tests passed, 0 failed, 0 skipped
- Initial baseline: 62 tests, 55 passed and 7 failed
- Source changes made by backend/frontend owners; QA owns the tests and synthetic fixtures
- All provider calls replaced by a test-only fake adapter before each disposable server starts. No actual API key or paid request used

## Executed stages

### Core public functions

Verified five-field extraction, unknowns, verbatim source snippets, duplicate-label conflicts, exact field identity and boolean review requirements, control-character rejection, unknown placeholders, all three English template types, CSV quoting/BOM/blank cases/notice metadata, malformed CSV rejection, CR/LF/Unicode row-injection prevention, formula-prefix neutralization, provider source/value grounding, malformed suggestions, duplicate suggestions, and preservation of both sides of deterministic conflicts.

### HTTP public routes

Verified disabled live mode, same-origin and fetch-metadata checks, consent, JSON shape/media type, byte and character limits, chunked oversized request response, source-grounded unconfirmed suggestions, provider transport/JSON/schema/oversize/truncation/tool-call failures, one bounded transient retry, two-request concurrency limit, client cancellation and capacity recovery, synthetic sensitive-identifier pattern rejection before provider access, safe error messages, basic security headers, static MIME type, and restricted static routing.

### PDF public route with real parser

Verified text extraction from a synthetic text PDF with the installed local `pdftotext`; no AI call. Verified explicit upload consent, MIME/origin checks, blank/vector PDF no-OCR rejection, true AES-256 password-encrypted PDF rejection, corrupt and disguised PDF rejection, 5 MiB upload limit, and 50,000-character extracted-text limit. Fixtures are synthetic and reproducible. PDF tests explicitly report skips if `pdftotext` is missing; the recorded checkpoint has no skips.

## Open verification stages

- Browser actions, pixels, desktop and mobile layouts, keyboard focus, zh-CN default and complete English toggle
- UI generation gate, current proper-name/CJK approval policy, editing and print/export contents
- UI file picker, repeated selection, cancel/reset while asynchronous work is pending, preservation of old work after failed import
- Clipboard and actual downloaded TXT/CSV/print-to-PDF artifacts

A direct cloud-browser loopback navigation was blocked. No alternate route was used to bypass that restriction. Browser coverage must be run through an authorized supported preview, otherwise reported unverified.

## Important limits

- No real provider entitlement/model quality, billing, privacy terms, retention, or region tested
- No OCR and no image-based document understanding
- PDF extraction warnings do not prove correct reading order or government-form field validity
- Source substring grounding does not prove semantic truth, all contradictions, or correct field classification
- CSV formula-prefix bytes are tested; actual Excel/Google Sheets execution behavior has not been tested
- The sensitive-data guard is a limited pattern check, not de-identification or comprehensive data-loss prevention
- No real customer data, agency submission, external communication, housing eligibility/rent decision, or production security certification
