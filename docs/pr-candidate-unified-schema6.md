# Draft PR candidate: integrate case workflows and owner account management

Status: local, unpublished candidate. Do not merge or deploy from this document alone.

Base: `5335312fd53becaad4bfccace5c1f3e39c6bf4f2`
Branch: `feat/chat-case-workflow-20261007`

## Summary

- Connect complete persisted conversation messages to explicit same-case material review, preserved confirmed facts, missing-document questions, English generation and preview
- Retain a selected chat image original only on its explicit private-save action; keep chat transmission separate from original retention
- Save a complete assistant answer only as an unreviewed draft, with stable conversation/message provenance and uncertain-write reconciliation
- Mount owner-only account management and separately capability-gated read-only administrator diagnostics in Account and settings
- Keep the immutable owner/trial authentication identities and all per-user case/file boundaries; grants add a bounded capability, never cross-user access or provider-management authority
- Integrate the official-reference browser scenario from PR24 and value-preserving chat-radius tokens from PR25

## Implementation and boundaries

The case bridge reuses the existing mounted material and document editors. It does not introduce a schema for chat, auto-confirm model prose, overwrite material/document buffers, add a new agent framework, or submit documents externally. The account capability is the additive schema6 change. Unknown or invalidated facts remain subject to the existing review/readiness/version gates.

Chat-original and draft POST uncertainty is reconciled by reading stored results. Malformed successful responses are not treated as safe-to-retry failures. Account permission changes are explicit desired-state, versioned owner operations, followed by fresh reads; leaving the surface discards pending intent. The minimal append-only permission audit commits atomically with a grant/revoke.

The unified integration updates CI-only schema expectations to6 and expands unauthenticated admin-route smoke coverage. It does not modify the independent deployment/maintenance helper or point the independent schema4→5 rollout at this candidate.

## Source inputs

- Image originals: `4d77f0b21e5bc789253563eb491c0eb008965f22` and `065b0a8` (local equivalents `0c86990`, `82ee762`)
- Conversation bridge: `8281a48c6ec0957f5999f28a69549d6a1c842504`
- Schema6 private-data compatibility: `17718215a3153193e90f3cb3e2021c7e4b6aedd0` (local `95b3cbe`)
- Account capabilities: `c0cce7ef3e07a71372ce4bd7349ef2dbea01ae4a` (local `02c25fe`)
- PR24 official references: `3cfde3786a3eeddf097f38493c7b7786564b6323` (local `357002e`)
- PR25 radius tokens: `f9168ad71e85f287826958a35bb2751bcb939027` (local `f911294`)
- Final integration commit: use the published candidate HEAD after its exact-SHA checks; no publication has occurred yet

Only appended validation-note sections required conflict resolution; both evidence histories were retained.

## Local validation

- Syntax checks and production Vite build: passed
- Frontend: 277/277
- Backend: 325/325, including schema6 migration, atomic permission/audit and real backup/restore drills
- Explicitly simulated email contracts: 53/53
- Additional actual HTTP/DOM artifact-invalidation integration: 1/1
- Product, email, parser/formats and customer fixture checks: passed
- Actual schema1→6 migration and real SQLite write/read smoke in private disposable directories: passed
- Browser source/discovery: 20 scenarios; no local Chromium execution
- No dependency changes or fresh install claimed; identical-lock installed dependencies were reused

The new mounted settings and chat workflows have actual HTTP/SQLite/React DOM evidence. Those checks are not browser layout/CSP, real-provider, real-inbox, Docker or deployment acceptance. Vite retains its large-chunk advisory.

## Required before release

1. Review this exact combined source and run all official Node, Chromium and Docker CI gates
2. Keep the ongoing baseline schema5 release separate; complete its independently required email evidence
3. Follow `docs/account-administration.md`: verify a pre-upgrade schema5 database/original-files snapshot and restore drill, schema6 migration, schema6 backup/restore, and deployment-tool/image compatibility
4. Obtain the applicable publication/merge/deployment authorization; make any real account grant only through the explicit owner confirmation flow

## Rollback

Reverting frontend/source commits alone is insufficient after schema6 migration: a schema5 binary refuses a schema6 database. Preserve the pre-upgrade schema5 snapshot. Any authorized rollback requires a stopped-service restore to an approved destination and accounting for records written after the snapshot. Never decrement `user_version`, edit role rows ad hoc, or discard the persistent volume.
