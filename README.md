# Nestlet · 巢小秘

A standalone JavaScript frontend and backend for one Housing Choice Voucher paperwork case at a time: import material, review source-linked facts, then prepare an editable English administrative draft. Keep your folders and spreadsheets. [Repository](https://github.com/ledondev520/nestlet)

**Development MVP, not a production housing system.** No verified local PHA pack, real-case pilot results, official-form completion, automatic sending or production privacy/security assurance. The provisional name has existing rental-software collisions; no trademark clearance is claimed.

## Product contract and release status

The final workflow starts empty and uses real document parsing and `deepseek-flash` extraction. It must not substitute samples, mocked model output, a local rule extractor or an older model alias when configuration or a provider call fails. Test fixtures and isolated fake-provider tests are development evidence only.

**Transition checkpoint, October 7, 2026:** PDF and workbook backend routes are implemented; UI integration, removal of the earlier demo flow and full end-to-end acceptance are being reconciled. Read [validation](docs/validation.md) for the exact tested snapshot. Source code or tests passing at an intermediate commit are not final acceptance.

## Install and run

Use Node.js 24 to match the container runtime, npm, and Poppler's `pdftotext` for text-PDF extraction. Node package dependencies are pinned in `package-lock.json`.

```sh
npm ci
npm run check
npm test
npm start
```

Open http://127.0.0.1:4173. The server binds to loopback. `npm start` does not load `.env` automatically. For configuration, copy `.env.example` to a private ignored `.env`, populate the key through an authorized secure mechanism, then run:

```sh
node --env-file=.env server.js
```

Required for real AI extraction: server-side `DEEPSEEK_API_KEY` and `ENABLE_LIVE_AI=true`. The only supported product model is `deepseek-flash`; legacy aliases are not maintained. An absent key must be a visible configuration blocker, not an offline success. No live account/key/model response has yet been verified by the project.

Never paste secrets into chat, browser fields, screenshots or commits. Before sending any production tenant material, resolve provider terms, retention, training use, geography and authorization. The current development build accepts synthetic or thoroughly de-identified inputs only. [Provider notes](docs/provider.md)

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

1. Start with an empty case and import or paste safe material
2. Review parsed text or map the workbook's selected sheet/row before sending minimal text for extraction
3. Inspect source-linked facts; resolve conflicts and review every field, including unknowns
4. Select a supported English document type, generate and edit the draft
5. Verify placeholders, recipient, facts, dates and attachments before copy/TXT/print export

The interface defaults to Simplified Chinese and supports English, including errors. External draft boilerplate is English in either locale. Case values and manual edits are preserved rather than silently translated; the operator must ensure the complete formal artifact is English. Print / Save PDF is a browser export, not an official-government PDF generator.

“Not provided here” never means “not submitted to the agency.” Proposed rent is not approved rent. Operator confirmation is not agency verification. [Product scope](docs/product.md)

## Deploy independently

Frontend, backend and parser code live in this repository. Sites is only a temporary preview and is not a runtime or deployment dependency. An owner-only preview is not assumed accessible to collaborators.

No VPS target is selected and no remote deployment is claimed. [VPS and Docker deployment plan](docs/deployment.md) documents requirements, a proposed container recipe, release gates and rollback. The current server has no authentication or multi-user isolation: do not expose an unprotected live API to the internet.

## Data boundaries

No database or persistent case storage is implemented. Browser state is transient; downloads/clipboard contents remain where the operator saves them. Imported bytes reach the local/self-hosted backend, and consented extraction text reaches DeepSeek. Transient processing is not a complete retention/deletion or privacy assurance.

No real personal records, raw customer materials, secret values or private infrastructure details belong in the public repo. No messages, signatures, official submissions, housing eligibility decisions or rent approvals are automated.

## Documentation

- [English operator documents versus official forms](docs/official-artifacts.md)
- [Official domain sources and version checks](docs/domain-sourcebook.md)
- [Five-case pilot protocol, not results](docs/pilot.md)
- [Code and data flow](docs/code-walkthrough.md)
- [Collaboration contract](docs/collaboration.md)
- [Local Codex acceptance task](docs/tasks/local-codex-acceptance.md)
- [Engineering skills usage and provenance](docs/skills-guide.md)

Repository creation/publication is separate from tested release or deployment. Licensing remains a separate project-owner decision.
