# Chat-first workbench delivery · 2026-10-08 r1

## Outcome and scope
A standard chatbox is the primary workbench. The user supplies material once, sees a concise extracted summary, answers only missing/conflicting/material confirmation questions in the conversation, and continues into an English artifact without compulsory review-page hopping. Client → case → material → facts → conversation → artifact records remain reusable across sessions. Use a collapsible context/archive panel and contextual actions beside the relevant reply, rather than permanent forms above chat.

Initial domain: SFHA lease-up administrative follow-up, information request, and case summary. These are supplementary operator documents, not a generic benefits platform, eligibility decisions, signed agreements, or completed government submissions. Reference-agency selection is not proof of the case's actual PHA. Personal collaborative artifact archiving in Google Drive is outside this product infrastructure task; there is no backend-migration decision here.

This issue consolidates the next delivery slice; it does not reopen or replace existing work. Main release/live acceptance proceeds in parallel, with desktop first and mobile checks retained.

## Verified baseline versus new work
- Main `2e1354ef591975160885d9461910bf00f67742e8`: PR #28 merged, with prior root-reported exact-main 23-test browser gate and deployed revision. Authenticated live full-user-story acceptance remains a separate pending gate; do not infer it from CI or component provider probes.
- Already implemented: persisted own-user customers/cases, conversations, fact/document context, source navigation, immutable artifact versions/readiness; read-only conversation preparation and explicit apply/cancel; unconfirmed fact suggestions and same-source/body draft deduplication. See [current contract](https://github.com/ledondev520/nestlet/blob/2e1354ef591975160885d9461910bf00f67742e8/docs/current-delivery-contract.md), [action contract](https://github.com/ledondev520/nestlet/blob/2e1354ef591975160885d9461910bf00f67742e8/docs/conversation-actions.md), PR #26 and PR #28.
- New: natural-language answer → narrowly scoped, version-bound explicit confirmation; inline conflict resolution; simpler chat-first layout; verified contextual official action links; later reuse of evidence-backed workflow status/receipts where necessary.
- Existing auth work: PR #30 owns independent in-field password visibility. Root signup-continuation lane owns safe verification-to-session continuation. Do not duplicate either.
- Existing design evidence: PR #27; tokens/design references PR #18 / #15. Historical evidence is not current acceptance.
- Vetted good-css skill/checklist has a local docs-only commit `5ca9a36`; public availability is pending. It is not yet a remote-installation or UI-pass claim. Root will publish the exact available revision before requiring external reviewers to consume it.

## Ownership and collision rule
Root is integration/release owner. Kimi owns visual design/layout/CSS audit; root engineers own functional integration, authorization, persistence and API behavior. Local Codex independently reviews/runs only tests already permitted by its current environment and writes its acceptance report. An issue comment cannot expand Local permissions.

Each lane ACKs this revision, exact base SHA, exact files and next result before editing. A posted handoff is **sent, pending ACK**, not execution. Shared files (`frontend/features/chat/index.jsx`, `frontend/App.jsx`, `frontend/styles.css`, `server.js`, `storage.js`) remain root-owned unless a precise hunk/file handoff is acknowledged. Use separate branches and draft PRs; no force-push or implicit merge/deploy authorization. Keep credentials, private account details, case contents and infrastructure out of public evidence.

## Phase 1: bounded delivery tasks

### W1 · P1 · Remove authentication friction — existing work, finish rather than duplicate
Owner: existing root auth lanes. Dependencies: PR #30 and signup-session continuation contract.
Files: PR #30 exclusively `frontend/features/auth/auth-fields.jsx`, auth `copy.js`, corresponding auth tests and its narrowly scoped CSS; continuation lane owns its declared verification/session files (`email-auth.js`, relevant auth route/panels/session wiring and tests), subject to root coordination.
Acceptance:
- Each password field independently reveals/hides only its own value; usable by keyboard, has readable bilingual state/name and adequate hit area, no accidental submit/autofill break.
- Valid completed signup verification safely continues into an authenticated ordinary-user session where supported; expired/used/foreign-context links fail honestly with a clear sign-in fallback, no account-switch confusion or weakened verification.
- Record exact tested head, CI and real-browser status separately. Existing PR30 evidence is not proof of the later combined release.

### W2 · P1 · Version-bound conversational clarification and confirmation — new functional slice
Owner: root backend + root chat integration, one coordinating owner for shared files.
Backend boundary: `conversation-action-contract.js`, `document-context.js`, `case-records.js`, necessary bounded `chat.js` integration; `storage.js`/`server.js` only via root-reviewed explicit hook changes. Frontend boundary: `frontend/features/chat/conversation-actions.{js,jsx}`, `case-workflow.jsx`, `copy.js`, and root-owned chat `index.jsx`. Contract/test additions may use `docs/conversational-confirmation.md`, `test/conversational-confirmation.test.js`, `test/frontend-browser/conversational-confirmation.spec.js`.
Dependencies: existing PR28 contract; publish revised request/response/confirmation semantics before frontend binding. Do not merely relabel current `confirm:false` suggestion apply as confirmation.
Acceptance:
- Intake yields a concise summary with source provenance; unchanged confirmed values and prior answers are reused. Optional absent fields do not generate needless questions.
- Ask only required missing, conflicting, stale or materially consequential questions, grouped naturally. A direct user answer can complete-and-continue in chat without opening a separate editor.
- Explicit answer/confirmation is bound server-side to authenticated user, case, conversation, complete user-message ID, target fields, exact proposed values and expected record version. A generic “yes” is actionable only with one unambiguous pending question/summary; multiple or changed proposals require disambiguation.
- User factual answers may confirm only their exact scoped facts. Uploaded text, assistant prose, retrieved sources or tool output cannot authorize confirmation, conflict resolution, final status, signatures or external action.
- Conflict resolution preserves old/new provenance and the user's exact decision; stale versions, incomplete messages, changed accounts/cases, cancellation and late streams invalidate pending authority. No silent overwrite or replay after uncertain writes.
- Duplicate submission/lost-response reconciliation produces no duplicate confirmed action/artifact. Reopen/restart retains answers and provenance without re-asking the same resolved question.
- Readiness remains authoritative; drafting, finalization, export and government submission remain distinct. Existing draft/readiness/stale protections must not be bypassed.

### W3 · P1 · Chatbox-centered workbench and contextual panels — new layout slice
Owner: Kimi design; root implementation consumes the accepted layout. Kimi immediate files: `docs/design-system/chat-workbench.md`, `docs/design-evidence/chat-workbench/**`. Proposed CSS stays in that reference scope until exact runtime file/hunk ownership is ACKed. Root runtime files: `frontend/components/application-shell.jsx`, chat `index.jsx`, customer `workspace.jsx`, intake `workspace.jsx`, documents `index.jsx`, `frontend/styles.css`.
Dependencies: W2 contracts for inline question states; layout/reference work starts now in parallel.
Acceptance:
- Conversation and composer dominate; current client/case are visible in a compact header; contextual facts/materials/artifacts sit in a collapsible panel/drawer. No mandatory repeated entry or sequential page hops to finish normal clarification.
- New/existing client and case selection reuse saved records, keep current identity clear and retain dirty-draft safeguards. Source click/reopen points to the correct persisted record/version.
- Inline summary → question → answer → artifact path is legible; preview/source details expand on demand. Existing manual editors remain an optional correction route.
- Composer never covers a card's action/focus target; verify viewport scrolling, not just a full-page screenshot. Desktop plus 320/390px, Chinese/English, long text, keyboard, 200% zoom, reduced motion and real-device keyboard where available.
- Consume verified good-css checklist when published: focus outlines, touch areas, hover-only restriction, explicit transitions, stable drawer scrolling, long labels, restrained motion. Record unavailable device/screen-reader tests as Not run.
- Fold PR27 notice-color/separator/version-label findings into this bounded review rather than opening duplicate styling tasks.

### W4 · P1 · Verified official actions beside artifacts — stage 1 only
Owner: root domain/content + frontend integration; Kimi visual review. Files: `docs/domain-sourcebook.md`, `docs/official-artifacts.md`, existing official-reference data module and `frontend/components/agency-guidance.jsx`; add isolated `frontend/features/chat/official-actions.jsx` and tests, integrate through root chat owner. Locate/claim the exact existing data module before edit.
Dependencies: actual verified SFHA destination/type and artifact applicability; W3 placement can be designed meanwhile.
Acceptance:
- Beside a relevant follow-up/request/summary, offer verified official page/form/contact-channel links with descriptive purpose, agency, source-check date and applicability caveat. Reverify targets before publishing; never use a model-invented URL.
- Selecting a reference agency does not overwrite confirmed case PHA. If destination/edition/applicability is unverified, show that limit and an appropriate official information page, not a false ready-to-submit action.
- Opening links sends no case contents or personal data in query parameters. Export/download is never labeled “submitted”, “accepted” or “approved”.
- No direct form fill, upload, signature, certification or submission in stage 1. A future integration needs verified service capabilities, exact form/edition, data mapping, per-action authorization and supported receipt evidence before scope approval.

### W5 · P1 · Independent journey acceptance and release truth — extend existing QA
Owner: Local Codex #1 independent read-only/testing/report lane; root owns executable product/browser gaps and final release. Local report boundary: `docs/design-evidence/` only if already permitted, or issue report; no product edits, no new permissions, production account operations or provider calls. Root browser changes: new W2 spec and existing relevant auth/chat/customer browser specs, coordinated to avoid overlaps.
Dependencies: fixed candidate SHA per slice. Run current independent checks now; do not wait for all new features or production login.
Acceptance matrix:
1. New user → verify → session continuation; returning user → reopen without duplicate identity/client/case.
2. Import/paste once → summary → answer missing item in chat → continue; unchanged facts not re-asked.
3. Conflicting answer/version → explicit scoped resolution or 409 with input preserved; interrupted/late stream cannot apply.
4. Search → explicit case selection → source/material reuse → English draft/readiness → preview/export → logout/reopen.
5. Two accounts/cases/tabs: no residue, cross-tenant access, stale authority or duplicate lost-response write.
6. Artifact/draft/final/stale status and provenance remain truthful; official link action does not claim filing success.
7. Desktop keyboard and mobile layout/composer reachability, zh/en; auth visibility independent of confirmation field.
For every row publish exact SHA, Pass/Fail/Blocked/Not run, evidence type (source/unit/HTTP/DOM/browser/live-provider), sanitized reproduction and residual limitations. Existing 23 browser tests do not certify these new requirements. Root keeps live full-story acceptance separate; source QA does not require expanding Local access.

## Phase 2: only after Phase 1 validates the workflow

### W6 · P2 · Reusable case progress and receipt evidence
Owner: root data/workflow, Kimi display, Local independent QA. Design first in `docs/case-workflow-status.md`; runtime changes in isolated workflow module plus `case-records.js`/`storage.js` only after reviewed backward-compatible schema contract.
Dependency: W2 confirmed facts/provenance and W4 validated action taxonomy.
Acceptance: reuse actual existing case/material/artifact versions; distinguish not assessed, applicability unknown, prepared, user-reported sent, receipt verified, agency response and closed. A receipt must reference real evidence with source/time/version; a signature or approval is never synthesized. Absence of an import does not prove an agency lacks a document. Record next needed information/action without repeating completed questions. No migration or new status taxonomy just for dashboard decoration.

### W7 · P2 · Persistent material/record reuse gaps, only where proven
Owner: root storage/assets; Kimi discovery surfaces; Local read-only gap confirmation. Boundaries: `asset-records.js`, `private-assets.js`, `asset-domain.js`, customer assets/workspace modules and existing retention docs; schema changes require separate reviewed contract.
Acceptance: discover and reopen authorized client/case/material/artifact records without re-uploading supported retained material; clearly state when only extracted text, not original binary/pixels, was retained. Preserve current retention consent, tenant isolation, bounded payloads, version/conflict semantics and deletion/recovery rules. Reuse existing APIs before proposing new infrastructure. No Drive backend migration in this issue.

## Done and handoff protocol
- [ ] W1 existing auth lanes integrated and tested
- [ ] W2 minimal conversational-confirmation contract + implementation + negative tests
- [ ] W3 Kimi design ACK/reference → root integration → visual retest
- [ ] W4 verified stage-1 official action links
- [ ] W5 exact combined candidate accepted with explicit remaining live blockers
- [ ] W6/W7 assessed after Phase1; only evidenced gaps become implementation scope

Root retains release control. A lane's completion needs a PR/immutable SHA, files, passed/failed/not-run evidence and next dependency, not “aligned”. No broad rewrite, duplicate issues or notification flood. Kimi #3 and Local #1 remain their dispatch channels; this is the single outcome/acceptance index.
