# Email-authentication acceptance boundary

The five `email-auth.spec.js` journeys use compiled React, the actual `server.js`, real HTTP, and disposable SQLite. Each email scenario starts an independent loopback server and enrolls accounts through the actual email-registration/verification API. No email-specific account is privately seeded.

## Important evidence distinctions

- `simulated-email-bootstrap.mjs` is a test-only Node preload, never a production import or route. It intercepts only the fixed Alibaba DirectMail endpoint, checks the synthetic request, and returns an explicitly simulated accepted receipt. Every other outbound fetch fails closed. **This is not genuine provider acceptance or inbox delivery.**
- The actual signing, receipt parsing, asynchronous readiness, activation, and password-reset code still runs. Only public synthetic credentials/addresses are supplied through a sanitized child environment. No ambient provider keys are inherited.
- Captured one-time messages travel over private child IPC and remain in memory. There is no OTP/debug endpoint, spool file, browser storage, or mail-token logging. Email browser traces are disabled; screenshots are taken only after URL-fragment scrub and credential-field clear.
- Expiry and resend replacement preparation age only the relevant disposable SQLite timestamp. This establishes real server rejection of expired tokens, not elapsed wall-clock TTL.
- The older product/parser journeys now sign in to explicitly private-seeded legacy fixtures. They continue testing the same parser, case, file, document, isolation, responsive and CSP behavior, but do not claim to test registration. New-user username registration is required to fail.

## Run on the exact integrated backend + UI + test commit

Use the existing `Nestlet browser acceptance` GitHub Actions workflow, which installs the pinned official Playwright Chromium. Do not use a denied local Chromium launch as a fallback.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run test:frontend
npm run build
node test/frontend-browser/fixture.check.mjs
node test/frontend-browser/formats-fixture.check.mjs
npm run test:browser:frontend -- --list
NESTLET_BROWSER_ENTRY_PATH=/ npm run test:browser:frontend
```

`fixture.check.mjs` now also invokes `email-fixture.check.mjs`. For focused real HTTP-only diagnosis, run `node test/frontend-browser/email-fixture.check.mjs`. For browser-only email discovery, run `npm run test:browser:frontend -- email-auth.spec.js --list`.

Discovery must find 13 tests: the 8 prior gates and 5 new email scenarios. Listing, syntax, jsdom, and HTTP checks are not browser-pass evidence. Review exact-SHA CI and individual results before reporting acceptance.

## New browser coverage

1. Required email and matching password; generic pending response; no pre-verification login or implicit session; cooldown; explicit keyboard verification; single use; six-character sign-in; ordinary role
2. Forgot/reset forms; preserved mismatching input; no reset until matching submission; invalidation of another active session; old-password rejection, new-password login, and replay rejection
3. Actual server rejection of missing, malformed and privately aged expired verification/reset tokens; old credential survives expired reset
4. 320/390-pixel bilingual account/recovery layouts, keyboard activation, retained address, Close and Back/Forward without token resurrection
5. Missing mail configuration fails closed while privately seeded old username accounts remain login-compatible

Cross-cutting assertions check URL scrub before the first fetch/XHR effect, no token in DOM/browser storage/console/telemetry/Referrer/server logs, no automatic activation from opening a link, strict CSP and no model requests.

## Not established

Genuine Alibaba acceptance/delivery, the planned May AgentMail production receipt, production credentials/configuration, production deployment, real wall-clock expiration, real-device soft keyboards, and full accessibility certification remain separate gates. The previously accepted schema4/username browser run is not evidence for these new email flows.
