# Chat feature

Public export: `ChatPage({lang='zh', caseId=null, guidanceAgency='unknown', onCaseChange, onDirtyChange?, onImportFiles?})`.

- `onCaseChange(id)` binds a newly saved case to the current workspace. It is not an instruction to switch to a different customer's case.
- `onDirtyChange(boolean)` covers unsent text/images, pending decoding and active streaming. App must confirm actual case switches, then remount case features using its workspace epoch. Account changes always remount.
- A same-workspace null→ID binding from Intake preserves unsent chat text and prepared images. Pending old-context decodes are invalidated.
- `onImportFiles(files,{caseId,userId})` hands PDF/TXT/CSV/XLS/XLSX browser File objects to Intake. App rejects stale handoffs and owns temporary file lifetime. Chat does not parse or overwrite source material.
- Navigation may hide this component without unmounting to preserve an unsent composer. Unmount, account changes and true case changes abort requests and revoke all owned object URLs.

The first send creates a real empty case and conversation before calling `/api/chat`. Any creation failure stops the operation. Existing case data is never overwritten by chat typing. Persistent requests contain exactly one new user message plus conversationId and a fresh clientMessageId. The server supplies saved history and facts.

The root's separate official-reference selector supplies `guidanceAgency`, a strict registry ID. Clients cannot supply reference URLs or policy prose. The server defaults omitted IDs to `unknown` for earlier clients and rejects unknown IDs/extra source fields. Both ordinary and opt-in library chat receive an English registry snapshot bounded to 8,000 serialized characters, including official URLs, check date, displayed editions and acceptance uncertainty. This does not infer the responsible case agency, add case facts, fetch websites or provide another model/tool capability. Instructions require Chinese/English conversational explanations with English formal drafts, current-applicability checks, no agency-approval claims and no hidden reasoning. Prompt instructions are not a guarantee of live-model answer quality; real-provider source fidelity still needs acceptance testing.

The updated frontend and backend ship together because earlier backends reject the new request field. The shipped source registry is distinct from the per-request saved-library `[S1]` references and never becomes a retrieved customer record.

Failures retain received partial text, then reload actual saved history. A reload racing disconnect cleanup keeps a clearly labeled local partial until the server confirms it. Retry places the question back in the composer; a new paid request requires another explicit Send. No automatic provider retry or transient fallback exists.

PNG/JPEG headers are bounded before actual browser pixel decoding; pixel dimensions are then checked again. Prepared image bytes and blob previews live only in memory. Historical messages explicitly state that earlier pixels were not retained.

## Evidence

`node --test frontend/features/chat/logic.test.js` covers pure payload, bounded image-header, saved-history, SSE-byte parser and bilingual-error contracts. Authored SSE fixtures test a parser and are not a real model response or provider-access acceptance.

The feature transforms/imports through the actual Vite pipeline. Full production-CSP browser and paid-provider acceptance must be recorded separately after App integration. No sample chat history or provider fallback is shipped.

## Suspended-session text recovery

`useSuspendedDraft('chat')` stores only `{input,conversationId?}` in the current tab's bounded memory vault. The Session provider alone verifies identities; reads/writes are sealed during suspension. Only the same server-verified user may recover within 30 minutes. Logout, another account, expiry, or a backward clock clears recovery data. No images, blob URLs, consent, model history, passwords or API keys enter this cache.

Question text remains recoverable while a send is awaiting confirmation, then clears when a done event or server history confirms the user turn. Recovery never resends automatically; the user must inspect saved history and explicitly send again. Image attachments must be added again after expiry. Oversized or encoded/forbidden snapshots fail without silently evicting another draft, and the UI warns that temporary recovery is unavailable.

`component.development.test.js` uses actual React/Radix in a DOM emulator with controlled HTTP/SSE fixtures. It tests lifecycle behavior, not a browser layout engine or real provider. `frontend/lib/draft-vault.test.js` separately covers identity sealing, expiry, strict JSON rejection, limits and detached clones.

## Optional saved-library retrieval

The composer has no per-message checkboxes. Send enables read-only proposals; explicit Apply/Save still controls every write. A compact notice identifies DeepSeek and ordinary message, image, selected-case context and current-conversation processing.

Saved-library retrieval requires a separately recorded account/provider/policy/category grant. Before each eligible send, the client reads `/api/library-permission`. Unset permissions open a first-use dialog; allow/deny is remembered by the server and revocable in Account and settings. Declining keeps ordinary chat working. Cancel preserves input without granting anything. Permission is never recovered from the suspended-draft vault or browser storage. See [permission flow](../../../docs/chat-permission-flow.md).

`/api/status.libraryRetrievalEnabled === true` enables permission lookup; absent capability leaves ordinary chat usable. `buildChatTurn` sends `libraryConsent:true` with the exact `libraryPermissionVersion` only after an active grant. The server independently enforces it. Opt-in responses still must acknowledge `X-Library-Retrieval: enabled`; a missing acknowledgement is a visible error, never a claimed retrieval success.

- `activity`: only `phase` (`searching`, `reading`, `retrieving`), `state` (`started`, `completed`, `error`), bounded `count` (0–8), and fixed `LIBRARY_*` error codes are retained. UI prose comes from the local zh/en dictionary. No invented intermediate progress is shown.
- `sources`: one event per request, matching the terminal request ID, with at most 48 records, a 16,000-character appendix and a 64,000-character serialized event. Record IDs, versions, kinds, retrieval states, optional timestamps/stale/truncation flags and excerpt offsets are checked by `retrieval.js`; arbitrary URLs, snippets, arguments, tool prose and reasoning fields are discarded.
- The source list distinguishes metadata-only, partial excerpts read, and unavailable body text. Historical/draft status remains visible. Every title and reference renders as plain React text with no external anchors or HTML interpretation.
- `sources.appendix` is the sole transport for the server-generated appendix. It is appended once to the streamed reply, within the existing 64,000-character total bound. The server persists the same appendix; history reload replaces the local body rather than appending it again. Structured source metadata is transient, while source references survive as assistant text.
- Existing user/case/conversation epoch checks protect every received activity/source event and clear prior-account UI. No retrieval metadata, snippets or consent enter browser persistent storage or telemetry.

### Retrieval evidence and remaining acceptance

October 7, 2026: the Chat feature's 24 focused tests pass (23 pure/protocol/controlled-response React-DOM checks plus one real loopback HTTP/SQLite guard test). Coverage includes default-off and per-send consent, same-user expiry reset, no consent in recovered text, case/account switches with delayed replies, capability changes, absent response acknowledgement, bounded event/source schemas, plain-text-only source titles, one appendix through history reload, and legacy ordinary payload compatibility.

The HTTP test uses actual application routes, sessions and SQLite with no provider key. It establishes failure/capability boundaries, **not** a successful retrieval/tool call. SSE fixtures in the development tests are authored test data, not real provider output. Combined backend retrieval/persistence integration and authorized Local browser/provider acceptance remain separate gates. No standalone Chromium was launched for this change.

To validate on an authorized browser after combining the backend: open `/next/`, verify the library option begins unchecked, opt in and send one safe synthetic lookup, inspect truthful activity and source states, copy the reply, reload the conversation and compare the single retained source appendix. Confirm the option resets after sending and after expiry/relogin, and switching accounts/cases cannot show the old request's sources. Ordinary text/image chat and document handoff should still work with the option off.

### Main-branch polish integration

The main-branch chat layout, role-aligned messages, compact composer, explicit Send/Attach controls, Enter versus Shift+Enter/IME behavior, and accessible icon-only reload control are retained. The saved-conversation picker still distinguishes no saved history from the New conversation action. Library permission/activity/source handling remains separate, and source cards never claim persistence before the reply save state is confirmed.

## Assistant Markdown display

`AssistantMarkdown` parses model replies with pinned `react-markdown` and `remark-gfm`.
This is a presentation layer only: original message strings, source IDs, stored
content, Copy reply and document handoff stay unchanged. User messages remain
literal escaped text. Unfinished streamed Markdown is reparsed as text arrives;
no completion text or fact is invented.

The renderer supports emphasis, lists, headings, blockquotes, fenced/inline code,
GFM tables and disabled task checkboxes. Wide tables and code scroll within the
message. Tables have keyboard-focusable, localized scroll regions and column
headers. Styling uses the existing warm-white/forest semantic tokens.

Raw HTML is skipped, embedded images become descriptions without network loads,
and executable/relative/protocol-relative URLs are rejected. Explicit HTTP(S)
and mail links open separately with no opener or referrer. Links in model prose
are unverified external references, never the authenticated source-navigation
controls. No raw-HTML plugin, syntax execution, resource fetching or HTML storage
is introduced.
