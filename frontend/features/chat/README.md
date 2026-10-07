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
