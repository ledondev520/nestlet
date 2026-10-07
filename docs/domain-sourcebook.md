# HCV domain sourcebook

Public-source research checkpoint: October 7, 2026. These are research notes, not live application integrations; recheck the linked authority before operational use. Product scope: San Francisco Bay Area tenant-based Housing Choice Voucher lease-up. Initial PHA is not yet selected. This document guides a synthetic-data prototype, not a filing, legal opinion, eligibility determination, or guarantee of government acceptance or legal compliance.

## Product contract

- UI defaults to Simplified Chinese, with an English toggle.
- All generated downloadable deliverables, correspondence, filenames, labels inside formal documents, and cover sheets are English regardless of UI language.
- Official prescribed forms must retain their original layout and mandatory text. A professional-looking generated document is not a substitute for a required HUD or PHA form.
- Operator-created cover letters, missing-document lists, follow-up correspondence, case summaries, and preparation checklists are separate from official forms and official decisions.
- For the prototype, mark every export `SAMPLE — SYNTHETIC DATA — NOT FOR SUBMISSION`. No real resident data, signatures, filings, portal submissions, or outgoing messages.

## Federal baseline

HUD distinguishes standard required forms from PHA-developed forms and explicitly advises obtaining the local PHA's forms because administration varies. Source: [HUD landlord forms guide](https://www.hud.gov/helping-americans/housing-choice-vouchers-landlord-forms).

| Document | Product behavior |
| --- | --- |
| HUD-52517 Request for Tenancy Approval | Fill verified fields into the agency-accepted official template; retain owner/family certification and signature roles |
| HUD-52641 Housing Assistance Payments Contract | Treat as an official owner–PHA agreement. Prepare permitted Part A fields only from verified facts; preserve prescribed body and Part C |
| HUD-52641-A Tenancy Addendum | Preserve in its entirety and attach to lease as required; never paraphrase the legal clauses |
| HUD-52646 Voucher | Receive and inspect the PHA-issued record; do not generate or issue a voucher |
| Landlord lease | Use the applicable landlord/PHA lease, checking required information and addendum presence; do not invent a supposedly government-approved lease |
| Other documents | Lead-related disclosures, W-9, ownership evidence, agent authority, deposit enrollment and other forms depend on facts and PHA requirements |

HUD-52641 instructions state that the prescribed contract must be word-for-word, with only specified PHA additions permitted. The applicable lease requirements include parties, unit, term, monthly rent, and utility/appliance responsibilities. Sources: [HUD-52641 official PDF](https://www.hud.gov/sites/dfiles/OCHCO/documents/52641ENG.pdf), [official 24 CFR 982.308 publication](https://www.govinfo.gov/content/pkg/CFR-2023-title24-vol4/pdf/CFR-2023-title24-vol4-sec982-308.pdf). The latter is an archived 2023 regulatory publication; production legal review must check current regulations.

### Version issue verified in current downloads

The [HUD forms directory](https://www.hud.gov/hudclips/forms) currently links to:

- [HUD-52517](https://www.hud.gov/sites/dfiles/OCHCO/documents/52517ENG.pdf): April 2023 edition, printed OMB expiration April 30, 2026
- [HUD-52641](https://www.hud.gov/sites/dfiles/OCHCO/documents/52641ENG.pdf): April 2023 edition, printed OMB expiration April 30, 2026
- [HUD-52641-A](https://www.hud.gov/sites/dfiles/OCHCO/documents/52641A.pdf): April 2023 edition, printed OMB expiration April 30, 2026

Record these as official currently linked downloads, not as confirmed current accepted editions. A printed past OMB expiration alone does not establish that a form is invalid; nor does being downloadable establish acceptance by the intended PHA. Obtain acceptance/version confirmation before production submission. Never silently edit an OMB expiration date.

## Bay Area agency variation

### Oakland Housing Authority (OHA)

[Official forms page](https://www.oakha.org/propertyowners/section8ownerforms/) links a [2025 RTA packet, 10 pages](https://www.oakha.org/wp-content/uploads/2025/06/RTA-Packet-2025_fillable.pdf). Its instructions include a signed inspection checklist, specific inspection/occupancy dates, legal owner identity matching the grant deed, and agent authorization documentation. The packet includes HAP cancellation for an already-leased participant; that is conditional and must never be automatically completed or executed. Filename year and observed page count are verified; do not invent a more precise issue date.

### San Francisco Housing Authority (SFHA)

The [official HCV participant process](https://sfha.org/housing-programs/housing-choice-voucher-participants) requires RTA submission on or before voucher expiration and describes ownership/payee eligibility review. New owners must obtain an SFHA vendor number before requesting inspection. The [Property Owner Packet, filename Rev.07.2024, 6 pages](https://sfha.org/files/documents/Property%20Owner%20Packet%20Rev.%2007.2024.pdf) lists ownership evidence, authority to sign, W-9 and banking documentation. It states accepted signature methods. It also includes an assumption-of-HAP-contract page describing an existing tenancy: do not treat every page as a new-lease requirement. Select documents by the actual case type and confirm applicability.

### Housing Authority of the County of Alameda (HACA)

HACA is a different agency from Oakland Housing Authority. [Its official paperwork explanation](https://www.haca.net/landlords/landlord-questions/how-much-paperwork-is-there/) describes RTA, lease, inspection and HAP steps, with W-9 required for new owners. This source does not establish a complete current downloadable local packet.

### Santa Clara County Housing Authority (SCCHA)

[Official participant resources](https://www.scchousingauthority.org/section-8/for-participants/existing-tenants/) identify RFTA, HQS checklist, VAWA documents and portal workflows. No independently verifiable standalone RFTA download was retrieved during this research. Display this agency as requiring template confirmation, not as a fully integrated template pack.

## Date-sensitive rules

### Inspection regime

[HUD Notice PIH 2026-18](https://www.hud.gov/sites/default/files/PIH/documents/PIH-2026-18.pdf), issued July 15, 2026, supersedes earlier voucher inspection notices. It states a February 1, 2027 compliance date for specified NSPIRE requirements and permits PHAs to continue prior HQS or approved methods before then. Inspection cases retain the standards applicable when inspected through resolution. Carbon monoxide and smoke-alarm requirements are not generally excused by that extension. Do not label every 2026 inspection as NSPIRE; store PHA, inspection date, regime and rule version. Preparation checklists do not certify inspection passage.

### California protections

[California Civil Rights Department housing guidance](https://calcivilrights.ca.gov/housing/) identifies source of income, including vouchers, as protected. Examples include refusal to provide necessary subsidy paperwork and unequal terms. [CRD source-of-income fact sheet](https://calcivilrights.ca.gov/wp-content/uploads/sites/32/2022/11/Source-of-Income-Fact-Sheet_ENG.pdf) explains that income standards must consider the portion paid by the tenant. The product must not generate discriminatory screening recommendations or make eligibility decisions.

[California DOJ security-deposit guidance](https://oag.ca.gov/system/files/media/Know-Your-Rights-Security-Deposits-English.pdf) explains the general one-month limit effective July 2024, specified small-owner exceptions, and additional protections. Local protections may also apply. Do not implement an unconditional single-value deposit rule or present an automated warning as a final legal determination.

## Output architecture

### Three document classes

1. `official_form_draft`: an exact approved template with verified field mappings, all prescribed pages, and intact required text
2. `operator_document`: generated English cover, checklist, correspondence or summary explicitly identifying the operator and draft status
3. `received_authority_record`: PHA-issued voucher, approval, rent determination, inspection result or signed agreement; store the received evidence rather than simulate its issuance

Do not decorate operator documents with seals, fabricated government letterhead or claims of government approval. No universal government font, letterhead or typography specification was established by this research.

### Shared provenance model

Template records should store: template ID, PHA ID, program, case type, official form number, displayed edition, displayed expiration when present, source URL, retrieved date, last verified date, verification status, checksum, applicable effective dates, field schema, reviewer and acceptance notes.

Each case field should store value, source document/reference, extraction date, confidence or verification state, and reviewer confirmation. Preserve conflicting source values for resolution rather than silently selecting one. Distinguish requested lease dates and rent from PHA-approved dates and rent.

Every output should have a manifest linking its template version and case-data revision. Keep the manifest separate from the official form when adding metadata would alter the accepted form.

### Validation and export states

- `Draft`: may download with missing-field indicators and synthetic-data marking
- `Needs review`: missing fields, conflicting facts, unverified template edition, unresolved signature/authority, or unknown jurisdiction
- `Ready for operator review`: documented checks passed; not synonymous with government acceptance
- `Submitted` and `Approved`: only established from real submission receipts or received agency evidence in a future authorized production workflow

Cross-document checks: parties, address/unit, lease term, rent, security deposit, utility/appliance responsibilities, household details, signatures, attachments and PHA-specific prerequisites. Missing data must remain blank or explicitly missing in a draft. Never invent facts, approvals, execution dates, certifications or signatures. Do not claim a packet is complete solely because its generated cover letter exists.

### Privacy and human review

Use synthetic data only for this prototype. Real SSN/TIN, bank account details, medical/VAWA records and household details need a separately reviewed secure intake and storage design before production. A masked field is not evidence that a document was received. Leave signature and PHA-only fields to authorized humans. Eligibility, legal interpretation, binding terms, rent approval and inspection conclusions require the appropriate accountable reviewer or agency.

## Suggested MVP boundary

Support one explicitly selected tenant-based HCV PHA pack at a time. Other Bay Area agencies can appear in an agency selector with transparent `Requirements not yet verified` status. Ship English operator drafts and a source-backed document checklist first. Official-form draft filling is enabled only for a verified template mapping; otherwise provide the official download link and the missing verification reason. This design provides useful preparation without making a legal-compliance or acceptance guarantee.

## Moving from research to a verified agency pack

1. Confirm the actual PHA, program variant, case type and operator role
2. Retrieve the current official packet and instructions from the authority's own site or verified staff channel
3. Record the URL, retrieval date, displayed edition/expiration, file checksum and responsible reviewer
4. Resolve expired-date or contradictory-version questions with that PHA; keep acceptance evidence
5. Map only permitted fields and preserve mandatory pages and legal text; test against a synthetic answer key
6. Record agency applicability and review date in the UI; stale or unverified packs return to needs-review

None of these notes enables a production pack automatically. Generic preparation guidance is not a verified PHA requirements pack. No PDF templates are bundled, mapped or declared accepted.

## Later same-day form-level checkpoint

Additional official-source retrieval on October 7, 2026, approximately 03:48–03:50 UTC refined the notes above. Acceptance remains unconfirmed; no agency was contacted.

- OHA's 2025-named packet embeds RTA footer **LH0406 (10/19)**, an OHA revision of **HUD 52517 (7/19)**. Filename year is not form edition. Its page-6 rent-roll requirement begins at **2+ units**, distinct from the RTA comparable-rental threshold. [OHA packet](https://www.oakha.org/wp-content/uploads/2025/06/RTA-Packet-2025_fillable.pdf)
- SFHA directly hosts its linked two-page HUD-52517, **04/2023**, printed OMB expiration **04/30/2026**. Agency-hosted provenance does not establish present acceptance. [SFHA RTA landing page](https://sfha.org/resources-forms/request-tenancy-rta-approval-3) · [PDF](https://sfha.org/files/documents/52517ENG.pdf)
- HACA's two-page direct-deposit form is **Version 2, updated 10.27.2022**. It is financial authorization, not an ordinary cover letter; no real banking/tax fields belong in the MVP. A complete current RTA packet remains unverified. [HACA form](https://www.haca.net/pdf/Direct%20Deposit%20Enrollment%20Form.pdf)
- SCCHA says move paperwork accompanies the issued voucher. A standalone RFTA PDF, field schema and accepted edition remain unverified. [SCCHA move process](https://www.scchousingauthority.org/section-8/for-participants/existing-tenants/move-process/)

The current five fields cannot populate an RTA/HAP/owner packet or certify a complete agency checklist. Successful PDF/Excel parsing changes input support, not that limitation. An eventual supplementary **Operator Lease-Up Review Cover and Document Checklist** should list candidate documents, applicability, official source/edition, receipt evidence and unresolved action separately. Start with `Not assessed` / `Applicability unconfirmed` / `No receipt evidence in this working copy`; never infer `Required`, `Missing`, `Submitted`, `Approved`, `Inspection passed` or `Complete` from an absent import or successful export. This is an artifact specification, not a claim that the current UI implements it.

The consolidated [English artifact and form-mapping requirements](official-artifacts.md) distinguish usable supplementary drafts from future official-form filling and detail the five-field model’s limits.
