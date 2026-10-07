/** Same-origin JSON client. Sessions and CSRF tokens remain in memory. */
export class ApiError extends Error {
  constructor(code, status = 0, details) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function createApiClient({ fetchImpl = (...args) => fetch(...args), getCsrfToken = () => '', onUnauthorized = () => {} } = {}) {
  async function request(path, { method = 'GET', body, signal } = {}) {
    if (typeof path !== 'string' || !path.startsWith('/api/') || path.includes('\\') || /[\r\n]/.test(path)) {
      throw new ApiError('INVALID_API_PATH');
    }
    if (!new URL(path, 'https://nestlet.invalid').pathname.startsWith('/api/')) throw new ApiError('INVALID_API_PATH');
    const headers = { Accept: 'application/json' };
    const requestCsrf = getCsrfToken();
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (!['GET', 'HEAD'].includes(method)) headers['X-CSRF-Token'] = requestCsrf;
    let response;
    try {
      response = await fetchImpl(path, {
        method, headers, credentials: 'same-origin', cache: 'no-store', signal,
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new ApiError('NETWORK_ERROR');
    }
    let data;
    try { data = await response.json(); }
    catch {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new ApiError('INVALID_RESPONSE', response.status);
    }
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!response.ok) {
      // A delayed old-account request must not log out a newer session.
      if (response.status === 401 && !path.startsWith('/api/login') && requestCsrf === getCsrfToken()) onUnauthorized();
      // Never render arbitrary backend exception text as interface copy.
      throw new ApiError(typeof data?.code === 'string' ? data.code : 'REQUEST_FAILED', response.status, data?.details);
    }
    return data;
  }
  return {
    request,
    get: (path, options) => request(path, options),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
    delete: (path, body, options) => request(path, { ...options, method: 'DELETE', body })
  };
}
