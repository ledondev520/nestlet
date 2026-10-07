/** Same-origin JSON client. Sessions and CSRF tokens remain in memory. */
import { classifyJourneyRequest } from './journey-telemetry.js';
export class ApiError extends Error {
  constructor(code, status = 0, details) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function createApiClient({ fetchImpl = (...args) => fetch(...args), getCsrfToken = () => '', onUnauthorized = () => {}, getJourney = () => null } = {}) {
  async function request(path, { method = 'GET', body, signal, rawBody, contentType, filename, assetConsent, documentConsent, telemetry } = {}) {
    if (typeof path !== 'string' || !path.startsWith('/api/') || path.includes('\\') || /[\r\n]/.test(path)) {
      throw new ApiError('INVALID_API_PATH');
    }
    if (!new URL(path, 'https://nestlet.invalid').pathname.startsWith('/api/')) throw new ApiError('INVALID_API_PATH');
    const headers = { Accept: 'application/json' };
    const requestCsrf = getCsrfToken();
    if (rawBody !== undefined) {
      const pathname = new URL(path, 'https://nestlet.invalid').pathname;
      if (method !== 'POST' || !['/api/assets', '/api/document', '/api/workbook'].includes(pathname)) throw new ApiError('INVALID_UPLOAD_PATH');
      if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/plain', 'text/csv', 'image/png', 'image/jpeg'].includes(contentType)) throw new ApiError('INVALID_UPLOAD_TYPE');
      headers['Content-Type'] = contentType;
      if (filename) headers['X-Asset-Filename'] = encodeURIComponent(filename);
      if (assetConsent === true) headers['X-Asset-Consent'] = 'persist-private';
      if (documentConsent === true) headers['X-Document-Consent'] = 'synthetic-or-deidentified';
    } else if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = requestCsrf;
    // Reads are not automatically counted as user opens: most are background
    // refreshes. Explicit reads can opt in; feature-owned actions opt out.
    const event = telemetry === false || method === 'GET' && telemetry !== true ? null : classifyJourneyRequest(path, method);
    let observation;
    try {
      observation = event ? getJourney()?.beginAction(event, { signal }) : null;
      const workflowId = observation?.headers?.['X-Workflow-Id'];
      if (typeof workflowId === 'string' && /^[a-f0-9-]{36}$/u.test(workflowId)) headers['X-Workflow-Id'] = workflowId;
    } catch { /* Observability must never alter business behavior. */ }
    const observed = detail => { try { observation?.finish(detail); } catch { /* Nonblocking metadata only. */ } };
    let response;
    try {
      response = await fetchImpl(path, {
        method, headers, credentials: 'same-origin', cache: 'no-store', signal,
        ...(rawBody !== undefined ? { body: rawBody } : body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch (error) {
      observed({ ok: false, cancelled: error.name === 'AbortError' });
      if (error.name === 'AbortError') throw error;
      throw new ApiError('NETWORK_ERROR');
    }
    let data;
    try { data = await response.json(); }
    catch {
      observed({ ok: false, cancelled: signal?.aborted === true, httpStatus: response.status, headers: response.headers });
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new ApiError('INVALID_RESPONSE', response.status);
    }
    if (signal?.aborted) {
      observed({ ok: false, cancelled: true, httpStatus: response.status, headers: response.headers });
      throw new DOMException('Aborted', 'AbortError');
    }
    observed({ ok: response.ok, httpStatus: response.status, headers: response.headers });
    if (!response.ok) {
      // A delayed old-account request must not log out a newer session.
      const rejectedBindingPassword = path === '/api/auth/email/bind' && data?.code === 'INVALID_CREDENTIALS';
      if (response.status === 401 && !path.startsWith('/api/login') && !rejectedBindingPassword && requestCsrf === getCsrfToken()) onUnauthorized();
      // Never render arbitrary backend exception text as interface copy.
      throw new ApiError(typeof data?.code === 'string' ? data.code : 'REQUEST_FAILED', response.status, data?.details);
    }
    return data;
  }
  return {
    request,
    upload: (path, file, options) => request(path, { ...options, method: 'POST', rawBody: file }),
    get: (path, options) => request(path, options),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
    delete: (path, body, options) => request(path, { ...options, method: 'DELETE', body })
  };
}
