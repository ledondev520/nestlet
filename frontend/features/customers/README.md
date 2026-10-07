# Customer directory feature

Public entry: `CustomersPage({ lang = 'zh', onOpenCase, active = true })` from `index.jsx`.
It uses the shared `useSession()` and official shadcn components. Kimi's existing
semantic paper/ink/cinnabar tokens supply the colors and type treatment. No CSS,
package, session, App, backend, or shared component source is owned here.

## Data flow and boundaries

- Only authenticated sessions mount the workspace. `status.userId` keys the entire
  workspace, so another account cannot inherit selection, search, forms, or reads.
- Search uses `URLSearchParams`, 180 ms debounce, an abort signal, request epochs,
  and a key-specific render guard. It requests all possible 100 own-user customer
  records; the server remains the ownership and capacity authority.
- Each selected customer independently loads its canonical customer record, case
  metadata, and artifact metadata. A partial failure does not invent empty success
  or conceal other successful sections. Duplicate customer labels show record IDs.
- Creation and rename are explicit inline forms. A synchronous mutation lock stops
  duplicate clicks. Unmounting aborts writes and ignores completion callbacks; a
  server may already have committed before a network cancellation. Unconfirmed
  network saves direct the operator to inspect records before retrying.
- A rename sends `expectedVersion`. Conflict retains the operator's input, blocks
  another save until an explicit latest-record load succeeds, and requires another
  explicit save. Cancel after that load preserves the refreshed canonical name.
- New cases contain exactly `{ title, sourceText: '', fields: [], draftType:
  'followup', draftText: '', clientId }`. Customer labels never become legal names,
  confirmed case facts, senders, or recipients. The saved case ID is passed to
  `onOpenCase(caseId)`; artifacts use the same callback for their owning case.
- This module lists immutable artifact metadata, draft/final status, versions,
  and historical/stale warnings. It does not edit messages/documents or initiate
  generated-document downloads. The conversation and document modules own those actions.
- Search and selection changes prevent a late customer-creation result from
  changing a newer user selection. Selection/account changes prevent late case
  creation from opening the wrong case. No browser storage is used.

## Verification (2026-10-07)

Run from the repository root after its pinned dependency installation:

```sh
node --test frontend/features/customers/customers.dom.test.js
node --test frontend/features/customers/customers.http.test.js
```

15 development DOM tests passed with Vite SSR transforms, React DOM, jsdom, and
controlled API doubles. They exercise both languages, empty/failure states,
literal search encoding, abort/epoch ordering, duplicate submissions, optimistic
rename conflicts, inline keyboard focus return, metadata/version rendering,
malformed responses, text escaping, exact case payloads, and account/selection
changes during reads and writes.

2 independent real local HTTP tests passed using the shared API client, an actual
Node server, authentication/CSRF, and disposable SQLite. They cover literal own-user
search, duplicate labels, rename version conflicts, the exact empty-case payload,
saved artifact versions, and foreign-record denial for another ordinary account
and the administrator. All fixtures are synthetic; no production record or
provider credential is used.

These results are not actual-browser/CSP, integrated App navigation, paid-provider,
production-deployment, or final workflow acceptance. Those remain separate checks
against the integrated build. In-page panels avoid Radix portal dependencies.

Aggregate regression at this checkpoint: `npm run check` passed. `npm test`
passed 229 of 230 tests; `test/localization-contract.test.js:57` failed because
legacy `public/app.js` lacks explicit bilingual handling for the backend's new
`CASE_ISSUE_NOT_FOUND` code. That shared/legacy file is outside this feature's
ownership and was reported to the integrator. This is not an aggregate green run.

## Increment: private original materials (2026-10-07, 10:03 UTC)

`original-materials.jsx`, `assets-hooks.js`, `assets-model.js` and `assets-copy.js`
add a separate originals section using the frozen `docs/private-assets-api.md`
contract. The existing customer/case/artifact sections remain in place.

- Requests `GET /api/assets` with the selected customer, optional case, literal
  query (maximum 200 characters), and 50-record offset pages. Search snippets,
  filenames and extraction warnings are rendered as text. No HTML is interpreted.
- Shows MIME/size/date, case association, searchable-text availability and bounded
  indexing warnings. No OCR or complete parsing is inferred from a saved image.
- Original PDF/image preview and original-byte download links use validated UUIDs
  on the same application origin with the existing session cookie. Preview opens
  a new tab with `noopener noreferrer`. No third-party viewer, public link, blob
  cache, or service worker is introduced.
- Extracted text opens in an inline, escaped text preview through the JSON API,
  with loading/error/empty states and a matching-asset-ID check. Close, filter,
  pagination, selection and account changes discard late responses.
- A legacy server's non-JSON 404 is explicitly shown as an unavailable feature,
  with the case/document directories still usable. A known foreign/missing
  customer/asset 404 is distinguished from an unsupported endpoint. No mocked
  successful file list is supplied by production code.
- The optional `active` prop handles App's cached hidden pages: an old create
  result cannot force navigation while the customer page is hidden. Returning
  refreshes directories, while preserving an unfinished rename/case form. The
  foundation owner supplies this prop; no shared App file was edited here.

Additional verification:

```sh
node --test frontend/features/customers/assets.dom.test.js
node --test frontend/features/customers/assets.http.check.mjs
node frontend/features/customers/assets.browser.check.mjs
```

The original 17 checks still pass. The new 13 development DOM checks pass and
exercise paging, filter/query scope, out-of-order reads, preview cancellation,
account remounts, unavailable endpoints, missing records, safe links/escaping,
keyboard focus, hidden-page navigation, and unsaved-form preservation.

The new 2 real HTTP checks pass against the authorized private-assets backend
checkout using independent temporary SQLite/files and synthetic identities. They
use this feature's actual query/path helpers and verify literal-content search,
text identity, byte-identical download and SHA-256, preview security headers,
pagination, and foreign ordinary/admin isolation. Before backend integration,
set `NESTLET_ASSET_TEST_ROOT` to that authorized checkout when running the explicit
`.check.mjs` commands. They are not silently treated as successful on an old server.

The Chromium check was attempted twice, including an approved escalated execution,
but this executor blocked Chromium startup with `process_singleton socket():
Operation not permitted`. No browser steps or screenshots were completed. The
script remains available for an environment that supports Chromium. Even a future
pass of this component's Vite-development check is not whole-App production-CSP,
provider, deployment, or end-to-end release acceptance.
