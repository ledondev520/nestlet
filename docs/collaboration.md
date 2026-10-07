# Collaboration contract

Current assignments follow [the delivery contract](current-delivery-contract.md), revision **2026-10-07-r4**. Kimi exclusively owns all frontend work. Local Codex owns browser QA, email authentication, and deployment within the project owner's existing authorization. Root coordinates requirements, backend/document integration, review, and release evidence. Coco's assignment is cancelled; do not dispatch work to Coco.

Each participant uses their own account and authorized environment; private conversations, credentials, browser sessions and implicit authority are not shared. The repository and reviewable Issues/PRs carry shared project state. Existing approvals apply only within their stated scope; a role or task record does not grant additional permissions.

Repository: https://github.com/ledondev520/nestlet. Creation is verified; publication of any particular commit, collaborator access and branch protections require separate checks.

## Roles

The delivery contract defines current product scope and lane boundaries. New assignments and changes in scope come through the project owner and root coordinator, with explicit file ownership before edits.

| Role | Primary ownership | Required second review |
| --- | --- | --- |
| Project owner | Product decisions, consequential approvals, merge/deploy authority | Root checks implementation feasibility and evidence |
| Kimi | All frontend, bilingual interactions, customer/case/document entry points | Local Codex checks actual browser behavior; root checks contracts |
| Local Codex | Email authentication, browser acceptance, exact-SHA QA, authorized deployment | Root reviews integration and release evidence; Kimi implements frontend changes |
| Root | Requirements, backend/document integration, API/storage contracts, coordination and review | Local Codex verifies the combined build independently |

One person is release integrator. The author does not solely approve their own sensitive-boundary change. Product decisions and merge/deploy permissions remain with the project owner.

## Working agreement

1. Claim one small issue with outcome, file scope, acceptance checks and owner before coding
2. Use a separate clone/worktree and short-lived branch, such as `feat/review-ui`, `fix/csv-roundtrip` or `docs/pilot-protocol`
3. Coordinate interface changes before editing shared files; only one worker owns a file at a time
4. Make small commits; open a draft PR with tests and observable evidence, not a dump of private chat history
5. Review product/spec correctness separately from code standards; resolve both before the integrator merges
6. Re-run affected checks after rebasing or resolving conflicts; inspect the exact remote commit and CI before claiming publication
7. Merge and deploy only with the project owner's authorization; never force-push shared main or overwrite another person's work

Use explicit file ownership wherever a checkout is shared, and separate clones/worktrees for independent lanes. Do not switch the shared checkout's branch under another worker. Frontend fixes found by QA go to Kimi; Local Codex and root do not silently take over frontend files. Agree email/backend interface changes before editing shared server or storage files.

## Handoff contents

- Goal, task revision, acknowledged owner, branch/commit and exact files changed
- Decision made and unresolved questions
- Commands run, outcomes and what was mocked or unrun
- Small code/data-flow walkthrough and screenshots where relevant
- Known risks, rollback plan and next owner

Use only sanitized examples. A public repo must exclude raw customer PRDs, screenshots, personal records, private source paths, secrets and unpublished account details. Invited collaborators, protected branch rules and CI are unverified until actually configured and checked.

## Current task and claiming

Read [the current delivery contract](current-delivery-contract.md) and the latest assigned Issue before starting. Earlier [Local Codex acceptance](tasks/local-codex-acceptance.md) and [Kimi frontend](tasks/kimi-k3-frontend-redesign.md) task files provide background; they do not override newer requirements or ownership. Record the claim with owner, current revision, file scope, base commit, and status, then acknowledge receipt to the coordinator. If another claim overlaps, pause and resolve ownership.

A task file, label, or posted comment is coordination data, not proof another agent received or executed it. Require an explicit ACK for receipt and an immutable SHA plus observable checks for completion. Re-check current requirements before publishing a result and before authorized release; superseded work cannot certify the current revision.

[The agent coordination plan](agent-coordination.md) describes a proposed 30–60 second local dispatcher using supported APIs, deduplication, and revision checks. It is preparation only: no new dispatcher, persistent access, credentials, or webhook is enabled by these documents. Continue the existing verified handoff path until a separately approved implementation is tested. The coordinator owns cross-environment follow-up and must not assume GitHub notifications wake local agents.
