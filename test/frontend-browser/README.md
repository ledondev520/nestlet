# Browser acceptance boundary

These tests run the compiled React application in actual Chromium against the real Node server, SQLite, and private-file storage. The fixture binds only to loopback, creates a fresh temporary database/assets directory, configures a disposable synthetic owner, and discards them on shutdown. It does not inherit provider keys or enable model requests.

All account names, passwords, case details, contact addresses, and uploaded bytes are public synthetic fixtures. Do not substitute production records or point the tests at a deployed account.

## Run

```sh
npm ci --ignore-scripts
npx --no-install playwright install --with-deps chromium
npm run build
node test/frontend-browser/fixture.check.mjs
node test/frontend-browser/customer-cases-fixture.check.mjs
npm run test:browser:frontend
```

The browser install uses the version already pinned in the repository lockfile. Run browser execution in a supported GitHub Actions or authorized local environment. `--list`, source checks, jsdom tests, and `fixture.check.mjs` do not launch a browser and are not browser-pass evidence.

The dedicated `Nestlet browser acceptance` workflow runs these steps at the promoted `/` homepage for pull requests, main pushes, and manual dispatch. It retains the HTML/JUnit report, labelled screenshots from successful synthetic journeys, and synthetic-only failure traces/screenshots for seven days. Read the job's exact commit and individual test results before claiming a pass.

Four additional customer/case scenarios are described in [the customer/case evidence boundary](CUSTOMER-CASES.md): linked cases and document versions, a real private-fixture server restart, empty-conversation selection, two-tab conflicts, offline-save recovery and owner/ordinary isolation. Their local HTTP contract check passed. The first official Chromium run passed 17/17 tests on the exact tree recorded there; later integrations require fresh CI rather than inheriting that result.

## Coverage

- Existing component palette, bilingual text, escaped input, repeated Radix modal keyboard/focus/scroll-lock lifecycles, static allowlist, strict production CSP, and fresh style-only document nonces matching the official injected modal styles
- Privately seeded legacy-account six-character sign-in through the UI; this is explicitly not new-user registration
- Five independent required-email verification/recovery journeys with real HTTP/SQLite and explicitly simulated accepted mail transport; see [email evidence boundary](EMAIL.md)
- Standalone original upload before creating any case, full page reload, global discovery, safe text preview, focus return, and byte-for-byte browser download
- Manually reviewed, unassigned case save, full reload, global discovery, and real application reopen with saved source/facts
- Genuine readiness questions, explicit user answers, deterministic supplementary English final generation, and exact identity between displayed text, server-saved final, and browser download
- Cancelled sign-out; real sign-out; another ordinary user's empty directory and 404 access isolation; first user's saved document recovery without repeated confirmed questions
- 320/390-pixel Chinese and English account/product pages, populated saved-case rows, keyboard activation and focus return, browser Back/Forward, root and visible-control overflow, and strict CSP
- Successful screenshots identify fixture, viewport, language, and actual page; they are not production screenshots

`NESTLET_BROWSER_ENTRY_PATH` defaults to `/next/`. The CI workflow explicitly uses `/`; to reproduce that default-route gate locally, run with `NESTLET_BROWSER_ENTRY_PATH=/` to exercise the same account/save/reload journeys at the root entry. Component QA remains explicitly at `/next/#components`; that component route cannot substitute for product acceptance.

## Explicitly not established

The pre-existing product/parser journeys do not mock APIs or parsing. The new email journeys explicitly simulate the mail provider receipt only; no genuine delivery is established. Manual explicit-label organization and deterministic document templates do not establish AI acceptance. Live DeepSeek extraction, streamed chat, image understanding, provider errors/cancellation, genuine production email provider acceptance/delivery, production host/container restart or restore, production deployment, real device soft keyboard/safe-area behavior, and full accessibility conformance require separate evidence.

## Dedicated official-reference panel scenario

`agency-guidance.spec.js` adds one bounded scenario using the existing isolated synthetic customer fixture, real HTTP/SQLite and manually reviewed case facts. It does not alter fixtures, intercept responses or call a provider.

The scenario checks chat, materials and documents in Chinese and English at 320, 390 and 1280 pixels. It opens and closes both native disclosures with Enter/Space, follows the actual Tab order through the reference selector and official links, changes SFHA → unknown → OHA → SFHA with native select keyboard keys, and checks focus plus document/control overflow. Expanded-state screenshots are labelled by viewport, language and page. Official links are inspected but never followed.

Actual case/readiness reads before and after selection, plus a business-mutation request log, verify that references do not write facts, change readiness, or create documents/conversations. The fixture case keeps its separately confirmed synthetic housing authority. Browser error/CSP/model-request monitoring remains enabled; no source site is automatically fetched.

Preparation checkpoint, 2026-10-07: discovery reports 18 total scenarios; build, syntax, existing real-HTTP fixture checks, 312 backend checks and 224 frontend checks pass. The new Chromium scenario has not been run in the authoring environment. Its first actual browser result must come from an authorized official CI run; discovery is not browser acceptance. This test adds engineering interaction/layout evidence, not a design approval, live-model/source-edition verification or full accessibility certification.
