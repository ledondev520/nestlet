# Nestlet end to end user journey acceptance

Research and supplied-screenshot review: 7 October 2026. Updated for Kimi commit `a7cdb9833be47f96494b82bb35a82d39e82bad57` and the full-case timing/error instrumentation requirement. Audience: Kimi frontend implementation, Local Codex browser acceptance, and the integration maintainer.

## Decision and scope

Accept one coherent user story: a new ordinary user can register or sign in, start an empty case, bring real material into the app, review evidence and uncertainty, prepare and edit an English draft, export it, save the case, sign out, and safely resume later. An administrator can configure the shared provider through a separate, comprehensible settings path. Styling isolated screens is insufficient evidence that either journey works.

This is a source-backed acceptance plan with a limited review of supplied screenshots and public commit evidence. It is **not a newly executed browser audit**. All proposed tests below are **Not run by this reviewer**. Current integration may differ from the screenshots; record the exact final SHA before acceptance. Historical evidence issues are identified separately from current open verification work.

Ownership is explicit: **Kimi fixes every frontend issue; Local Codex executes actual browser QA; the integration maintainer coordinates contracts and integration.** A backend cause discovered through the UI is escalated to its assigned owner. Other contributors must not bypass that frontend ownership by making uncoordinated frontend edits.

## Product contract read

Product sources: [Product scope](product.md), [Architecture](architecture.md), [Authentication contract](auth-contract.md), [First operator session](onboarding.md), [Synthetic sample materials](sample-materials.md), [Kimi frontend brief](tasks/kimi-k3-frontend-redesign.md), and [Local Codex acceptance brief](tasks/local-codex-acceptance.md). These relative links target verified repository files from this document in `docs/`. The contracts describe implemented scope awaiting final release verification, not a completed pilot.

Preserve these boundaries:

- One case at a time; five facts: property, owner, housing authority, case reference, proposed rent
- Simplified Chinese default interface, switchable to English; formal draft language stays English and entered case facts are not silently translated
- Real TXT/CSV/text-PDF/XLSX/XLS intake; no OCR, mock extraction, preloaded case, invented source, automatic sending, or agency approval claim
- Ordinary self-registration assigns its role server-side; no administrator selection, email verification, SSO, or password-reset feature is established
- Explicit Save persists validated case text, facts/evidence/review state, and draft in the current user's SQLite records; raw upload binaries are not retained
- Owner and ordinary users each see only their own cases; owner settings privilege does not confer access to other users' case content
- Versioned updates/deletes reject stale writes with 409 rather than overwriting; saved cases and unexpired schema8 sessions survive restart; browser-submitted RAM-only provider keys do not
- A saved key is configured, a model-list check verifies model access, and a successful real extraction is separate evidence; none proves agency acceptance or document correctness

Where a stale brief conflicts with the current integration contract, the integration owner must settle the exact contract before Kimi changes behavior.

## Sources and how to use them

### Standards

Adopt WCAG 2.2 AA as the accessibility target. WCAG's success criteria are normative; its Understanding pages and ARIA Authoring Practices are informative implementation guidance. Conformance concerns complete pages and complete processes, so this selected checklist cannot establish full conformance. Source: [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

| ID | Requirement to test | Source |
| --- | --- | --- |
| A1 | Every core operation is usable with a keyboard; do not depend on dragging files | [2.1.1 Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html) |
| A2 | A keyboard user can see the focused control; author-created content must not completely hide it | [2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), [2.4.11 Focus Not Obscured Minimum](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) |
| A3 | Test reflow at an equivalent 320 CSS-pixel width, without losing content/functionality or requiring two-dimensional scrolling except content that needs it; the requested 390px phone test alone is insufficient | [1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) |
| A4 | Pointer targets meet 24×24 CSS pixels or an applicable spacing/equivalent/inline/other exception; a visual checkbox square alone does not establish its clickable target size | [2.5.8 Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) |
| A5 | Normal text contrast is at least 4.5:1; large text 3:1, with criterion exceptions. Necessary component/state visuals require 3:1 against adjacent colors, with exceptions. Measure computed colors instead of judging screenshots | [1.4.3 Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) |
| A6 | Inputs have usable labels/instructions; detected input errors identify the field and explain the problem in text | [3.3.2 Labels or Instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions.html), [3.3.1 Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) |
| A7 | Save/copy/upload/progress/error status messages are programmatically exposed without requiring focus to move to every update | [4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html) |
| A8 | Login supports assistance such as password managers and paste; do not force an unaided memory/transcription task. Avoid unnecessary re-entry within a process, subject to the standard's exceptions | [3.3.8 Accessible Authentication Minimum](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html), [3.3.7 Redundant Entry](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html) |
| A9 | The page's programmatic language follows the selected interface language | [3.1.1 Language of Page](https://www.w3.org/WAI/WCAG22/Understanding/language-of-page.html) |

For any actual modal, use a clear accessible name, move focus inside when opened, keep its keyboard sequence inside, provide a closing mechanism, and return focus appropriately. This is pattern guidance, not proof that adding ARIA attributes makes a dialog accessible. Source: [WAI modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

### Design guidance and Nestlet judgments

These recommendations are not legal requirements or proof of measured user preference.

- **G1 Review before consequence:** keep correction close to the fact, retain existing answers when revisiting, and label unknowns honestly. Nestlet application: show extracted value, source excerpt, review status, and correction/confirmation together. [GOV.UK Check answers](https://design-system.service.gov.uk/patterns/check-answers/)
- **G2 Recoverable errors:** provide an error summary with links to invalid fields, consistent inline wording, and focus management after unsuccessful form submission. Do not move focus on every keystroke. [GOV.UK Error summary](https://design-system.service.gov.uk/components/error-summary/)
- **G3 Real file intake:** offer a file chooser and clear constraints; do not require uploads when paste is sufficient. Nestlet's raw-binary non-retention policy must remain honest even though other products may reuse uploaded files. [GOV.UK File upload](https://design-system.service.gov.uk/components/file-upload/)
- **G4 Understandable progress:** explain what information is needed, disclose complexity gradually, and let people save/resume. Nestlet application: retain the three work steps and put account/save continuity around them; avoid adding a large task dashboard to a short one-case workflow. [USWDS Progress easily](https://designsystem.digital.gov/patterns/complete-a-complex-form/progress-easily/)
- **G5 Returning users:** a multi-task overview is useful for genuinely long, multi-session transactions, not automatically for every three-step form. Nestlet judgment: a small own-case list with title, last-saved time and Open is sufficient unless research shows otherwise. [GOV.UK Complete multiple tasks](https://design-system.service.gov.uk/patterns/complete-multiple-tasks/)
- **G6 Take the result away:** offer a useful printable/downloadable record. Nestlet must label that record a supplementary draft, never a successful agency submission. [USWDS Keep a record](https://designsystem.digital.gov/patterns/complete-a-complex-form/keep-a-record/)
- **G7 Predictability and control:** show what a consequential click did, use the operator's terms, support correction/cancellation, keep status visible, and prevent avoidable mistakes. Nestlet judgment: “Saved” appears only after server success; source changes visibly invalidate a draft; provider-state labels are explicit. [Nielsen's original ten heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/), [NN/g Visibility of system status](https://www.nngroup.com/articles/visibility-system-status/)

Official GitHub references were inspected: [GOV.UK Design System](https://github.com/alphagov/govuk-design-system) contains guidance-site source, while [GOV.UK Frontend](https://github.com/alphagov/govuk-frontend) contains reusable component code; [USWDS](https://github.com/uswds/uswds) is its official implementation repository. Use them as reference material. No package, skill, CSS framework, or copied code is required by this plan. Reusing a component does not waive testing its behavior in Nestlet, and must not introduce government branding or endorsement.

## Supplied screenshot observations

The following PNGs were opened and inspected; links are pinned to the verified [Kimi evidence commit](https://github.com/ledondev520/nestlet/commit/a7cdb9833be47f96494b82bb35a82d39e82bad57). They show supplied states only; complete interaction, network and persistence results cannot be inferred from them. The [capture notes](https://github.com/ledondev520/nestlet/blob/a7cdb9833be47f96494b82bb35a82d39e82bad57/docs/design-evidence/README.md) report desktop 1280×900 and mobile 390×844 viewports; full-page PNG dimensions are listed below.

| Evidence | Pixels | Observation and limit |
| --- | --- | --- |
| [after-zh-empty.png](https://github.com/ledondev520/nestlet/blob/a7cdb9833be47f96494b82bb35a82d39e82bad57/docs/design-evidence/kimi-k3/after-zh-empty.png) | 1280×980 | Empty textarea, upload affordance, supported-format labels, three work steps and no-auto-submit footer are visible. Successful intake, required consent and auth routing are untested |
| [after-en-review.png](https://github.com/ledondev520/nestlet/blob/a7cdb9833be47f96494b82bb35a82d39e82bad57/docs/design-evidence/kimi-k3/after-en-review.png) | 1280×1517 | Five labeled fields, source disclosures, 0/5 reviewed count, explicit missing PHA, and an instruction beneath the inactive generation action are visible. This does not establish accessible labels or enforcement |
| [after-zh-conflict.png](https://github.com/ledondev520/nestlet/blob/a7cdb9833be47f96494b82bb35a82d39e82bad57/docs/design-evidence/kimi-k3/after-zh-conflict.png) | 1280×1681 | Two contradictory owner excerpts and a field-local instruction to correct or clear before confirming are visible. Actual conflict resolution is untested |
| [after-en-draft.png](https://github.com/ledondev520/nestlet/blob/a7cdb9833be47f96494b82bb35a82d39e82bad57/docs/design-evidence/kimi-k3/after-en-draft.png) | 1280×1330 | English editable draft appearance, draft/review warning and copy/TXT/print actions are visible. “Operator setup required” appears above the draft. No live-provider success is evidenced |
| [after-zh-settings.png](https://github.com/ledondev520/nestlet/blob/a7cdb9833be47f96494b82bb35a82d39e82bad57/docs/design-evidence/kimi-k3/after-zh-settings.png) | 1280×1337 | Expanded setup-required panel is visible, not an authenticated settings form. It cannot prove key save/test/role behavior |
| [after-mobile-review.png](https://github.com/ledondev520/nestlet/blob/a7cdb9833be47f96494b82bb35a82d39e82bad57/docs/design-evidence/kimi-k3/after-mobile-review.png) | 390×1487 | The supplied Chinese review layout fits the visible 390px image width; fields and actions are present. Dynamic overflow, English, virtual keyboard and pointer target behavior are untested |
| [after-mobile-focus.png](https://github.com/ledondev520/nestlet/blob/a7cdb9833be47f96494b82bb35a82d39e82bad57/docs/design-evidence/kimi-k3/after-mobile-focus.png) | 390×1487 | Updated image visibly shows the first confirmation checkbox with a red focus ring. SHA-256 prefix `6ef76eb37bbe00e03` differs from the review image; this supplies one focused state, not full keyboard-path acceptance |

**Historical evidence correction, closed for the screenshot replacement:** the original mobile-focus image duplicated the review image. Commit `a7cdb98` replaces it with a distinct focused-state image, now visually checked. Do not continue to report the old duplicate as a current defect. The same verified commit darkens informational small-text styles and adds shrink/wrap rules for mobile case controls; those changes are confirmed in the public diff, while final integrated contrast measurements and interactive 390px behavior still require retesting.

**Observed visual risk O1, provisional P2:** desktop screenshots show a green dot beside “DeepSeek Flash” while a setup-required panel can also be visible. A newcomer may read green as ready. This is a design interpretation, not a proven false backend status. Kimi should make brand identity versus actual connection state unambiguous; Local Codex must capture unconfigured/configured/model-access-verified/failure states before closing it. Principle G7; accept when the visible label cannot reasonably be mistaken for a successful connection or extraction.

**Evidence gaps, not runtime defects:** supplied screenshots do not demonstrate registration, normal login, signed-in identity, saved-case list, save success, logout/resume, authenticated owner settings, parsing progress, or recoverable server errors. One focused checkbox now has distinct visual evidence; whole-journey keyboard traversal on the integrated SHA remains open. Add fresh evidence for the other branches and the integrated keyboard path. Do not claim those features are missing merely because these screenshots omit them.

## Ordinary user story and acceptance

Run the connected story in order with authored synthetic material in actual files. A local parser result is not a live AI result. Use clearly labeled test accounts A and B plus a separate owner; never publish their credentials. Chinese and English should both be exercised, including one locale switch while text is edited.

### J01 First visit and orientation

**Story:** As a first-time operator, I understand what the app does and how to begin without learning the server's vocabulary.

**Pass conditions:** Chinese default, readable purpose and short data-use boundary; no preloaded sample/fake success; Sign in/Register are discoverable when registration is available. An unavailable service gives a next step ordinary users can understand. Explain that provider setup is an administrator task instead of asking ordinary users for environment variables. Clearly distinguish unsigned-in, signed-in and unavailable states. Start/New case and own saved cases are discoverable after authentication. Source: G4/G7, product contract.

**Evidence:** fresh signed-out screenshot, setup-disabled screenshot, final route/role details. **Current health:** empty visual available; complete first-visit behavior unverified.

### J02 Register or sign in

**Story:** I can create an ordinary account or enter an existing one and know which account is active.

**Pass conditions:** visible username/password/confirmation labels and requirements before submission; matching current backend limits (username 3–64 permitted ASCII characters, password 6–256, owner reserved); password-manager/paste support; no role selector. Successful registration creates the authenticated ordinary session according to the contract, with no unnecessary second login. Existing users can switch from registration to login without a dead end. Invalid/duplicate/reserved names, mismatched passwords, throttling and disabled registration have localized actionable errors. Preserve nonsecret input on recoverable errors; avoid exposing passwords or creating misleading password-recovery controls for an unsupported feature. No provider request occurs on registration. Source: A6/A8, G2, product contract.

**Evidence:** ordinary registration success, invalid form, login, active identity/role and rejected privilege attempt. **Current health:** no supplied browser evidence.

### J03 Start a case and understand saving

**Story:** I start one case knowing what stays on this device and what Save does.

**Pass conditions:** empty source/review/draft state; a concise “Unsaved” or equivalent state is truthful; title/save affordance clear when supported; importing/opening/new-case actions warn before replacing unsaved work. Cancel leaves the entire case intact. Clear workspace and deleting a saved case are distinct actions. No implicit promise of autosave. Source: G4/G7, product contract.

**Evidence:** empty signed-in case; edit, cancel replacement, and verify retained text. **Current health:** empty visual available; continuity unverified.

### J04 Bring in actual text and files

**Story:** I can paste text or choose a real TXT, CSV, text-PDF, XLSX or XLS file and verify what was read.

**Pass conditions:** choose-file works by keyboard as well as pointer; accepted formats and applicable limits are available before selection; parsing disclosure/consent happens before backend transfer when required; original filename and progress are visible. Text-PDF yields actual readable text; a workbook exposes actual sheet/row selection and mapping. Switching the sheet/row changes the displayed source correctly. No formulas/macros execute. Valid Unicode, CSV quoting and blank values round-trip safely. A parse error does not destroy an existing case. Source: A1/A6, G3/G7, product contract.

**Evidence:** real-file manifests and filenames, parsed text comparison, actual workbook selection screenshots and network outcome. **Current health:** upload affordance only; functional intake unverified in this review.

### J05 Request extraction and handle waiting

**Story:** I know when my de-identified text will go to the provider and whether processing succeeded.

**Pass conditions:** explicit consent for live extraction; only `deepseek-flash`; no-key/disabled/session/provider/timeout/quota errors are honest. Show processing immediately; prevent duplicate submission; retain data for retry. A late response cannot replace text or another case loaded after the request started. Locale switching does not break the in-flight state. Success labels the real route used; manual processing must never masquerade as live AI. Source: A7, G7, product contract.

**Evidence:** consent, progress, real response/error and request lifecycle. Real-key testing stays **Not run** until separately authorized secure configuration and test consent exist. **Current health:** supplied review says manual processing; live extraction unproven.

### J06 Review facts, unknowns and conflicts

**Story:** I can compare each proposed fact with its source, correct it, and explicitly review unknowns without inventing values.

**Pass conditions:** all five facts have clear labels, evidence, editable value and review state; conflict evidence is visible beside the affected field; conflicting alternatives are not silently chosen. Confirming a blank means reviewed-as-unknown, not data invented. Unresolved conflicts or incomplete review block generation with an explanation and route to the affected field. Proposed rent is never presented as approved rent. Changing a value resets relevant confirmation and invalidates a stale draft; changing source invalidates dependent review/draft state. Source: A6/G1, product contract.

**Evidence:** partial review blocked, unknown reviewed, conflict resolved, source/value changed after completion. **Current health:** strong visual structure and conflict instruction visible; enforcement unverified.

### J07 Create, preview and edit English output

**Story:** I choose a supported draft type and edit the exact English artifact I intend to take away.

**Pass conditions:** each exposed type produces its actual supported draft; the preview is editable and includes correct reviewed facts and explicit unknown placeholders. No invented recipient, signature, agency acceptance or claim of official form completion. UI language changes do not alter draft language or user edits. Back to review preserves work unless an intentional change invalidates it; replacing an edited draft is explained before discarding those edits. Source: G1/G7, product contract.

**Evidence:** all exposed types, one edited sentence, locale toggle, back/edit/regenerate transition. **Current health:** English draft visual visible; edit/preservation behavior unverified.

### J08 Copy, download and print

**Story:** I can take away the current edited draft and tell whether the action worked.

**Pass conditions:** copy obtains current text and announces success only after success; denied clipboard access offers a clear manual-copy route. TXT contains current edits, English artifact labels and required warning. Print/PDF output contains the intended artifact without application navigation, credential panels or internal Chinese guidance; inspect actual preview/output, not only a clicked button. CSV safety is verified without executing formulas. These actions never send or submit externally. Source: A7/G6, product contract.

**Evidence:** clipboard result where supported, opened downloaded TXT, actual print preview/PDF and warning checks. **Current health:** controls visible; artifacts unverified.

### J09 Save explicitly

**Story:** I save the current case under my account and know exactly which version is durable.

**Pass conditions:** title is usable; saving/waiting/saved/error states are distinct. “Saved” means successful persistence, not just a click. Saving includes reviewed fields, evidence, draft choice and edited text; it never includes raw binary files or credentials. Network/auth/cap/payload failure preserves recoverable local work and never marks it saved. Edits after save restore dirty/unsaved indication. Source: G4/G7, product contract.

**Evidence:** case list row, successful response/version, reopened content comparison and failure state. **Current health:** no supplied browser evidence.

### J10 Sign out and resume

**Story:** I can leave safely and later continue the same saved work.

**Pass conditions:** logout identifies unsaved-work consequences before destructive clearing when needed; on confirmation the session is revoked and private workspace/list state is cleared. Browser Back or refresh cannot reveal a previously signed-in user's case to another user. Sign in again, locate the case and Open; saved source, facts/review state, edited draft and version are intact. Opening another case does not merge it with the previous workspace. An authorized restart test preserves saved cases while requiring login again; do not mistake lost RAM-only key state for deleted cases. Source: G5/G7, product contract.

**Evidence:** save → logout → new session → open sequence, plus separately authorized restart persistence evidence. **Current health:** no supplied browser evidence.

### J11 Recover a stale save or delete conflict

**Story:** If two tabs diverge, I keep my edits and can understand which saved copy is current.

**Pass conditions:** open one case in two tabs, save A, attempt stale save B; 409 produces a clear conflict message and preserves B's unsaved work. Provide an obvious copy/export escape and explicit action to reopen the latest version; explain before replacing local edits. Do not silently merge, overwrite, retry with a fabricated version, or label failure as saved. Repeat for stale Delete; the newer record survives. No version-history or merge feature is implied. Source: G7, product contract.

**Evidence:** two visible tab states, conflict response and retained local text; latest record checked afterward. **Current health:** proposed test, not observed defect.

### J12 Verify account isolation and deletion

**Story:** My saved cases are private to my account, and deleting one is deliberate.

**Pass conditions:** A, B and owner have distinct synthetic cases. Each UI lists/opens only its own cases. Direct requests to another user's case fail according to the contract, including owner-to-ordinary access; hidden buttons alone are insufficient. A normal user cannot read/write/test settings. Delete names the target, cancellation changes nothing, confirmation removes only that case, stale deletion is rejected, and unrelated cases remain. Do not claim secure erasure or recovery that the product does not implement. Source: product contract; G7 for the UI.

**Evidence:** browser roles and independent HTTP ownership checks, delete cancel/confirm. **Current health:** no supplied browser evidence.

## Administrator settings journey

Run separately from the ordinary story. Actual secrets are entered and submitted only by the authorized human through the approved secure path; screenshots/logs must contain no secret bytes.

1. **O01 Discover and enter:** sign in as owner; Settings is discoverable and identifies administrator responsibility. Ordinary users receive appropriate service status/help without provider-management controls or private metadata. Missing setup is actionable for the correct audience. Current health: setup-required screenshot only.
2. **O02 Inspect current state:** distinguish not configured, configured, live disabled/enabled, model-access verified with time, and failed/unverified. Show RAM-only browser-key lifecycle accurately. “DeepSeek Flash” branding alone is not a readiness claim. Current health: authenticated states unverified.
3. **O03 Configure safely:** disclose key destination and memory-only retention, preserve `deepseek-flash`, and let the authorized human submit. Never echo saved key bytes or put them in case data/browser storage. Success updates sanitized configured state without implying verification. Current health: not run.
4. **O04 Test connection honestly:** show in-progress, prevent duplicate tests, handle provider/rate-limit errors. Successful model-list check is labeled model access only; changing configuration during a check cannot mark the new configuration verified. No chat completion or billing claim follows from this result. Current health: not run.
5. **O05 Return to work:** closing settings returns to the prior case without losing edits; enable/disable changes are explicit; signed-out or expired session cannot keep controls usable. Authorized restart clears session/RAM-only key, while saved case data remains. Current health: not run.

Pass evidence includes owner and ordinary screenshots, sanitized status/network outcomes, secure-transport check and state transitions. Actual provider success remains a separate release gate when authorized test access is unavailable.

## Cross cutting failure and recovery matrix

Each applicable branch must be exercised in both languages, with at least representative mobile and keyboard checks. Do not manufacture production errors or alter security settings to force a test.

| State | Expected recovery and evidence |
| --- | --- |
| Empty source / zero saved cases | Clear next action; no fake rows, blocked-but-unexplained button, or implied data loss |
| Unsupported, renamed, malformed UTF-8, oversized, corrupt, encrypted or scanned PDF | Name the limitation, including no OCR; offer a supported file/text alternative; keep prior work; subsequent valid import succeeds |
| Empty/unsuitable sheet, wrong workbook row or ambiguous mapping | Show actual available choices, require deliberate selection and preserve source provenance |
| Parsing/extracting/saving/testing | Localized descriptive busy state; no fake percentage; duplicate action protection; accessible status; late response cannot revive a replaced case |
| Authentication expired / permission denied | Explain reauthentication or owner responsibility, preserve safe recoverable work without leaking it to a different account, no secret or raw server traceback |
| Offline / timeout / service 5xx | No success state; retain work; bounded retry initiated deliberately; no duplicate saved cases after uncertain create outcome |
| Provider missing / disabled / unavailable / quota | Honest specific category and next step; no mock output or repeated paid retries hidden from the user |
| Dirty case followed by New/Open/Clear/Logout | Warn about unsaved changes, offer a safe cancel, and accurately explain what Save retains; no premature state clearing |
| 409 version conflict | Retain local edits, preserve latest server record, copy/export before explicit reopening; no silent overwrite |
| Case cap / payload limit / unavailable database | Clear reason and next action; no false “Saved”; previous saved version remains accessible when storage recovers |
| Clipboard denied / download or print unavailable | Report actual limitation; retain preview and offer permitted manual copy; mark unavailable QA branches Not run |

## Mobile keyboard and accessibility execution

These are proposed acceptance checks, not claims of current conformance.

- Test desktop at 1280 CSS pixels and mobile at **390px**, plus the **320 CSS-pixel equivalent** reflow condition. Record viewport, zoom, browser and OS. Cover Chinese and English, long filenames/addresses, conflict messages, account controls, saved-case list, settings and draft editor; a single Chinese screenshot does not cover all states
- Traverse the entire ordinary path using Tab/Shift+Tab/Enter/Space and appropriate native select keys. File chooser, source disclosures, confirmation controls, retry, save, logout and copy must be reachable and operable. Do not require pointer-only drag/drop
- Capture actual focused controls in different states and record the focused element's accessible name. Check that newly inserted errors and navigation land focus meaningfully; a locale switch must not strand focus in removed content
- Inspect labels and group names in the accessibility tree; repeated “Confirm” controls need contextual field identification. Ensure headings/landmarks support orientation and the active step is programmatically conveyed
- For dialogs, check entry/exit focus, Escape/close behavior and background interaction. For non-modal panels, do not apply modal focus trapping unnecessarily
- Verify screen-reader announcements for processing, upload result, save/copy success, validation and conflicts. If no screen reader is available, mark speech behavior Not run; DOM attributes alone are partial evidence
- Measure target areas, text/control contrast and error-state contrast. Disabled states have criterion exceptions but must still have a readable explanation; do not infer target size or compliance from the 16px checkbox drawing
- On mobile, focus each lower-page input with the virtual keyboard open where actual device/browser support exists; confirm the current field, error and next action remain usable. Emulated viewport evidence does not prove virtual-keyboard behavior
- Check reduced-motion preference and avoid mandatory animation delays. Check 200% text enlargement and the separate reflow condition; screenshot dimensions alone cannot establish text resizing support

## Full case timing and error instrumentation acceptance

This is a newly requested product requirement, not a claim that instrumentation is implemented. It must cover the connected journey and failures without recording case content or credentials. Frontend instrumentation belongs to Kimi; backend measurements and authenticated ownership checks belong to the assigned backend maintainer. Local Codex verifies the joined evidence on the final integrated SHA.

### Measurement definitions

Keep these measures separate in the schema, logs and any readout. The names below are proposed field names; agree the actual contract before implementation.

| Measure | Definition and boundary |
| --- | --- |
| `workflow_elapsed_ms` | Overall elapsed time between explicitly defined workflow start/end events. Record incomplete, abandoned and resumed runs separately; elapsed time is not hands-on effort |
| `step_active_ms` | Estimated foreground, non-idle engagement in a named step, under a documented visibility/focus/idle rule. It is a proxy, not proof of attention or measured human labor |
| `step_wait_ms` | Time when progress in that step is blocked by in-flight work. Count the union of overlapping waits, not their sum; distinguish waiting from active editing |
| `client_request_ms` | Monotonic browser duration from a particular request attempt's start to response/error/abort. It includes network and other overhead and must not be called server processing time |
| `server_request_ms` | Monotonic server measurement within declared handler boundaries for that same request; no estimate from the browser timer |
| Optional server subspans | Actual parse/provider/storage intervals when instrumented. Mark absent values unknown, not zero; overlapping subspans must not be blindly summed |

Product judgment: show a useful per-step breakdown for intake, extraction, review, draft editing, export and persistence. Define whether blocked time is excluded from active time so totals do not double-count. Preserve a separately labeled raw foreground dwell measure only if needed. Changing the system clock must not generate negative operation durations; page reload/resume starts a new timing segment rather than subtracting incomparable clock origins. Use wall-clock timestamps for event ordering context, with browser and server clock provenance stated.

Technical basis: browser `performance.now()` supports monotonic operation timing, while visibility events can distinguish a hidden page; neither establishes user attention or solves all sleep/background-throttling behavior. Test those boundaries in the supported browser. [Performance timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance/now), [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API). Separately identifying client and server request spans follows the distinction in [OpenTelemetry HTTP conventions](https://opentelemetry.io/docs/specs/semconv/http/http-spans/); adopting an SDK is not required.

### Correlation and privacy contract

- `workflow_id` identifies a single workflow run before the first save. `case_id` is an opaque identifier when a persisted case exists; record the deliberate transition from unsaved workflow to saved case. Resume creates a new run/segment associated with that case rather than silently continuing an old browser timer
- `request_id` and attempt number correlate client request outcome, server duration and the current workflow/case. Retry attempts remain distinguishable. Client-supplied IDs are correlation data, never authorization; the server validates case ownership from the authenticated session
- Step names, event names, outcomes and error codes are bounded enumerations. Include schema version and application revision. Errors distinguish validation, authentication, permission, parsing, provider, network, storage, conflict and cancellation; avoid calling a user cancellation a provider failure
- Record terminal success/failure/cancel exactly once per operation attempt; deduplicate retried telemetry delivery with an event identifier. Missing events are incomplete evidence, not successful completion. A failed save must not emit a save-success outcome
- Exclude source text, document/draft contents, evidence snippets, entered fact values, file contents, original filenames, case titles, usernames, passwords, API keys, cookies, session tokens, CSRF tokens, authorization headers and raw provider/server error bodies. Use safe error codes and fixed message categories. Never capture typed characters, clipboard contents or DOM snapshots as telemetry
- Opaque IDs remain linkable operational data: restrict log access and retention, and keep them out of public screenshots or issue reports unless they belong to disposable synthetic fixtures. Publish only redacted synthetic evidence. Case A's events must never be attached to case B or exposed through another account
- Use the authorized application logging destination; this requirement does not authorize a new external analytics vendor, third-party script or data export. Agree retention, access and volume limits. Instrumentation delivery failure must not block drafting, save, logout or recovery

The data-minimization approach is informed by [OpenTelemetry guidance on sensitive data](https://opentelemetry.io/docs/security/handling-sensitive-data/). The explicit exclusions, ownership rules and first-party-only destination above are Nestlet acceptance decisions.

### Required instrumentation tests

| ID | Scenario and pass condition |
| --- | --- |
| T01 | Complete J01–J10 with synthetic data; each applicable step has bounded start/outcome timing, and each request joins to the correct workflow/request/case without exposing contents |
| T02 | Spend measured foreground time reviewing, then hide the tab and cross the documented idle cutoff; active time follows that rule and is not inflated by the whole hidden/idle interval. Report the threshold and tolerance used |
| T03 | Exercise an actual slow request or a permitted deterministic test delay; client wait and independently measured server duration remain separate. Real-provider acceptance still cannot use fabricated provider output |
| T04 | Trigger validation, unsupported file, no-key/provider failure where authorized, 401, 409, timeout, cancellation and retry; outcome/error codes are correct, local work survives, and terminal events are not double-counted |
| T05 | Use two cases, two tabs and two ordinary accounts; late responses, Open/New, logout/login and resume cannot cross-attach events or reuse another user's case association |
| T06 | Place unique synthetic marker strings in source, field, draft, title and filename; inspect browser telemetry payloads, authorized server logs and exported test evidence. None of these markers or credentials appears; authorized opaque IDs/codes and duration fields still correlate |
| T07 | Reload during processing, interrupt telemetry delivery, and resume a saved case; no negative duration, fabricated completion, duplicate success or poisoned next-run timer. The primary app remains usable |

Evidence must include the measurement schema, start/end definitions, idle/background policy, synthetic correlation examples, sanitized log samples, verified actual server measurements, privacy checks and known dropped-event limits. Aggregate medians/percentiles or funnel rates require a stated denominator and sample size; a developer acceptance run does not establish user time saving or production reliability. Current health: **Not run in this review**.

## Issue severity and required handoff

**P0:** confirmed cross-account disclosure, credential exposure, destructive silent overwrite/data loss, authorization bypass, or a core journey completely unusable for all intended users. Stop the affected release path and route urgently. No P0 runtime defect is established by this screenshot review.

**P1:** a confirmed essential task blocked for a supported user group/device (including keyboard-only), inability to register/login/save/resume, stale or falsely labeled output, unrecoverable intake/error path, or a materially misleading success state. Fix and independently retest before claiming that journey accepted.

**P2:** lower-risk clarity, discoverability, spacing or consistency problem with a workable path. Prioritize by frequency and user cost; cosmetic preference alone must be labeled design judgment.

Every issue must contain:

- ID, short user-outcome title, severity and evidence status: observed / reproduced / proposed test / blocked
- Exact application SHA, URL/origin class, date, browser/OS, viewport/zoom, locale, role and test-data reference
- Preconditions and numbered reproduction steps starting from a known state
- Actual behavior; distinguish screenshot observation from network/DOM/interaction evidence
- Screenshot/video path and relevant frame/control; sanitized response or console evidence if needed; never credentials
- User impact and why this priority is warranted
- Expected behavior and source principle/criterion, with direct URL; identify product-specific judgment explicitly
- Smallest acceptance condition in Given/When/Then form, including recovery and state preservation
- Owner: **Kimi for frontend**, plus separately named backend dependency if applicable; verifier: **Local Codex**; integration owner: **integration maintainer**
- Fix commit/PR, retest commit, result, residual limits and regression checks

Example verification task: `UX-E01 | P1 verification priority, not a confirmed runtime defect | Verify the integrated keyboard journey`. Historical duplicate screenshot: corrected by `a7cdb98`; the replacement visibly demonstrates a focused confirmation checkbox. Remaining acceptance: Local Codex completes the actual keyboard path on the integrated SHA and captures the relevant focused states with reachable actions; any runtime defect found is sent to Kimi using the template above.

## Release evidence and stopping condition

1. Integration owner freezes and communicates the exact candidate SHA/contracts. Kimi receives all frontend issues in one ordered list and reports its fix SHA/files; reviewers do not edit those files
2. Local Codex runs actual browser journeys J01–J12 and O01–O05, plus instrumentation T01–T07 and relevant error/mobile/keyboard branches, using synthetic real files and isolated test accounts. Record Pass, Fail, Not run or Blocked for each, with evidence
3. Fixes return to Kimi; Local Codex retests on the new SHA and repeats affected adjacent steps. A successful unit suite, screenshot set or historical SHA does not stand in for this retest
4. Stop only when every required journey is passed or an explicit blocker/accepted limitation is recorded by the integration owner. No unqualified “all passed” while live-provider, print, focus, persistence or another required branch is unrun
5. Separate release claims: UI/browser acceptance; backend isolation/persistence; content-free instrumentation accuracy; exact deployed revision/TLS; real-provider extraction. Passing one does not prove the others, customer usefulness, legal compliance, or production sensitive-record readiness

The final handoff should lead with: whether a new ordinary user can finish and resume; whether an owner can configure safely; whether timing/error evidence is correctly correlated and content-free; remaining P0/P1; exact tested/deployed SHAs; links to evidence; and the specific decision or permission required for any blocker.
