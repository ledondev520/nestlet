# Nestlet · 巢小秘

A small, pre-portal Housing Choice Voucher paperwork assistant. Start with one synthetic or thoroughly de-identified case, review source-linked facts, and prepare an editable English administrative draft. Keep your existing folders and spreadsheets.

**Prototype only.** No verified local PHA pack, real-case pilot results, official-form completion, automatic sending, or production privacy/security assurance. Nestlet is a provisional name; existing rental-software uses of the name have been identified and trademark clearance has not been performed.

## Run locally

Requires Node.js 20 or later and npm. There are no runtime package dependencies.

```sh
npm start
```

Open http://127.0.0.1:4173. The server binds to loopback; this is not an authenticated internet service. No API key or account is needed for the local demo. Do not expose it publicly or enter real personal documents.

```sh
npm run check
npm test
```

See [validation evidence](docs/validation.md) for the scope, actual results, and untested areas. A passing offline suite is not evidence of a working live AI account or correct PHA requirements.

## Try the main workflow

1. Click **试用示例 / Try sample** or paste safe text
2. Click **整理演示字段 / Extract demo fields**
3. Inspect each value and its source; edit conflicts and review every field, including unknowns
4. Generate an English draft; review placeholders, recipient, facts, attachments and wording
5. Copy, download TXT, print using your browser, or export a one-case CSV

The interface defaults to Simplified Chinese and has an English toggle. Generated boilerplate is English in either locale; user-entered values and manual edits are preserved, not translated. Keep those values in English if the whole artifact must be English. Print / Save PDF uses the browser print dialog, not an official-form PDF generator.

### Accepted input

Pasted text and UTF-8 TXT or CSV files only. The UI limits files to 50 KB. No PDF, images, OCR, inbox integration, Google Sheets sync, or PHA portal connection is implemented.

The local extractor recognizes these English labels, not arbitrary prose:

```text
Property: 128 Example Lane, Unit B
Owner: Example Property LLC
PHA: Not confirmed
Case reference: DEMO-104
Proposed rent: $2,100 per month
```

CSV has exactly this header and one case row:

```csv
property,owner,pha,caseReference,rent
128 Example Lane Unit B,Example Property LLC,Not confirmed,DEMO-104,$2100
```

Exported CSV uses formula-prefix protection; it is a data interchange file, not an approved packet or preserved review audit. Importing starts a new review. “Not provided here” never means “not submitted to the agency.”

## Optional DeepSeek extraction

Live extraction is separate from local deterministic drafting. Both `ENABLE_LIVE_AI=true` and a server-side `DEEPSEEK_API_KEY` are required. The configurable default model is `deepseek-v4-pro`. **No live account, API key, entitlement, balance or model response has been verified by this project.**

`.env.example` documents configuration; `npm start` does not automatically load `.env`. On Node 20.6+ you can copy the example to a private, ignored `.env`, set values locally through a secure mechanism, and run:

```sh
node --env-file=.env server.js
```

Never paste a key into chat, a browser field, a screenshot, a fixture, or a commit. Do not enable live mode with real tenant data. Review provider processing terms, retention, training use, geography and authorization first. The in-app confirmation describes transmission; it is not a legal/privacy clearance. See [provider notes](docs/provider.md).

Demo text stays in page memory; refresh or Clear case removes app state. Downloads and copied text remain wherever the operator saves them. In live mode, submitted text leaves this computer for DeepSeek. No database, authentication, multi-user isolation, formal audit trail or production retention policy is implemented.

## Documentation

- [Product scope and open decisions](docs/product.md)
- [Official domain sourcebook and version checks](docs/domain-sourcebook.md)
- [Five-case pilot protocol and blank worksheet](docs/pilot.md)
- [Code and data-flow walkthrough](docs/code-walkthrough.md)
- [Collaboration contract](docs/collaboration.md)
- [Engineering skills guide and provenance](docs/skills-guide.md)

This repository contains synthetic examples and sanitized product guidance only. The project repository is [ledondev520/nestlet](https://github.com/ledondev520/nestlet). Repository creation does not establish that a release has been pushed, tested remotely, or deployed. Licensing remains a separate release decision.
