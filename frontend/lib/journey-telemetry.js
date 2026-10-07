/** First-party v1 action observations. Never accepts content, URLs or arbitrary metadata. */
export const JOURNEY_ACTIONS = Object.freeze([
  'input.paste', 'input.file', 'input.mapping', 'review.confirm', 'draft.generate', 'draft.edit',
  'export.copy', 'export.download', 'export.print', 'case.open', 'case.save', 'case.delete'
]);
export const JOURNEY_LIMITS = Object.freeze({ queue: 20, batch: 10, perMinute: 50, workflowsPerMinute: 10, queueAgeMs: 30000, flushDelayMs: 1000, timeoutMs: 3000 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const ERRORS = new Set(['CLIENT_CANCELLED', 'CLIENT_VALIDATION', 'CLIPBOARD_FAILED', 'DOWNLOAD_FAILED', 'PRINT_FAILED', 'UNKNOWN_CLIENT_ERROR']);
const VIEWS = new Set(['chat', 'intake', 'customers', 'documents', 'settings']);
const boundedMs = (value, maximum) => Math.min(maximum, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
const noopAction = Object.freeze({ headers: Object.freeze({}), finish() {} });

/** Only semantically equivalent legacy actions. Never return or retain a dynamic path/query. */
export function classifyJourneyRequest(path, method = 'GET') {
  if (typeof path !== 'string' || !path.startsWith('/api/') || /[\\\r\n]/u.test(path)) return null;
  let pathname;
  try { pathname = new URL(path, 'https://nestlet.invalid').pathname; } catch { return null; }
  if (method === 'POST' && ['/api/document', '/api/workbook'].includes(pathname)) return 'input.file';
  if (pathname === '/api/cases' && method === 'POST') return 'case.save';
  if (!/^\/api\/cases\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(pathname)) return null;
  return { GET: 'case.open', PUT: 'case.save', DELETE: 'case.delete' }[method] || null;
}

/**
 * Session-owned, tab-memory-only observer. Business operations must never await it.
 * Injected clock/environment are deterministic test seams, not telemetry metadata.
 */
export function createJourneyTelemetry({
  fetchImpl = (...args) => fetch(...args), getSession = () => ({}),
  now = () => performance.now(), documentTarget = globalThis.document,
  windowTarget = globalThis.window, isOnline = () => globalThis.navigator?.onLine !== false,
  setTimer = setTimeout, clearTimer = clearTimeout
} = {}) {
  let identity = null, scope = null, caseId = null, epoch = 0, navigation = 0;
  let workflowId = null, creating = null, flushing = null, bindingAttemptedCase = null, disabled = false, disposed = true;
  let queue = [], eventTimes = [], workflowTimes = [], flushTimer = null;
  let step = null, view = null, activeSince = null, activeMs = 0, activeWaits = 0, stepGeneration = 0;
  const controllers = new Set(), actions = new Set();
  const visible = () => documentTarget?.visibilityState !== 'hidden';
  const liveIdentity = () => {
    const session = getSession();
    return session?.authenticated && typeof session.userId === 'string' && session.userId && typeof session.csrfToken === 'string' && session.csrfToken
      ? { userId: session.userId, csrfToken: session.csrfToken } : null;
  };
  const same = (a, b) => a?.userId === b?.userId && a?.csrfToken === b?.csrfToken;
  const pause = () => { if (activeSince !== null) { activeMs += Math.max(0, now() - activeSince); activeSince = null; } };
  const resume = () => { if (identity && !disabled && step && !activeWaits && visible() && activeSince === null) activeSince = now(); };
  const stopFlushTimer = () => { if (flushTimer !== null) clearTimer(flushTimer); flushTimer = null; };
  const clearActions = () => { for (const action of actions) action.drop(); actions.clear(); activeWaits = 0; };
  const clearJourney = () => {
    epoch++; navigation++; stopFlushTimer(); clearActions();
    for (const controller of controllers) controller.abort();
    controllers.clear(); queue = []; workflowId = null; bindingAttemptedCase = null; creating = null; flushing = null;
    activeSince = null; activeMs = 0; step = null;
  };
  const syncIdentity = () => {
    if (disposed) return false;
    const next = liveIdentity();
    if (!same(identity, next)) {
      clearJourney(); identity = next; scope = null; caseId = null; view = null; disabled = false;
    }
    return Boolean(identity) && !disabled;
  };
  const current = savedEpoch => !disposed && savedEpoch === epoch && same(identity, liveIdentity()) && Boolean(identity) && !disabled;
  const disable = savedEpoch => {
    if (!current(savedEpoch)) return;
    clearJourney(); disabled = true;
  };
  const request = async (path, body, savedEpoch, keepalive = false) => {
    if (!current(savedEpoch) || !isOnline()) return null;
    const controller = new AbortController(); controllers.add(controller);
    const timeout = setTimer(() => controller.abort(), JOURNEY_LIMITS.timeoutMs);
    try {
      const response = await fetchImpl(path, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': identity.csrfToken },
        body: JSON.stringify(body), signal: controller.signal, keepalive });
      // Keep the timeout/abort alive through workflow JSON consumption, not only response headers.
      if (path === '/api/workflows' && response.ok) return { ok: true, workflowId: (await response.json())?.workflowId };
      void response.body?.cancel?.().catch(() => {});
      return { ok: response.ok, status: response.status };
    } finally { clearTimer(timeout); controllers.delete(controller); }
  };
  const ensureWorkflow = async () => {
    if (!syncIdentity() || !isOnline()) return null;
    if (workflowId) return workflowId;
    if (creating) return creating;
    const savedEpoch = epoch;
    workflowTimes = workflowTimes.filter(time => now() - time < 60000);
    if (workflowTimes.length >= JOURNEY_LIMITS.workflowsPerMinute) { queue = []; return null; }
    workflowTimes.push(now());
    const pending = (async () => {
      try {
        const response = await request('/api/workflows', {}, savedEpoch);
        if (!current(savedEpoch)) return null;
        if (!response?.ok) { disable(savedEpoch); return null; }
        if (!current(savedEpoch)) return null;
        if (!UUID.test(response.workflowId)) { disable(savedEpoch); return null; }
        workflowId = response.workflowId;
        return workflowId;
      } catch { disable(savedEpoch); return null; }
    })();
    creating = pending;
    void pending.finally(() => { if (creating === pending) creating = null; });
    return pending;
  };
  const flush = ({ keepalive = false } = {}) => {
    stopFlushTimer();
    if (!syncIdentity()) return Promise.resolve();
    if (!isOnline()) { queue = []; return Promise.resolve(); }
    if (flushing) return flushing;
    queue = queue.filter(entry => now() - entry.time <= JOURNEY_LIMITS.queueAgeMs);
    if (!queue.length) return Promise.resolve();
    // A closing tab cannot reliably create/bind a workflow. Drop instead of sending unauthenticated beacons.
    if (keepalive && !workflowId) { queue = []; return Promise.resolve(); }
    const savedEpoch = epoch;
    const pending = (async () => {
      try {
        const id = workflowId || await ensureWorkflow();
        if (!id || !current(savedEpoch)) return;
        if (caseId && bindingAttemptedCase !== caseId && !keepalive) {
          const binding = caseId;
          const response = await request(`/api/workflows/${id}/bind`, { caseId: binding }, savedEpoch);
          if (!current(savedEpoch)) return;
          // A case may have just been deleted or never existed. Keep its failure/action
          // observation under the owned workflow without inventing an association.
          if (!response?.ok && response?.status !== 404) { disable(savedEpoch); return; }
          bindingAttemptedCase = binding;
        }
        // At most the bounded queue present at entry; new events get their own delayed flush.
        let remaining = JOURNEY_LIMITS.queue;
        while (queue.length && remaining > 0 && current(savedEpoch)) {
          const batch = queue.splice(0, Math.min(JOURNEY_LIMITS.batch, remaining)).filter(entry => now() - entry.time <= JOURNEY_LIMITS.queueAgeMs);
          remaining -= batch.length;
          if (!batch.length) break;
          const response = await request(`/api/workflows/${id}/events`, { events: batch.map(entry => entry.payload) }, savedEpoch, keepalive);
          if (!current(savedEpoch)) return;
          // No retries, no persistence, and no business/API unauthorized callback. A 401 cannot recurse.
          if (!response?.ok) { disable(savedEpoch); return; }
        }
      } catch { disable(savedEpoch); }
    })();
    flushing = pending;
    void pending.finally(() => { if (flushing === pending) flushing = null; });
    return pending;
  };
  const enqueue = payload => {
    if (!syncIdentity() || !isOnline()) return;
    const time = now();
    eventTimes = eventTimes.filter(value => time - value < 60000);
    queue = queue.filter(entry => time - entry.time <= JOURNEY_LIMITS.queueAgeMs);
    if (eventTimes.length >= JOURNEY_LIMITS.perMinute || queue.length >= JOURNEY_LIMITS.queue) return;
    eventTimes.push(time); queue.push({ payload, time });
    if (flushTimer === null) flushTimer = setTimer(() => { flushTimer = null; void flush(); }, JOURNEY_LIMITS.flushDelayMs);
  };
  const activateStep = event => {
    if (event !== null && !JOURNEY_ACTIONS.includes(event)) return;
    if (!syncIdentity() || step === event) return;
    pause(); step = event; stepGeneration++; activeWaits = 0; activeMs = 0; activeSince = null; resume();
  };
  const visit = next => {
    if (!VIEWS.has(next) || !syncIdentity() || view === next) return;
    // Navigation is a lifetime guard only; v1 has no page-visit/dwell event.
    pause(); navigation++; clearActions(); view = next; step = null; activeMs = 0; activeSince = null;
  };
  const setScope = ({ workspaceKey = null, caseId: nextCase = null } = {}) => {
    if (!syncIdentity()) return;
    if (workspaceKey !== null && (typeof workspaceKey !== 'string' || !UUID.test(workspaceKey))) return;
    if (nextCase !== null && (typeof nextCase !== 'string' || !UUID.test(nextCase))) return;
    if (scope !== workspaceKey || (caseId && caseId !== nextCase)) { clearJourney(); disabled = false; }
    scope = workspaceKey; caseId = nextCase;
  };
  const beginAction = (event, { signal } = {}) => {
    if (!JOURNEY_ACTIONS.includes(event) || !syncIdentity() || signal?.aborted || actions.size >= JOURNEY_LIMITS.queue) return noopAction;
    const savedEpoch = epoch, savedNavigation = navigation, started = now(), measuredStep = step === event, savedStepGeneration = stepGeneration;
    let done = false;
    let dwell = 0;
    if (measuredStep) { pause(); dwell = boundedMs(activeMs, 86400000); activeMs = 0; activeWaits++; }
    const headers = workflowId ? { 'X-Workflow-Id': workflowId } : {};
    const remove = () => {
      signal?.removeEventListener('abort', aborted); actions.delete(action);
      if (measuredStep && savedStepGeneration === stepGeneration) { activeWaits = Math.max(0, activeWaits - 1); resume(); }
    };
    const finish = ({ ok = true, cancelled = false, httpStatus, headers: responseHeaders, errorCode } = {}) => {
      if (done) return; done = true; remove();
      if (!current(savedEpoch) || savedNavigation !== navigation) return;
      if (httpStatus === 401) { disable(savedEpoch); return; }
      const payload = { event, outcome: ok && !cancelled ? 'success' : 'failure', clientActiveMs: dwell,
        clientWaitMs: boundedMs(now() - started, 300000) };
      if (payload.outcome === 'failure') payload.errorCode = cancelled ? 'CLIENT_CANCELLED' : ERRORS.has(errorCode) ? errorCode : 'UNKNOWN_CLIENT_ERROR';
      // Only recorded backend business requests can be correlated. Never adopt a returned foreign/new workflow.
      try {
        const returnedWorkflow = responseHeaders?.get?.('X-Workflow-Id');
        const requestId = responseHeaders?.get?.('X-Request-Id');
        if (workflowId && headers['X-Workflow-Id'] === workflowId && returnedWorkflow === workflowId &&
          responseHeaders?.get?.('X-Telemetry-Status') === 'active' && UUID.test(requestId)) payload.requestId = requestId;
      } catch { /* Headers are optional. */ }
      enqueue(payload);
    };
    const aborted = () => finish({ ok: false, cancelled: true });
    const action = { headers, finish, drop() { if (!done) { done = true; remove(); } } };
    actions.add(action); signal?.addEventListener('abort', aborted, { once: true });
    // Prepare correlation for later operations without delaying this business request.
    void ensureWorkflow();
    return { headers, finish };
  };
  const visibility = () => { if (visible()) resume(); else { pause(); void flush({ keepalive: true }); } };
  const pagehide = () => { pause(); void flush({ keepalive: true }); };
  return {
    connect() {
      if (!disposed) return;
      disposed = false; syncIdentity();
      documentTarget?.addEventListener('visibilitychange', visibility);
      windowTarget?.addEventListener('pagehide', pagehide);
    },
    syncIdentity, setScope, visit, activateStep, beginAction, flush,
    reset() { clearJourney(); identity = liveIdentity(); scope = null; caseId = null; view = null; disabled = true; },
    dispose() { clearJourney(); disposed = true; identity = null; documentTarget?.removeEventListener('visibilitychange', visibility); windowTarget?.removeEventListener('pagehide', pagehide); }
  };
}
