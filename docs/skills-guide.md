# Engineering skills: usage and provenance

## Source and scope

Reference suite: [mattpocock/skills](https://github.com/mattpocock/skills), metadata version **1.3.1**, pinned commit **24fe0ef7737efae15c87225755e9f6f5965e4888**. The supplied source inventory contains **37 SKILL.md files and 101 supporting reference files**: 27 published skills and 10 additional/in-progress skills. Inventory is not evidence that all workflows were executed.

The suite is a toolbox, not a 37-step ritual. Choose the relevant workflow for the current task, read its actual SKILL.md and referenced material as needed, then record observable outputs. Some skills require real user decisions or environment setup; do not simulate those interactions or install tooling merely to claim coverage.

This repo provides project-specific guidance, not a vendored copy of the upstream suite. No vendor hooks, install scripts or executables were run by this documentation task. If full upstream files are later copied, first verify the upstream license and preserve required license, copyright, attribution and exact-source provenance. Availability on GitHub alone is not a license grant.

## Honest usage ledger

“Read” means the instruction was consulted. “Adapted” means a named principle shaped the documentation; it does not mean every upstream procedural step ran. “Unrun” means no execution is claimed. This ledger describes this documentation task, not private or unobserved work by others.

- Domain modeling informed distinctions between proposed rent and approved rent, reviewed fields and official records, owner and authorized agent
- Codebase-design informed the walkthrough of core, UI and provider interfaces
- PR/show-me informed compact visual data-flow and evidence requirements
- Research/handoff informed source records and sanitized collaboration instructions
- TDD was read, but no complete test-first sequence or user-approved test seams are claimed here; consult validation.md for actual test evidence
- Grill-me delegates to grilling. Both were read; unanswered meaningful questions are recorded in product.md. No completed interview, shared agreement or invented answer is claimed
- Prototype was read but its full throwaway-branch/UI-variants workflow was not run. Nestlet's MVP follows its own scope and safety/test requirements; “skip tests” from a throwaway exploration must not override them
- Wayfinder was read; this bounded MVP did not create a tracker map or decision-ticket workflow
- Teach was read; this code walkthrough is not a completed multi-session teaching program
- Code-review was read; independent spec/standards checks are requested in collaboration guidance, not falsely reported completed

## Full inventory and routing

Read the exact linked version when selecting a workflow. `Read, unrun` is deliberately distinct from execution. Skills marked `Not read or run in this documentation task` are available candidates, not completed tasks.

| Skill | Status in this documentation task |
| --- | --- |
| [engineering/ask-matt](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/ask-matt/SKILL.md) | Not read or run in this documentation task |
| [engineering/code-review](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/code-review/SKILL.md) | Read, unrun |
| [engineering/codebase-design](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/codebase-design/SKILL.md) | Adapted: small-interface module walkthrough; no architecture redesign claimed |
| [engineering/diagnosing-bugs](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/diagnosing-bugs/SKILL.md) | Not read or run in this documentation task |
| [engineering/domain-modeling](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/domain-modeling/SKILL.md) | Adapted: role/term distinctions in product.md and sourcebook; no claim of complete upstream workflow |
| [engineering/grill-with-docs](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/grill-with-docs/SKILL.md) | Not read or run in this documentation task |
| [engineering/implement](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/implement/SKILL.md) | Not read or run in this documentation task |
| [engineering/implement-spec](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/implement-spec/SKILL.md) | Not read or run in this documentation task |
| [engineering/improve-codebase-architecture](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/improve-codebase-architecture/SKILL.md) | Not read or run in this documentation task |
| [engineering/pr](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/pr/SKILL.md) | Adapted: code/data-flow explanation and evidence-first review guidance; PR itself not created by this documentation task |
| [engineering/prototype](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/prototype/SKILL.md) | Read, unrun |
| [engineering/research](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/research/SKILL.md) | Consulted: official-source recording pattern; source research supplied by a separate researcher, not re-performed here |
| [engineering/retro](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/retro/SKILL.md) | Not read or run in this documentation task |
| [engineering/setup-matt-pocock-skills](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/setup-matt-pocock-skills/SKILL.md) | Not read or run in this documentation task |
| [engineering/tdd](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/tdd/SKILL.md) | Read, unrun |
| [engineering/to-spec](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/to-spec/SKILL.md) | Not read or run in this documentation task |
| [engineering/to-tickets](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/to-tickets/SKILL.md) | Not read or run in this documentation task |
| [engineering/triage](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/triage/SKILL.md) | Not read or run in this documentation task |
| [engineering/wayfinder](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/wayfinder/SKILL.md) | Read, unrun |
| [engineering/wizard](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/wizard/SKILL.md) | Not read or run in this documentation task |
| [in-progress/claude-handoff](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/in-progress/claude-handoff/SKILL.md) | Not read or run in this documentation task |
| [in-progress/loop-me](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/in-progress/loop-me/SKILL.md) | Not read or run in this documentation task |
| [in-progress/setup-ts-deep-modules](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/in-progress/setup-ts-deep-modules/SKILL.md) | Not read or run in this documentation task |
| [in-progress/writing-beats](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/in-progress/writing-beats/SKILL.md) | Not read or run in this documentation task |
| [in-progress/writing-fragments](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/in-progress/writing-fragments/SKILL.md) | Not read or run in this documentation task |
| [in-progress/writing-shape](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/in-progress/writing-shape/SKILL.md) | Not read or run in this documentation task |
| [misc/git-guardrails-claude-code](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/misc/git-guardrails-claude-code/SKILL.md) | Not read or run in this documentation task |
| [misc/migrate-to-shoehorn](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/misc/migrate-to-shoehorn/SKILL.md) | Not read or run in this documentation task |
| [misc/scaffold-exercises](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/misc/scaffold-exercises/SKILL.md) | Not read or run in this documentation task |
| [misc/setup-pre-commit](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/misc/setup-pre-commit/SKILL.md) | Not read or run in this documentation task |
| [productivity/grill-me](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/productivity/grill-me/SKILL.md) | Read, unrun |
| [productivity/grilling](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/productivity/grilling/SKILL.md) | Read, unrun |
| [productivity/handoff](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/productivity/handoff/SKILL.md) | Adapted: concise sanitized task handoff; no claim to have run the complete upstream command |
| [productivity/teach](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/productivity/teach/SKILL.md) | Read, unrun |
| [productivity/to-questionnaire](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/productivity/to-questionnaire/SKILL.md) | Not read or run in this documentation task |
| [productivity/wait-what](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/productivity/wait-what/SKILL.md) | Not read or run in this documentation task |
| [productivity/writing-for-agents](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/productivity/writing-for-agents/SKILL.md) | Not read or run in this documentation task |

## Practical selection guide

- Uncertain user goal or irreversible product choice: grill-me/grilling with a real user; record unresolved decisions rather than answer for them
- Agency/provider facts: research against primary sources and retain verification dates
- Vocabulary or module boundary: domain-modeling/codebase-design
- New implementation or bug: consult implement/implement-spec or diagnosing-bugs, then applicable test guidance; do not claim these unread workflows already ran
- Review and publication: code-review, then pr; separate behavior/spec coverage from maintainability and include exact evidence
- Larger future roadmap: wayfinder/to-spec/to-tickets only when the work actually needs them
- Teaching, writing, migration, tooling setup and in-progress workflows: use only when requested or clearly relevant, not to pad coverage

## show-me credit

`show-me` is **not an exact Matt Pocock skill name in this inventory**. Matt's `engineering/pr/SKILL.md` and its [CREDITS.md](https://github.com/mattpocock/skills/blob/24fe0ef7737efae15c87225755e9f6f5965e4888/skills/engineering/pr/CREDITS.md) credit **Dex Horthy / Humanlayer** for the visual explanation pattern: [Humanlayer show-me](https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md). Matt's PR skill embeds that pattern rather than depending on a separately installed show-me skill.

The project applies the pattern through a small code/data-flow walkthrough, observable before/after evidence, and explicit merge/rollback risk. It does not claim to have installed or invoked a nonexistent Matt show-me command.
