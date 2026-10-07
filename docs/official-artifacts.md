# English operator documents and official government forms

Research checkpoint: October 7, 2026. Scope: ordinary tenant-based Housing Choice Voucher lease-up. First operating PHA, case type and accepted packet remain unconfirmed. These are source-backed product requirements, not legal advice, a completed filing or assurance of agency acceptance.

## Two distinct deliverables

| | Operator working paper | Official form draft |
| --- | --- | --- |
| Purpose | Organize evidence, unresolved questions and administrative follow-up | Prepare fields on the exact agency-accepted prescribed form |
| Available scope | Existing English follow-up, missing-information correspondence and status-summary templates; human review required | Future gated capability; not implemented or accepted |
| Format | Professional supplementary draft, explicitly labeled | Official layout, required text, complete pages and applicable edition preserved |
| Missing information | Visible unknowns/placeholders and unresolved actions | Blank or explicit draft indicators only where the accepted form permits |
| Authority | Operator's review, not an agency determination | Signatures, certifications and PHA-only entries reserved for authorized humans/agency |
| Completion claim | “Ready for operator review” only after documented checks | Never “accepted”, “approved” or “submission-ready” without the required evidence |

A browser “Save PDF” creates a PDF of an operator document. It does not turn that document into a HUD/PHA form. Successful PDF/Excel input parsing is not official-form compliance. There is no single universal California government-correspondence layout established by these sources.

## What five case fields support

Current core facts are property, owner, PHA, case reference and **proposed** rent. They can support a short administrative summary or request for instructions once reviewed. They cannot establish packet completeness, populate an RTA/HAP or determine what every local agency requires.

Missing from that model are, among other things: program/case subtype, issued voucher evidence, household identity, requested lease/inspection dates, construction year, bedrooms, deposit, utilities/appliances, signatory authority, conditional attachments, received-document versions and actual agency decisions. Do not add invented defaults to fill those gaps.

`confirmed` means operator review. It is not government validation. Reviewed blanks are still unknown. Current missing-information correspondence is largely about five fields; it is not an agency-complete named-document checklist. Absence from this working copy proves neither agency nonreceipt nor that a document is mandatory.

## English output requirements

- Generated prose, headings, warnings, filenames and formal labels are English regardless of UI locale
- User-provided names, addresses and facts remain faithful to their evidence; an English template or a CJK-script check does not prove the whole artifact is English
- Review any necessary English rendering explicitly; do not silently translate facts, invent names or expand an ambiguous acronym
- Use a clear document title, actual preparation date or placeholder, verified recipient or placeholder, factual subject, concise body, actual attachments and sender-role block
- No official seals, fabricated government letterhead, approval language, signatures, initials, certifications or execution dates
- Retain draft and synthetic/de-identified-use warnings as required by the development build; remove neither through export nor accidental editing

## Federal baseline and verified mapping limits

### HUD-52517 Request for Tenancy Approval

[Official PDF](https://www.hud.gov/sites/dfiles/OCHCO/documents/52517ENG.pdf): two pages, edition 04/2023, printed OMB expiration 04/30/2026.

| Location | Evidence needed before any future mapping |
| --- | --- |
| Page 1, 1–2 | PHA and complete unit address |
| Page 1, 3–8 | Requested start, bedrooms, construction year, proposed rent, deposit, inspection-ready date |
| Page 1, 9–10 | Structure and subsidy type, never inferred |
| Page 1, 11 | Utility payer/fuel and appliance provider, cross-checked with lease |
| Page 2, 12 | Conditional comparable rentals, relationship certification and lead status |
| Execution | Authorized owner/representative and household signers, dates and contacts |

Preserve both pages. Do not automatically certify lead status, receipt of pamphlets, relationship facts or signatures. Requested dates and proposed rent are not approvals. Comparable-unit entries are conditional for projects exceeding four units; local additional rent-roll rules are a separate question.

### HUD-52641 HAP Contract

[Official PDF](https://www.hud.gov/sites/dfiles/OCHCO/documents/52641ENG.pdf): 13 pages, edition 4/2023, printed expiration 4/30/2026. Prescribed wording must remain intact; only specified PHA additions are allowed. Preserve Parts A, B and C.

Future Part A mapping requires actual tenant/unit data, PHA-approved household membership, approved dates/rent/HAP amount, utility allocation and authorized signatories. Never derive those approvals from the five proposed case facts. Binding terms, exceptions and special housing variants require separate applicability review.

### Other records

- [HUD-52641-A Tenancy Addendum](https://www.hud.gov/sites/dfiles/OCHCO/documents/52641A.pdf): five pages, edition 4/2023, printed expiration 4/30/2026; attach intact, not an AI summary
- HUD-52646 voucher: receive the PHA-issued evidence; never issue or manufacture one
- Inspection record: receive inspector evidence; an operator checklist is not an official inspection result
- W-9 and financial enrollment: record applicability/receipt in an approved production workflow; never collect real tax/banking identifiers in this MVP
- Landlord lease: use the actual applicable lease and prescribed addendum; do not claim a generated lease is government-approved

[HUD landlord forms guide](https://www.hud.gov/helping-americans/housing-choice-vouchers-landlord-forms) distinguishes standard forms from PHA-developed forms and directs users to local packages.

## PHA-specific branches

| PHA | Observed source | What remains unconfirmed |
| --- | --- | --- |
| OHA | [2025-named 10-page RTA packet](https://www.oakha.org/wp-content/uploads/2025/06/RTA-Packet-2025_fillable.pdf), with embedded LH0406 (10/19)/HUD 52517 (7/19); agent authority, owner inspection checklist, lead page and 2+ unit rent roll | Actual case applicability and current accepted edition |
| SFHA | [Direct HUD-52517](https://sfha.org/files/documents/52517ENG.pdf), 04/2023/printed 04/30/2026; [six-page owner packet, filename Rev.07.2024](https://sfha.org/files/documents/Property%20Owner%20Packet%20Rev.%2007.2024.pdf) | Accepted edition, applicable packet pages and case evidence |
| HACA | [Paperwork guidance](https://www.haca.net/landlords/landlord-questions/how-much-paperwork-is-there/) and [two-page direct-deposit form](https://www.haca.net/pdf/Direct%20Deposit%20Enrollment%20Form.pdf), Version 2 updated 10.27.2022 | Complete current RTA packet, schema and acceptance |
| SCCHA | [Move process](https://www.scchousingauthority.org/section-8/for-participants/existing-tenants/move-process/) says paperwork accompanies issued voucher | Standalone RFTA template, field schema and accepted edition |

OHA's 2+ unit rent-roll requirement is distinct from the federal comparable-rental threshold. SFHA's existing-HAP-assumption page is not automatically required for every new lease. Do not automate HAP cancellation, authority grants, financial authorizations or signatures. HACA and Oakland Housing Authority are separate agencies.

A filename year is not a form edition. A past printed OMB expiration alone proves neither valid nor invalid. An official download establishes source availability, not current case acceptance. Never silently edit an expiration date or replace a local packet with the newest-looking federal PDF.

## Next useful working paper: specification only

A future **Operator Lease-Up Review Cover and Document Checklist** can extend the existing summaries without pretending to be an official form. This title and structure are a proposed extension, not a claim the current UI offers it.

1. Operator details/date, unresolved where missing
2. Five case facts with source reference and review state
3. Agency/program/case-type confirmation
4. Candidate document inventory: document, applicability, official source/edition, receipt evidence, review state, unresolved action
5. Separate requested dates, voucher-expiry evidence and received agency decisions
6. Only attachments actually bundled
7. Reviewer and next-action owner, with no legal/agency certification

Initial inventory states should be `Not assessed`, `Applicability unconfirmed` and `No receipt evidence in this working copy`. Never infer `Required`, `Missing`, `Submitted`, `Approved`, `Inspection passed` or `Complete` from an empty import or generated export.

## Gate before official form filling

Select the PHA/program/case type; obtain accepted-edition and applicability evidence; retrieve and checksum the official template; preserve mandatory text/pages; define verified field mappings; use an experienced reviewer and synthetic answer key; protect sensitive data; leave execution to authorized humans; retain version, reviewer and evidence provenance. Until those steps are complete, provide official links and supplementary drafts only.
