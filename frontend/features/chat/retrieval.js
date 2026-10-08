/** Bounded UI protocol. Never retain tool arguments, private snippets, arbitrary URLs or reasoning. */
export const LIBRARY_CODES = Object.freeze([
  'LIBRARY_PERMISSION_REVOKED', 'LIBRARY_PERMISSION_CONFLICT', 'LIBRARY_CONTEXT_INVALID', 'LIBRARY_CONSENT_REQUIRED', 'LIBRARY_ARGUMENT_INVALID', 'LIBRARY_TOOL_UNKNOWN',
  'LIBRARY_NOT_FOUND', 'LIBRARY_SENSITIVE_DATA', 'LIBRARY_UNAVAILABLE', 'LIBRARY_RESULT_LIMIT',
  'LIBRARY_TOOL_LIMIT', 'LIBRARY_ABORTED', 'LIBRARY_TIMEOUT', 'LIBRARY_UNVERIFIED_CITATION'
]);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const invalid = () => { throw Object.assign(new Error('CHAT_STREAM_FAILED'), { code: 'CHAT_STREAM_FAILED' }); };
export function normalizeLibraryActivity(value) {
  if (!object(value) || !['searching', 'reading', 'retrieving'].includes(value.phase) || !['started', 'completed', 'error'].includes(value.state)) invalid();
  const result = { phase: value.phase, state: value.state };
  if (value.count !== undefined) { if (!integer(value.count) || value.count > 8) invalid(); result.count = value.count; }
  if (value.code !== undefined) { if (!LIBRARY_CODES.includes(value.code)) invalid(); result.code = value.code; }
  return result;
}
export function normalizeLibrarySources(value) {
  if (!object(value) || JSON.stringify(value).length > 64000 || !uuid(value.requestId) || !Array.isArray(value.items) || !value.items.length || value.items.length > 48 ||
      typeof value.appendix !== 'string' || value.appendix.length > 16000 || /\u0000/u.test(value.appendix)) invalid();
  const seen = new Set();
  const items = value.items.map(item => {
    if (!object(item) || !/^S(?:[1-9]|[1-3]\d|4[0-8])$/u.test(item.sourceId) || seen.has(item.sourceId) ||
        !['client','case','asset','artifact'].includes(item.kind) || !uuid(item.id) || !integer(item.version) || item.version < 1 ||
        typeof item.title !== 'string' || item.title.length > 160 || /[\u0000-\u001f\u007f]/u.test(item.title) ||
        typeof item.titleTruncated !== 'boolean' || !['metadata','read','unavailable'].includes(item.retrievalState)) invalid();
    seen.add(item.sourceId);
    const result = { sourceId:item.sourceId, kind:item.kind, id:item.id, version:item.version, title:item.title,
      titleTruncated:item.titleTruncated, retrievalState:item.retrievalState };
    for (const key of ['caseId','clientId']) if (item[key] !== undefined && item[key] !== null) {
      if (!uuid(item[key])) invalid(); result[key] = item[key];
    }
    for (const key of ['sourceCaseVersion','currentCaseVersion']) if (item[key] !== undefined) {
      if (!integer(item[key]) || item[key] < 1) invalid(); result[key] = item[key];
    }
    for (const key of ['isStale','needsRegeneration','truncated']) if (item[key] !== undefined) {
      if (typeof item[key] !== 'boolean') invalid(); result[key] = item[key];
    }
    if (item.status !== undefined) { if (!['draft','final'].includes(item.status)) invalid(); result.status = item.status; }
    for (const key of ['createdAt','updatedAt']) if (item[key] !== undefined) {
      if (typeof item[key] !== 'string' || item[key].length > 40 || !/^\d{4}-\d{2}-\d{2}T/u.test(item[key]) || !Number.isFinite(Date.parse(item[key]))) invalid();
      result[key] = item[key];
    }
    if (item.excerpts !== undefined) {
      if (!Array.isArray(item.excerpts) || item.excerpts.length > 6) invalid();
      result.excerpts = item.excerpts.map(excerpt => {
        if (!object(excerpt) || !integer(excerpt.offset) || !integer(excerpt.endOffset) || !integer(excerpt.textLength) ||
            excerpt.offset > excerpt.endOffset || excerpt.endOffset > excerpt.textLength || excerpt.textLength > 1000000 ||
            excerpt.offsetBasis !== 'sanitized-extracted-text-characters') invalid();
        return {offset:excerpt.offset,endOffset:excerpt.endOffset,textLength:excerpt.textLength,offsetBasis:excerpt.offsetBasis};
      });
    }
    return result;
  });
  return {requestId:value.requestId,items,appendix:value.appendix};
}
