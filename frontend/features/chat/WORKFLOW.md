# Conversation-to-case workflow bridge

This bridge reuses the existing mounted materials and document editors, plus the authenticated case/readiness/artifact APIs. It adds no schema, agent framework, account permission or provider call.

## Explicit steps

- Chat shows the saved case's document readiness questions, confirmed details and resolved issues. Existing confirmed answers are not redisplayed as missing questions. This is a read-only snapshot; the document editor rechecks readiness and versions before generation.
- “Review for this case” on a complete, server-persisted message opens the same case's materials editor with a separate pending text preview. An explicit append action adds an `UNREVIEWED AI RESPONSE` or `UNREVIEWED USER MESSAGE` source block with the stable conversation/message IDs. It cannot replace pending material or mutate/confirm any field. Cancel changes nothing. Exact repeated source blocks are not appended twice.
- “Finish and preview English document” uses the existing document workspace, keeping its pending edits and the conversation composer mounted. Pending material or a pending text review is handled first. The existing missing-question confirmation, optimistic versioning, final generation, immutable versions, preview and export gates remain authoritative.
- An assistant's complete, stored English answer can explicitly save as an unreviewed draft through `/api/cases/:id/artifacts`. It includes stable source IDs and a visible unreviewed warning, never uses `status: final`, never calls the fact-confirmation route and never overwrites the materials/document draft. The server records the existing `user-edited` generation method because this is an explicit user save, not reviewed-template generation; message provenance identifies the assistant answer.
- Draft saving checks the canonical stored message and current case version. Matching previously saved content is reused. Lost, cancelled or uncertain POST responses expose status checks rather than blind POST retries. Actual 409 responses remain visible. Delayed prior-case/account responses cannot publish a saved claim or write after the scope changes.
- Chat-original retention is integrated through `ChatOriginalRetention`. Validated attachments retain their exact File and name in current-tab memory. Only its explicit per-image save retains original bytes. Sending chat still does not retain originals. Original saves and answer-draft saves synchronously block competing sends; first-save binding retains the current composer.

## Limits

- This is guided, explicit navigation between the existing owners of case drafts, not a new autonomous agent loop or automatic extraction/confirmation of chat prose.
- Message handoffs are capped at 48,000 characters so the provenance/warning fits the existing 50,000-character source/artifact bounds. Incomplete/local-only responses have no review/save actions. The existing copy action remains available.
- Saved-answer drafts use the existing document English/CJK review gate. Chat messages remain in their original language. A model answer still needs human review for correctness, recipient, facts and suitability; a saved draft is never official approval or a completed submission.
- A new-case POST with an uncertain outcome does not silently create another case. The operator is told to inspect Customers and open the saved case. No new idempotency/storage contract is invented.
- A pending text-handoff preview is transient; the canonical source message is already persisted. App case/account switches clear the preview under the existing dirty-work guard. App session recovery remains the existing same-account, current-tab text-only mechanism.

## Evidence

`workflow.http-dom.test.js` uses real HTTP, SQLite, actual React DOM events and an authored synthetic saved conversation. It covers same-case handoff/cancel, existing unsaved material/composer/document edits, unchanged confirmed facts, only missing questions, final-template persistence, source-linked draft saving, duplicate clicks, a deliberately dropped actual save response, pre-write cancellation, real concurrent-version 409, late prior-case responses, and server restart. It makes no provider, Chrome, layout, CSP or production claim.

`test/frontend-browser/chat-workflow.spec.js` is an official-CI browser gate for the integrated first-save image action, exact original bytes, composer preservation, pending-material routing, targeted questions, English generation and mobile 390px state. No model call or fake assistant reply is needed. Listing this test locally does not establish browser acceptance; it must run on the published exact combination in official CI.
