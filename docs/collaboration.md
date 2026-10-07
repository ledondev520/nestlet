# Collaboration contract

The current external collaboration is the project owner and Local Codex. No other external assistant has an assignment. Each participant uses their own account and authorized environment; private conversations, credentials, browser sessions and implicit authority are not shared. The repository and reviewable issues/PRs carry shared project state.

Repository: https://github.com/ledondev520/nestlet. Creation is verified; publication of any particular commit, collaborator access and branch protections require separate checks.

## Roles

These are responsibility areas, not three accounts or claims that additional collaborators have joined. The owner assigns them explicitly. Local Codex initially owns only the independent acceptance task linked below.

| Role | Primary ownership | Required second review |
| --- | --- | --- |
| Product/domain owner | Scope, agency sources, sample answer keys, output wording, pilot | Technical owner checks implementation feasibility |
| Technical owner | Server adapter, core logic, security and data boundaries | QA/reviewer checks behavior and release evidence |
| UI/QA owner | Bilingual UI, interaction tests, accessibility, regression evidence | Product owner checks task fit and external wording |

One person is release integrator. The author does not solely approve their own sensitive-boundary change. Product decisions and merge/deploy permissions remain with the project owner.

## Working agreement

1. Claim one small issue with outcome, file scope, acceptance checks and owner before coding
2. Use a separate clone/worktree and short-lived branch, such as `feat/review-ui`, `fix/csv-roundtrip` or `docs/pilot-protocol`
3. Coordinate interface changes before editing shared files; only one worker owns a file at a time
4. Make small commits; open a draft PR with tests and observable evidence, not a dump of private chat history
5. Review product/spec correctness separately from code standards; resolve both before the integrator merges
6. Re-run affected checks after rebasing or resolving conflicts; inspect the exact remote commit and CI before claiming publication
7. Merge and deploy only with the project owner's authorization; never force-push shared main or overwrite another person's work

The initial shared workspace uses explicit file ownership instead of concurrent branch switching. Move to independent clones/worktrees when real accounts and the repository exist. Do not switch the shared checkout's branch under another worker.

## Handoff contents

- Goal, branch/commit and exact files changed
- Decision made and unresolved questions
- Commands run, outcomes and what was mocked or unrun
- Small code/data-flow walkthrough and screenshots where relevant
- Known risks, rollback plan and next owner

Use only sanitized examples. A public repo must exclude raw customer PRDs, screenshots, personal records, private source paths, secrets and unpublished account details. Invited collaborators, protected branch rules and CI are unverified until actually configured and checked.

## Current task and claiming

[Local Codex acceptance](tasks/local-codex-acceptance.md) is the only current external task. Before starting, record the claim in that task file on the task branch (owner, base commit and status), and tell the project owner. A task file is coordination data, not automatic inter-agent messaging. If another claim exists, pause and resolve ownership. The owner relays cross-environment updates; never assume another assistant received them.
