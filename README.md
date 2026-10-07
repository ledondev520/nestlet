# Nestlet · 巢小秘

A standalone JavaScript frontend and backend for one Housing Choice Voucher paperwork case at a time: import material, review source-linked facts, then prepare an editable English administrative draft. Keep your folders and spreadsheets. [Repository](https://github.com/ledondev520/nestlet)

**Application under active implementation and release verification.** No verified local PHA pack, real-case pilot results, official-form completion, automatic sending or production privacy/security assurance. The provisional name has existing rental-software collisions; no trademark clearance is claimed.

## Product contract and release status

The final workflow starts empty and uses real document parsing and `deepseek-flash` extraction. It must not substitute samples, mocked model output, a local rule extractor or an older model alias when configuration or a provider call fails. Test fixtures and isolated fake-provider tests are development evidence only.

**Checkpoint, October 7, 2026:** operator authentication, protected parser/extraction/settings routes, real PDF/Excel import, Flash-only extraction and authenticated HTTPS key settings are implemented. The workflow starts empty and has no silent mock/provider fallback. Local Codex reported a real-browser retake against `8b429` covering login, PDF/Excel and exports, plus 87 core and five independent HTTP checks; see [validation](docs/validation.md) for the exact evidence and limitations.

The initial private loopback deployment of `8b429` was reported successful at 04:48 UTC in [deployment run 37573150783](https://github.com/ledondev520/jiesong-system/actions/runs/37573150783); the deployment logs were reviewed separately. Public trusted HTTPS activation and external health verification completed at 06:07 UTC in [run 37579840911](https://github.com/ledondev520/jiesong-system/actions/runs/37579840911); production operator configuration and a real DeepSeek call are not established by that result. No first-case time saving or ROI has been validated.

**Operator setup helper:** The user-run operator setup helper passed independent review and was published in PR #6, merged as main commit `b431ea59405cbbf9ab6ec9945010f66f655b1781`. Exact PR and main Node/container CI passed, including actual Docker/PTY helper checks. The helper release is staged on the private loopback service: corrected [upgrade run 37577482526](https://github.com/ledondev520/jiesong-system/actions/runs/37577482526) succeeded at 05:40:48 UTC, with a healthy container, fail-closed HTTP checks, helper-module checks and current-release pointer verified; existing runtime configuration was preserved. The earlier attempt rolled back safely and is no longer a blocker. The helper is published, container-verified and privately staged. Operator setup is still a user-controlled step; public trusted HTTPS is verified for the previous application release. Administrator/API configuration and a live model call remain pending; the new registration/SQLite release is not yet deployed.

## Accounts, cases and release scope

**Implementation checkpoint, October 7, 2026, 06:07 UTC:** named trial logins and server-local SQLite case storage are implemented and awaiting final CI, browser and deployment verification. Self-service web registration and ordinary/administrator roles are now explicitly in scope and are implemented, with final release verification pending. This is not a completed customer pilot or evidence that the new release is already on the public service.

Use explicit **Save / Open / Delete** for a case. The page’s preview, editing, copy, download and print remain primary; saving is optional. Saved source text, reviewed fields and drafts belong to the signed-in user. The owner also sees only their own cases; trial users cannot manage the API key or provider settings. Web username/password registration is implemented with a server-assigned ordinary role; administrators bootstrap privately and cannot be selected at registration. Shared teams, CRM and cross-user case administration are not included.

Node.js 24 is required. Configure `NESTLET_DB_PATH` to an explicit private absolute path for direct launch. Docker uses `/data/nestlet.sqlite` on the dedicated `case_data` volume. Saved cases and explicitly saved original files survive process/container restart when that volume is preserved. Private originals default to the assets directory beside SQLite, with optional NESTLET_ASSETS_PATH configuration. Manual verified backup/restore/export commands are implemented; no automatic backups are configured. Never remove/prune the data volume as routine deployment or rollback. [SQLite runtime](docs/sqlite-runtime.md)

## Install and run

Use Node.js 24 (required for server-local SQLite), npm, and Poppler's `pdftotext` for text-PDF extraction. Node package dependencies are pinned in `package-lock.json`.

```sh
npm ci --ignore-scripts
npm run check
npm run build
npm test
npm start
```

Open http://127.0.0.1:4173. The server binds to loopback. `npm start` does not load `.env` automatically. For configuration, copy `.env.example` to a private ignored `.env`, provide the operator password hash through an authorized private setup, then run:

The JavaScript/JSX React + shadcn/ui workspace is served at `/`, with `/next/` retained as an alias. The previous workspace remains explicitly available at `/legacy/`. Run `npm run build` after frontend changes; Docker builds these assets from source. A missing or incomplete production build returns a clear 503 rather than silently switching interfaces. See [frontend integration](frontend/README.md) for module contracts and validation scope.

```sh
node --env-file=.env server.js
```

Protected routes require configured operator authentication, sign-in and CSRF protection. For real extraction, configure an authorized key either server-side with `DEEPSEEK_API_KEY` and `ENABLE_LIVE_AI=true`, or through the implemented authenticated HTTPS Settings screen with explicit enablement. Browser-entered keys remain in server process memory only. The only supported product model is `deepseek-flash`; legacy aliases are not maintained. An absent key must be a visible configuration blocker, not an offline success. No live account/key/model response has yet been verified by the project.

Never paste secrets into chat, arbitrary browser fields, screenshots or commits. The operator personally enters/submits credentials only through the authorized private setup or the authenticated HTTPS Settings screen. Before sending any production tenant material, resolve provider terms, retention, training use, geography and authorization. The current development build accepts synthetic or thoroughly de-identified inputs only. [Provider notes](docs/provider.md)

### Dependencies and input limits

- TXT: UTF-8 text; UI text/file limits must match server acceptance
- CSV: fixed columns `property,owner,pha,caseReference,rent` and one case row; quoted values are supported
- PDF: real local `pdftotext` parsing, up to 5 MiB and 50,000 extracted characters; scanned/image-only or encrypted files are rejected; no OCR
- XLSX / legacy XLS: real SheetJS workbook parsing in an isolated worker, up to 5 MiB; bounded sheet/row/column preview for human mapping; not a file-extension-only acceptance

Parser availability is reported by `/api/status`. PDF parsing needs the operating-system Poppler dependency in addition to `npm ci`. Workbook formulas/macros must not execute. File upload sends document bytes to the application's backend; parsing is distinct from a later explicitly consented DeepSeek request. Review extracted reading order and values against the original.

CSV example:

```csv
property,owner,pha,caseReference,rent
128 Example Lane Unit B,Example Property LLC,Not confirmed,DEMO-104,$2100
```

This is synthetic documentation data, not a preloaded production case. Exported CSV has formula-prefix protection; reimport starts a fresh review and does not preserve an agency status or review audit.

## Working with a case

Assistance is optional. Keep the existing process and use Nestlet only when a first real case exposes a document-reading, missing-information or English-writing difficulty. No migration, repeated data entry or feature expansion is required to establish a need.

1. Start with an empty case and import or paste safe material
2. Review parsed text or map the workbook's selected sheet/row before sending minimal text for extraction
3. Inspect source-linked facts; resolve conflicts and review every field, including unknowns
4. Select a supported English document type, generate and edit the draft
5. Verify placeholders, recipient, facts, dates and attachments before copy/TXT/print export

The interface defaults to Simplified Chinese and supports English, including errors. External draft boilerplate is English in either locale. Case values and manual edits are preserved rather than silently translated; the operator must ensure the complete formal artifact is English. Print / Save PDF is a browser export, not an official-government PDF generator.

“Not provided here” never means “not submitted to the agency.” Proposed rent is not approved rent. Operator confirmation is not agency verification. [Product scope](docs/product.md)

## Deploy independently

Frontend, backend and parser code live in this repository. Sites is only a temporary preview and is not a runtime or deployment dependency. An owner-only preview is not assumed accessible to collaborators.

The owner selected the same VPS as the existing Jiesong service, with Nestlet isolated as an independent service. Private addresses and access details are not published here. An initial loopback container deployment is reported above; certificate issuance has completed, but trusted HTTPS activation is still being verified. [Deployment status and guide](docs/deployment.md) distinguishes implementation, deployment, configuration and verification. Owner/named-trial access and own-user case isolation are implemented in the new feature pending final release verification; production privacy readiness is not established.

## Data boundaries

SQLite stores explicitly saved case text, reviewed fields and drafts per authenticated user. Unsaved browser changes remain transient; downloads/clipboard contents remain where the operator saves them. Explicit private-file uploads retain original PDF, Excel, TXT, CSV, PNG and JPEG bytes under the authenticated user, with local text indexing where supported. Transient parser/chat requests do not silently retain binaries. Private-file saving and search do not call a model; only separately consented extraction text reaches DeepSeek. Own-user query isolation does not establish a complete production retention, backup or privacy program. Original-file deletion is not enabled pending a confirmed recovery policy. See [private assets](docs/private-assets-api.md) and [manual backup/recovery](docs/private-data-operations.md).

No real personal records, raw customer materials, secret values or private infrastructure details belong in the public repo. No messages, signatures, official submissions, housing eligibility decisions or rent approvals are automated.

## Documentation

- [English operator documents versus official forms](docs/official-artifacts.md)
- [Official domain sources and version checks](docs/domain-sourcebook.md)
- [Five-case pilot protocol, not results](docs/pilot.md)
- [Full application architecture and lifecycle](docs/architecture.md)
- [SQLite storage and named-trial runtime](docs/sqlite-runtime.md)
- [Prepared owner-controlled administrator capability and schema6 release gates](docs/account-administration.md)
- [First operator session and verification gates](docs/onboarding.md)
- [Code and data flow](docs/code-walkthrough.md)
- [Collaboration contract](docs/collaboration.md)
- [Local Codex acceptance task](docs/tasks/local-codex-acceptance.md)
- [Engineering skills usage and provenance](docs/skills-guide.md)

Repository creation/publication is separate from tested release or deployment. Licensing remains a separate project-owner decision.
