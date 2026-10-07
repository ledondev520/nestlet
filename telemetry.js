/** Bounded first-party operational metadata. Never accepts document text or arbitrary metadata. */
export const CLIENT_EVENTS = Object.freeze(['input.paste', 'input.file', 'input.mapping', 'review.confirm', 'draft.generate', 'draft.edit', 'export.copy', 'export.download', 'export.print', 'case.open', 'case.save', 'case.delete']);
export const SERVER_EVENTS = Object.freeze(['request.pdf_parse', 'request.workbook_parse', 'request.extract', 'request.case_create', 'request.case_read', 'request.case_update', 'request.case_delete', 'request.case_list']);
export const CLIENT_ERRORS = Object.freeze(['CLIENT_CANCELLED', 'CLIENT_VALIDATION', 'CLIPBOARD_FAILED', 'DOWNLOAD_FAILED', 'PRINT_FAILED', 'UNKNOWN_CLIENT_ERROR']);
const SERVER_ERRORS = new Set(['ORIGIN_REJECTED', 'OPERATOR_SETUP_REQUIRED', 'AUTH_REQUIRED', 'CSRF_REJECTED', 'OWNER_REQUIRED', 'HTTPS_REQUIRED', 'INVALID_JSON', 'UNSUPPORTED_MEDIA_TYPE', 'INPUT_TOO_LARGE', 'INVALID_INPUT', 'SENSITIVE_DATA', 'LIVE_DISABLED', 'TRIAL_LIMIT_REACHED', 'BUSY', 'PROVIDER_ERROR', 'EXTRACTION_FAILED', 'REQUEST_CANCELLED', 'PDF_UNAVAILABLE', 'DOCUMENT_CONSENT_REQUIRED', 'INVALID_PDF', 'PDF_ENCRYPTED', 'PDF_TIMEOUT', 'OCR_REQUIRED', 'TEXT_TOO_LARGE', 'WORKBOOK_UNAVAILABLE', 'INVALID_WORKBOOK', 'WORKBOOK_TOO_COMPLEX', 'WORKBOOK_ENCRYPTED', 'WORKBOOK_TIMEOUT', 'CASE_NOT_FOUND', 'CASE_INVALID', 'CASE_TOO_LARGE', 'CASE_CONFLICT', 'CASE_LIMIT_REACHED', 'USER_INVALID', 'INTERNAL_ERROR', 'UNCLASSIFIED_ERROR']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
export const TELEMETRY_LIMITS = Object.freeze({ retentionDays: 30, eventsPerWorkflow: 200, eventsPerUser: 2000, eventsGlobal: 20000, workflowsPerUser: 100, batch: 10, clientPerMinute: 60, workflowsPerMinute: 20 });
export class TelemetryError extends Error {
  constructor(code, status = 400) { super(code); this.name = 'TelemetryError'; this.code = code; this.status = status; }
}
const invalid = () => { throw new TelemetryError('TELEMETRY_INVALID'); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const keys = (value, allowed, required = []) => {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(value, key))) invalid();
};
const duration = (value, maximum) => {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) invalid();
  return value;
};
export function telemetryId(value) { if (typeof value !== 'string' || !UUID.test(value)) invalid(); return value; }

export function validateClientBatch(body) {
  keys(body, ['events'], ['events']);
  if (!Array.isArray(body.events) || !body.events.length || body.events.length > TELEMETRY_LIMITS.batch) invalid();
  return body.events.map(item => {
    keys(item, ['event', 'outcome', 'clientActiveMs', 'clientWaitMs', 'requestId', 'errorCode'], ['event', 'outcome']);
    if (!CLIENT_EVENTS.includes(item.event) || !['success', 'failure'].includes(item.outcome) ||
        (item.errorCode != null && !CLIENT_ERRORS.includes(item.errorCode)) || (item.outcome === 'success' && item.errorCode != null)) invalid();
    return { source: 'client', event: item.event, outcome: item.outcome, requestId: item.requestId == null ? null : telemetryId(item.requestId),
      httpStatus: null, errorCode: item.errorCode ?? null, serverElapsedMs: null,
      clientActiveMs: duration(item.clientActiveMs, 86400000), clientWaitMs: duration(item.clientWaitMs, 300000) };
  });
}

export function serverTelemetryEvent({ event, requestId, httpStatus, errorCode, serverElapsedMs }) {
  if (!SERVER_EVENTS.includes(event) || !Number.isSafeInteger(httpStatus) || httpStatus < 100 || httpStatus > 599) invalid();
  return { source: 'server', event, requestId: telemetryId(requestId), outcome: httpStatus >= 400 ? 'failure' : 'success', httpStatus,
    errorCode: httpStatus < 400 ? null : SERVER_ERRORS.has(errorCode) ? errorCode : 'UNCLASSIFIED_ERROR',
    serverElapsedMs: duration(serverElapsedMs, 300000), clientActiveMs: null, clientWaitMs: null };
}

/** Revalidate the exact stored shape at the SQLite seam, not only at the HTTP boundary. */
export function validateStoredTelemetryEvent(item) {
  keys(item, ['source', 'event', 'outcome', 'requestId', 'httpStatus', 'errorCode', 'serverElapsedMs', 'clientActiveMs', 'clientWaitMs'], ['source', 'event', 'outcome', 'requestId', 'httpStatus', 'errorCode', 'serverElapsedMs', 'clientActiveMs', 'clientWaitMs']);
  if (item.source === 'client') {
    if (item.httpStatus !== null || item.serverElapsedMs !== null) invalid();
    return validateClientBatch({ events: [{ event: item.event, outcome: item.outcome, requestId: item.requestId, errorCode: item.errorCode, clientActiveMs: item.clientActiveMs, clientWaitMs: item.clientWaitMs }] })[0];
  }
  if (item.source !== 'server' || item.clientActiveMs !== null || item.clientWaitMs !== null || item.serverElapsedMs === null ||
      (item.errorCode !== null && !SERVER_ERRORS.has(item.errorCode))) invalid();
  const canonical = serverTelemetryEvent(item);
  if (canonical.outcome !== item.outcome || canonical.errorCode !== item.errorCode) invalid();
  return canonical;
}

export function telemetryPageOptions(searchParams, admin = false) {
  const allowed = admin ? ['caseId', 'workflowId', 'userId', 'limit', 'beforeId'] : ['limit', 'beforeId'];
  if ([...searchParams.keys()].some(key => !allowed.includes(key)) || [...new Set(searchParams.keys())].some(key => searchParams.getAll(key).length !== 1)) invalid();
  const limit = searchParams.has('limit') ? Number(searchParams.get('limit')) : 100;
  const beforeId = searchParams.has('beforeId') ? Number(searchParams.get('beforeId')) : null;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || (beforeId !== null && (!Number.isSafeInteger(beforeId) || beforeId < 1))) invalid();
  const result = { limit, beforeId };
  if (admin) for (const key of ['caseId', 'workflowId', 'userId']) {
    if (searchParams.has(key)) result[key] = key === 'userId' && searchParams.get(key) === 'owner' ? 'owner' : telemetryId(searchParams.get(key));
  }
  return result;
}

export function createTelemetry(storage) {
  const windows = new Map();
  const consume = (userId, kind, count, maximum) => {
    const key = userId + ':' + kind;
    const now = Date.now();
    const timestamps = (windows.get(key) || []).filter(time => now - time < 60000);
    if (timestamps.length + count > maximum) throw new TelemetryError('TELEMETRY_RATE_LIMITED', 429);
    timestamps.push(...Array(count).fill(now)); windows.set(key, timestamps);
  };
  const createWorkflow = session => {
    consume(session.userId, 'workflow', 1, TELEMETRY_LIMITS.workflowsPerMinute);
    return storage.telemetryCreateWorkflow(session.userId);
  };
  return {
    createWorkflow,
    bind(session, workflowId, caseId) { return storage.telemetryBindWorkflow(session.userId, telemetryId(workflowId), telemetryId(caseId)); },
    postEvents(session, workflowId, body) {
      const events = validateClientBatch(body);
      consume(session.userId, 'client', events.length, TELEMETRY_LIMITS.clientPerMinute);
      return storage.telemetryAppendEvents(session.userId, telemetryId(workflowId), events);
    },
    page(session, filters, admin = false) {
      if (admin && session.role !== 'owner') throw new TelemetryError('OWNER_REQUIRED', 403);
      return storage.telemetryReadEvents(session.userId, filters, admin);
    },
    // These methods are best-effort and never change business success/failure.
    beginRequest(session, suppliedWorkflowId) {
      try {
        if (suppliedWorkflowId) {
          telemetryId(suppliedWorkflowId);
          const workflow = storage.telemetryGetWorkflow(session.userId, suppliedWorkflowId);
          if (!workflow) return { status: 'ignored-invalid-workflow', workflow: null };
          return { status: 'active', workflow };
        }
        return { status: 'active', workflow: createWorkflow(session) };
      } catch { return { status: suppliedWorkflowId ? 'ignored-invalid-workflow' : 'unavailable', workflow: null }; }
    },
    bindRequest(session, workflowId, caseId) {
      try { storage.telemetryBindWorkflow(session.userId, workflowId, caseId); return true; } catch { return false; }
    },
    recordRequest(session, workflowId, event) {
      try { storage.telemetryAppendEvents(session.userId, workflowId, [serverTelemetryEvent(event)]); return true; }
      catch { return false; }
    },
  };
}
