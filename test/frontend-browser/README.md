# Browser acceptance boundary

These tests run the compiled React application in actual Chromium against the real Node server, SQLite, and private-file storage. The fixture binds only to loopback, creates a fresh temporary database/assets directory, configures a disposable synthetic owner, and discards them on shutdown. It does not inherit provider keys or enable model requests.

All account names, passwords, case details, contact addresses, and uploaded bytes are public synthetic fixtures. Do not substitute production records or point the tests at a deployed account.

## Run

```sh
npm ci --ignore-scripts
npx --no-install playwright install --with-deps chromium
npm run build
node test/frontend-browser/fixture.check.mjs
npm run test:browser:frontend
```

The browser install uses the version already pinned in the repository lockfile. Run browser execution in a supported GitHub Actions or authorized local environment. `--list`, source checks, jsdom tests, and `fixture.check.mjs` do not launch a browser and are not browser-pass evidence.

The dedicated `Nestlet browser acceptance` workflow runs these steps for pull requests, main pushes, and manual dispatch. It retains the HTML/JUnit report, labelled screenshots from successful synthetic journeys, and synthetic-only failure traces/screenshots for seven days. Read the job's exact commit and individual test results before claiming a pass.

## Coverage

- Existing component palette, bilingual text, escaped input, Radix dialog keyboard/focus, static allowlist, and strict production CSP
- Actual six-character registration and later sign-in through the UI
- Standalone original upload before creating any case, full page reload, global discovery, safe text preview, focus return, and byte-for-byte browser download
- Manually reviewed, unassigned case save, full reload, global discovery, and real application reopen with saved source/facts
- Genuine readiness questions, explicit user answers, deterministic supplementary English final generation, and exact identity between displayed text, server-saved final, and browser download
- Cancelled sign-out; real sign-out; another ordinary user's empty directory and 404 access isolation; first user's saved document recovery without repeated confirmed questions
- 320/390-pixel Chinese and English account/product pages, populated saved-case rows, keyboard activation and focus return, browser Back/Forward, root and visible-control overflow, and strict CSP
- Successful screenshots identify fixture, viewport, language, and actual page; they are not production screenshots

`NESTLET_BROWSER_ENTRY_PATH` defaults to `/next/`. After the separately approved default-route promotion, run with `NESTLET_BROWSER_ENTRY_PATH=/` to exercise the same account/save/reload journeys at the root entry. Component QA remains explicitly at `/next/#components`; that component route cannot substitute for product acceptance.

## Explicitly not established

No API, product response, or provider success is mocked in these browser tests. Manual explicit-label organization and deterministic document templates do not establish AI acceptance. Live DeepSeek extraction, streamed chat, image understanding, provider errors/cancellation, email verification/delivery/recovery, browser recovery across service restart, production deployment, real device soft keyboard/safe-area behavior, and full accessibility conformance require separate evidence.
