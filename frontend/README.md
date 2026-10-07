# React / shadcn integration contract

This directory is the JavaScript/JSX frontend. No TypeScript application source is used. `/` serves the integrated account/chat/customer/material/document build; `/next/` is an alias and `/legacy/` explicitly serves the previous `public/app.js` workspace. `/next/#components` is the separate component QA route. Implementation and development tests do not replace exact-build browser/provider acceptance.

## Shared foundation

- Vite root: `frontend/`; alias `@/` points here
- `@/components/ui/*`: actual shadcn New York / Radix components; imports use named exports from the official component API
- `@/lib/utils`: `cn(...classes)`
- `@/lib/api`: `createApiClient`, `ApiError` (`code`, `status`, `details`); never display raw server exception prose
- `@/lib/session`: `SessionProvider`, `useSession`
- `styles.css`: Kimi's Working Paper colors and typefaces mapped to semantic shadcn tokens; no legacy CSS import

`useSession()` returns `{status, loading, error, recovery, api, journey, refresh, login, register, logout}`.

- `status` is the `/api/status` body, including `authenticated`, `userId`, `username`, `role`, `canManageSettings`, `authConfigured`, `registrationEnabled`, `emailDeliveryConfigured`, `email`, `emailVerified`, `emailBindingRequired`, `passwordRecoveryMethod`, `secureLogin`, `secureSettings`, and provider capabilities
- `api.get(path, {signal})`; `api.post/put/patch/delete(path, body, {signal})`; `api.request(path, {method, body, signal})`
- Responses are parsed JSON, not `Response` objects. Cookie/CSRF handling is automatic. An aborted read rejects with `AbortError`; other failures are `ApiError`
- `login({email,password,rememberMe})` or existing-account `login({username,password,rememberMe})`; `register({email,password,passwordConfirmation})` returns an accepted verification request and never creates a session; `logout()`; `refresh({signal})`
- The session stores only current account/capability state in memory. Do not write passwords, keys, email-link tokens, or CSRF tokens to local/session storage. The existing explicit remember-me option may store only a validated legacy username; email identifiers are not persisted by this implementation
- Settings updates use `api.post('/api/settings', payload)` then `refresh()`
- Raw local files use `api.upload(path, file, {contentType, filename, assetConsent: true, signal})`; `/api/assets` persists the original only after the feature's explicit save action. The helper URL-encodes `filename`, sends exact raw bytes/MIME and adds `X-Asset-Consent: persist-private`. Legacy PDF/workbook parser routes use `documentConsent: true` instead. This does not imply AI transmission consent
- `journey` is the optional bounded, current-tab first-party action observer. See `docs/react-journey-observability.md`; it accepts fixed metadata only. Shared API observes exact parser/case writes. Background reads are omitted; an explicit case-open read may use `{telemetry: true}`. Feature-owned operations use `{telemetry: false}` to avoid duplicates. Observer failure never changes business success
- Streaming chat uses its own streaming fetch and the current `status.csrfToken`. Do not send the token anywhere except the same-origin application API

## Feature boundaries

### Official-source references

The authenticated root workspace mounts `components/agency-guidance.jsx` above Conversation, Materials & facts, and Documents. It uses the existing bilingual `public/agency-guidance.js` registry in a collapsed native disclosure with shadcn Label/NativeSelect and existing design tokens. Official titles remain in their source language. Edition metadata, source-check date, conditional preparation notes and the printed OMB caution remain available inside the disclosure; applicability is visibly unconfirmed even while collapsed.

App owns the transient reference selector, initially SFHA for research. This is separate from the saved `pha` fact: it never writes case data, changes document readiness, or inserts an agency into a generated document. It survives view/language changes in the workspace and resets when another case/account opens or the page reloads. The choice is not a persisted case setting. Chat receives the selected ID for subsequent requests; only server-owned registry text can become reference context. Source observations are not fetched or reverified for each request.

Each feature owns only its directory and tests. Foundation owner integrates App/navigation after modules are ready.

| Directory | Public component |
| --- | --- |
| `features/auth/` | `AuthPanel({lang = 'zh', onAuthenticated})`, `SettingsPage({lang = 'zh'})` |
| `features/chat/` | `ChatPage({lang = 'zh', caseId, onCaseChange})` |
| `features/customers/` | `CustomersPage({lang = 'zh', onOpenCase})` |
| `features/documents/` | `DocumentsPage({lang = 'zh', caseId})` |
| `features/intake/` | `IntakePage({lang = 'zh', caseId, onCaseChange, onDirtyChange, importRequest, onImportHandled, onOpenDocuments, active = true})` |

Use `index.jsx` as each feature's public export. `caseId` is a saved-case UUID or `null`. `onOpenCase(caseId)` and `onCaseChange(caseId)` update App's selected case. App owns navigation/locale and keys the account workspace by `status.userId` to discard another account's transient state.

ChatPage and DocumentsPage may also report `onDirtyChange(boolean)`. App guards opening a different saved case when either has unsaved work. `onCaseChange(newId)` from ChatPage binds the just-saved current work, so that callback does not trigger a second leave-work confirmation. Already visited pages stay mounted under `hidden` during normal navigation; changing account unmounts them all. Features must still abort and epoch-guard old case requests.

Chat forwards non-image files through `onImportFiles(files, {caseId,userId})`. App scopes the short-lived request to the active account/case and navigates to Intake. Intake adopts it only when both still match, then calls `onImportHandled(request.id)`. A case switch clears pending File objects. Documents receives `active` for safe read-only refresh on reentry plus `onOpenIntake()` to return to materials.

Use Chinese by default and complete English alternatives, including loading/empty/error states. Preserve unknowns, source provenance, case optimistic versions, and user confirmation gates. Use synthetic fixtures only. Do not silently fall back to fake data on failed API calls.

## Components

Available official components: Button, Input, Card, Dialog, Label, Textarea, Tabs, NativeSelect, Select, Badge, Alert, Separator, Checkbox, Skeleton. Button variants are `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`; sizes are `default`, `xs`, `sm`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`.

## Expiry recovery

`@/lib/suspended-draft` exports `useSuspendedDraft(feature)` returning `{restored, saveDraft, clearDraft, cacheStatus}`. App supplies a verified account/workspace scope. Features validate their restored schema and server version, cache only unsaved text/form edits, clear after an explicit successful save, and do not clear on unmount. The session provider alone authorizes the singleton vault after a real successful session response.

The vault is current-tab memory only: 512 KiB per entry, 1 MiB total, 30 minutes from suspension, no silent eviction, no credentials, Files/Blobs, encoded image data, settings or retained message history. Reads are sealed on expiry; different verified identities and explicit sign-out discard entries. Closing or refreshing the tab also loses this temporary recovery. Cache refusal must remain visible; nothing here claims a server save.

Prefer in-page panels and native selection for core flows while CSP compatibility is verified. Do not add `unsafe-inline` or loosen script security to make an interaction work. Modal/portal controls require actual browser keyboard, focus-return, and CSP checks before acceptance.

The shadcn CLI is not a build/runtime dependency: checked-in official JSX sources, their provenance manifest and license are sufficient. It was removed from the locked development dependencies after its transitive dependency audit reported advisories. Component maintenance can use the pinned-source `scripts/vendor-shadcn.mjs` path; re-check the official CLI's current security/dependency status before any future temporary invocation.

## Commands and evidence

`npm run build` emits only compiled public assets into `public/next/`; Node backend stays JavaScript. `npm run dev:frontend` starts Vite locally. Production-like browser testing uses a built frontend and the real Node server, so CSP and same-origin checks are exercised. Passing mocks or a preview page cannot certify real-provider, email, full workflow, or deployment acceptance.

## Entry routes and modal CSP

Each built React HTML response at `/`, `/next`, or `/next/` receives a fresh cryptographically random 144-bit style nonce and `Cache-Control: no-store`. The matching meta value is passed to the supported `get-nonce` API before rendering. Radix scroll locking can then attach its trusted style element with that nonce. Script policy remains `script-src 'self'`; style attributes and arbitrary inline styles/scripts are not permitted. `/legacy/` retains its previous strict policy without a nonce. No build or partially missing JS/CSS produces an explicit bilingual 503.

The production root browser gate covers product journeys and responsive navigation, while `/next/#components` separately exercises repeated modal focus, dismissal, scroll-lock restoration and zero CSP violations. HTTP nonce/route tests are distinct from the browser gate; neither certifies live-provider calls.

## Email account release boundary

The email UI requires the schema5 API in the same release. Registration is email-only and returns202 without authenticating. Existing usernames remain supported for login. Email delivery status is supplied by `/api/status`; absent configuration keeps registration and email-request actions unavailable and never implies delivery. Request success is deliberately generic and does not establish eligibility, account existence, inbox receipt, or live mail-provider acceptance.

`main.jsx` captures trusted root `/#auth=verify&token=...` or `/#auth=reset&token=...` fragments before React effects, removes the fragment with `replaceState`, and keeps the token in a clearable memory closure. Neither opening a link nor a GET consumes it. Verification requires an explicit button; reset requires matching passwords. Submission removes the local token even if the network result is uncertain. Reopen the email or request a fresh link to retry. Link tokens never enter route telemetry, markup, localStorage, sessionStorage, or logs. Navigation, closing the link, pagehide, and account changes discard the token. Server expiration remains authoritative.

Authenticated existing accounts bind email with their current password and the current CSRF token. They remain pending until explicit inbox verification and status refresh. Wrong binding passwords do not expire an otherwise valid session; genuine AUTH_REQUIRED does. Password reset invalidates previous sessions on the server. Administrator/bootstrap recovery is explicitly unavailable by email in this release and must be performed by the administrator personally in the private server setup flow.

See `features/auth/README.md` for test scope. Real browser, DirectMail delivery, and deployment acceptance remain separate gates.

## Explicit chat workflow bridge

Chat additionally accepts `onReviewMessage(request)`, `onOpenMaterials()`, `onOpenDocuments({userId,caseId})` and `active`. App owns the short-lived account/case/message-scoped text-review request and passes `textReviewRequest`/`onTextReviewHandled(id)` to Intake. Intake previews it separately, then only appends its unreviewed source text on an explicit action. It never replaces a buffer or confirms a fact. Chat's document continuation returns to pending material first and otherwise opens the already-mounted Documents editor without changing its edits. Complete assistant messages may explicitly save source-linked, unreviewed draft artifacts; final generation remains in the established reviewed workflow. See `features/chat/WORKFLOW.md` and `features/chat/ORIGINAL-RETENTION.md` for invariants, evidence and limits.
