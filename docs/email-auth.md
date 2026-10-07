# Email authentication

Implemented contract, 2026-10-07. Runtime/HTTP, service-contract, real-provider and browser evidence are separate; see validation.md for exact checks.

## Accounts and migration

New public registrations require email, password and matching confirmation. A pending registration does not create a `users` row or session. After the mail provider accepts the one-time link and the user explicitly verifies it, a normal `trial` identity is created. Only the server assigns the role. Existing usernames, administrator aliases, IDs, customer/case history and credentials remain valid.

Schema **5** is additive: `email_identities`, `email_actions`, and `email_rate_buckets`. The existing `users` table and its owner/trial CHECK constraint are unchanged. A verified email is canonicalized by trimming and lowercasing **ASCII only**, is unique, and belongs to one immutable user ID. No provider-specific dot/plus folding occurs. Non-ASCII email addresses are not supported in this release. Email is not inferred from an existing username.

An existing user signs in with the old username and current password, then requests email binding. Binding requires an authenticated session, CSRF and current-password proof, followed by email-link proof. The original user ID and all scoped data remain intact. A verified binding cannot be changed through this initial binding endpoint.

## Bootstrap owner exception

The owner's effective credential remains `NESTLET_OPERATOR_PASSWORD_HASH`; no owner password hash is written to SQLite. An owner may verify an email binding and use that email with the existing owner password. Owner password recovery remains the established **private bootstrap-password recovery** flow, where the operator enters and submits the new password and restarts the service. The interface reports `passwordRecoveryMethod: "private-bootstrap"` for the owner. The generic public forgot-password response does not promise an owner reset email, and no owner reset action is issued. This release has no owner credential override or recovery opt-in.

## HTTP contract

All POST routes require the exact configured Origin. HTTPS is required outside loopback development. Mutation bodies are bounded at 4 KiB. Enrollment and mail requests are unavailable until operator authentication, a trusted PUBLIC_ORIGIN and DirectMail configuration are present.

| Endpoint | Body | Success |
| --- | --- | --- |
| POST /api/register | email, password, passwordConfirmation | 202 generic request acceptance, no session |
| POST /api/auth/email/resend | email | 202 generic request acceptance |
| POST /api/auth/email/verify | token | 200 verified:true, authenticated:false |
| POST /api/login | email,password **or** legacy username,password; optional Boolean rememberMe | 200 authenticated session |
| POST /api/auth/password/forgot | email | 202 generic request acceptance |
| POST /api/auth/password/reset | token,password,passwordConfirmation | 200 reset:true, authenticated:false |
| POST /api/auth/email/bind | email,currentPassword | 202 generic request acceptance; session + CSRF required |

The common 202 body is `{accepted:true,authenticated:false,next:"check-email-if-eligible",retryAfter:60}`. It means only that the request was accepted for eligible processing. It does not state that an account exists, mail was sent, the provider accepted it, or it reached an inbox. Existing, unknown, duplicate and per-email-suppressed addresses receive the same body. Provider work runs after the response path, so eligible-account latency does not wait on an external mail service. Mail failures leave registration challenges unready for retry, remove recovery/binding challenges, and remain generic publicly; sanitized owner diagnostics distinguish provider outcomes.

`GET /api/status` includes `emailDeliveryConfigured` and `registrationEnabled`. Signed-in users also receive their own `email`, `emailVerified`, `emailBindingRequired` and `passwordRecoveryMethod` (`email`, `bind-email` or `private-bootstrap`). Only the owner sees `emailDelivery` diagnostics; these contain configuration/last-attempt status and time, never recipient, token, body, keys or provider response.

Errors: EMAIL_DELIVERY_UNAVAILABLE (503), EMAIL_AUTH_INVALID (400), EMAIL_TOKEN_INVALID (400), EMAIL_AUTH_RATE_LIMITED (429), EMAIL_ALREADY_BOUND (409), INVALID_CREDENTIALS (401), REGISTRATION_INVALID (400), plus existing Origin/CSRF/setup/HTTPS/JSON guards.

## One-time link and password security

- Passwords are 6–256 JavaScript string characters, reject control characters, and use the existing scrypt format and work factor
- Tokens are 32 random bytes, 43 canonical base64url characters. Only SHA-256 hashes are stored. The token's 256-bit entropy requires no shared JWT secret; no Jiesong JWT secret is copied
- Verification/binding expires after 10 minutes; password-reset links after 30 minutes. Tokens are single-use, purpose-isolated and accepted only after a well-formed DirectMail acceptance receipt
- Links use only configured PUBLIC_ORIGIN and root fragments: `/#auth=verify&token=...` or `/#auth=reset&token=...`. Request Host/forwarded headers never construct a link. Fragments do not enter HTTP access logs or Referer; the frontend clears them after capture. GET never consumes a token
- Resend replaces the previous pending registration token. An expired registration requires starting registration again because its password hash is no longer retained
- Verification, unique identity creation and reset consumption run in SQLite write transactions. Bind/reset links are tied to a credential fingerprint; password rotation invalidates old links
- Upstream session behavior is preserved: 30-minute normal idle timeout, opt-in remembered sessions up to eight hours, and an eight-hour absolute cap for both. Sessions remain in memory; restart revokes them
- Every normal and remembered session checks the effective credential fingerprint; reset invalidates all old sessions. Login rechecks a trial credential after asynchronous scrypt, closing a reset-during-login race
- No password, raw token, email body or recipient enters logs or operational telemetry. Emails, pending password hashes and token hashes remain private database data. Backups require the same access protection as account data
- There is no durable raw-token outbox. A process restart during a send may leave an unusable pending challenge. Request a new link; the application never fabricates acceptance or silently retries an uncertain send

## Bounded mail and verification traffic

Mail requests reserve persistent limits before sending: one/mailbox/minute, five/mailbox/hour, twenty/socket-IP/hour and sixty/global/hour. Mailbox suppression is generic 202; IP/global exhaustion is 429. Different mail request endpoints share these quotas. Tokens are already unguessable, and claim attempts are additionally bounded at sixty/socket-IP/10 minutes and six hundred/global/10 minutes. Rate rows are hashed and expire; their table is capped at 4,096 rows. Pending registrations are capped at 100, alongside the existing 100 ordinary-user cap.

The socket IP is used, and untrusted X-Forwarded-For is ignored. Behind the current single reverse proxy, users may share the twenty/hour socket-IP budget. This is a deliberate conservative bound, not a per-browser guarantee. Adding trusted proxy identity or raising quotas requires an explicit deployment review.

## Reuse the existing Alibaba Cloud service

Transport matches Jiesong's Alibaba Cloud DirectMail RPC pattern: fixed `https://dm.aliyuncs.com/`, `SingleSendMail`, API version `2015-11-23`, region `cn-hangzhou`, canonical HMAC-SHA1 RPC signing, optional STS, no redirect/retry, 10-second full-response timeout, 64 KiB response limit. A success requires HTTP success, nonempty `RequestId`/`EnvId` and no `Code`. This proves **provider acceptance only**, never inbox delivery.

Required runtime names, all blank by default:

- `ALIBABA_CLOUD_ACCESS_KEY_ID`
- `ALIBABA_CLOUD_ACCESS_KEY_SECRET`
- `NESTLET_EMAIL_FROM`, an existing approved and verified DirectMail sender
- Optional `ALIBABA_CLOUD_SECURITY_TOKEN`
- Existing `PUBLIC_ORIGIN`, the exact HTTPS Nestlet origin

The display alias is `Nestlet`. No SMTP, Resend, new paid service, SDK dependency, Jiesong sender auto-discovery or credential copying is included. The owner configures existing credentials privately using the authorized secure deployment flow; credentials never go into Git, browser settings, chat or test fixtures. First real test sending requires an authorized recipient and configured provider. Historical delivery from another application does not certify this deployment's keys, permissions, quota or inbox delivery.

## Upgrade and rollback

Before migration, take and verify a private database/original-asset backup with the established helper. The updated helper supports schemas 1–5; container checks expect schema 5. Existing schema4 application binaries intentionally refuse a schema5 database. Therefore the earlier schema4→schema4 code-only rollback helper **must not** be used for this release. A compatible schema5 application is required for code-only rollback. Restoring a pre-upgrade snapshot may discard later writes and needs a separate, explicit recovery decision; never silently restore, downgrade, drop email tables or delete current data. Test the precise upgrade/backup/recovery plan before production deployment.
