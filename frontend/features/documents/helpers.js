export const FACT_KEYS = Object.freeze(['property', 'owner', 'pha', 'caseReference', 'rent']);
export const DOCUMENT_KINDS = Object.freeze(['followup', 'missing-documents', 'status-summary']);
export const DETAIL_KEYS = Object.freeze(['documentDate', 'recipientName', 'recipientOrganization', 'recipientContact', 'salutation', 'senderName', 'senderRole', 'senderOrganization', 'senderContact', 'attachments', 'nextActionOwner', 'targetDate']);
export const ISSUE_STATUSES = Object.freeze(['pending', 'confirmed', 'resolved']);

export function confirmationBody(answers, record, namesVerified) {
  const changes = {}, factChanges = {};
  for (const [key, raw] of Object.entries(answers)) {
    if (![...FACT_KEYS, ...DETAIL_KEYS].includes(key)) continue;
    const answer = typeof raw === 'string' ? {value: raw} : raw;
    if (!answer || typeof answer.value !== 'string') continue;
    const value = answer.value.trim();
    if (!value && !answer.notApplicable) continue;
    if (FACT_KEYS.includes(key)) factChanges[key] = {value};
    else changes[key] = {value: answer.notApplicable ? '' : value, ...(answer.notApplicable ? {notApplicable: true} : {}),
      ...(answer.sourceMessageId ? {sourceMessageId: answer.sourceMessageId} : {})};
  }
  if (!Object.keys(changes).length && !Object.keys(factChanges).length && namesVerified === undefined) return null;
  return {changes, ...(Object.keys(factChanges).length ? {factChanges} : {}), confirm: true, expectedVersion: record.version,
    ...(namesVerified === undefined ? {} : {namesVerified})};
}

export function mutableCasePayload(record, overrides = {}) {
  // Dedicated confirmation/issue routes own their metadata; ordinary PUT must omit it.
  const keys = ['title', 'sourceText', 'fields', 'draftType', 'draftText', 'extractionMode', 'namesVerified', 'clientId'];
  return {...Object.fromEntries(keys.filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]])), ...overrides, expectedVersion: record.version};
}

export function currentValue(record, key) {
  return FACT_KEYS.includes(key) ? record?.fields?.find(field => field.key === key)?.value || '' : record?.documentContext?.[key]?.value || '';
}

export function hasUnreviewedCJK(content, record) {
  let remaining = content;
  if (record?.namesVerified === true) {
    const entries = [...(record.fields || []).filter(field => field.key !== 'rent'),
      ...['recipientName','recipientOrganization','recipientContact','senderName','senderOrganization','senderContact','nextActionOwner'].map(key => record.documentContext?.[key])];
    const names = entries.filter(item => item?.confirmed && !item.conflict && !item.notApplicable && item.value && item.source)
      .map(item => item.value).sort((a, b) => b.length - a.length);
    for (const name of new Set(names)) remaining = remaining.split(name).join(' ');
  }
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(remaining);
}

export function issueChange(form) {
  if (!form || typeof form.question !== 'string' || typeof form.resolution !== 'string') return null;
  const question = form.question.trim(), resolution = form.resolution.trim();
  if (!question || question.length > 500 || !ISSUE_STATUSES.includes(form.status) || resolution.length > 2000 || (form.status === 'resolved' && !resolution)) return null;
  return {...(form.id ? {id: form.id} : {}), question, status: form.status, resolution, sourceMessageId: form.sourceMessageId || null};
}

export function printableFilename(artifact) {
  const kind = DOCUMENT_KINDS.includes(artifact?.kind) ? artifact.kind : 'document';
  const status = artifact?.status === 'final' ? 'final' : 'draft';
  const version = Number.isSafeInteger(artifact?.version) && artifact.version > 0 ? `-v${artifact.version}` : '';
  return `nestlet-${kind}${version}-${status}.txt`;
}

/** No inline code, styles, or HTML parsing of document content, including in a print window. */
export function fillPrintDocument(popup, content, stylesheetUrl, title = 'Nestlet document') {
  const doc = popup.document;
  doc.documentElement.lang = 'en'; doc.title = title;
  const article = doc.createElement('article'); article.className = 'print-document'; article.textContent = content;
  doc.body.replaceChildren(article);
  const link = doc.createElement('link'); link.rel = 'stylesheet'; link.href = stylesheetUrl;
  doc.head.append(link);
  return link;
}
