# Local agent coordination plan

Status: preparation only, 2026-10-07. This document defines a small implementation for Local Codex to review. No dispatcher, service, credential, webhook, or new agent access has been installed or enabled by this change. Existing task assignments and permissions still apply; this document does not grant permission to run agents, publish code, merge, or deploy.

## Proposed first version

Keep GitHub Issues and PRs as the shared task and evidence record. Add one local dispatcher that checks approved tasks every 60 seconds, optionally 30 seconds during active work, and calls supported Kimi and Codex interfaces. The timer is ordinary local code, not an LLM invocation on every poll. No new chat service, public endpoint, hosted queue, or terminal keystroke injection is needed.

Current lane assignments follow [the delivery contract](current-delivery-contract.md) and [collaboration contract](collaboration.md): dot/root coordinates requirements and backend integration, Kimi exclusively owns frontend, and Local Codex handles email authentication, browser QA, and authorized deployment. The dispatcher may use only those existing approvals that cover the specific action; new access or expanded scope needs approval. GitHub comments and labels record state; they do not themselves wake an agent or authorize an action.

Use separate worktrees for implementation and QA. Keep one dispatcher and one small local SQLite state file outside Git. Persist task claims, deduplication keys, API validators, session IDs, and pending result publication. Do not put credentials, private prompts, machine paths, or full agent transcripts into GitHub.

## Task contract

Use one Issue per task, with one designated machine-readable task block in its body. Verify repository and configured account IDs from GitHub metadata, not names written in the body. An Issue's original author is not proof of who edited its latest revision: verify applicable edit provenance or block an unverified change. Ordinary comments are context and evidence, never execution triggers or independent permission grants.

**Shared-account boundary:** root, Kimi, and Local Codex may all publish through `ledondev520`. A matching actor ID therefore identifies the GitHub account, not which agent authored or approved a task. Labels, an `owner` field, ACK markers, and hashes do not provide strong dispatch identity or authorization. The pilot must accept only task Issues pre-approved by the project owner, within a locally recorded fixed scope, branches, files, and allowed actions. Issue revisions cannot expand that approval boundary; uncertain provenance or scope changes block execution pending verified owner approval. Keep Kimi's manual approvals and Codex's approval/sandbox boundaries enabled. This design does not safely authorize unattended execution of arbitrary GitHub tasks. Strong signed dispatch or a separate bot identity would be a later design requiring separate approval; neither is configured here.

Required fields:

| Field | Meaning |
| --- | --- |
| `task_id` | Stable repository and Issue identifier |
| `revision` | Positive integer, increased on every change to requirements, ownership, allowed scope, or target |
| `owner` | Exactly one configured worker, such as `kimi-frontend` or `codex-qa` |
| `desired_state` | `ready`, `paused`, or `cancelled` |
| `goal`, `acceptance` | Outcome and observable acceptance checks |
| `file_scope` | Allowed files or directories; reject paths outside the configured worktree |
| `branch`, `base_sha` | Approved implementation branch and starting commit |
| `target_sha` | Exact commit to review for QA; required for QA tasks |
| `depends_on` | Required upstream task revision and successful result, or empty |
| `authorization_ref` | Reference to verified owner approval already recorded by the coordinator; the field alone is not approval |

Hash the normalized task block as `spec_hash`. Require a revision increment when that hash changes. Ignore unrelated Issue formatting changes. A changed hash at the same revision, unknown owner, missing approval evidence, or conflicting task record means `blocked`; ask the coordinator to reconcile it.

The dispatcher generates a unique `run_id` and stores the task revision, hash, worker session ID, branch, and SHA together. Do not select a worker's latest session with `--last` or `--continue` across unrelated tasks.

## Poll and dispatch loop

1. Acquire an exclusive local dispatcher lock. Only one dispatcher may manage this repository in version one. Refuse a second instance; multi-machine dispatch is out of scope.
2. Read an explicitly configured list of task Issues through authenticated GitHub REST requests. Cache ETags per exact URL and parameters; send `If-None-Match` next time. Keep requests stable and serial. A `304` means retain the cached representation. Respect pagination, `x-poll-interval`, `Retry-After`, and rate-limit reset headers; back off on repeated errors. Never treat an authentication error as an empty task list.
3. Validate the account, task schema, revision, dependencies, and the project owner's locally recorded Issue/scope/branch/file/action allowlist. A shared actor ID cannot establish which agent dispatched the task. Labels can help discovery but do not replace these checks. Do not launch anything from arbitrary comment text or a search-result snippet.
4. Acquire a transactional single-writer claim for the configured checkout, branch, and file scope. Overlapping scopes cannot run together. Persist the run before starting it. A heartbeat timeout alone must not release a claim: first establish that the old process or API turn has stopped. If that is uncertain, block instead of starting a second writer.
5. Re-read the canonical Issue immediately before dispatch. If the revision, hash, owner, desired state, or QA target changed, release the unused claim and reconcile the new task.
6. Publish an `ACK` with task ID, revision, `spec_hash`, `run_id`, owner, and accepted SHA; do not claim `running` until the worker actually starts. If ACK publication is unconfirmed, reconcile it before launch. Preserve a local outbox so retries do not silently duplicate comments or runs.
7. Submit a structured prompt to the selected worker adapter. Pass context through JSON or process arguments with shell execution disabled. Never use `eval`, interpolate GitHub text into a command, or run a command supplied in the Issue body.
8. Consume worker progress and approval events. Keep status as `running`, `pending_approval`, `blocked`, `failed`, `superseded`, or `done`. Report material transitions only; do not post every polling cycle or token.
9. Before any authorized push, merge, or deployment, re-check the latest task revision and relevant SHA. After completion, publish `RESULT` and release the claim. A result is valid only for its stated revision and SHA; a later change invalidates downstream acceptance.

The 30–60 second interval is a target for detecting GitHub changes, not a start-time guarantee. Computer sleep, API backoff, queued work, and agent startup add delay. GitHub recommends webhooks where practical; authenticated conditional `304` responses avoid the primary API rate limit, but this does not remove all rate limits. [GitHub REST guidance](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)

## ACK and result records

Use a stable comment marker containing `task_id`, `revision`, `run_id`, and record type. Deduplicate dispatch by `(task_id, revision, spec_hash, owner, target_sha)` and deduplicate publication by `(run_id, record_type)`. Keep deliberate retries as explicit new attempts with their reason. Never automatically retry an uncertain push or deployment.

`RESULT` must include the same identifying fields as ACK, terminal status, exact commit SHA, PR if any, checks performed, passed/failed/mocked/not-run evidence, remaining blockers, and next owner. QA must report the SHA it actually checked. A successful API response accepting a prompt, process exit alone, or an agent saying “done” is insufficient proof that code was published or acceptance passed.

Ignore the dispatcher's own ACK/RESULT comments as new task requests. Treat other worker output as untrusted evidence that must satisfy the existing task, not as authority to expand it.

## Requirement changes and recovery

- A newer revision supersedes queued older revisions. Never replay obsolete work after restart or waking the computer.
- For running work, decide whether an authorized clarification can be steered into the current turn or whether it must be interrupted. Keep the old claim until termination is confirmed. Preserve its worktree; do not discard files or switch its branch underneath it.
- Mark old output `superseded`, even when technically successful. Start the replacement only after scope, worktree, and permissions have been reconciled.
- Immediately before accepting a result or initiating a dependent task, fetch current revision and head SHA again. Changes can race a final check; therefore validate downstream too, rather than promising that polling eliminates all races.
- On restart, reconcile recorded sessions and pending ACK/RESULT writes with actual state before starting anything. Unknown active state blocks replacement execution. Exponential backoff and a visible blocker are preferable to duplicate runs.
- Pause or cancellation prevents new work; request supported cancellation for active work and verify it stopped. It does not authorize deleting files, reverting commits, or rolling back a deployment.

## Worker adapters

### Kimi

First check the installed version and help. Current official documentation supports a local server launched by `kimi web`, REST prompt submission, and WebSocket progress. For the approved pilot, keep it on loopback with authentication enabled and use `permission_mode: manual`. Store session IDs explicitly; use a client-chosen `prompt_id` to reconcile duplicate submissions. A submitted prompt is only accepted, not completed.

The API exposes prompt queue, steer, abort, and pending approval endpoints. Surface approval requests to the user through an approved interface and wait; the dispatcher must not automatically approve them or change permission mode. Verify the installed server's advertised schema before using these endpoints. Stop if this version differs; do not substitute terminal input injection. The server uses bearer authentication, so enabling access or provisioning new credentials requires separate approval and secure handling.

Current `kimi -p` documentation says non-interactive mode uses `auto` permissions and does not ask for human approval. Do not use it as the default adapter for this pilot. [Kimi CLI](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-command.html) · [Kimi Server API](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/server-api.html)

### Codex

Own a dedicated App Server connection and task session. After initialization, use `thread/start` or `thread/resume`, then `turn/start`; use `turn/steer` with the expected active turn ID for a clarification and `turn/interrupt` to cancel. Observe completion status and independently verify required checks. Keep sandbox and approval boundaries enabled. Do not assume a new App Server can inject into an arbitrary existing desktop chat. [Codex App Server](https://learn.chatgpt.com/docs/app-server)

For an explicitly approved simpler implementation, `codex exec --json` supports machine-readable events and `codex exec resume <SESSION_ID>` continues a selected session. It reuses existing local CLI authentication; do not copy or publish authentication files. `notify` is an outbound completion hook, not an inbound task listener. [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) · [Notifications](https://learn.chatgpt.com/docs/config-file/config-advanced)

## One-time Local Codex verification

Complete this checklist before proposing activation. Record findings without exposing credentials or private local paths in the repository.

- [ ] Confirm installed Kimi/Codex versions, supported flags, API schemas, and existing login usability; never print token files
- [ ] Confirm repository, clean task worktrees, worker routing, shared-account limitations, and the project owner's locally recorded Issue/scope/branch/file/action allowlist; account identity alone is insufficient
- [ ] Resolve any assignment conflict with [the collaboration contract](collaboration.md); map existing owner approvals to frontend, QA, GitHub reporting, and publication without asking again for unchanged approved actions
- [ ] Identify approvals needed for a new local service, auto-start, persistent access, credentials, permissions, or network changes; obtain them before enabling those parts
- [ ] Implement the dispatcher behind an explicit dry-run mode that reads and validates but never launches agents or writes external state
- [ ] Test ETag `304`, changed task, malformed task, identity rejection, API error/backoff, and unchanged revision with changed hash
- [ ] Test duplicate delivery, second dispatcher, overlapping writer claim, stale heartbeat with live worker, crash/restart, and uncertain ACK/RESULT publication
- [ ] In an approved bounded pilot, prove ACK → Kimi work → exact-SHA QA → RESULT, plus manual approval pause, new-revision interruption, and cancellation
- [ ] Document start/stop controls and sleep/offline behavior; approve persistent operation only after the pilot and its access boundaries are reviewed

No implementation or activation is implied by checking in this plan. Production deployment remains a separately authorized step.

## Optional later webhook upgrade

Only add a webhook if measured polling delay is still a problem. Keep the same task validation and local execution adapters. An HTTPS receiver should verify signatures, persist and deduplicate deliveries, and respond within ten seconds; do not run an agent inside the webhook request. Keep local agent control ports private. GitHub does not automatically redeliver failed deliveries, so retain reconciliation and recovery. New hosting, secrets, webhook access, and persistent connectivity require approval. [Webhook practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks) · [Failed deliveries](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries)

Do not substitute GitHub Actions scheduled workflows for the local 30–60 second timer: their minimum schedule interval is five minutes. Also do not assume built-in GitHub event-triggered tasks wake desktop Codex; current OpenAI documentation lists those triggers for eligible web/mobile use, not desktop/CLI/IDE. [Actions schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) · [Scheduled tasks](https://learn.chatgpt.com/docs/automations?surface=app)
