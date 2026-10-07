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
