# Engineering baseline: real-browser acceptance handoff

Prepared 2026-10-07 09:26 UTC. Final checkpoint: **14:00 UTC / 22:00 Asia/Shanghai**. This is a test plan, not browser evidence. Record the exact integrated commit before execution; the engineering working tree is not the React/shadcn branch.

## Evidence already available

- 09:24 engineering candidate: syntax passes; strict231/231 actual core/HTTP/SQLite/parser tests pass, no provider doubles or real paid requests
- The extra strict test follows a genuinely server-created first-action workflow through case creation and disabled-provider persistent chat; request IDs and case/user association are checked without a setup roundtrip, and content markers stay out of metadata
- Development-only DOM diagnostics: chat8 and library5 pass separately. These use controlled responses/stream fixtures and simulated bitmap completion. They are explicitly excluded from strict231 and do not establish browser pixels, native decoding, actual provider streaming or complete user acceptance
- Historical browser/production/provider evidence remains in the scenario matrix; do not inherit those passes into this build

## Preconditions and evidence format

Use the separately authorized Local Codex browser and disposable real accounts/database. No production customer records. Keep the existing private API configuration private; do not ask for it again, print it, copy it into screenshots, or repeat the earlier component probe. Provider-dependent steps need the approved application/key path and should remain marked unrun if unavailable. Do not replace network/provider responses to manufacture an end-to-end pass.

Capture: scenario ID, UTC time, full commit, OS/browser version, viewport/zoom, locale, account role, input fixture hash, actual steps, actual HTTP statuses/request IDs, visible result, safe screenshot/download evidence, remaining limits. Suggested viewports:1440×900 and390×844; add320px overflow/keyboard check. Logs/screenshots must not include cookies, CSRF tokens, credentials, real names or private paths.

## Core first-chat and lifecycle scenarios

| ID | Actual steps | Required result |
|---|---|---|
| E01 source versus composer | Import actual synthetic TXT/PDF or type source into Case source material. Type a different question in the chat composer and send using the approved live path | Saved source remains byte-equivalent; question does not replace or erase materials; composer clears only after the turn is accepted; reopened case retains source |
| E02 persistence is required | Start a new ordinary user's case and conversation from the real UI. Separately interrupt connectivity during case/conversation creation | Successful path has durable case/conversation IDs and only one latest user message plus clientMessageId in each chat request. Failed creation does not call /api/chat, invent an answer or clear the unsent question |
| E03 actual incremental SSE | Send one bounded synthetic question; observe real application SSE and visible incremental text | Deltas originate upstream rather than a timer; done refers to saved assistant message; refresh/reopen reproduces the durable answer. Log exact provider/application evidence separately from parser tests |
| E04 Stop/incomplete/retry | During actual streaming click Stop, then reopen the same conversation and explicitly retry if wanted | Stop aborts the old request; partial text is visibly incomplete/interrupted, not final; source unchanged. Retry uses one new clientMessageId, no duplicate automatic paid request; incomplete history is not presented as complete |
| E05 New/reset during stream | Start actual streaming, click New/reset, then wait longer than the original response latency | Old text, status, error, images and finally callbacks cannot reappear in the new workspace. New composer is usable; no accidental association to old case |
| E06 logout/user switch | While actual streaming, explicitly log out; log in as a second disposable user, then wait | No old answer/frame/customer/case/image appears for the new identity. Old session cannot access the other user's content. Inspect both DOM and real API IDs |
| E07 switch case/conversation | Open another case/conversation during a pending history load or stream, using real network throttling | Last selected scope wins; the previous request cannot replace messages or labels. No transient unsaved chat is silently claimed persisted |
| E08 native image lifecycle | Attach real authored PNG/JPEG, preview/remove; attach again and switch/reset while native decode is pending if reproducible | Only supported bounded files accepted; cancelled decode closes without restoring chip/bytes. Old previews revoked. Reopened prior image-only turn states pixels were not retained; retry asks for reattachment rather than pretending vision access |
| E09 real vision | Through the approved application path send a safe image with one clearly visible synthetic marker | Actual provider result can be checked against the image. Unreadable information stays unknown. No claim of vision from image validation or a text-only provider probe |
| E10 temporary expiry/same identity | Expire/revoke a disposable session without changing its identity, retain an unsaved associated case, then sign back into the same account | Private lists/chat clear while signed out; same-account recovery retains source and clientId when saved. A different account clears the retained workspace. This does not replace the earlier real30-minute idle observation |

## Customer, facts and final-document journey

| ID | Actual steps | Required result |
|---|---|---|
| L01 customers/search | Create two synthetic customers, including Élodie; search Johnny/Élodie/élodie and literal%/_; create same labels in accountB | Search is own-user scoped, literal and bounded; labels do not become legal names automatically; customer selection retrieves its real cases/artifacts |
| L02 one answer completes facts | Open incomplete case; answer the consolidated missing property/contact questions once and continue | PATCH separates factChanges from document fields, uses expectedVersion, server-stamps the explicit confirmation and applies full returned case. Already confirmed answers are reused without repeat checkboxes |
| L03 original edits preserved | Begin with a user-edited legacy draft, then correct or withdraw a confirmed fact | Previous draft is archived once as immutable history in the same transaction; stale active text clears; archive remains readable. Failed save retains both original case and original draft |
| L04 actual final output | Generate each supported available final type from sufficient reviewed facts. Preview, copy, downloadTXT, and nativeprint/savePDF | Same current final body in all outputs; no DRAFT/NOT FOR SUBMISSION wrapper on final. Precise nonofficial/no-approval boundary remains; no unresolved required placeholders, invented attachments/agency facts or navigation/settings in print |
| L05 optional values and names | Leave optional date/salutation/attachments empty; use a verified proper name when applicable | Optional values do not force a confirmation loop; unknown facts omitted; retained verified names match source; surrounding formal prose is English |
| L06 stale final | Save final, change a material case fact in another tab, then open/download old final | Immutable old content stays readable and is marked stale/needs regeneration; stale download409 shows in-place guidance. New generated version uses the changed fact and downloads successfully |
| L07 source integrity | Try finalizing from an actual interrupted/failed answer and from a different case's message ID | Incomplete or wrong-scope source cannot support final; draft work remains explicitly draft. Do not create artificial provider answers just to claim this browser path |
| L08 restart and reopen | Save a customer with two cases, multiple conversations, resolved question, edited draft and final. Stop/restart the isolated app with same DB, then sign in and reopen | IDs, facts/provenance, question states, message completion states and artifact versions survive. Original images are not falsely restored. Existing sibling history remains intact |
| L09 isolation and concurrent edits | Open two tabs for same case; save inA then attempt stale save/delete inB. Separately inspect from userB and owner | Conflict409 preserves B edits and A persisted version. Neither another user nor system owner can read/change/delete A's customer/case/messages/artifacts |
| L10 files/locales/accessibility | Actual TXT/CSV/PDF/XLS/XLSX imports, unsupported/encrypted/no-text/oversize errors, CSV roundtrip; zh/en and desktop/mobile keyboard path | Real file bytes parsed; no success toast on failure; prior case preserved and retry works. Fully localized UI/errors, no clipped essential controls; formal output remains English |

## Correlated operational evidence

1. Begin with an empty real user session and no explicit workflow-creation action. Inspect the server-returned X-Workflow-Id, X-Request-Id and X-Telemetry-Status on the first business request.
2. Confirm the next conversation/chat operation adopts that workflow. Compare stored server events with the actual case ID and current user. A different user's workflow/request ID must not attach.
3. Exercise a success, a genuine failure, an actual cancellation and retry. Record measured server duration independently from client wait/active time; HTTP200 SSE with terminal error must retain failure outcome.
4. Put different public synthetic markers in source, title, message and filename. None may enter operational metadata; content is stored only in its authorized case/conversation records. Administrator telemetry access must not grant document access.
5. Lose telemetry connectivity while continuing a permitted business operation. No automatic duplicate paid request, fabricated success event or lost user work. Mark a missing event as missing, not reconstructed proof.
6. Browser dwell/hidden-tab/idle measurement requires actual visibility changes; the Node suite does not certify those measurements. Report the definition and observed tolerance rather than calling dwell a performance stall.

## Exit criteria

No core P1 isolation/data-loss/false-completion bug remains on the exact tested commit. Record passes, failures and unrun scenarios separately; strict tests, development DOM, real browser, native provider and deployment each retain their own evidence. Email verification/recovery and the separate React/shadcn migration are distinct lanes and need their own integrated acceptance before any completion claim.
