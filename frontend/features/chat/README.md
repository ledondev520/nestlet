# Chat feature

Public export: `ChatPage({lang='zh', caseId=null, onCaseChange, onDirtyChange?, onImportFiles?})`.

- `onCaseChange(id)` binds a newly saved case to the current workspace. It is not an instruction to switch to a different customer's case.
- `onDirtyChange(boolean)` covers unsent text/images, pending decoding and active streaming. App must confirm actual case switches, then remount case features using its workspace epoch. Account changes always remount.
- A same-workspace null→ID binding from Intake preserves unsent chat text and prepared images. Pending old-context decodes are invalidated.
- `onImportFiles(files,{caseId,userId})` hands PDF/TXT/CSV/XLS/XLSX browser File objects to Intake. App rejects stale handoffs and owns temporary file lifetime. Chat does not parse or overwrite source material.
- Navigation may hide this component without unmounting to preserve an unsent composer. Unmount, account changes and true case changes abort requests and revoke all owned object URLs.

The first send creates a real empty case and conversation before calling `/api/chat`. Any creation failure stops the operation. Existing case data is never overwritten by chat typing. Persistent requests contain exactly one new user message plus conversationId and a fresh clientMessageId. The server supplies saved history and facts.

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

The dedicated library-permission checkbox explicitly allows relevant excerpts from the signed-in user's saved library to be sent to DeepSeek **for one send**. It defaults off and resets when a send starts, on expiry, account/case/conversation changes, and unmount. It is never written to the suspended-draft vault. The merged main branch uses an explicit Send action for ordinary chat, without its former extra checkbox. The separate library permission remains unchecked by default. Image handling and the separate Intake handoff are preserved.

`/api/status.libraryRetrievalEnabled === true` enables the option. An absent/false capability shows an unavailable explanation and ordinary chat stays usable. `buildChatTurn` omits the optional field when false for strict legacy-backend compatibility; true is sent only after the live capability guard. Opt-in responses must acknowledge `X-Library-Retrieval: enabled`; a missing acknowledgement is a visible error, never an ordinary-chat success. Request headers and the shared API client are unchanged.

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
