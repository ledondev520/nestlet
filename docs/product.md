# Product scope

## Question this prototype answers

Can a low-volume HCV lease-up operator save hands-on time turning one case's scattered notes into reviewable facts and an English administrative draft, after including review and corrections?

This is a hypothesis, not established demand. Existing PHA portals and property-management products already cover parts of the workflow. Folders, a spreadsheet and email may remain the best baseline for occasional cases. Do not equate faster drafting with faster agency approval.

## Current boundary

A standalone one-case work surface: input → review → English draft. The five fields are property, owner, housing authority, case reference and proposed rent. The final flow uses real file parsing and server-side `deepseek-flash` extraction. It starts empty, with visible configuration/provider errors and no sample or mock fallback. Earlier label-based demo extraction is not final acceptance. Document receipt and official completion are not established by those five fields.

The intended user is an administrative operator; actual owner/agent/helper role is unconfirmed. No authority to sign or represent an owner is inferred. The household supplies its own facts and authorizations. The owner or authorized agent reviews paperwork. The PHA and its authorized providers make program, rent and inspection decisions.

## Nonclaims and deferred work

- No legal advice, housing eligibility, tenant screening, compliance certification or acceptance guarantee
- No verified PHA-specific template pack, automatic official-form filling or government-approved correspondence format
- No case-management platform, tenant/owner portal, billing, reminder automation, inbox ingestion or sending
- Text-based PDF and XLSX/XLS parsing are implementation scope; image ingestion, OCR and vision remain unsupported
- No production sensitive-record storage, account isolation, audit log or secure intake
- No measured time saving, adoption, willingness to pay or revenue claim

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
- Exports have visible draft/synthetic warnings and no invented approvals or signatures
- No external send or submission occurs
- PDF, CSV, XLSX and XLS are actually parsed; unsupported/encrypted/scanned/corrupt files produce clear bilingual errors
- A human can compare the reviewed result with their manual task

See validation.md for observed evidence and pilot.md for the measurement protocol.
