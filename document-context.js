/** User-reviewed document context. Model suggestions are never confirmations or agency decisions. */
import { FIELDS, DRAFT_TYPES, hasCJKText } from './public/core.js';

export const DOCUMENT_DETAIL_KEYS = Object.freeze([
  'documentDate', 'recipientName', 'recipientContact', 'recipientOrganization', 'salutation',
  'senderName', 'senderContact', 'senderRole', 'senderOrganization', 'attachments',
  'nextActionOwner', 'targetDate',
]);
export const DOCUMENT_CONTEXT_LIMITS = Object.freeze({ valueChars: 1000, sourceChars: 1000, contentChars: 50000 });

export class DocumentContextError extends Error {
  constructor(code = 'DOCUMENT_DETAILS_INVALID', status = 400, details = undefined) {
    super(code);
    this.name = 'DocumentContextError'; this.code = code; this.status = status;
    if (details !== undefined) this.details = details;
  }
}
const fail = (code, status, details) => { throw new DocumentContextError(code, status, details); };
const plain = value => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function exactKeys(value, allowed, required = allowed) {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) fail();
}
function boundedText(value, limit, multiline = false) {
  if (typeof value !== 'string' || value.length > limit) fail();
  const normalized = multiline ? value.replace(/\r\n/gu, '\n') : value;
  if ((multiline ? /[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]/u : /[\u0000-\u001f\u007f\u2028\u2029]/u).test(normalized)) fail();
  return normalized.trim();
}
function confirmedTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value)) fail();
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf()) || date.toISOString() !== value.replace(/Z$/u, value.includes('.') ? 'Z' : '.000Z')) fail();
  return date.toISOString();
}
const unknown = value => /^(?:unknown|not confirmed|not provided|to be confirmed|to be determined|tbd|tbc|待确认|待补充|未提供|未知)$/iu.test(value.trim());
export function hasDocumentPlaceholders(value) {
  if (typeof value !== 'string') return false;
  return /\[(?:to be (?:confirmed|determined)|insert\b[^\]\n]*|verify\b[^\]\n]*|verified (?:recipient|contact)[^\]\n]*|sender[ _-]name|recipient[ _-]name|full[ _-]name|role\s*\/\s*organization|operator name[^\]\n]*|list only documents[^\]\n]*|not independently verified|assign operator|confirm deadline|record reviewed materials[^\]\n]*|recipient|sender|date|name|address|property|(?:tbd|tbc|todo)|待确认|待补充)\]/iu.test(value) ||
    /\{\{\s*[\w. -]{1,100}\s*\}\}|\b(?:TBD|TBC|TODO)\b/iu.test(value);
}
const meaningful = value => Boolean(value && !unknown(value) && !hasDocumentPlaceholders(value));
function validateDetailValue(key, value) {
  const result = boundedText(value, DOCUMENT_CONTEXT_LIMITS.valueChars, key === 'attachments');
  if (['documentDate', 'targetDate'].includes(key) && result && meaningful(result)) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(result)) fail();
    const date = new Date(result + 'T00:00:00.000Z');
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== result) fail();
  }
  return result;
}

/** Validate persisted state without inferring review from text or inventing a timestamp. */
export function validateDocumentDetails(input = {}) {
  exactKeys(input, DOCUMENT_DETAIL_KEYS, []);
  const result = {};
  for (const key of DOCUMENT_DETAIL_KEYS) {
    if (!Object.hasOwn(input, key)) continue;
    const detail = input[key];
    exactKeys(detail, ['value', 'source', 'confirmed', 'confirmedAt', 'notApplicable', 'sourceMessageId'], ['value', 'source', 'confirmed', 'confirmedAt']);
    const value = validateDetailValue(key, detail.value);
    const source = boundedText(detail.source, DOCUMENT_CONTEXT_LIMITS.sourceChars, true);
    const notApplicable = Object.hasOwn(detail, 'notApplicable') ? detail.notApplicable : false;
    const sourceMessageId = detail.sourceMessageId ?? null;
    if (typeof notApplicable !== 'boolean' || (notApplicable && (!detail.confirmed || value)) ||
        (sourceMessageId !== null && (typeof sourceMessageId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(sourceMessageId)))) fail();
    if (typeof detail.confirmed !== 'boolean' || (!detail.confirmed && detail.confirmedAt !== null)) fail();
    const confirmedAt = detail.confirmed ? confirmedTimestamp(detail.confirmedAt) : null;
    if (detail.confirmed && ((!notApplicable && !meaningful(value)) || !source)) fail();
    result[key] = { value, source, confirmed: detail.confirmed, confirmedAt, notApplicable, sourceMessageId };
  }
  return result;
}

/**
 * A caller must set confirm only for the authenticated user's explicit confirmation.
 * Model output cannot supply review flags. A changed value/source loses its old confirmation.
 */
export function mergeDocumentDetails(current, changes, { confirm = false, confirmedAt = undefined, replaceConfirmed = false } = {}) {
  if (typeof confirm !== 'boolean' || typeof replaceConfirmed !== 'boolean') fail();
  const result = validateDocumentDetails(current);
  exactKeys(changes, DOCUMENT_DETAIL_KEYS, []);
  const timestamp = confirm ? confirmedTimestamp(confirmedAt) : null;
  for (const key of DOCUMENT_DETAIL_KEYS) {
    if (!Object.hasOwn(changes, key)) continue;
    exactKeys(changes[key], ['value', 'source', 'notApplicable', 'sourceMessageId'], ['value', 'source']);
    const value = validateDetailValue(key, changes[key].value);
    const source = boundedText(changes[key].source, DOCUMENT_CONTEXT_LIMITS.sourceChars, true);
    const notApplicable = Object.hasOwn(changes[key], 'notApplicable') ? changes[key].notApplicable : false;
    const sourceMessageId = changes[key].sourceMessageId ?? null;
    if (typeof notApplicable !== 'boolean' || (notApplicable && (!confirm || value))) fail();
    const candidate = validateDocumentDetails({ [key]: { value, source, notApplicable, sourceMessageId, confirmed: confirm, confirmedAt: timestamp } })[key];
    if (confirm) {
      result[key] = candidate;
    } else if ((!result[key]?.confirmed || replaceConfirmed) && ((replaceConfirmed && result[key]?.confirmed) || !result[key] || result[key].value !== value || result[key].source !== source || result[key].sourceMessageId !== sourceMessageId || result[key].notApplicable !== notApplicable)) {
      result[key] = candidate;
    }
  }
  return result;
}

// These are requirements for Nestlet's supplementary working documents, not HUD/PHA form requirements.
const correspondence = Object.freeze(['recipientContact', 'senderName', 'senderContact']);
const recipientIdentity = Object.freeze([Object.freeze(['recipientName', 'recipientOrganization'])]);
export const DOCUMENT_REQUIREMENTS = Object.freeze({
  followup: Object.freeze({ fields: Object.freeze(['property']), details: correspondence, anyOf: recipientIdentity }),
  'missing-documents': Object.freeze({ fields: Object.freeze(['property']), details: correspondence, anyOf: recipientIdentity }),
  'status-summary': Object.freeze({ fields: Object.freeze(['property']), details: Object.freeze(['senderName']), anyOf: Object.freeze([]) }),
});
const labels = Object.freeze({
  property: ['房屋地址', 'Property address'], owner: ['业主名称', 'Owner name'], pha: ['住房管理机构', 'Housing authority'],
  caseReference: ['案件编号', 'Case reference'], rent: ['拟议租金', 'Proposed rent'],
  documentDate: ['文书日期', 'Document date'], recipientName: ['收件人或收件部门', 'Recipient or department'],
  recipientContact: ['收件人联系地址', 'Recipient contact/address'], recipientOrganization: ['收件人机构', 'Recipient organization'],
  salutation: ['信件称呼', 'Salutation'],
  senderName: ['发件人姓名', 'Sender name'], senderContact: ['发件人联系方式', 'Sender contact details'],
  senderRole: ['发件人角色', 'Sender role'], senderOrganization: ['发件人机构', 'Sender organization'],
  attachments: ['实际附件清单', 'Actual attachment list'], nextActionOwner: ['下一步负责人', 'Next-action owner'], targetDate: ['目标日期', 'Target date'],
});
function options(record, supplied = {}) {
  const kind = supplied.kind ?? record?.draftType;
  const locale = supplied.locale ?? 'zh';
  if (!DRAFT_TYPES.includes(kind) || !['zh', 'en'].includes(locale)) fail();
  return { kind, locale };
}
function fieldMap(record) {
  if (!plain(record) || !Array.isArray(record.fields) || record.fields.length > FIELDS.length) fail();
  const result = new Map();
  for (const field of record.fields) {
    if (!plain(field) || !FIELDS.includes(field.key) || result.has(field.key) || typeof field.value !== 'string' ||
        field.value.length > 3000 || /[\u0000-\u001f\u007f\u2028\u2029]/u.test(field.value) ||
        typeof field.confirmed !== 'boolean' || typeof field.conflict !== 'boolean') fail();
    result.set(field.key, field);
  }
  return result;
}
function reasonFor(entry, allowNotApplicable = false) {
  if (entry?.conflict) return 'conflict';
  if (entry?.notApplicable === true) return allowNotApplicable && entry.confirmed === true ? null : 'missing';
  if (!entry || !meaningful(entry.value.trim())) return 'missing';
  if (entry.confirmed !== true) return 'unconfirmed';
  return null;
}
function removeVerifiedNames(content, record, fields, context) {
  if (record.namesVerified !== true) return content;
  const nameFields = ['property', 'owner', 'pha', 'caseReference'];
  const nameDetails = ['recipientName', 'recipientOrganization', 'recipientContact', 'senderName', 'senderOrganization', 'senderContact', 'nextActionOwner'];
  const names = [...nameFields.map(key => fields.get(key)), ...nameDetails.map(key => context[key])]
    .filter(entry => entry?.confirmed === true && !entry.conflict && !entry.notApplicable && meaningful(entry.value) && typeof entry.source === 'string' && entry.source.trim())
    .map(entry => entry.value.trim()).filter(hasCJKText).sort((left, right) => right.length - left.length);
  let remainder = content;
  for (const name of new Set(names)) remainder = remainder.replaceAll(name, ' ');
  return remainder;
}
function missingQuestion(key, reason, locale) {
  const label = labels[key][locale === 'zh' ? 0 : 1];
  const question = locale === 'zh'
    ? reason === 'conflict' ? `「${label}」的信息存在冲突，请确认应采用的准确内容及来源。`
      : reason === 'unconfirmed' ? `请核对并确认「${label}」的内容及来源。`
      : reason === 'english_review' ? `请提供并确认「${label}」在英文文书中的准确写法，不会自动翻译或猜测。`
      : `请提供「${label}」及其来源，并确认可以用于这份文书。`
    : reason === 'conflict' ? `Please resolve the conflicting ${label.toLowerCase()} and confirm its source.`
      : reason === 'unconfirmed' ? `Please review and confirm the ${label.toLowerCase()} and its source.`
      : reason === 'english_review' ? `Please provide and confirm the English rendering of the ${label.toLowerCase()}; it will not be translated or guessed automatically.`
      : `Please provide the ${label.toLowerCase()}, its source, and confirmation for this document.`;
  return { key, reason, label, question };
}

/** Reuses stored confirmations; absent or unreviewed optional details are omitted, never fabricated. */
export function documentReadiness(record, supplied = {}) {
  const { kind, locale } = options(record, supplied);
  const fields = fieldMap(record);
  const details = validateDocumentDetails(record.documentContext === undefined ? {} : record.documentContext);
  const requirements = DOCUMENT_REQUIREMENTS[kind];
  const required = [...requirements.fields, ...requirements.details];
  const all = [...FIELDS, ...DOCUMENT_DETAIL_KEYS];
  const entry = key => fields.get(key) ?? details[key];
  const reason = key => {
    const item = entry(key);
    const alternativeRequired = requirements.anyOf.some(group => group.includes(key));
    const missing = reasonFor(item, !required.includes(key) && !alternativeRequired);
    if (missing || !item?.value) return missing;
    const wording = key === 'rent' ? item.value : removeVerifiedNames(item.value, record, fields, details);
    return hasCJKText(wording) ? 'english_review' : null;
  };
  const unansweredAlternatives = requirements.anyOf.filter(group => !group.some(key => reason(key) === null)).map(group => group[0]);
  const missing = [...requirements.fields, ...unansweredAlternatives, ...requirements.details].map(key => ({ key, reason: reason(key) })).filter(item => item.reason)
    .map(item => missingQuestion(item.key, item.reason, locale));
  const resolvedKeys = all.filter(key => reason(key) === null);
  const omittedOptionalKeys = all.filter(key => !required.includes(key) && (reason(key) !== null || entry(key)?.notApplicable));
  return { ready: missing.length === 0, kind, missing, resolvedKeys, omittedOptionalKeys };
}

/** This is a structural/review gate, not verification of all prose or official submission readiness. */
export function assertFinalArtifact(record, content, supplied = {}) {
  const readiness = documentReadiness(record, supplied);
  if (!readiness.ready) fail('DOCUMENT_DETAILS_REQUIRED', 409, readiness);
  if (typeof content !== 'string' || !content.trim() || content.length > DOCUMENT_CONTEXT_LIMITS.contentChars || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(content)) fail('DOCUMENT_CONTENT_INVALID');
  if (hasDocumentPlaceholders(content)) fail('DOCUMENT_PLACEHOLDERS_REMAIN', 409);
  if (hasCJKText(removeVerifiedNames(content, record, fieldMap(record), validateDocumentContext(record.documentContext === undefined ? {} : record.documentContext)))) fail('DOCUMENT_ENGLISH_REQUIRED', 409);
  return { ...readiness, content: content.trim() };
}

export const validateDocumentContext = validateDocumentDetails;
export const assessDocumentReadiness = documentReadiness;
export const validateFinalArtifact = assertFinalArtifact;
export const mergeDocumentContext = mergeDocumentDetails;

/**
 * English supplementary correspondence using confirmed facts and context.
 * Default draft status is explicit. Final means the structural prerequisites are met;
 * it does not mean official approval, independent verification, sending, or submission.
 */
export function generateReviewedDocument(record, kind = record?.draftType, { generatedAt = new Date().toISOString(), status = 'draft' } = {}) {
  if (!['draft', 'final'].includes(status)) fail();
  const readiness = documentReadiness(record, { kind, locale: 'en' });
  if (!readiness.ready) fail('DOCUMENT_DETAILS_REQUIRED', 409, readiness);
  const fields = fieldMap(record);
  const context = validateDocumentContext(record.documentContext === undefined ? {} : record.documentContext);
  const included = new Set(readiness.resolvedKeys);
  const value = key => included.has(key) && !context[key]?.notApplicable ? (fields.get(key)?.value ?? context[key]?.value ?? '').trim() : '';
  const preparedOn = confirmedTimestamp(generatedAt).slice(0, 10);
  const dateLine = value('documentDate') ? `Document date: ${value('documentDate')}` : `Prepared on: ${preparedOn}`;
  const boundary = 'Supplementary correspondence; not an official agency form.';
  const header = status === 'draft' ? 'DRAFT — FOR HUMAN REVIEW\n' + boundary : boundary;
  const factLabels = { property: 'Property', owner: 'Owner', pha: 'Housing authority', caseReference: 'Case reference', rent: 'Proposed rent (not approved)' };
  const facts = FIELDS.filter(key => value(key)).map(key => `${factLabels[key]}: ${value(key)}`).join('\n');
  const disclaimer = 'This document does not constitute an eligibility determination, rent approval, agency acceptance, or proof of submission.';
  let content;
  if (kind === 'status-summary') {
    const preparer = [`Prepared by: ${value('senderName')}`, value('senderRole'), value('senderOrganization'), value('senderContact')].filter(Boolean).join('\n');
    const actions = [value('nextActionOwner') && `Next-action owner: ${value('nextActionOwner')}`, value('targetDate') && `Target date: ${value('targetDate')}`].filter(Boolean);
    content = [header, 'CASE STATUS SUMMARY', dateLine, facts, preparer,
      ...(actions.length ? [actions.join('\n')] : []),
      'Only user-confirmed information is included. Other details are omitted. Confirm the applicable agency instructions before use.',
      value('attachments') && `Attachments:\n${value('attachments')}`, disclaimer].filter(Boolean).join('\n\n');
  } else {
    const recipientName = value('recipientName') || value('recipientOrganization');
    const recipient = [`To: ${recipientName}`, value('recipientName') && value('recipientOrganization'), value('recipientContact')].filter(Boolean).join('\n');
    const subject = kind === 'missing-documents' ? 'Request for information and document confirmation' : 'Request for lease-up instructions';
    const request = kind === 'missing-documents'
      ? 'Please confirm the information and current documentation requirements relevant to this case, including any outstanding requests. An item not recorded in this working copy is not evidence that it has not already been submitted.'
      : 'Please confirm the applicable lease-up instructions, current Request for Tenancy Approval package, supporting documentation, and submission method for this case.';
    const sender = [value('senderName'), value('senderRole'), value('senderOrganization'), value('senderContact')].filter(Boolean).join('\n');
    content = [header, dateLine, recipient,
      `Subject: ${subject}${value('caseReference') ? ' — ' + value('caseReference') : ''}`,
      value('salutation') || 'Hello,', 'I am preparing administrative lease-up materials for the property below and would appreciate your guidance.',
      facts, request,
      'Please confirm an approved secure channel before requesting sensitive identity, tax, or banking documents.',
      disclaimer, 'Thank you for your assistance.', `Sincerely,\n${sender}`,
      context.attachments?.notApplicable ? 'Attachments: None' : value('attachments') && `Attachments:\n${value('attachments')}`].filter(Boolean).join('\n\n');
  }
  return assertFinalArtifact(record, content, { kind, locale: 'en' }).content;
}
