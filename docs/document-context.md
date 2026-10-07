# Document context and supplementary output

Implementation contract, October 7, 2026. This describes the pure `document-context.js` module. HTTP authorization, SQLite persistence, same-case message ownership, and server-supplied confirmation timestamps are integration responsibilities; the pure-module tests do not establish those integrations or a live provider response.

## Stored context

`case.documentContext` is an optional keyed object. An omitted value normalizes to `{}`; explicit `null` is invalid. Supported keys are:

`documentDate`, `recipientName`, `recipientContact`, `recipientOrganization`, `salutation`, `senderName`, `senderContact`, `senderRole`, `senderOrganization`, `attachments`, `nextActionOwner`, `targetDate`.

Every canonical entry has this shape:

```json
{
  "value": "Example Housing Authority Intake Team",
  "source": "The user supplied the department in this case conversation",
  "confirmed": true,
  "confirmedAt": "2026-10-07T08:00:00.000Z",
  "notApplicable": false,
  "sourceMessageId": null
}
```

- `value` and `source` are each bounded to 1,000 characters
- Attachments may be a reviewed newline-separated list; provenance descriptions may also contain newlines
- Names, contacts and other individual values are single-line text. Dates, when supplied, use a valid `YYYY-MM-DD` calendar date
- Confirmation requires a meaningful value, a source description, and a valid timestamp. A confirmed `notApplicable: true` entry instead requires an empty value and explicit source evidence for that disposition
- Missing `notApplicable` and `sourceMessageId` normalize to `false` and `null`
- A source-message reference is a UUID. The module checks its shape only; storage must verify that the referenced message belongs to the authenticated user and the same case
- Source text is descriptive provenance, never a file-access instruction, a provider instruction, or proof of official agency approval

## One consolidated completion action

Use one user action to confirm the direct answers needed for the document. Do not require a checkbox or repeated confirmation for every unchanged field. Restored confirmed values remain usable until explicitly edited or their confirmation is revoked. Unanswered optional details are omitted from output.

`mergeDocumentContext(current, changes, options)` returns canonical context. Each changed entry may contain only `value`, `source`, optional `notApplicable`, and optional `sourceMessageId`. It cannot carry model-supplied confirmation flags.

- Default `confirm: false` treats changes as proposals and preserves already-confirmed values
- `confirm: true` is reserved for the authenticated user's explicit consolidated confirmation; the caller supplies `confirmedAt` from the server clock
- `replaceConfirmed: true` with `confirm: false` is reserved for an explicit user edit or review revocation. It clears the old confirmation and timestamp, even when the text is unchanged
- Model suggestions must not use either explicit-user override

## Readiness

`assessDocumentReadiness(record, {locale, kind})` returns:

```json
{
  "ready": false,
  "kind": "followup",
  "missing": [
    {
      "key": "recipientContact",
      "reason": "missing",
      "label": "Recipient contact/address",
      "question": "Please provide the recipient contact/address, its source, and confirmation for this document."
    }
  ],
  "resolvedKeys": [],
  "omittedOptionalKeys": []
}
```

`locale` is `zh` by default or `en`. `kind` defaults to `record.draftType`. Reasons distinguish missing, unconfirmed, conflicting, and English-rendering information.

For `followup` and `missing-documents`, critical information is:

- A confirmed, non-conflicting property identifier from `case.fields`
- A confirmed recipient name **or** recipient organization/department
- A confirmed recipient contact/address
- Confirmed sender name and contact details

For `status-summary`, only the confirmed property identifier and preparer's name are critical. These are requirements for Nestlet's supplementary documents, not requirements for an official HUD/PHA form.

Salutation, date, role, organization, attachments and next-action details do not independently block output. If salutation is absent, the generator uses neutral `Hello,` without inventing a person's name or title. Unknown attachments are omitted; only an explicitly confirmed absence renders `Attachments: None`.

Existing `namesVerified` behavior permits exact, confirmed, source-supported proper names, addresses and references to remain verbatim. It does not permit arbitrary non-English prose or imply an automated language-quality review.

## Generation and status

```js
generateReviewedDocument(record, kind = record.draftType, {
  generatedAt = new Date().toISOString(),
  status = 'draft'
})
```

The function returns a string. It uses deterministic supplementary templates and confirmed case information; it is not a DeepSeek response or a silent substitute for a failed provider call.

- `draft` is the conservative default and includes a clear `DRAFT — FOR HUMAN REVIEW` heading
- Explicit `final` means the current structural and information prerequisites have been satisfied for a usable supplementary document. It does **not** mean official approval, independent verification of every statement, sending, or submission
- Final output does not print `DRAFT`, `NOT FOR SUBMISSION`, or an unsupported claim that the user's material is de-identified
- Both statuses retain the boundary `Supplementary correspondence; not an official agency form.` and a concise statement that the document does not establish eligibility, rent approval, agency acceptance, or proof of submission
- A supplied and confirmed `documentDate` is labeled `Document date`. Otherwise the actual server generation day is labeled `Prepared on`; it is not represented as a case, execution, or signature date
- Both statuses retain the same real readiness, known-placeholder, and language checks. Removing a draft label never bypasses those checks

`validateFinalArtifact(record, content, {locale, kind})`, also exported as `assertFinalArtifact`, checks saved final content and returns readiness metadata plus canonical `content`. Known placeholders, unresolved critical information, malformed content, and unreviewed CJK prose fail explicitly. This is a structural/review gate, not independent semantic verification of arbitrary edited prose.

Incomplete user-authored drafts may be retained by storage without being marked final. The generation function itself asks for missing critical information instead of manufacturing a placeholder-filled document.

## Error interface and evidence

Failures throw `DocumentContextError` with `code`, HTTP-oriented `status`, and optional `details`. `DOCUMENT_DETAILS_REQUIRED` has status 409 and includes the readiness result for the consolidated follow-up UI. Other explicit codes include `DOCUMENT_DETAILS_INVALID`, `DOCUMENT_CONTENT_INVALID`, `DOCUMENT_PLACEHOLDERS_REMAIN`, and `DOCUMENT_ENGLISH_REQUIRED`.

Run `node --test test/document-context.test.js` for the pure-module suite. It covers provenance, confirmation/revocation, preservation of confirmed facts against model proposals, localized missing-field questions, optional-field omission, organization recipients, preparation-date semantics, draft/final rendering, known placeholders, and verified proper-name exceptions. Real account isolation, persistence, stale-version handling and message-source ownership require separate HTTP/SQLite tests.
