# Nestlet application architecture

Checkpoint: October 7, 2026. This is the engineering contract for the complete frontend/backend/server-local SQLite application. Existing authentication, parsing, review and document editing work remains the foundation; named-user persistence and web registration extend that flow. Registration is implemented, and the new role/storage release awaits final CI, browser and deployment verification. This document is not production-security or government-compliance certification.

## Components and responsibilities

```text
Browser: bilingual application
  register / login / account state
  actual import / workbook mapping / evidence review
  English preview + editor / copy / download / print
  explicit save / list / open / delete
        ↓ same-origin HTTP + cookie + CSRF
Node 24 server
  authentication + server-assigned roles
  request limits / validation / user-scoped case operations
  PDF and workbook parser isolation
  consented DeepSeek Flash adapter
        ↓                       ↓
Private local SQLite        DeepSeek API
users + saved cases         minimal consented de-identified text
```

- `public/app.js`: UI, locale, request lifecycle, authenticated state, transient editing workspace and explicit save/open behavior
- `public/core.js`: known facts, evidence validation, review gates, English draft templates and CSV safety
- `public/agency-guidance.js`: bilingual official-source references and explicit unconfirmed acceptance
- `server.js`: HTTP routing, origin/CSRF enforcement, bounded parsing, provider calls and per-user persistence APIs
- `auth.js`: password verification, immutable session identity/role and session expiry
- `storage.js`: SQLite schema, user records, validated cases, own-user queries and version conflicts
- `workbook-worker.js`: actual XLS/XLSX parsing without executing workbook instructions, formulas or macros
- `Dockerfile` / `compose.yaml`: app runtime and one dedicated persistent volume; Sites is not a runtime dependency

## Identity and authorization

There are two product-facing access levels: **administrator** and **ordinary user**. The existing bootstrap owner is the administrator; wire roles are `owner` for administrator and `trial` for ordinary users (retained for compatibility). The administrator configures the shared provider connection. Ordinary users register with username/password and receive the ordinary role **from the server**; registration must reject/ignore any attempt to choose administrator privileges according to the strict request schema. No admin registration endpoint or self-promotion is implied.

Owner bootstrap remains a private environment/password-hash setup. Registration creates a password hash, not a plaintext-password record. Login creates a server-memory session with a host-only HttpOnly/SameSite=Strict cookie, Secure on HTTPS. State-changing requests require CSRF and origin checks. Browser state, hidden controls or a caller-supplied user ID do not confer authority.

Every case operation derives its user ID from the verified session. Administrator and ordinary users each access only their own cases; administrative provider privileges do not grant access to other users’ case content. Named trial identities, if retained for compatibility, have no provider-management privilege. Registration is not teams, sharing, public profiles, password recovery or identity verification.

## End-to-end lifecycle

1. **Register / sign in:** the user personally submits credentials over the verified HTTPS application; the backend validates and assigns the ordinary identity/role. Existing administrator uses owner bootstrap, not registration
2. **Import real material:** TXT/CSV are read as text; PDF uses the actual local parser; XLS/XLSX uses the actual isolated workbook parser. The user selects/maps real workbook cells. No default example or fake provider response is substituted
3. **Review input:** extracted reading order and source text are visible. Raw binaries are transient and are not saved as case attachments
4. **Extract when wanted:** explicit consent sends minimal de-identified text to `deepseek-flash`. Keys stay server-side. Response schema and source evidence are checked; output is unconfirmed until human review
5. **Review facts:** missing facts stay unknown, contradictory evidence is not silently resolved, and changes invalidate stale review/draft state
6. **Create an English artifact:** generate the supported supplementary document, preview/edit on the page, then copy/download/print. UI locale does not change formal output language or silently translate facts
7. **Save explicitly:** persist validated source text, reviewed fields, draft and case metadata to the signed-in user’s SQLite records. Unsaved edits remain browser state
8. **Resume safely:** list/open only own cases; use versioned updates and deletes. A stale `expectedVersion` returns 409 rather than overwriting another edit. Clear workspace/sign-out does not delete saved records

The five case facts remain a limited administrative model; they do not establish an agency-complete packet or authorized signatures. SFHA research guidance is separate from evidence identifying the actual case’s PHA.

## Trust and data boundaries

| Boundary | Data crossing | Required controls |
| --- | --- | --- |
| Browser → app authentication | User-entered credentials | Trusted HTTPS, bounded validation, password hashing, rate limits, no logging/export |
| Browser → parser | Authorized document bytes | Authentication, CSRF/origin, size/time/resource limits, no shell interpolation or credential-bearing parser environment |
| Browser → case storage | Source text, facts/evidence, English draft | Session-derived ownership, strict schema, size/case caps, version checks |
| App → DeepSeek | Minimal consented de-identified text | Server-held key, Flash-only model, explicit enablement, timeout/response bounds, no autonomous tools/actions |
| App → browser | Sanitized status, own case content, unconfirmed suggestions | No API keys/password hashes; safe rendering; no fabricated approvals |
| App → persistent disk | User password hashes and saved cases | Private SQLite path/volume, restricted permissions, no raw binary or provider-key storage |
| Browser → clipboard/download | Intended English artifact or CSV | User action, correct draft labeling, formula-prefix protection; never credentials |

Uploaded text, spreadsheets and model output are untrusted data, not instructions. A cited substring is evidence of textual presence, not proof of truth, correct field classification or agency acceptance.

## Persistence and secrets

Node 24’s SQLite implementation serves one application database. Docker mounts the dedicated `case_data` volume at `/data`; the database is `/data/nestlet.sqlite`. Direct development uses the explicit private `NESTLET_DB_PATH` configured for that launch. Keep databases/journals out of Git and images. Preserve the volume on upgrades/rollback; never `down --volumes` or prune it as cleanup. See [SQLite runtime](sqlite-runtime.md).

Source text, reviewed fields and drafts are durable only after Save. Raw PDF/Excel bytes are not retained. The current cap is 100 cases per user, with bounded payload/source/draft sizes. There is no automatic backup, version-history archive, database encryption claim or complete retention program. Deletion from the application is not a guarantee of forensic erasure from all storage layers.

The administrator may provide an initial API key in the private server environment or personally submit one through authenticated HTTPS Settings. Browser-submitted keys remain in server RAM and are lost at restart; an environment key may be reloaded. Sessions are also in RAM. Password hashes and saved cases persist in SQLite; provider keys are not exported or stored in case records.

## Failure and release contracts

- Missing auth/provider setup, rejected files, parser failures and provider failures produce explicit bilingual errors, not mock success
- Registration must be bounded and must not allow a requested role/user ID to override server-assigned identity
- Ownership and version checks apply on every case route, not only in the frontend
- A model-list check proves model access, not chat completion, billing capacity or document quality
- Current trial request counters are in memory (ten/user/hour, thirty total trial/hour), reset at restart and are not billing limits; the same caps apply to self-registered ordinary users whose wire role is `trial`
- Database initialization precedes a healthy service; do not silently create an unrelated empty store on a failed configured path
- Public certificate issuance, activation, application deployment, owner credentials and real-provider verification are separate release gates

Acceptance needs actual files, real HTTP/browser flows, two independent ordinary users and administrator scope tests, restart persistence, conflict handling, secret-leak checks and the exact deployed revision. Explicitly labeled TXT/CSV/PDF/XLSX/XLS samples are optional test material; they must not preload the app or stand in for a live model response. No completed customer pilot, time saving or ROI is claimed.

## Implemented registration interface

`POST /api/register` accepts exactly `{username,password,passwordConfirmation}` and returns HTTP 201 with an authenticated session `{csrfToken,role,userId,username}` plus the HttpOnly cookie. It assigns wire role `trial`, meaning ordinary user, without a provider call. `POST /api/login` remains `{username?,password}`; omitted/blank/`owner` uses the administrator bootstrap hash.

Usernames normalize to lowercase and allow 3–64 ASCII characters matching `[a-z0-9][a-z0-9_.-]*`; `owner` is reserved. Passwords are 6–256 characters without control characters and must match confirmation. Registration requires owner setup and exact Origin/HTTPS, with a narrow loopback-development exception, a 4 KiB body limit, five signup attempts per ten minutes globally and 100 ordinary accounts total. Sessions are capped at five/account and 512 globally, with 30-minute idle (unless `rememberMe: true` is selected)/eight-hour absolute expiry. No email verification, SSO or password-reset flow is implemented. Final QA remains pending.
