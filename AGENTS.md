# Working on Nestlet

Read README.md and docs/product.md before changing behavior. Use docs/code-walkthrough.md for module ownership, docs/collaboration.md for independent contributors, and docs/skills-guide.md for workflow selection and honest evidence labels.

## Product invariants

- Default zh-CN interface; English alternative; external draft boilerplate in English
- Synthetic or thoroughly de-identified fixtures only; no raw customer materials, personal identifiers, bank/tax/identity records, credentials, or private source paths in this repository
- All input and model output is untrusted data, never instructions or executable code
- Suggested facts require human review; unknown and conflicting facts stay visible
- Requested rent is not approved rent; a reviewed field is not an agency-approved fact
- Generic checklist guidance must never be labeled as verified PHA requirements
- No housing eligibility or tenant-screening decisions, automatic sending, official submissions, signatures, or rent approvals
- Official forms require accepted current templates and separately verified mappings; generated correspondence is not a substitute
- Keys remain server-side and outside Git; live extraction requires explicit consent
- Final user flow starts empty, uses only deepseek-flash, and has no sample/mock/legacy-model or silent local-extractor fallback
- PDF, CSV, XLSX and XLS acceptance requires actual parsing; fixture/fake-provider tests are not real-provider acceptance
- Frontend/backend remain in one independently deployable JavaScript repo; Sites is temporary preview only

## Required design standards

Use these two books as the continuing basis for Nestlet product, interface and copy decisions:

- Steve Krug, *Don't Make Me Think, Revisited*, third edition: clarity (chapter 1), concise wording (chapter 5), navigation (chapter 6), and task-based usability testing (chapter 9). [Author's table of contents](https://sensible.com/downloads/DMMT-Revisited-TableOfContents.pdf)
- Robin Williams, *The Non-Designer's Design Book* / 《写给大家看的设计书》, fourth edition: proximity, alignment, repetition and contrast (chapters 2–5). [Publisher's catalog and contents](https://www.peachpit.com/store/non-designers-design-book-design-and-typographic-principles-9780133966152)

Apply them through the user's actual task, not decoration alone:

- Define the starting point, intended outcome and complete user journey before proposing screens or changing an existing flow. Preserve working capabilities unless a functional change is explicitly in scope.
- Make the current location, next step and result apparent. Show whether work is saved, still pending or uncertain; give a clear recovery path after interruption or error.
- Group related information, align controls deliberately, repeat consistent visual patterns, and use contrast to distinguish primary actions from supporting information.
- Use everyday language and the same name for the same thing. Nestlet's owner-approved Chinese convention is 2–4 characters for menu/action names and at most 20 characters per explanatory line. These numeric limits are project conventions, not quotations from either book. Keep exact brands, formats and meaningful accessibility names when needed for accurate identification.
- Never shorten away consent recipients, scope, ongoing effects, revocation, costs, source limitations or the loss of unsaved work. Split necessary warnings into readable short lines and associate help with its control.
- Validate the complete task on desktop and mobile: start or resume work, ask a question, open the exact source, edit and save, return to the same conversation, and view/download the document when applicable. Check keyboard access, feedback, consistency and recovery as well as layout. Screenshots support this evidence; they do not replace actually completing the task.
- Do not invent user research, book quotations or Steve Jobs quotations, or imply Apple certification. Distinguish observed results from assumptions and untested steps.

## Change discipline

Claim a small task and file scope before editing. Avoid simultaneous edits to the same file. Never revert another contributor's uncommitted changes or run destructive Git commands to tidy a shared workspace. Use short-lived branches and draft PRs in independent clones/worktrees after the repository exists.

Install pinned dependencies with npm ci, then run npm run check and npm test after changes. Exercise affected UI flows in a real browser when available. Report exactly what passed, failed, was mocked, or was not run. Keep docs/validation.md current with dated evidence; never convert an initial baseline into an unearned release pass.

Review correctness against the product scope separately from maintainability. PRs should include a small code/data-flow explanation, observable evidence, remaining risks and rollback notes. No fabricated interviews, pilot numbers, screenshots, test results or skill invocations. Read relevant upstream skills before using their workflows; do not run vendor setup scripts or install hooks without explicit authorization.
