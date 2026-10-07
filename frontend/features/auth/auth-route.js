/** Capture only trusted root auth fragments. The secret lives in a private closure,
 * never in the route, browser storage, rendered markup, or telemetry. */
export function captureAuthFragment(browser = window) {
  const hash = browser.location.hash;
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  if (!params.has('auth') && !params.has('token')) return null;
  // Clear even malformed/unsupported auth links before any component or request runs.
  browser.history.replaceState(null, '', browser.location.pathname + browser.location.search);
  const mode = params.get('auth');
  let secret = params.get('token') || '';
  const valid = browser.location.pathname === '/' && ['verify', 'reset'].includes(mode) && params.getAll('auth').length === 1 && params.getAll('token').length === 1 && [...params.keys()].every(key => ['auth', 'token'].includes(key)) && /^[A-Za-z0-9_-]{43}$/u.test(secret);
  if (!valid) secret = '';
  const expiresAt = Date.now() + (mode === 'verify' ? 10 : 30) * 60_000;
  return {
    id: browser.crypto?.randomUUID?.() || String(Math.random()),
    mode: mode === 'reset' ? 'reset' : 'verify', valid,
    takeToken() { const token = Date.now() < expiresAt ? secret : ''; secret = ''; return token; },
    clear() { secret = ''; }
  };
}
