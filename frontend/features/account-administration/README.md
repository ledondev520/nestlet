# Owner account administration

## Integration contract

Import `AccountAdministration` and optional `OperationalDiagnostics` from `./features/account-administration/index.jsx`. Both accept `{ lang = 'zh', active = true }` and must be inside the existing `SessionProvider`. The unified frontend mounts both components from `features/auth/settings-page.jsx` on Account and settings and passes its `active` state. The wrappers still own capability gating and inactive cleanup; no separate privileged route or navigation role inference was added.

For controlled API fixtures or composition, `AccountAdministrationPanel` and `OperationalDiagnosticsPanel` take `{ api, status, lang = 'zh', active = true }`. `api` is the existing same-origin client (`get(path, { signal })` and `put(path, body, { signal })`); its session-cookie, CSRF and unauthorized-session behavior remain authoritative.

Account management mounts only when all four checks are exact: `authenticated === true`, `userId === 'owner'`, `role === 'owner'`, and `canManageAccounts === true`. The diagnostics component independently requires an authenticated user identity and `canViewDiagnostics === true`. Delegated administrators never obtain an account-directory request from the management component. Inactive and unauthorized panels render nothing. Replacing the session identity, role, CSRF binding or authority remounts the inner panel, aborting old operations and removing the previous roster.

### API shape

- `GET /api/admin/accounts` → `{ accounts: [{ id, username, role: 'owner' | 'trial', email: string | null, emailVerifiedAt: number | null, createdAt, administrator: boolean, capabilityVersion: nonnegativeSafeInteger, canGrantAdministrator: boolean }] }`
- `PUT /api/admin/accounts/:id/administrator` → exact body `{ administrator: desiredBoolean, expectedVersion: selectedCapabilityVersion }`, response `{ account: sameAccountShape, changed: boolean }`
- Optional `GET /api/admin/diagnostics` → `{ model: 'deepseek-flash', liveEnabled: boolean, pdfEnabled: boolean, workbookEnabled: boolean, uptimeSeconds: nonnegativeSafeInteger, activeRequests: { chat, extraction, pdf, workbook } }`, all four counts nonnegative safe integers

`createdAt` accepts a valid date string or a valid nonnegative numeric timestamp. Verified-email timestamps are nonnegative safe integers. Unknown response fields are dropped before entering UI state. Missing/malformed fields and duplicate account IDs produce an explicit error, not a partial actionable list or fabricated empty state. The backend must independently enforce all access, version and grant rules; these frontend checks are not an authorization boundary.

## Interaction and lifecycle

1. Owner entry reads the account directory once. The persisted owner/trial role is displayed as distinct Owner, Administrator or Ordinary user access labels.
2. The owner row is immutable. A new administrator grant needs both a verified bound email and the server's `canGrantAdministrator` flag. Legacy accounts receive a bind-and-verify-first explanation. Existing administrator access can still be revoked when email verification is absent.
3. Grant/Revoke opens a focused in-page confirmation with target identity and bounded consequences. Cancel returns focus and sends nothing. There is no toggle or automatic write.
4. Confirm submits a single versioned intent. A synchronous operation lock prevents duplicate clicks. The old directory becomes unavailable while the write is in flight.
5. An accepted response is followed by a fresh GET, with no optimistic roster replacement. Only that read restores actionable rows. The response explains whether a change was acknowledged or no change was needed.
6. Conflict, uncertainty, permission failures, invalid responses, and post-write refresh failures remove all actionable rows. They do not retry or replay a write; the owner must explicitly reload and make a new selection/confirmation.
7. Inactive navigation, unmount, session/role/authority changes and pagehide abort operations and ignore late results. A late successful write cannot start a refresh after its panel was discarded. Pagehide clears the mounted panel and requires manual reload. A newly mounted active panel makes a fresh read.

Chinese is the default; English covers loading, empty, errors, access descriptions and confirmations. The copy explicitly excludes other users' cases/files, provider secrets/settings, account grants and global telemetry from administrator access. Optional diagnostics is read-only, with no account-directory access or settings mutations. No account information, credentials or operation state is persisted to browser storage.

## Evidence limits

`model.test.js` validates response boundaries and capability rules. `panel.dom.test.js` uses actual React through Vite with JSDOM and synthetic controlled API responses; its wrapper check exercises the existing API client's CSRF and same-origin request construction. It does not contact an actual API, real provider or production service, and is not Chromium, responsive-layout, CSP or screen-reader acceptance.

Run focused checks with `node --test frontend/features/account-administration/*.test.js`. The repository's `npm run test:frontend` glob includes these files. Real HTTP integration, final application mounting, real-browser desktop/mobile/keyboard/CSP checks, backend capability enforcement and deployment each need separate evidence.

`settings.http-dom.test.js` exercises the mounted full App through actual local HTTP/SQLite and React DOM events: owner entry, immutable owner/unverified legacy eligibility, keyboard-focus target, cancel/no PUT, inactive roster removal, explicit grant/revoke with one audit per change, same-cookie delegated diagnostics, ordinary UI, account isolation, and no provider calls. Enrollment uses a disclosed simulated mail transport. The official-CI browser scenario is prepared separately and remains unrun locally.
