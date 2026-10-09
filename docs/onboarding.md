# Current operator session

Updated October 9, 2026 against main `52f6ce549ea847274caaa3b973814bc23f448b3a` (PRs #50–54). Prioritize completing the user's task and checking the whole journey. Commercialization is deferred: existing manual service controls are not checkout, payments or subscriptions. No ROI or time saving has been demonstrated. Dated October 7 validation matrices and design plans remain historical evidence, not current setup instructions.

## 1. Use the trusted entry point

Public trusted HTTPS activation was verified in the [October 7 deployment run](https://github.com/ledondev520/jiesong-system/actions/runs/37579840911). Use the authorized service address; do not enter credentials on an untrusted/IP-only public page or bypass a certificate warning. A historical HTTPS check does not guarantee current availability.

Owner setup remains a private, authorized operator action. No default password or API key is created. The operator personally enters and submits credentials through the approved private setup or authenticated HTTPS form; never put passwords, hashes or keys in chat, screenshots, source files or support logs.

## 2. Sign in and understand session expiry

Sign in with your own account. The owner manages provider settings; ordinary users cannot change them. Registration assigns an ordinary role, never owner or administrator privileges. Follow the displayed email-verification steps when required; successful registration verification signs in automatically. Delegated administrator diagnostics do not grant provider control or access to another user's records.

Sessions are stored in private SQLite and survive routine service restarts while still valid. The browser uses an HttpOnly, SameSite=Strict cookie, Secure under HTTPS, with CSRF protection. Ordinary sessions expire after 30 minutes idle; remember-me removes that idle cutoff, but **every session expires eight hours after creation**. Restart does not extend either deadline. Logout, credential changes and supported restore invalidate sessions as documented in [durable sessions](durable-login-sessions.md). This is not permanent login.

If a connection or login check interrupts work, use the displayed recovery action and inspect saved history before sending again. Same-tab recovery is bounded and temporary, not a durable backup of unsaved input or replies. Save or copy anything important before signing out, switching workspaces or closing the page.

## 3. Owner sets up the assistant with Save

Only `deepseek-flash` is supported. In the authenticated HTTPS assistant settings, the owner enters the authorized key and chooses **保存 / Save**. There is no separate model-list check or connection-test button. Save makes one fixed synthetic completion, with at most eight output tokens and a 15-second deadline; it sends no case, conversation or library material and can consume provider quota. A successful check proves that bounded completion worked at that time, not future billing availability, extraction accuracy or privacy suitability.

After validation and a fresh owner-session check, settings are encrypted in a separate private SQLite store before becoming active. Validation, authorization or persistence failure leaves the previous working configuration unchanged. The UI does not return the key. A separately authorized stable wrapping-key file is required; unavailable secure storage blocks Save before a provider call. See [atomic setup](model-setup-and-conversation-context.md) and [encrypted provider storage](provider-config-storage.md).

Successfully saved settings and their verification timestamp survive restart when both the private database and wrapping file are preserved. Restart itself makes no verification call. An existing environment-provided connection can remain the baseline until a validated Save; it is **not automatically imported**. Configured/enabled status alone does not prove encrypted storage. Confirm `keyStorage: encrypted-database` and its retention across restart before claiming a database-backed credential was verified. The production baseline reported for this release remains environment-provided; no real-key database migration is claimed here.

Encryption at rest is not a complete privacy program. Before any production tenant material is sent, resolve provider terms, retention, training use, geography and authorization. Use synthetic or thoroughly de-identified material for the current validation workflow, and grant library disclosure only when intended; it is separate from signing in or enabling service.

## 4. Understand access and request limits

Each user sees their own saved records; even the owner has no all-user case list. Optional named-trial setup remains available through the authorized private CLI described in [SQLite runtime](sqlite-runtime.md). It is not needed for ordinary web registration. Credential rotation preserves that user's saved cases and invalidates their sessions.

Ordinary accounts without a manual service override default to enabled access with no expiry and ten AI requests per rolling hour; no separate commercial activation is required. All ordinary users share thirty per rolling hour. The owner can manually pause access, set expiry or choose one to thirty requests per hour. Usage reservations persist in SQLite across restart; failed admitted attempts still count. Optional generated titles have their own reservation. These are application request allowances, not upstream-call/token counts or guaranteed money limits. Paused or expired AI access does not block the user's own saved records and exports. See [service access and recovery](service-access-record-ids.md).

## 5. Complete one task from conversation to document

1. Open the workspace and continue an existing conversation or choose **新对话**. Ask a natural question; uploading a document is optional.
2. When needed, add safe material or open **材料**. TXT/CSV/PDF/XLSX/XLS parsing happens on the application backend; text-PDF parsing is not OCR. Inspect reading order or select and map the workbook's actual sheet/row.
3. Open the exact source for a proposed fact. Review values, conflicts and unknowns before confirming or saving; a request for information is not evidence that the agency never received it.
4. Return to the same conversation. Confirm saved history and visible save feedback rather than assuming every received reply is durable.
5. Open the resulting document, edit and save it, then preview/download the supported export. Inspect facts, recipient, dates, placeholders and attachments before using an English supplementary draft externally.

The actual PHA and current requirements must come from evidence. An unknown PHA does not inherit SFHA requirements. Generic guidance, requested rent and operator-reviewed facts are not agency approval. No email, official submission, signature, housing eligibility decision or rent approval is performed automatically. For failures, retain the visible error and unsaved work, check the connection or latest saved version, then explicitly retry only the intended action.

## 6. Save and recover deliberately

Explicitly saved case text, reviewed facts and drafts belong to the signed-in user. Saving a case alone does not preserve original PDF/Excel bytes; explicitly saved private files use separate owned storage. Opening saved work restores that record. Clearing the workspace or signing out does not delete saved records. Unsaved browser work is not guaranteed to survive refresh, closing the page or logout.

The case cap is 100 per user. Version conflicts do not silently overwrite another edit: copy/export work you need, reopen the latest record and compare. The dedicated database and original-file storage must be preserved across releases. Automatic backups are not configured; follow [manual backup and recovery](private-data-operations.md). Case backups do not include the separate provider credential store or wrapping key. Never prune the data volume as routine deployment or rollback.

## 7. Verification boundaries

- **Synthetic end-to-end evidence:** official CI exercises real application authentication, HTTP, SQLite, parsers and browser task flows with synthetic data and a controlled provider. The current main's [66-scenario browser run](https://github.com/ledondev520/nestlet/actions/runs/37873769269) passed on `52f6ce549ea847274caaa3b973814bc23f448b3a`; later releases need their own exact-commit evidence. These fixtures do not establish real-provider quality or production credential migration.
- **Production evidence:** the [final deployment run](https://github.com/ledondev520/jiesong-system/actions/runs/37874251763) succeeded for `52f6ce549ea847274caaa3b973814bc23f448b3a`. A limited manual production check on October 9 used an existing synthetic conversation: repeating its prompt identified the latest final document version 3 and case version 4, distinguished unknown agency requirements from no requirements, retained the result after refresh, and downloaded/opened/parsed the actual PDF. This manual observation is separate from, and cannot be independently proved by, CI. It does not prove browser-entered real keys were encrypted, production email delivery, a complete real-customer journey or an agency-accepted document. The environment-provider baseline remains distinct from validated browser Save. No additional live model call is performed by updating this guide.
- **Not established:** a real-case pilot, time savings/ROI, verified local PHA pack, official-form completion, broad production privacy/security assurance or commercialization readiness.

Use [validation](validation.md) for dated engineering evidence and [deployment](deployment.md) for operational context. Historical pending statements and unexecuted plans retain their original scope. Judge the actual task by source accuracy, saved-state feedback and recovery on desktop/mobile; screenshots alone are insufficient acceptance.
