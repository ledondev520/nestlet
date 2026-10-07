# Kimi K3: redesign the Nestlet frontend

## Assignment and claim

- Status: **Claimed by Kimi K3 on 2026-10-07** (via the project owner's local environment)
- Intended contributor: Kimi K3, supplied and started by the project owner
- Repository: https://github.com/ledondev520/nestlet
- Suggested branch: `design/kimi-k3-frontend`
- Base commit: `993676bdbd8797919cde187528e01aaa796f1f11` (origin/main at claim time; auth/settings/file-workflow changes from the main frontend owner had NOT landed on main — `git diff origin/main` shows docs-only changes, `public/*` identical)
- Agreed file scope (confirmed with project owner 2026-10-07): `public/style.css`, `public/index.html`, `public/logo.svg`, plus `public/app.js` **rendering layer only** (DOM structure, class names, interaction presentation; no changes to state logic, API contracts, copy strings, element IDs used by tests, or safety validation)
- Delivery: working frontend plus evidence in a **draft PR**; no merge or deployment

The main frontend owner is currently integrating authentication, settings and file workflows. Ask the owner whether those changes have landed and agree a base commit/file scope first. Do not concurrently overwrite the same files. A task file does not automatically communicate with another assistant. Report your claim and progress to the project owner; nobody is authorized by this document to contact an unspecified external service or transmit private materials.

## Goal

Make Nestlet feel compelling, polished and worth opening. The current frontend needs a substantial visual redesign, not another layer of small cosmetic patches. Deliver a distinctive working application that makes the actual paperwork task easy to understand and satisfying to use.

**You have creative freedom over theme, colors, typography, layout and visual language. No palette or prescribed style is required.** Aim for strong visual craft and a memorable identity. Avoid generic admin-template styling, oversized marketing hero sections, excessive explanatory text and decorative complexity that makes the workflow harder. This is a useful application first, not a landing page pretending to be an app.

The owner may review an initial visual direction before full implementation. If you offer that stage, clearly label it a design exploration and then implement the approved direction against the real runtime. A static mockup alone is not the final deliverable.

## Product in one paragraph

Nestlet / 巢小秘 helps an HCV lease-up operator review one case's material and prepare English administrative documents before or alongside the housing authority's process. It keeps the operator's existing folders and spreadsheets. It does not screen tenants, decide eligibility, approve rent, send messages or submit government forms. SFHA is the initial agency context for the design; do not infer that an SFHA packet or template has been verified or accepted. Official form requirements remain governed by docs/official-artifacts.md and docs/domain-sourcebook.md.

## Real user journey

1. Open an empty workspace; configuration/authentication state is clear
2. Sign in and access model settings only through the application's real authorized flow
3. Paste text or import **PDF, CSV, XLSX or XLS**, using real parser responses
4. For a workbook, preview/select the actual sheet and row and map supported values without inventing data
5. Review extracted facts beside source evidence; unknowns and conflicting facts remain visible
6. Confirm/edit facts, then choose a supported English document type
7. Generate and edit the actual supplementary draft; copy, download or print through the real export path
8. Reset or begin another case without stale results or credentials surviving unintentionally

The five current core facts are property, owner, PHA, case reference and proposed rent. Five reviewed fields do not establish that an official packet is complete. Preserve the distinction between proposed and approved rent, operator review and agency verification, and absent-in-this-copy versus absent-at-the-agency.

## Functional requirements that visual design must preserve

- Simplified Chinese is the default UI; English is freely switchable
- Translate the complete UI, including navigation, settings, errors, processing states, dialogs and accessibility labels
- Interface language is independent of artifact language; generated formal prose and document labels remain English
- Actual case values are not silently translated or replaced during a locale switch
- Start empty: no preloaded samples, fake metrics, canned successful AI output or hidden demo mode
- `deepseek-flash` is the sole product model; do not add legacy model choices or simulated fallbacks
- Missing setup, failed authentication, malformed files, provider errors and timeouts must be honest visible states
- Real PDF parsing does not mean OCR; clearly explain scanned/encrypted/unsupported files without a wall of text
- Real XLS/XLSX parsing must not evaluate formulas/macros or claim workbook content was verified by the agency
- Preserve review gates, stale-draft invalidation, conflicts, unknowns, cancellation and asynchronous-response protection
- Keep required warnings in exports even when the user edits draft text
- Preserve safe HTML rendering and prevent uploaded text/model output from becoming instructions or executable markup

Use progressive disclosure: keep the next action obvious, with detailed formats, privacy context and official-source explanations available when needed. Do not remove a meaningful safety decision merely to reduce text.

## Scope and ownership

Primary editable files: `public/style.css`, `public/index.html`, `public/logo.svg` and other explicitly agreed visual assets. `public/app.js` can be changed for rendering, layout and interaction polish **only after coordinating with the functional frontend owner**.

Do not change `server.js`, `auth.js`, `workbook-worker.js`, `public/core.js`, parser contracts, authentication/session behavior, CSRF handling, credential lifecycle, validation limits, deployment or dependencies without a separately agreed scope. Do not rename API fields or invent endpoints to suit a mockup.

Read the actual current `public/app.js`, server/auth routes and README before implementing. Their checked-in contract is authoritative; this brief deliberately does not invent endpoint schemas while backend work is evolving. Reuse real status, authentication, settings, parsing, extraction and export functions. If the existing interface cannot support a necessary design, propose the smallest change with an owner instead of silently duplicating business logic.

Do not copy real API keys, passwords, account data or case files into your tools or deliverables. The application's key-entry mechanism must preserve its approved security contract; no browser persistence, logging, fake saved-key state or unauthorized external transmission. A missing authorized credential means the live-provider check is **Not run**, not a fabricated success.

## Visual and interaction quality

- Strong typography, deliberate spacing, coherent visual hierarchy and restrained supporting copy
- A distinctive identity that works in both languages, rather than merely translating a crowded English layout
- Clear workspace progression with an obvious primary action and easy return to input/review
- Thoughtful empty, loading, disabled, error, success and conflict states
- Readable source snippets and draft editor; comfortable long-form text interaction
- Responsive layouts for desktop and phone; no clipped controls, horizontal overflow or sticky panels covering actions
- Keyboard accessibility, visible focus, semantic labels, sufficient contrast and sensible reduced-motion behavior
- Animation may add delight, but must not obstruct reading, waste time or hide request state
- Any artwork, icons and fonts must be original or appropriately licensed; preserve attribution where required and avoid unreviewed external tracking/CDN dependencies

Brand name remains provisional. Do not claim trademark clearance or government endorsement.

## Validation and evidence

Run `npm ci --ignore-scripts`, `npm run check` and `npm test` against the final branch. If a check fails, distinguish your regression from a pre-existing failure and report both accurately. Automated tests alone are not visual or real-provider acceptance.

Use a real browser and authored non-sensitive actual files. No simulated parser/provider result counts as acceptance. Record the browser/version, tested commit and viewport sizes. Include screenshots in both zh-CN and English covering:

- Empty/start workspace
- Authentication/settings state without visible credentials
- Loaded material and real workbook mapping
- Fact review with unknown/conflict
- Processing and recoverable error
- Editable English artifact and print/export view
- At least one narrow/mobile viewport and keyboard-focused state

Check locale switching without losing input, keyboard navigation, repeated clicks, reset/cancel, stale responses, file error recovery and export warnings. Screenshot only synthetic/non-sensitive content. Where a live call or protected state cannot be exercised safely, mark it **Not run** and explain what is needed.

## PR and handoff

Open a draft PR on `design/kimi-k3-frontend` with:

1. Brief design rationale and a small component/data-flow explanation
2. Before/after screenshots and the exact tested source SHA
3. Files changed, commands/results and browser coverage
4. Unrun checks, known limitations, accessibility notes and any requested follow-up
5. Confirmation that core/backend/auth/parser contracts were preserved, or links to explicitly coordinated changes
6. Rollback notes and any asset-license attribution

Return the verified draft PR link to the project owner. Do not merge, deploy, alter another application's service or change hosting. This handoff authorizes a scoped frontend redesign, not publication to unrelated external tools or use of production personal data.
