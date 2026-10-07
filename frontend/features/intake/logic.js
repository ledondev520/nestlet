import { FIELDS, extract, parseCSV, mapSpreadsheetRow, validateSuggestions } from '../../../public/core.js';
export { FIELDS, extract, parseCSV, mapSpreadsheetRow, validateSuggestions };
export const LIMITS = Object.freeze({
  source: 50000,
  fileBytes: 5 * 1024 * 1024,
  queue: 10
});
export class IntakeError extends Error {
  constructor(code) {
    super(code);
    this.name = 'IntakeError';
    this.code = code;
  }
}
const fail = code => {
  throw new IntakeError(code);
};
export const emptyFields = () => FIELDS.map(key => ({
  key,
  value: '',
  source: '',
  conflict: false,
  confirmed: false
}));
export const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value);
export function caseWork(record) {
  return {
    title: record?.title || '',
    sourceText: record?.sourceText || '',
    fields: record?.fields?.length === 5 ? record.fields.map(field => ({
      ...field
    })) : emptyFields(),
    draftType: record?.draftType || 'followup',
    draftText: record?.draftText || '',
    extractionMode: record?.extractionMode === 'live' ? 'live' : 'manual',
    namesVerified: record?.namesVerified === true,
    clientId: record?.clientId || null
  };
}
export function casePayload(work, fallbackTitle) {
  const payload = caseWork(work);
  payload.title = payload.title.trim() || fallbackTitle;
  if (payload.title.length > 120 || payload.sourceText.length > LIMITS.source || payload.fields.some(field => field.value.length > 3000 || field.source.length > 50000)) fail('CASE_TOO_LARGE');
  // Dedicated document-context and issue operations alone own those records.
  return payload;
}
export function fileType(file) {
  const extension = file?.name?.split('.').at(-1)?.toLowerCase();
  const types = {
    txt: 'text/plain',
    csv: 'text/csv',
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg'
  };
  if (!types[extension]) fail('ASSET_TYPE_UNSUPPORTED');
  if (!Number.isSafeInteger(file.size) || file.size < 1) fail('ASSET_EMPTY');
  if (file.size > LIMITS.fileBytes) fail('ASSET_TOO_LARGE');
  return {
    extension,
    mime: types[extension],
    workbook: ['xlsx', 'xls'].includes(extension),
    image: ['png', 'jpg', 'jpeg'].includes(extension)
  };
}
export function appendSource(current, incoming) {
  if (typeof incoming !== 'string' || !incoming.trim()) fail('SOURCE_EMPTY');
  const next = current.trim() ? `${current}\n\n${incoming}` : incoming;
  if (next.length > LIMITS.source) fail('TEXT_TOO_LARGE');
  return next;
}
function evidence(field) {
  return [...new Set([field?.source, ...(field?.sources || [])].filter(Boolean))];
}
/** A new suggestion can add evidence, never erase a reviewed or edited value. */
export function mergeSuggestions(existing, incoming) {
  return FIELDS.map(key => {
    const old = existing.find(field => field.key === key) || emptyFields().find(field => field.key === key);
    const next = incoming.find(field => field.key === key) || emptyFields().find(field => field.key === key);
    if (!next.value && !next.conflict) return old;
    if (!old.value && !old.confirmed && !old.edited && !old.conflict) return {
      ...next,
      confirmed: false
    };
    if (old.value === next.value && !next.conflict && !old.conflict) return old.confirmed ? old : {
      ...next,
      edited: old.edited || false,
      confirmed: false
    };
    const source = [...new Set([...evidence(old), ...evidence(next)])].join('\n');
    if (source.length > LIMITS.source) fail('TEXT_TOO_LARGE');
    // The old value remains visible; resolving the contradictory sources is explicit.
    return {
      key,
      value: old.value || next.value,
      source,
      conflict: true,
      confirmed: false,
      edited: old.edited || false
    };
  });
}
export function applySuggestions(work, incoming, extractionMode) {
  return {
    ...work,
    fields: mergeSuggestions(work.fields, incoming),
    extractionMode,
    namesVerified: false
  };
}
/** Three-way reconciliation adopts untouched remote values and flags overlapping edits. */
export function reconcileWork(base, local, remote) {
  const latest = caseWork(remote),
    previous = caseWork(base),
    result = {
      ...latest
    };
  result.title = local.title !== previous.title ? local.title : latest.title;
  if (local.sourceText === previous.sourceText) result.sourceText = latest.sourceText;else if (latest.sourceText === previous.sourceText || latest.sourceText === local.sourceText) result.sourceText = local.sourceText;else result.sourceText = appendSource(local.sourceText, latest.sourceText);
  result.fields = FIELDS.map(key => {
    const before = previous.fields.find(field => field.key === key),
      ours = local.fields.find(field => field.key === key),
      theirs = latest.fields.find(field => field.key === key);
    if (equal(before, ours)) return theirs;
    if (equal(before, theirs) || equal(ours, theirs)) return ours;
    return mergeSuggestions([ours], [theirs]).find(field => field.key === key);
  });
  result.extractionMode = local.extractionMode !== previous.extractionMode ? local.extractionMode : latest.extractionMode;
  result.namesVerified = local.namesVerified && latest.namesVerified && result.fields.every(field => field.confirmed && !field.conflict);
  return result;
}
export function validateWorkbook(result) {
  if (!Array.isArray(result?.sheets) || !result.sheets.length || result.sheets.length > 12 || !result.sheets.some(sheet => sheet.hidden === false && Array.isArray(sheet.rows) && sheet.rows.length)) fail('INVALID_WORKBOOK');
  return result;
}
export function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}
export function importMatches(request, userId, caseId) {
  return Boolean(request?.id && request.userId === userId && (request.caseId || null) === (caseId || null) && Array.isArray(request.files));
}

/** Recovery contains only text edits, their optimistic version, and original IDs. */
export function recoverySnapshot(work, base, caseId, assets = []) {
  return {
    title: work.title,
    sourceText: work.sourceText,
    fields: work.fields,
    extractionMode: work.extractionMode,
    namesVerified: work.namesVerified,
    baseVersion: base?.version || null,
    caseId: caseId || null,
    assetIds: assets.filter(asset => !asset.caseId).map(asset => asset.id)
  };
}
export function validRecovery(snapshot, caseId) {
  if (!snapshot || snapshot.caseId !== (caseId || null) || !(snapshot.baseVersion === null || Number.isSafeInteger(snapshot.baseVersion) && snapshot.baseVersion > 0)) return false;
  return typeof snapshot.title === 'string' && snapshot.title.length <= 120 && typeof snapshot.sourceText === 'string' && snapshot.sourceText.length <= LIMITS.source && ['manual', 'live'].includes(snapshot.extractionMode) && typeof snapshot.namesVerified === 'boolean' && Array.isArray(snapshot.fields) && snapshot.fields.length === 5 && FIELDS.every((key, index) => {
    const field = snapshot.fields[index];
    return field?.key === key && typeof field.value === 'string' && field.value.length <= 3000 && typeof field.source === 'string' && field.source.length <= 50000 && typeof field.confirmed === 'boolean' && typeof field.conflict === 'boolean' && !(field.confirmed && field.conflict);
  });
}
export function restoreEdits(snapshot, canonical) {
  return {
    ...caseWork(canonical),
    title: snapshot.title,
    sourceText: snapshot.sourceText,
    fields: snapshot.fields,
    extractionMode: snapshot.extractionMode,
    namesVerified: snapshot.namesVerified
  };
}
