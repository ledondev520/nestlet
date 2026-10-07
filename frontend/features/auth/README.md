# Email authentication frontend

This directory owns the email-first account interface and the schema5 API boundary.

- `auth-panel.jsx`: email registration, email/existing-username login, generic resend and forgot requests, 60-second minimum client cooldown
- `email-link-panel.jsx`: explicit verification and one-use password-reset submission
- `email-account.jsx`: signed-in current-password/CSRF email binding and recovery status, with owner private-bootstrap recovery explicitly unavailable by email
- `auth-route.js`: trusted-root fragment capture and immediate URL scrubbing; tokens stay inside clearable closures
- `auth-model.js`: input and accepted-response validation; backend remains authoritative
- `auth-fields.jsx`: native autofill-compatible inputs and user-triggered visibility; no application password storage
- `remember-account.js`: preserve the explicit upstream remember-me option while persisting only a validated legacy username; email, password and tokens are never stored

New registrations send `{email,password,passwordConfirmation}` and never use a username enrollment fallback. Login sends exactly one of email or an existing username, plus password and rememberMe. Password length is6–256. There is no OAuth, access-key setup, production account creation, or real email-send action performed by this implementation work.

The server exposes `emailDeliveryConfigured`, `registrationEnabled`, and account-specific email/recovery metadata through `/api/status`. Missing delivery configuration is visibly unavailable. All email-request success copy says “if eligible”; it never claims inbox delivery or reveals account existence. The server enforces60-second per-address cooldown and5 requests/hour; the frontend also prevents immediate repeated clicks.

Tokens are43-character base64url strings in root URL fragments, never query parameters. Opening the page does not consume them. An explicit verify/reset POST consumes the local copy before awaiting the result. Failed or uncertain requests require reopening the email link or requesting a new one. A token is not automatically replayed after navigation or refresh.

The frontend must ship atomically with its backend. Do not deploy this UI against the earlier username-registration server contract. Preserve the current SQLite database and private bootstrap credentials according to the backend release plan.

## Evidence limits

`auth-model.test.js` and `auth-route.test.js` are pure development tests. `auth-components.test.js` and `email-flows.test.js` use actual React with JSDOM and explicitly controlled HTTP responses. They verify payloads, generic copy, native autofill, token cleanup, explicit actions, errors, repeated clicks, navigation, binding CSRF, owner behavior and browser-storage boundaries. They do not demonstrate Chromium layout, actual mail delivery, or production behavior.

Run `npm run build`, `npm run test:frontend`, `npm run check`, and `npm test` against the final combined source. Schema5 API, real-browser mobile/keyboard/CSP, and actual approved DirectMail delivery each need separate evidence; no real credentials or production recipient was used here.

`email-http.test.js` is an additional real-HTTP development contract check. It uses the real Node server, SQLite and scrypt with an isolated temporary database and explicitly seeded accepted synthetic challenges. Actual React submits verification, email login and reset to the server, checks stable user identity, rejects token replay, and confirms the old session is revoked. Delivery remains deliberately unconfigured and is shown as unavailable. There is no simulated inbox-delivery claim, production registration, real recipient, or Chromium evidence in this test.
