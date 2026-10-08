# Account-scoped saved-library permission

Implementation candidate, 2026-10-08. Not a deployment or real-provider acceptance claim.

The chat composer has no per-message consent checkboxes. Sending a message requests a normal DeepSeek answer and enables read-only, reviewable case/draft proposals. Saving or applying a proposal remains a separate explicit action; facts are not automatically confirmed.

The composer discloses that sending includes the message, attached images, bounded selected-case context and that conversation's history. Saved-library retrieval is a separate permission for relevant excerpts of this account's saved customers, cases, files and documents. It does not grant cross-account access or enable automatic writes, sending, submission, signatures, approval or eligibility decisions.

Before a chat with retrieval, the client reads the current server permission. A missing or obsolete decision opens an accessible first-use dialog identifying DeepSeek, data category, purpose, persistence and revocation. Allow and Continue without library are separate buttons. Cancel/Escape retains the unsent message and does not create a case, call the provider or write permission. An unavailable permission API offers an explicitly selected ordinary-chat-only route; failure never turns retrieval on.

The server owns the account/provider/policy/category/version record. Browser draft recovery never stores permission. The client sends the matching grant version, and the server is the authority even if a tab is stale. Account and settings exposes the current decision and a direct turn-off action. Declining is remembered; it does not block ordinary chat. A provider/policy identity change requires new approval. Existing accounts receive no inferred grant.

Schema9 is an implementation prerequisite. Independent boundary review, migration/restore tests, aggregate checks and actual browser acceptance must pass before publication/release claims. Restoring an old database must not resurrect a revoked grant. See the schema-specific backend contract and dated validation record for exact evidence and remaining gates.
