# Operator authentication and connection contract

The standalone Node app uses one operator account. It does not create an account, password, or API key automatically. The operator supplies a password hash privately; API credentials are either supplied in the server environment or entered through the authenticated HTTPS settings screen.

## Configuration

- `NESTLET_OPERATOR_PASSWORD_HASH`: `scrypt$<base64url 16-byte salt>$<base64url 32-byte derived key>`; fixed N=16384, r=8, p=1. Run `npm run hash-password` privately in an interactive terminal. Put the printed assignment in the server `.env`; preserve its single quotes and never put a password in command arguments or chat
- `PUBLIC_ORIGIN`: the browser's exact HTTPS origin for production, without a path, query, fragment, or credentials. A trailing slash is normalized. HTTP public origins cannot sign in or configure keys. Loopback-only development can sign in over HTTP, but web API-key configuration still requires HTTPS
- `HOST`: defaults to `127.0.0.1`; containers use `0.0.0.0` behind the configured HTTPS reverse proxy
- `DEEPSEEK_MODEL`: if supplied, must equal `deepseek-flash`. Other names fail startup; no alias or Pro fallback is selected
- `DEEPSEEK_API_KEY` and `ENABLE_LIVE_AI=true`: optional initial server configuration. An authenticated settings save can explicitly enable or disable live extraction independently of that initial preference

No parser/extraction/settings endpoint has an unauthenticated development bypass. Missing operator configuration returns 503 `OPERATOR_SETUP_REQUIRED`; a missing/expired session returns 401 `AUTH_REQUIRED`. The browser-only manual label/CSV tools do not call these endpoints.

## Session and transport

`POST /api/login` accepts JSON `{password}` and requires a matching Origin. Successful authentication returns `{authenticated:true,csrfToken}` and a `nestlet_session` cookie: HttpOnly, SameSite=Strict, host-only, Path=/, Secure for the configured HTTPS deployment. Sessions exist only in server memory, expire after 30 idle minutes or eight absolute hours, and are capped at ten. Ten sign-in attempts per minute are allowed for the single operator; no password or hash is logged.

Authenticated POST requests include `X-CSRF-Token` and the session cookie. Cross-site fetch metadata and mismatched Origins are rejected. A same-origin browser Origin is additionally mandatory for login and key-settings writes/tests. The application does not trust an upstream authenticated-user header.

`POST /api/logout` accepts `{}` with session and CSRF, revokes that server session and clears the cookie. Restarting the process invalidates every session and any key saved only in memory.

## Endpoints

| Endpoint | Access and behavior |
| --- | --- |
| `GET /api/health` | Public, `{ok:true}` only |
| `GET /api/status` | Public capabilities and nonsecret connection state; CSRF appears only for a valid session |
| `GET /api/settings` | Operator session; same sanitized settings state |
| `POST /api/settings` | Authenticated HTTPS, Origin and CSRF; `{apiKey?,enableLive:boolean}`; stores a replacement key in process memory only and returns sanitized state |
| `POST /api/settings/test` | Same guards; `{}`; checks the configured credential against official `GET https://api.deepseek.com/models` |
| `POST /api/document` | Session and CSRF; PDF body with explicit de-identified-document consent |
| `POST /api/workbook` | Session and CSRF; XLS/XLSX body with explicit de-identified-document consent |
| `POST /api/extract` | Session and CSRF plus configured/enabled provider; JSON `{text,consent:true}` |

Settings state contains `model`, `providerEndpoint`, `configured`, `liveEnabled`, `authConfigured`, `authenticated`, `secureSettings`, `operatorSetupInvalid`, `connectionVerifiedAt`, and `keyStorage`. A session additionally receives `csrfToken`. No API-key bytes, password, or password hash are returned.

A saved credential is **configured, not verified**. `connectionVerifiedAt` remains null until a successful explicit model-access check. That check returns `{ok:true,model,verifiedAt,check:'model-access',chatCompletionTested:false}`. It does not prove chat completion, account billing availability, real document extraction quality, or data-processing suitability. Changing configuration during a check prevents the old result from marking the new configuration verified. Extraction retries retain the credential snapshot with which they began.

Settings writes/tests are capped at ten per minute, with one connection check in flight. Tests use only disposable test credentials; no real provider credential or paid live request has been used in acceptance so far.

## Stable error codes

`OPERATOR_SETUP_REQUIRED`, `AUTH_REQUIRED`, `CSRF_REJECTED`, `ORIGIN_REJECTED`, `HTTPS_REQUIRED`, `INVALID_CREDENTIALS`, `LOGIN_RATE_LIMITED`, `SETTINGS_RATE_LIMITED`, `INVALID_SETTINGS`, `API_KEY_REQUIRED`, `CONNECTION_FAILED`, `MODEL_UNAVAILABLE`, `SETTINGS_CHANGED`, `LIVE_DISABLED`, and `BUSY`.

Error responses have `{error,code}`. The frontend localizes codes; it must not display a successful connection based solely on a saved key or on an unauthenticated status response.
