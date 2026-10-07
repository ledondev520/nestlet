# Current delivery contract

Revision: **2026-10-07-r5** · acceptance checkpoint **14:00 UTC / 22:00 Asia/Shanghai**

Owner updated deadline and responsibilities at09:06–09:14 UTC. This is the current product scope and coordination index. It supersedes older one-shot-upload-only scope and organization-layer proposals. It is a requirement list, not a completion claim. Exact implementation evidence belongs in [the acceptance matrix](acceptance-matrix-2026-10-07.md).

## One user journey

1. Register/sign in; the administrator manages service settings, ordinary users manage their own information. Password minimum is **6**, maximum **256**. Existing usernames/admin aliases remain compatible while email verification is added.
2. Begin from a conversational home. Paste text or supported images, drag/drop documents, or select files. See genuine streamed response content, processing status, cancellation and explicit error/retry handling.
3. Find or create a customer, such as a clearly synthetic Johnny, and choose their case. Search names and browse saved documents instead of starting from scratch each time.
4. Extract available facts from supplied materials. Ask targeted questions for required missing information. Preserve confirmed facts, corrections, provenance, and resolved questions; do not repeatedly ask questions already answered unless information conflicts or is stale.
5. Produce an English document from sufficient verified case information. Show readiness and missing items first. Do not call a document complete while required names, recipients, dates or other material facts are placeholders. Optional unavailable fields can be omitted. Never invent a person, agency, deadline, attachment, approval or housing determination.
6. Preview/edit/copy/download the artifact. Persist the customer, case, conversations, confirmed facts and artifacts under the authenticated user. Reopen after logout and service restart, then continue the same case.

## Design system and migration

- Use real shadcn/ui components with a reproducible React/Vite JavaScript/JSX build, not renamed custom CSS. Migrate the complete product journey incrementally and report actual coverage.
- Preserve Kimi’s design direction and define reusable tokens, component states and responsive rules; see [design system contract](design-system-contract.md).
- Verify desktop keyboard/focus and mobile320/390px, soft keyboard, safe-area, touch and long-document behavior. A component library alone does not establish accessibility compliance.
- An isolated migration preview is not the production release. Switch the default entry only after integrated functional, visual and deployment checks.

## Data and authority boundaries

- **Per-user isolation now. No organization/workspace/invitation subsystem in this MVP.** A system administrator is not implicitly entitled to read all users' customer documents.
- User → customer → case → conversations/artifacts. Persist on server-local SQLite. Multiple conversations and documents can belong to a case.
- Chat answers are proposals, not automatically confirmed facts. Explicit changes and provenance distinguish user-confirmed information from model suggestions.
- Retain useful case history and action outcomes. Never put passwords, provider keys, raw document text or image payloads into operational telemetry.
- No autonomous model retraining or cross-user knowledge sharing is implied by “gets better with use.” Reuse verified case knowledge and resolved issues; record conflicts and corrections.
- Output English; interface fully Chinese by default with English switch. Government materials remain source-grounded; supplementary correspondence is not an official agency form or a legal/eligibility decision.

## Delivery ownership

| Lane | Owner | Immediate deliverable |
|---|---|---|
| Design direction | Kimi | Visual language, UI/UX, layout, semantic design tokens, desktop/mobile reference states |
| Frontend engineering | Root engineering | Chat/account/case isolation, real API wiring, durable customer journey, final artifacts, telemetry, shadcn/ui migration |
| Persistence and chat/backend integration | Root backend lane | One published API/storage contract, backward-compatible cases, customer search, conversations/artifacts, per-user authorization |
| Document completion | Root document lane | Validated document details, bilingual missing-item questions, readiness, confirmed provenance, no placeholder-filled final artifacts |
| Email authentication | Local Codex | Compatible email/password verification/recovery module and tests, actual mail readiness through approved configuration; UI contract to Kimi |
| Browser acceptance and release | Local Codex | Exact combined SHA, actual end-to-end evidence, rollout verification through its existing authorized environment |
| Coordination/integration | Root | Contract updates, received acknowledgments, review, CI, safe merge and verified delivery report |

Design/frontend coordination: [Issue3 current comment](https://github.com/ledondev520/nestlet/issues/3#issuecomment-6033437433). Email lane: [Issue1 assignment](https://github.com/ledondev520/nestlet/issues/1#issuecomment-6033507865).

## Integration rules

- One owner per shared file. Agree storage/server migration boundaries before edits; use independent modules/worktrees where possible.
- Receipt must state task revision, work in progress and next expected result. Completion requires immutable SHA and specific evidence, not “aligned” or a changed label.
- CI success is necessary but does not replace real-browser acceptance. Test the exact final combination; distinguish passed, failed and not run.
- Do not expose credentials or private deployment configuration in public Issues/PRs. Keep account initialization in the already established private owner flow.
- Email delivery, real vision/SSE, current production login and newly expanded persistence must each earn their own evidence. Earlier component checks cannot certify them.
- The deadline does not authorize shipping known broken core behavior. Report remaining gaps precisely if any part is not complete.
