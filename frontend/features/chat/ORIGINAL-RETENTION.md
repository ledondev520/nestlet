# Explicit chat-original retention

## Integration contract

`ChatOriginalRetention` is a composer-only action panel. The chat owner passes:

- `api`, verified `userId`, `authenticated`, current `caseId`, `lang`
- `images`, containing the validated chat image's `id`, `mimeType`, `originalFilename: file.name`, and `originalFile: file`
- `ensureCase(signal) => Promise<{caseId, userId}>`, using the chat owner's guarded same-workspace case creation/adoption flow
- `disabled` for chat loading/sending; `onBusyChange(boolean)` to block competing send, removal, attachment, and conversation-switch actions while retention is active
- `onOpenMaterials()` to open Materials for the same workspace, if available

The parent owns case changes and unmounts real workspace switches. Empty-workspace to first saved case ID is a binding of the same workspace. No encoded image, File, asset result, or credential is added to the suspended draft vault or browser storage.

## Behavior and data flow

1. Attaching or sending an image alone does not retain it
2. The operator explicitly chooses an individual original to save before sending
3. The panel validates the original File and hashes its exact bytes locally
4. The chat owner saves/binds the same case if needed
5. A bounded same-case asset metadata read checks for an existing exact filename, MIME, length, and SHA-256 match
6. If absent, the existing private asset API receives the original File with explicit retention consent and the case ID
7. Only a validated matching result creates the saved status and authenticated preview/download links

The existing asset API provides ownership isolation, quotas, private-file storage, filename search, and actual original retrieval. No backend, schema, permission, credential, provider, or telemetry contract is added. Images remain unavailable for text extraction/OCR. The existing Materials page can discover and retrieve saved originals; it does not imply image-text indexing.

## Failure and cancellation boundary

A duplicate click is blocked synchronously. A definite server rejection can be explicitly retried. Once an upload may have reached the server, a failed response, timeout, or Stop waiting is an uncertain outcome, not proof of failure. The action then only checks for a matching saved original; it does not repeat the POST. If no confirmed copy appears, the panel remains truthful and offers another status check or Materials navigation. There is no backend idempotency key, so this bounded panel does not claim cross-tab exactly-once writes or automatic recovery from every lost response.

Case/account changes and unmount abort local requests and discard UI state. Late responses cannot populate a different workspace. Abort does not roll back a completed server write. The image bytes and any explicitly authorized save remain governed by the existing private-materials lifecycle.

Historical chat metadata stays `retained: false`: chat history itself has no image bytes or per-message asset association. A separately saved original is case-associated and searchable in Materials. Missing older bytes cannot be reconstructed. Sending still uses the existing explicitly consented chat/provider path; saving an original never invokes a model.

## Local evidence, 2026-10-07

Isolated branch based on `5335312fd53becaad4bfccace5c1f3e39c6bf4f2`. Pinned dependencies were reused from an existing checkout with byte-identical `package-lock.json`; no install or network download was performed.

- Four adapter tests: exact original File and bytes, matching constraints, bounded pagination, foreign-case rejection, missing originals, and pre-upload abort
- Seven React/jsdom tests: explicit selection, duplicate clicks, truthful pending/saved states, definite retry, uncertain reconciliation without reupload, cancellation, same-workspace binding, and stale case/account responses
- One actual local HTTP/SQLite/private-file plus React/jsdom test: exact PNG/JPEG originals, explicit selection, response loss after an actual committed save, read-only reconciliation, search/preview after process restart and fresh login, duplicate reattachment, and independent account isolation including cross-case write rejection
- `npm run check`: pass
- `npm test`: 312/312 pass
- `npm run test:frontend`: 236/236 pass, including these 12 new tests
- `npm run build`: pass with the existing bundle-size advisory; this standalone branch does not yet wire the new panel into the chat entry point

These are source, fixture, and development-DOM results. Real Chromium acceptance, integrated chat-flow acceptance, public CI, production behavior, deployment, and real provider calls are not claimed. The coordinating chat workflow change owns the entry-point integration and combined verification.
