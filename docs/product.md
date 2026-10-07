# Product scope

## Product purpose and value to validate

Can a low-volume HCV lease-up operator save hands-on time turning one case's scattered notes into reviewable facts and an English administrative draft, after including review and corrections?

This is a hypothesis, not established demand. Existing PHA portals and property-management products already cover parts of the workflow. Folders, a spreadsheet and email may remain the best baseline for occasional cases. Do not equate faster drafting with faster agency approval.

## Current architecture and scope

Named-trial access and server-local SQLite persistence are newly implemented, awaiting final CI/browser/deployment verification. Web self-registration and ordinary/administrator roles are also user-authorized and implemented, pending final release verification. These features are product scope, not evidence of customer demand or a completed pilot. The complete frontend/backend/SQLite lifecycle is specified in [architecture.md](architecture.md).

A standalone one-case work surface: input → review → English draft. The five fields are property, owner, housing authority, case reference and proposed rent. The final flow uses real file parsing and server-side `deepseek-flash` extraction. It starts empty, with visible configuration/provider errors and no sample or mock fallback. Earlier label-based demo extraction is not final acceptance. Document receipt and official completion are not established by those five fields.

The intended user is an administrative operator; actual owner/agent/helper role is unconfirmed. No authority to sign or represent an owner is inferred. The household supplies its own facts and authorizations. The owner or authorized agent reviews paperwork. The PHA and its authorized providers make program, rent and inspection decisions.

## Nonclaims and deferred work

- No legal advice, housing eligibility, tenant screening, compliance certification or acceptance guarantee
- No verified PHA-specific template pack, automatic official-form filling or government-approved correspondence format
- No CRM, teams, tenant/landlord portal, billing, reminder automation, inbox ingestion or sending; ordinary-user web registration is explicitly in scope
- Text-based PDF and XLSX/XLS parsing are implementation scope; image ingestion, OCR and vision remain unsupported
- Own-user saved-case isolation is implemented for owner/named trials; production sensitive-record readiness, comprehensive audit logging and secure personal-document intake are not established
- No measured time saving, adoption, willingness to pay or revenue claim

## Email-first account access

Public registration requires email and a matching 6–256 character password. The account is created only after an accepted, unexpired, one-time email verification link is explicitly confirmed. Existing username accounts remain usable and may bind a verified email without changing their ID or saved records. Ordinary verified-email accounts support password recovery; the bootstrap owner's ENV credential retains private operator recovery. Missing mail configuration disables enrollment truthfully. See [email authentication](email-auth.md) for the API, security, service reuse and schema5 rollback requirements. Real inbox delivery and final browser acceptance are separate release gates.

## Saved cases and roles

The work surface remains one case at a time. Preview, editing, copy, download and print are primary. Explicit Save/Open/Delete adds continuity without turning the app into a multi-case management system. Stored text, reviewed fields and draft belong to the authenticated user; raw binary files are not retained. The owner has access only to owner cases, and named trials only to their own. Trial users cannot manage API credentials/settings.

Server-local SQLite requires Node 24 and a private persistent path/volume. The 100-case/user cap bounds storage. `expectedVersion` conflicts return HTTP 409 rather than silently overwriting edits. No automatic backups are implemented; deployment/rollback must preserve the volume. Trial AI request caps are ten/user/hour and thirty total trial/hour in memory, not billing guarantees.

Administrator/owner setup comes first. Ordinary users will register through the web with a server-assigned role; they cannot request administrator access. Optional named-trial CLI setup remains a private compatibility route, not the only planned enrollment path. Final role/isolation, persistence, conflict and real-browser release checks remain required.

## Open decisions

| Question | Why it matters | Safe default while unanswered |
| --- | --- | --- |
| First PHA and program variant? | Determines accepted packet and process | PHA unknown; link official sources; generic guidance only |
| Owner, authorized agent, referral helper or another role? | Determines permitted representations and signatures | Administrative draft only; sender role placeholder |
| Which task costs the most hands-on time? | Determines whether extraction or drafting is useful | Review notes and prepare a follow-up |
| Five safe cases and an experienced reviewer available? | Enables a meaningful paired pilot | Authored synthetic acceptance cases only; no claimed pilot results |

These are unanswered product questions, not an interview transcript or evidence of customer endorsement. Use a short live discussion when the user is available; do not invent their answers or silently substitute sample results for missing configuration.

## Acceptance checklist

- A new operator sees an empty case; missing live configuration is clearly explained, never replaced with demo output
- Interface switching does not change case facts or generated content
- Unknown facts remain explicit; conflicting evidence requires review
- Editing input or reviewed facts invalidates a stale draft
- Real `deepseek-flash` extraction is accurately labeled; no mock/demo mode exists in the final user workflow
- Exports have visible draft/review warnings, correct data-use labeling and no invented approvals or signatures; actual de-identified material is not falsely labeled synthetic
- No external send or submission occurs
- PDF, CSV, XLSX and XLS are actually parsed; unsupported/encrypted/scanned/corrupt files produce clear bilingual errors
- A human can compare the reviewed result with their manual task

See validation.md for observed evidence and pilot.md for the measurement protocol.
