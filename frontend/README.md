# React / shadcn integration contract

This directory is the JavaScript/JSX frontend. No TypeScript application source is used. The legacy `public/app.js` stays available during migration; `/next/` serves the integrated account/chat/customer/material/document build. `/next/#components` is the separate component QA route. Implementation and development tests do not replace exact-build browser/provider acceptance.

## Shared foundation

- Vite root: `frontend/`; alias `@/` points here
- `@/components/ui/*`: actual shadcn New York / Radix components; imports use named exports from the official component API
- `@/lib/utils`: `cn(...classes)`
- `@/lib/api`: `createApiClient`, `ApiError` (`code`, `status`, `details`); never display raw server exception prose
- `@/lib/session`: `SessionProvider`, `useSession`
- `styles.css`: Kimi's Working Paper colors and typefaces mapped to semantic shadcn tokens; no legacy CSS import

`useSession()` returns `{status, loading, error, api, refresh, login, register, logout}`.

- `status` is the `/api/status` body, including `authenticated`, `userId`, `username`, `role`, `canManageSettings`, `authConfigured`, `registrationEnabled`, `secureLogin`, `secureSettings`, and provider capabilities
- `api.get(path, {signal})`; `api.post/put/patch/delete(path, body, {signal})`; `api.request(path, {method, body, signal})`
- Responses are parsed JSON, not `Response` objects. Cookie/CSRF handling is automatic. An aborted read rejects with `AbortError`; other failures are `ApiError`
- `login({username,password})`; `register({username,password,passwordConfirmation})`; `logout()`; `refresh({signal})`
- The session stores only current account/capability state in memory. Do not write passwords, keys, or CSRF tokens to local/session storage
- Settings updates use `api.post('/api/settings', payload)` then `refresh()`
- Raw local files use `api.upload(path, file, {contentType, filename, assetConsent: true, signal})`; `/api/assets` persists the original only after the feature's explicit save action. The helper URL-encodes `filename`, sends exact raw bytes/MIME and adds `X-Asset-Consent: persist-private`. Legacy PDF/workbook parser routes use `documentConsent: true` instead. This does not imply AI transmission consent
- Streaming chat uses its own streaming fetch and the current `status.csrfToken`. Do not send the token anywhere except the same-origin application API

## Feature boundaries

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
