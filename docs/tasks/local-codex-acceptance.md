# Local Codex: independently validate the MVP

## Claim and status

- Status: **Visual evidence reported; SQLite baseline 146/146; combined browser journey and LC-07 admin-name contract pending**
- Assigned executor: **Local Codex**, started by the project owner
- Claiming account/person: Local Codex, authorized by owner ledondev520
- Base commit: `826202ee7da2b072d544c716cba19ac9cf38d6bf`; synchronized documentation from `6678aeaa57c666fcf77b2700653ed391c2034f0d` (runtime unchanged)
- Branch: `codex/design-acceptance`; earlier acceptance branches merged in PR #2 and PR #7
- PR URL: https://github.com/ledondev520/nestlet/pull/2 (merged)
- Follow-up PR: https://github.com/ledondev520/nestlet/pull/7 (merged)
- Visual acceptance PR: https://github.com/ledondev520/nestlet/pull/10
- Visual runtime: `e4179b14ae8b2c8051b64d0fad5035d55351d074`; superseded later PR #4 heads require their own verification
- LC-06 fixed-head verification: `55548513d6a5d66c8920d0fa1882ca0065bc3128`, default macOS suite 103/103 and independent HTTP 5/5
- Follow-up runtime: `8715b0d78a8cff0b5ebbbb5ea6db0bacd8137342`, identical tree to merged main `b431ea59405cbbf9ab6ec9945010f66f655b1781`
- Second-round runtime: `8b42962e55305e3cc70b7c20ce5d7e4d74ed13c7`; Node 24 + actual Poppler/browser
- Coordination issue: https://github.com/ledondev520/nestlet/issues/1
- Evidence: [local acceptance report](../local-acceptance.md); second-round PDF/authentication/model checks passed; live provider and trusted HTTPS key-entry remain not run; real idle expiry passed

Before work, inspect existing claims and tell the owner you are taking this task. Record the claimant, exact base commit and `In progress` on your task branch. If someone else has claimed it, pause for ownership clarification. This file does not send messages between assistants; report progress to the owner explicitly.

## Outcome

Independently clone and run https://github.com/ledondev520/nestlet on the owner's authorized local environment, execute the documented checks, and test the actual browser workflow with synthetic data. Submit a draft PR containing reproducible acceptance evidence and any narrowly scoped tests/docs changes. Do not certify production readiness.

Any owner-only private preview is not assumed accessible to Local Codex and is not a substitute for running the repository in its own authorized environment. This task does not authorize another assistant to connect to or operate a collaborator’s computer.

A runnable initial snapshot is published on main at commit 826202e, with later development continuing. Fetch/pull the current authorized main revision before starting and record its full SHA. Do not assume that an earlier CI pass covers later changes.

## Scope

Allowed files initially: new acceptance tests, this task record and a new `docs/local-acceptance.md`. Coordinate before editing existing tests. `docs/validation.md` belongs to the main QA owner; reference it instead of overwriting it.

Do not modify runtime files, dependencies, configuration, workflow hooks or deployment. Report runtime defects with exact steps and expected/actual behavior. A runtime fix needs coordination and an explicit owner/file assignment before proceeding. Do not merge or deploy the PR.

Use a separate clone/worktree and branch. Do not change another contributor's checkout or revert their work. Follow README.md and AGENTS.md. This task does not authorize account/key setup, paid API calls, real cases, outbound email, PHA portal activity or sensitive material. Report live-provider acceptance as blocked unless the owner separately arranges authorized secure access and consent.

## Steps

1. Clone the published repo and record Node/npm versions, OS, browser/version and commit
2. Follow README setup literally; note missing steps instead of silently inventing dependencies
3. Run `npm run check` and `npm test`; preserve counts and reproducible failure output
4. Start the loopback server and open the real local browser; no static screenshot-only substitute
5. Complete the matrix below; use clearly synthetic names and addresses
6. Report defects, coverage and limits in `docs/local-acceptance.md`; update this task status
7. Open a draft PR targeting the owner repository, describing evidence and remaining blockers; return the verified PR link to the owner

## Browser acceptance matrix

- Initial load: Chinese UI by default; empty case; configuration/privacy guidance visible; no preloaded demo or fabricated result
- English/Chinese toggle: labels switch; input, reviewed values and draft survive unchanged; external draft boilerplate stays English
- Real workflow: author safe input → actual import/parse → authorized live extraction if securely configured → inspect snippets → confirm fields → generate/edit/export; missing key is a blocker, not a simulated pass
- Review gate: untouched or partially reviewed fields block generation; unknowns stay explicitly unknown; conflicting repeated labels require resolution/review
- Invalidation: edit source text or a confirmed value; old confirmations/drafts must not silently remain valid
- Draft types: test every type actually exposed in the current UI; do not claim a hidden core capability was tested through the UI
- CSV: export and reimport one case; Unicode, commas, quotes and blank values; reject malformed headers/extra rows; inspect formula-prefix escaping without executing formulas
- PDF/Excel: actual text-PDF, XLSX and legacy XLS parsing; inspect selected sheet/row mapping and extracted values, reject renamed/corrupt/encrypted files, and report scanned-PDF/no-OCR errors
- TXT: valid UTF-8 file; unsupported extension, malformed UTF-8 and oversized file; error recovery followed by a valid import
- Export: verify downloaded TXT contents and warning; verify print-preview/PDF contents have only intended English artifact and required warnings, without app navigation or internal Chinese notes; print-dialog save is manual if tooling requires it
- Copy: test normal path where browser permissions permit; report permission-denied behavior if reproducible without changing security settings
- Reset/races: cancel and confirm reset, repeated clicks, edit/import around asynchronous work, locale switch while editing; ensure stale results do not revive an old case
- Layout/accessibility: desktop and narrow/mobile viewport, keyboard-only traversal, visible focus, input labels, readable errors and no blocked actions or horizontal overflow
- Authentication/settings: verify missing-auth fail-closed behavior, protected settings/paid routes, login/logout and CSRF rejection using operator-authorized non-production test credentials only; never save real credentials in screenshots or fixtures
- No-key behavior: clear configuration error and no substitute output; no secret can be retrieved from public routes; deepseek-flash is the only accepted model

Do not use a mock provider, simulated parser or fabricated response for this acceptance task. Exercise pure logic and real HTTP routes with authored non-sensitive actual files. Real-provider checks require the owner’s authorized secure configuration; if unavailable, mark them Not run and state the exact blocker. Never enter credentials in chat, source, screenshots or fixtures. Historical development-double tests may exist in the repository; their results are separate from acceptance and cannot satisfy real-provider checks. Do not say “all passed” if browser permissions, PDF inspection or another step was unavailable; mark that step `Not run` with the reason.

## Report format

Include tested commit, npm ci outcome, Poppler/parser availability, commands, browser details, a compact pass/fail/not-run table, screenshots with synthetic content only, exact reproduction steps, severity, and suggested owner. Keep product correctness separate from maintainability notes. Report whether any failures prevent the primary case workflow. Exclude environment secrets, private paths, raw customer materials and unrelated personal screen content.

Finish only when the reviewable draft PR exists, or report the exact permission/publishing blocker with a local patch/diff available for the owner. Branch creation and a local test pass are not evidence that a remote PR exists.


07:08 UTC browser checkpoint on main `443675c`: ordinary registration → manual review → edited draft → explicit save → actual server restart → login/open restores draft; logout clears workspace and a second account has an empty case list. Evidence and remaining Not run branches are in docs/local-acceptance.md. Six-character backend fix remains pending; owner reconfirmed the requirement. No provider call or production change in this acceptance run.

07:34 UTC: independently tested PR #12 `3bfcaa3`: npm ci/check pass, 179/179 default and 5/5 independent HTTP acceptance pass. Six-character backend/private-helper boundaries and admin alias contract pass; LC-07 backend resolved. Final integrated browser and actual production admin setup remain unverified. Coordinator completed the bounded provider probe separately; no duplicate paid call needed.

07:50 UTC composite2b983da (PR12 3bfcaa3 + PR4 7b74b227): actual six-character signup still rejected by old frontend guard; longer synthetic signup and real XLSX selected mapping→review→draft→save plus admin-alias settings succeed. Seven requested UI screenshots added; 179/179 composite suite. Kimi owns four reported blockers; final integrated journey remains incomplete.

08:08 UTC composite93caef8 (backend d1bcbdd + frontend ace9222): real-browser5reject/6register/relogin passes; nativeChromePDF593/TXT470/CSV197character imports succeed. P1-1 and positive-pathP1-2 closed atthiscomposite;187/187 suite. Telemetry and chat/newpersistence remain separate.

08:15 UTC composite200a58d (b68e857 + 5381f13): real browser→SQLite one workflow/9 sequential client events, save request correlation and bounded content-marker exclusion pass. Sanitized JSON+UI evidence added. Stale business-response identity race remains open; full timing/failure coverage not claimed.

08:36 UTC compositecc9c9f2 (8959bb9 + b8f789a):223tests/220pass3fail: actualfact-revocationCASE_INVALID, oldschema2assertion, missingnewUIerrors. ReportedPR12. Realchat-homeauth/disabled-key gates pass withoutanswerfabrication; livechat/imageandexpandedUI remainNotrun.

08:56 UTC backend8a7f5de + frontendb2de3d4 composite78091a4:230tests229pass1fail. Actual fact-revocation/archive/schema3 fixes pass; missing CASE_ISSUE_NOT_FOUND/ARTIFACT_STALE UI mappings remain. Chat isolation/persistence UI not accepted.

09:09 UTC composite3ce0cff (8a7f5de+a2417b6): realbrowser reproducesreadinessconfirmfailure+answerscleared, andfollowupreplacessource/disablesreviewbeforeSend. Kimirootgates1/4 supportedwith2screenshots;CASE_ISSUE_NOT_FOUNDstillmissing4/5localization.

09:27 UTC compositee01db90 (8a7f5de+d137191):230/230 passes. Actualbrowser followup/auth-disabled-send preservesoriginalsource5confirmationsandmanualdraft. Gate1observedregressionclosed forthesepaths; livestreampathsnotrun. Newownershiprootfrontendlogic/Kimidesign; otherreadiness/isolation/final/navigationgatesremain.

10:02 UTC PR13e39adc0 strict231/231. Real ordinary6register/customer/readinesspropertyroute/finalgenerate/customer-case-documentopen pass; finalDOM/storage/HTTP922bytes identical. NEWP1 editingopenedfinalthenSave remainsdirty (artifactidentity retained after draft clear), blocksnextreadiness; reportedPR13. Nativebrowserdownload/409recovery notpassed due tool/guard limitations.

10:13 UTC PR14fa6ff5b: install/build/frontend7 pass;14 officialsources andJSX transforms match. ActualCSP/dialog/focus/mobilepreviewpass exceptEnglish320header395pxoverflowP2. Appentrycomponent-only, auth/chatmodulesnotwired; fullmigrationNotrun. Productaudit0,dev7highforownertriage.
