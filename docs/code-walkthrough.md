# Code and data-flow walkthrough

This is a small JavaScript app, not a framework scaffold. Read the modules in this order: `public/core.js`, `public/app.js`, then `server.js`. Exact code is authoritative if a later change has not yet reached this walkthrough.

## File responsibilities

```text
server.js           HTTP routes, protected PDF/workbook imports, provider/settings calls
auth.js             single-operator password verification, sessions and CSRF
public/agency-guidance.js bilingual official-source references, unconfirmed acceptance
public/core.js      review gate, drafts, CSV, AI suggestion validation
workbook-worker.js isolated real XLSX/XLS parsing and bounded preview
public/app.js       bilingual interface, transient state, operator review and export actions
public/index.html   browser entry point
public/style.css    responsive screen and print presentation
public/logo.svg     provisional brand artwork
test/core.test.js   behavior checks at the exported core interface
test/server.test.js real local HTTP and file-parser checks
test/auth.test.js   single-operator authentication/session behavior
docs/               scope, sources, pilot, collaboration and evidence
```

The backend uses SheetJS for workbooks and an operating-system pdftotext dependency for PDFs. Authenticated HTTPS browser key entry is implemented; the submitted key stays in server process memory, not browser storage or a case database. No persistent case database is implemented. The app is independently deployable; Sites is only a temporary preview.

## Main path

```text
Empty case → pasted text / TXT / CSV / PDF / XLSX / XLS
  → real local parse / workbook selection and mapping
  → app state: reviewed source text
  → POST /api/extract                       [consented deepseek-flash call]
  → five unconfirmed field suggestions + source snippets
  → operator edits / resolves conflicts / confirms each field
  → canDraft(fields)
  → draft(fields, kind)                     [deterministic English template]
  → operator edits the draft
  → copy / TXT download / browser print
```

CSV export is a separate data interchange path through `exportCSV`. Reimport goes through `parseCSV` and creates new text to review; it does not restore a prior confirmation or agency status.

Final contract: no preloaded sample, mock response or silent local-extractor fallback. This behavior is implemented; real-provider verification remains a separate release gate. Explicit manual entry is not a simulated AI result.

## Core contracts

### `extract(text)` — legacy/internal label helper, not final-flow fallback

Recognizes the five known English label prefixes and returns one entry per field. Source lines remain attached. Repeated different values signal a conflict; explicit unknown markers become empty values. This is not a general document reader. It does not understand an entire packet, detect every contradiction or verify facts externally.

### `canDraft(fields)` and `draft(fields, kind)`

The review gate requires the expected fields, valid values, explicit confirmation and no unresolved conflict. A user can review an unknown while leaving it empty; the draft keeps a visible placeholder. A reviewed value means the operator reviewed it, not that the PHA approved it. `draft` rechecks the gate and emits a supported English operator-document template. Core support and UI-exposed draft choices must be verified separately.

### `validateSuggestions(items, text)`

Provider output is untrusted. The validator limits known fields, requires verbatim source grounding and leaves confirmation false. Known labeled conflicts and mismatches must not be silently replaced by an AI value. Syntactic substring evidence does not establish that the value belongs in that field or that the source is truthful. Human review remains necessary.

### `parseCSV(text)` and `exportCSV(fields)`

Import accepts a fixed five-column header and exactly one case, handles quoted cells and rejects malformed shape. Embedded row separators are flattened before turning cells into labeled text. Export quotes cells and adds protective prefixes to spreadsheet-sensitive values. Test actual spreadsheet behavior separately before broader interoperability claims; CSV is not a verified-form export or full review manifest.

## UI state and invalidation

`public/app.js` owns locale, original text, suggested fields, editable draft, mode and error/busy state in memory. Locale is a presentation choice, not a case-data transformation. Changing source input invalidates prior extraction and draft; changing a field invalidates its confirmation and draft. A version token is used around asynchronous work so obsolete responses do not revive a cleared case. Test interrupted and repeated flows in the browser, not just through core tests.

Rendering escapes input before inserting it into HTML. Export must use the intended artifact and preserve required warnings even after manual edits. Browser print is a presentation path, not official PDF form filling. Downloads/clipboard contents outlive app state.

## Optional network path

```text
Operator signs in; browser receives HttpOnly session cookie + CSRF token
  → optional HTTPS Settings save to server-memory key storage
  → browser confirms de-identified text transmission
  → same-origin POST /api/extract with session + CSRF
  → server checks authorization, live enablement, consent and input
  → server attaches its server-held credential
  → DeepSeek JSON response
  → server validates suggestions
  → browser receives unconfirmed facts, never a key
```

`GET /api/status` reports sanitized configuration/capabilities, not live account health. `/api/login` verifies the configured operator hash; `/api/logout` invalidates that session. PDF/workbook parsing and extraction require session plus CSRF. Key writes/tests additionally require the configured HTTPS origin. Sessions and browser-saved keys are lost on server restart; an environment-provided key can be loaded again at startup.

`POST /api/settings/test` explicitly checks model access through DeepSeek `/models`, not chat completion. Historical development-double tests are separate from real HTTP/file/browser evidence and cannot prove a successful provider call. The static route allowlist must not expose server code or environment files. Single-operator authentication is implemented, but does not establish multi-tenant isolation or production privacy readiness.

## What to inspect when changing behavior

- New field: align the known field list, labels, parsing, provider prompt/schema, UI, draft content and CSV contract; coordinate this shared interface first
- New draft: preserve English boilerplate, factual placeholders, explicit document type and review warning; never imply official approval
- New agency: follow domain-sourcebook.md verification steps before labeling any rule official
- New persistence/integration: requires a separately reviewed privacy, access and authorization design; do not tack it onto transient case state
- Bug fix: reproduce the defect, add a behavior check at the relevant public interface, rerun affected and aggregate checks, then update dated evidence

The diagram and before/after evidence approach is inspired by the credited `show-me` pattern in Matt Pocock's `pr` skill; see skills-guide.md for exact attribution and usage limits.
