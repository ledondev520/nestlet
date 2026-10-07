# Owner, trial and saved-case authentication contract

The standalone Node app has one owner identity and optional named trial identities. Trial users and SQLite saved cases are implemented at the October 7, 2026 checkpoint, awaiting final CI/browser/deployment verification. Self-service username/password registration is implemented with server-assigned ordinary roles, pending final CI/browser/deployment verification. There is no shared team account, automatic password creation or administrator selection during registration. The operator supplies a password hash privately; API credentials are either supplied in the server environment or entered through the authenticated HTTPS settings screen.

## Configuration

- `NESTLET_OPERATOR_PASSWORD_HASH`: `scrypt$<base64url 16-byte salt>$<base64url 32-byte derived key>`; fixed N=16384, r=8, p=1. Preferred initial setup: the operator personally runs `npm run setup-operator -- /opt/nestlet/shared/runtime.env` in a private interactive terminal, using the file owner's account (sudo if root-owned). It prompts twice without echo, requests a final `SET OPERATOR` confirmation, and atomically updates only this key without printing the password or hash. The existing file must be mode 0600, regular, owned by the current effective user, and reached without symlinks. Other environment lines remain unchanged. Restart Nestlet afterward. `npm run hash-password` remains an advanced private-owner tool; do not copy its output through chat
- `PUBLIC_ORIGIN`: the browser's exact HTTPS origin for production, without a path, query, fragment, or credentials. A trailing slash is normalized. HTTP public origins cannot sign in or configure keys. Loopback-only development can sign in over HTTP, but web API-key configuration still requires HTTPS
- `NESTLET_DB_PATH`: explicit private absolute SQLite path; Docker uses `/data/nestlet.sqlite` on the dedicated case-data volume. Node 24 is required. User identities/password hashes and saved cases persist there; API credentials do not
- `HOST`: defaults to `127.0.0.1`; containers use `0.0.0.0` behind the configured HTTPS reverse proxy
- `DEEPSEEK_MODEL`: if supplied, must equal `deepseek-flash`. Other names fail startup; no alias or Pro fallback is selected
- `DEEPSEEK_API_KEY` and `ENABLE_LIVE_AI=true`: optional initial server configuration. An authenticated settings save can explicitly enable or disable live extraction independently of that initial preference

No parser/extraction/settings endpoint has an unauthenticated development bypass. Missing operator configuration returns 503 `OPERATOR_SETUP_REQUIRED`; a missing/expired session returns 401 `AUTH_REQUIRED`. The browser-only manual label/CSV tools do not call these endpoints.

## Session and transport

`POST /api/login` accepts JSON `{password,username?}`; blank/omitted username selects `owner`, while a named trial uses its assigned username. Login requires a matching Origin. Successful authentication returns `{authenticated:true,csrfToken}` and a `nestlet_session` cookie: HttpOnly, SameSite=Strict, host-only, Path=/, Secure for the configured HTTPS deployment. Sessions exist only in server memory, expire after 30 idle minutes or eight absolute hours, with at most five sessions per user and 512 total. Ten sign-in attempts per minute are allowed across this small service; no password or hash is logged.

Authenticated state-changing requests include `X-CSRF-Token` and the session cookie. Cross-site fetch metadata and mismatched Origins are rejected. A same-origin browser Origin is additionally mandatory for login and key-settings writes/tests. The application does not trust an upstream authenticated-user header.

`POST /api/logout` accepts `{}` with session and CSRF, revokes that server session and clears the cookie. Restarting the process invalidates every session and any key saved only in memory.

## Endpoints

| Endpoint | Access and behavior |
| --- | --- |
| `POST /api/register` | Bounded same-origin HTTPS registration; assigns ordinary `trial` role, creates session; owner bootstrap required |
| `GET /api/health` | Public, `{ok:true}` only |
| `GET /api/status` | Public capabilities and nonsecret connection state; CSRF appears only for a valid session |
| `GET /api/settings` | Owner session only; same sanitized settings state |
| `POST /api/settings` | Owner-only authenticated HTTPS, Origin and CSRF; `{apiKey?,enableLive:boolean}`; stores a replacement key in process memory only and returns sanitized state |
| `POST /api/settings/test` | Same owner-only guards; `{}`; checks the configured credential against official `GET https://api.deepseek.com/models` |
| `POST /api/document` | Session and CSRF; PDF body with explicit de-identified-document consent |
| `POST /api/workbook` | Session and CSRF; XLS/XLSX body with explicit de-identified-document consent |
| `POST /api/extract` | Owner/trial session and CSRF plus configured/enabled provider; JSON `{text,consent:true}`; trial request caps apply |
| `GET /api/cases` | Session; list only that user’s saved cases |
| `GET /api/cases/:id` | Session; fetch only that user’s case, otherwise 404 |
| `POST /api/cases` | Session, Origin and CSRF; create a case for the session identity |
| `PUT /api/cases/:id` | Same guards, own-user scope and `expectedVersion`; stale version returns 409 |
| `DELETE /api/cases/:id` | Same guards, own-user scope and `{expectedVersion}`; stale version returns 409 |

Authenticated status also reports the server-established user identity/role and settings-management capability; clients cannot grant themselves ownership. `caseStorageEnabled` reports the storage capability. Settings state contains `model`, `providerEndpoint`, `configured`, `liveEnabled`, `authConfigured`, `authenticated`, `secureSettings`, `operatorSetupInvalid`, `connectionVerifiedAt`, and `keyStorage`. A session additionally receives `csrfToken`. No API-key bytes, password, or password hash are returned.

A saved credential is **configured, not verified**. `connectionVerifiedAt` remains null until a successful explicit model-access check. That check returns `{ok:true,model,verifiedAt,check:'model-access',chatCompletionTested:false}`. It does not prove chat completion, account billing availability, real document extraction quality, or data-processing suitability. Changing configuration during a check prevents the old result from marking the new configuration verified. Extraction retries retain the credential snapshot with which they began.

Settings writes/tests are capped at ten per minute, with one connection check in flight. Tests use only disposable test credentials; no real provider credential or paid live request has been used in acceptance so far.

## Stable error codes

`OPERATOR_SETUP_REQUIRED`, `AUTH_REQUIRED`, `CSRF_REJECTED`, `ORIGIN_REJECTED`, `HTTPS_REQUIRED`, `INVALID_CREDENTIALS`, `LOGIN_RATE_LIMITED`, `SETTINGS_RATE_LIMITED`, `INVALID_SETTINGS`, `API_KEY_REQUIRED`, `CONNECTION_FAILED`, `MODEL_UNAVAILABLE`, `SETTINGS_CHANGED`, `LIVE_DISABLED`, and `BUSY`.

Error responses have `{error,code}`. The frontend localizes codes; it must not display a successful connection based solely on a saved key or on an unauthenticated status response.

## Role and saved-case isolation

Session identity and role are established server-side. Neither request bodies nor a guessed case ID can select another owner. Both the owner and a named trial list/read/write/delete only their own cases; the owner is not given an all-users case browser. Cross-user requests return not-found. Trial users cannot read/write/test provider settings. Missing owner configuration still fails closed before trial use.

Named trial creation/rotation is a private user-run CLI operation: `node scripts/setup-trial-user.js /absolute/nestlet.sqlite username`. Hidden password prompts and explicit confirmation are required; no real credentials were created in development. A rotation retains the user’s cases and invalidates sessions tied to the prior credential fingerprint. See [SQLite runtime](sqlite-runtime.md) for lifecycle and container instructions.

Explicit saves retain the title, source text, field values/evidence/review states, draft type/text and permitted provenance flags. Raw upload binaries, API credentials and unknown payload properties are not stored as case content. Limits are 100 cases per user, 256 KiB canonical case payload, and 50,000 characters each for source/draft text. Updates/deletes require a positive integer `expectedVersion`; a stale version yields `CASE_CONFLICT`/409 instead of overwriting newer data.

Saved data survives restart through the dedicated SQLite volume; sessions and RAM-only provider keys do not. No automatic backup or full audit/history system is implemented. Preserve the data volume during deployment and rollback; never use volume removal/pruning as routine cleanup.

Trial AI extraction requests are limited to ten per user/hour and thirty total trial requests/hour in server memory. Restart resets counters. These limits do not establish a hard spending cap, paid subscription or billing guarantee. `TRIAL_LIMIT_REACHED` returns 429. Role/storage errors include `OWNER_REQUIRED`, `CASE_NOT_FOUND`, `CASE_CONFLICT`, `CASE_INVALID`, `CASE_TOO_LARGE` and storage/cap errors emitted by the actual route contract; do not substitute success on failure.

## Implemented registration extension: final QA pending

Ordinary/admin product roles and web registration are user-authorized scope. The existing owner identity remains the administrator bootstrap, configured privately. A new registrant provides username/password only; the server hashes the password and assigns an ordinary role. Client-supplied role/user IDs cannot grant privileges. `POST /api/register` accepts exactly `{username,password,passwordConfirmation}`. It returns HTTP 201 and `{csrfToken,role,userId,username}` with an authenticated HttpOnly-cookie session. The server assigns internal role `trial` for ordinary users; `owner` is the administrator. No provider request occurs on registration.

Username rules: normalize lowercase, 3–64 ASCII characters matching `[a-z0-9][a-z0-9_.-]*`, with `owner` reserved. Password rules: 12–256 characters, no controls, matching confirmation. Owner bootstrap is required first. Exact Origin and HTTPS are required except narrow loopback development. The body is bounded at 4 KiB, signup attempts at five per ten minutes globally, and ordinary accounts at 100 total. No email, SSO or password reset is included. Status reports `registrationEnabled`, role and `canManageSettings`; provider configuration metadata is owner-only.

Ordinary users can parse/review/generate and save/open/delete only their own cases. They cannot manage provider credentials or inspect another user’s records. The administrator likewise accesses only administrator-owned cases. Existing trial CLI identities remain a separate compatibility path. These interfaces are implemented; registration, ownership, rate limits and final real-browser/deployed behavior still require final QA. See [architecture](architecture.md).
