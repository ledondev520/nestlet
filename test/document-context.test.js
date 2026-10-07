// Deterministic document validation using synthetic data only; no provider or document-acceptance claim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOCUMENT_DETAIL_KEYS, DocumentContextError, validateDocumentDetails, mergeDocumentDetails,
  documentReadiness, assertFinalArtifact, hasDocumentPlaceholders, generateReviewedDocument } from '../document-context.js';

const confirmedAt = '2026-10-07T08:00:00.000Z';
const detail = (value, source = 'Confirmed by the user from a synthetic fixture') => ({ value, source, confirmed: true, confirmedAt, notApplicable: false, sourceMessageId: null });
const record = (overrides = {}) => ({
  draftType: 'followup', fields: [{ key: 'property', value: '128 Example Lane', source: 'Synthetic example worksheet', confirmed: true, conflict: false }],
  documentContext: {
    documentDate: detail('2026-10-07'), recipientName: detail('Example Recipient'),
    recipientContact: detail('recipient@example.invalid'), senderName: detail('Example Sender'),
    senderRole: detail('Administrative operator'), senderContact: detail('sender@example.invalid'),
    salutation: detail('Dear Example Recipient,'), attachments: { ...detail(''), notApplicable: true },
  }, ...overrides,
});
const errorCode = code => error => error instanceof DocumentContextError && error.code === code;

test('document context roundtrips provenance and confirmation timestamps without mutating caller state', () => {
  const input = record().documentContext;
  const before = JSON.stringify(input);
  assert.deepEqual(validateDocumentDetails(input), input);
  const copy = validateDocumentDetails(input);
  copy.senderName.value = 'Changed copy';
  assert.equal(JSON.stringify(input), before);
  const shortTimestamp = { senderName: { ...detail('Example Sender'), confirmedAt: '2026-10-07T08:00:00Z' } };
  assert.equal(validateDocumentDetails(shortTimestamp).senderName.confirmedAt, confirmedAt);
});

test('document context rejects fabricated review metadata, unknown fields, invalid dates, controls and oversized data', () => {
  for (const input of [
    null, [], { apiKey: detail('not-allowed') }, { role: 'owner' },
    { senderName: { ...detail('Example Sender'), confirmedAt: null } },
    { senderName: { ...detail('Example Sender'), confirmed: false } },
    { senderName: { ...detail('Example Sender'), source: '' } },
    { senderName: { ...detail('Example Sender'), confirmed: 'true' } },
    { senderName: { ...detail('Example Sender'), approved: true } },
    { senderName: detail('To be confirmed') }, { senderName: detail('[Sender name]') },
    { senderName: detail('has\ncontrol') }, { senderName: detail('x'.repeat(1001)) },
    { documentDate: detail('2026-02-30') }, { documentDate: detail('today') },
    { senderName: { ...detail('Example Sender'), confirmedAt: '2026-02-30T08:00:00Z' } },
  ]) assert.throws(() => validateDocumentDetails(input), errorCode('DOCUMENT_DETAILS_INVALID'));
});

test('only explicit confirmation stamps a detail; editing the value or provenance invalidates prior review', () => {
  const proposed = mergeDocumentDetails({}, { senderName: { value: 'Example Sender', source: 'Synthetic conversation answer' } });
  assert.deepEqual(proposed.senderName, { value: 'Example Sender', source: 'Synthetic conversation answer', confirmed: false, confirmedAt: null, notApplicable: false, sourceMessageId: null });
  const confirmed = mergeDocumentDetails(proposed, { senderName: { value: 'Example Sender', source: 'Synthetic conversation answer' } }, { confirm: true, confirmedAt });
  assert.equal(confirmed.senderName.confirmed, true);
  assert.equal(confirmed.senderName.confirmedAt, confirmedAt);
  assert.deepEqual(mergeDocumentDetails(confirmed, { senderName: { value: 'An unapproved model replacement', source: 'Model suggestion' } }), confirmed,
    'Unconfirmed model proposals must not overwrite established facts');
  assert.deepEqual(mergeDocumentDetails(confirmed, { senderName: { value: 'Example Sender', source: 'Synthetic conversation answer' } }), confirmed);
  const revoked = mergeDocumentDetails(confirmed, { senderName: { value: 'Example Sender', source: 'Synthetic conversation answer' } }, { replaceConfirmed: true });
  assert.equal(revoked.senderName.confirmed, false, 'An explicit review revocation works even when text is unchanged');
  assert.equal(revoked.senderName.confirmedAt, null);
  for (const change of [{ value: 'Different Sender', source: 'Synthetic conversation answer' }, { value: 'Example Sender', source: 'Changed evidence' }]) {
    const edited = mergeDocumentDetails(confirmed, { senderName: change }, { replaceConfirmed: true });
    assert.equal(edited.senderName.confirmed, false);
    assert.equal(edited.senderName.confirmedAt, null);
  }
  assert.throws(() => mergeDocumentDetails({}, { senderName: { value: 'Example Sender', source: 'Model proposal', confirmed: true } }), errorCode('DOCUMENT_DETAILS_INVALID'));
  assert.throws(() => mergeDocumentDetails({}, { senderName: { value: 'Example Sender', source: 'User answer' } }, { confirm: true }), errorCode('DOCUMENT_DETAILS_INVALID'));
});

test('missing required fields produce localized follow-up questions instead of a placeholder-filled final artifact', () => {
  const incomplete = record({ fields: [], documentContext: {} });
  for (const locale of ['zh', 'en']) {
    const readiness = documentReadiness(incomplete, { locale });
    assert.equal(readiness.ready, false);
    assert.deepEqual(readiness.missing.map(item => item.key), ['property', 'recipientName', 'recipientContact', 'senderName', 'senderContact']);
    assert.ok(readiness.missing.every(item => item.reason === 'missing' && item.label && item.question));
    if (locale === 'en') assert.doesNotMatch(JSON.stringify(readiness.missing), /[\p{Script=Han}]/u);
    else assert.match(readiness.missing[0].question, /请提供/);
    assert.throws(() => assertFinalArtifact(incomplete, 'An otherwise valid English draft.', { locale }), error => {
      assert.equal(error.code, 'DOCUMENT_DETAILS_REQUIRED'); assert.equal(error.status, 409);
      assert.deepEqual(error.details.missing, readiness.missing); return true;
    });
  }
});

test('restored confirmed details are reused and optional missing values do not block or generate repeat questions', () => {
  const saved = JSON.parse(JSON.stringify(record()));
  saved.documentContext.senderOrganization = { value: 'Unconfirmed organization', source: 'Model suggestion', confirmed: false, confirmedAt: null };
  const readiness = documentReadiness(saved);
  assert.equal(readiness.ready, true); assert.deepEqual(readiness.missing, []);
  assert.ok(readiness.resolvedKeys.includes('senderName'));
  assert.ok(readiness.resolvedKeys.includes('documentDate'));
  assert.ok(readiness.omittedOptionalKeys.includes('caseReference'));
  assert.ok(readiness.resolvedKeys.includes('attachments'));
  assert.ok(readiness.omittedOptionalKeys.includes('senderOrganization'));
  assert.equal(assertFinalArtifact(saved, 'A complete English working draft without placeholders.').ready, true);
});

test('generic status summaries require no invented recipient and unresolved required facts retain precise reasons', () => {
  const summary = record({ draftType: 'status-summary', documentContext: { documentDate: detail('2026-10-07'), senderName: detail('Example Sender') } });
  assert.equal(documentReadiness(summary).ready, true);
  assert.ok(documentReadiness(summary).omittedOptionalKeys.includes('recipientContact'));
  for (const [changes, reason] of [[{ confirmed: false }, 'unconfirmed'], [{ conflict: true }, 'conflict'], [{ value: '' }, 'missing'], [{ value: '示例地址' }, 'english_review']]) {
    const incomplete = { ...summary, fields: [{ ...summary.fields[0], ...changes }] };
    assert.equal(documentReadiness(incomplete, { locale: 'en' }).missing[0].reason, reason);
    assert.equal(documentReadiness(incomplete).ready, false);
  }
});

test('final-artifact checks reject known placeholders and CJK prose without rejecting meaningful bracketed names', () => {
  for (const value of ['[To be confirmed]', '[Insert date before sending]', '[Verify recipient and email/address]', '[Sender name]', '[Role / Organization]', '[Verified contact details]', '[List only documents actually attached]', '{{recipient_name}}', '[Recipient]', '[Date]', '[Full name]', 'Deadline: TBD']) {
    assert.equal(hasDocumentPlaceholders(value), true);
    assert.throws(() => assertFinalArtifact(record(), 'Draft text ' + value), errorCode('DOCUMENT_PLACEHOLDERS_REMAIN'));
  }
  assert.equal(hasDocumentPlaceholders('Use entrance [B] at Example Lane.'), false);
  assert.equal(assertFinalArtifact(record(), 'Use entrance [B] at Example Lane.').ready, true);
  assert.throws(() => assertFinalArtifact(record(), 'English introduction. 未提供信息。'), errorCode('DOCUMENT_ENGLISH_REQUIRED'));
  for (const content of ['', 'x'.repeat(50001), 'contains\u0000control']) assert.throws(() => assertFinalArtifact(record(), content), errorCode('DOCUMENT_CONTENT_INVALID'));
});

test('explicit not-applicable attachments are retained while unresolved optional values are omitted', () => {
  const complete = record();
  assert.equal(documentReadiness(complete).ready, true);
  const unresolved = record(); delete unresolved.documentContext.attachments;
  assert.equal(documentReadiness(unresolved).ready, true);
  assert.doesNotMatch(generateReviewedDocument(unresolved), /Attachments:/);
  const omittedRecipient = record();
  omittedRecipient.documentContext.recipientName = { ...detail(''), notApplicable: true };
  assert.equal(documentReadiness(omittedRecipient).missing[0].key, 'recipientName');
  for (const input of [
    { attachments: { ...detail('contradictory value'), notApplicable: true } },
    { attachments: { ...detail(''), notApplicable: true, confirmed: false, confirmedAt: null } },
    { attachments: { ...detail(''), notApplicable: null } },
    { attachments: { ...detail(''), notApplicable: true, sourceMessageId: 'foreign-or-malformed' } },
  ]) assert.throws(() => validateDocumentDetails(input), errorCode('DOCUMENT_DETAILS_INVALID'));
  const sourceMessageId = '8ac26b9a-9948-4c55-8e1b-f3e516706e88';
  const confirmedNone = mergeDocumentDetails({}, { attachments: { value: '', source: 'User explicitly confirmed no attachments', notApplicable: true, sourceMessageId } }, { confirm: true, confirmedAt });
  assert.equal(confirmedNone.attachments.sourceMessageId, sourceMessageId);
  assert.equal(confirmedNone.attachments.notApplicable, true);
});

test('all supported documents render real confirmed values, omit unresolved optional fields and contain no template placeholders', () => {
  for (const kind of ['followup', 'missing-documents', 'status-summary']) {
    const input = record({ draftType: kind });
    input.documentContext.senderOrganization = { value: 'UNCONFIRMED_ORGANIZATION_MUST_NOT_RENDER', source: 'Model suggestion', confirmed: false, confirmedAt: null };
    input.fields.push({ key: 'rent', value: '$2,100', source: 'Synthetic case', confirmed: false, conflict: false });
    const before = JSON.stringify(input);
    const content = generateReviewedDocument(input);
    assert.match(content, /DRAFT — FOR HUMAN REVIEW/);
    assert.match(content, /Supplementary correspondence; not an official agency form\./);
    assert.doesNotMatch(content, /DE-IDENTIFIED|NOT FOR SUBMISSION/);
    assert.match(content, /128 Example Lane/);
    assert.match(content, /2026-10-07/);
    assert.match(content, /Example Sender/);
    assert.doesNotMatch(content, /UNCONFIRMED_ORGANIZATION_MUST_NOT_RENDER|\$2,100|\[To be confirmed\]/);
    assert.equal(hasDocumentPlaceholders(content), false);
    assert.equal(assertFinalArtifact(input, content).ready, true);
    assert.equal(JSON.stringify(input), before);
    if (kind !== 'status-summary') assert.match(content, /Attachments: None/);
  }
  const actualAttachments = record();
  actualAttachments.documentContext.attachments = detail('Reviewed source summary.txt\nReviewed property worksheet.csv');
  const content = generateReviewedDocument(actualAttachments);
  assert.match(content, /Reviewed source summary\.txt\nReviewed property worksheet\.csv/);
  assert.doesNotMatch(content, /Attachments: None/);
  assert.throws(() => generateReviewedDocument(record({ documentContext: {} })), errorCode('DOCUMENT_DETAILS_REQUIRED'));
});

test('one confirmed agency contact is sufficient; missing optional greetings, dates and attachments never create extra gates', () => {
  const input = record({ documentContext: {
    recipientOrganization: detail('Example Housing Authority Intake Team'),
    recipientContact: detail('intake@example.invalid'), senderName: detail('Example Sender'),
    senderContact: detail('sender@example.invalid'),
  } });
  const readiness = documentReadiness(input);
  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.missing, []);
  assert.ok(readiness.resolvedKeys.includes('recipientOrganization'));
  assert.ok(readiness.omittedOptionalKeys.includes('recipientName'));
  const text = generateReviewedDocument(input, 'followup', { generatedAt: '2026-10-08T00:15:00.000Z' });
  assert.match(text, /To: Example Housing Authority Intake Team/);
  assert.match(text, /Hello,/);
  assert.match(text, /Prepared on: 2026-10-08/);
  assert.doesNotMatch(text, /Document date:|Attachments:|Dear \[/);
  input.documentContext.documentDate = detail('2026-09-30');
  const explicitlyDated = generateReviewedDocument(input, 'followup', { generatedAt: '2026-10-08T00:15:00.000Z' });
  assert.match(explicitlyDated, /Document date: 2026-09-30/);
  assert.doesNotMatch(explicitlyDated, /Prepared on:/);
  assert.throws(() => generateReviewedDocument(input, 'followup', { generatedAt: 'not-a-server-timestamp' }), errorCode('DOCUMENT_DETAILS_INVALID'));
});

test('explicit final output is usable supplementary correspondence while default output remains clearly draft', () => {
  for (const kind of ['followup', 'missing-documents', 'status-summary']) {
    const input = record({ draftType: kind });
    const before = JSON.stringify(input);
    const output = generateReviewedDocument(input, kind, { status: 'final', generatedAt: confirmedAt });
    assert.match(output, /Supplementary correspondence; not an official agency form\./);
    assert.match(output, /does not constitute an eligibility determination, rent approval, agency acceptance, or proof of submission/);
    assert.doesNotMatch(output, /\bDRAFT\b|NOT FOR SUBMISSION|DE-IDENTIFIED/iu);
    assert.equal(hasDocumentPlaceholders(output), false);
    assert.equal(assertFinalArtifact(input, output).ready, true);
    assert.equal(JSON.stringify(input), before);
    const draft = generateReviewedDocument(input, kind, { generatedAt: confirmedAt });
    assert.match(draft, /^DRAFT — FOR HUMAN REVIEW/u);
    assert.match(generateReviewedDocument(input, kind, { status: 'draft', generatedAt: confirmedAt }), /^DRAFT — FOR HUMAN REVIEW/u);
  }
  for (const input of [record({ fields: [] }), record({ documentContext: {} }), record({ fields: [{ ...record().fields[0], conflict: true }] })]) {
    assert.throws(() => generateReviewedDocument(input, 'followup', { status: 'final' }), errorCode('DOCUMENT_DETAILS_REQUIRED'));
  }
  assert.throws(() => generateReviewedDocument(record(), 'followup', { status: 'approved' }), errorCode('DOCUMENT_DETAILS_INVALID'));
});

test('verified proper names remain verbatim while unreviewed CJK prose still blocks finalization', () => {
  const input = record({ namesVerified: true });
  input.fields[0].value = '示例路128号';
  input.documentContext.recipientName = detail('示例收件部门');
  input.documentContext.salutation = detail('Dear 示例收件部门,');
  assert.equal(documentReadiness(input).ready, true);
  const content = generateReviewedDocument(input);
  assert.match(content, /示例路128号/);
  assert.match(content, /Dear 示例收件部门,/);
  assert.equal(assertFinalArtifact(input, content).ready, true);
  assert.throws(() => assertFinalArtifact(input, content + '\n这是未经确认的正文。'), errorCode('DOCUMENT_ENGLISH_REQUIRED'));
  assert.equal(documentReadiness({ ...input, namesVerified: false }).ready, false);
  input.fields.push({ key: 'rent', value: '每月2100元', source: 'Synthetic source', confirmed: true, conflict: false });
  assert.ok(documentReadiness(input).omittedOptionalKeys.includes('rent'));
  assert.doesNotMatch(generateReviewedDocument(input), /每月2100元/);
});

test('record shape and document kind reject malformed or duplicate facts and cannot select an unsupported official form', () => {
  for (const item of [record({ draftType: 'official-hud-form' }), record({ fields: [{}] }), record({ fields: [record().fields[0], record().fields[0]] }), record({ fields: 'not-an-array' }), record({ documentContext: null })]) {
    assert.throws(() => documentReadiness(item), errorCode('DOCUMENT_DETAILS_INVALID'));
  }
  assert.throws(() => documentReadiness(record(), { locale: 'fr' }), errorCode('DOCUMENT_DETAILS_INVALID'));
  assert.equal(new Set(DOCUMENT_DETAIL_KEYS).size, DOCUMENT_DETAIL_KEYS.length);
});
