/** Single-operator, server-memory authentication. No credentials are persisted by this module. */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
const COOKIE = 'nestlet_session';
const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 8 * 60 * 60 * 1000;

export function createOperatorAuth({ passwordHash = '', publicOrigin = '', host = '127.0.0.1' } = {}) {
  const sessions = new Map();
  const attempts = [];
  const match = /^scrypt\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/u.exec(passwordHash);
  const configured = Boolean(match);
  const secure = /^https:\/\//u.test(publicOrigin);
  const cookie = (token, clear = false) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : ABSOLUTE_MS / 1000}${secure ? '; Secure' : ''}`;
  const prune = () => {
    const now = Date.now();
    for (const [id, session] of sessions) if (now - session.lastUsed > IDLE_MS || now - session.created > ABSOLUTE_MS) sessions.delete(id);
  };
  const getSession = request => {
    prune();
    const token = (request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
    if (!token || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return null;
    const session = sessions.get(token);
    if (!session) return null;
    session.lastUsed = Date.now();
    return { token, csrfToken: session.csrfToken };
  };
  const csrfValid = (request, session) => {
    const token = request.headers['x-csrf-token'];
    return Boolean(session && typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(token) &&
      timingSafeEqual(Buffer.from(token), Buffer.from(session.csrfToken)));
  };
  return {
    configured, secure, localTransportAllowed: !publicOrigin && ['127.0.0.1', 'localhost', '::1'].includes(host), setupInvalid: Boolean(passwordHash && !configured),
    getSession, csrfValid,
    async login(password) {
      if (!configured) return { error: 'OPERATOR_SETUP_REQUIRED' };
      const now = Date.now();
      while (attempts.length && now - attempts[0] > 60000) attempts.shift();
      if (attempts.length >= 10) return { error: 'LOGIN_RATE_LIMITED' };
      attempts.push(now);
      if (typeof password !== 'string' || password.length < 12 || password.length > 256) return { error: 'INVALID_CREDENTIALS' };
      const actual = await derive(password, Buffer.from(match[1], 'base64url'), 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
      if (!timingSafeEqual(actual, Buffer.from(match[2], 'base64url'))) return { error: 'INVALID_CREDENTIALS' };
      prune();
      // A single operator does not need an unbounded number of remembered sessions.
      while (sessions.size >= 10) sessions.delete(sessions.keys().next().value);
      const token = randomBytes(32).toString('base64url');
      const csrfToken = randomBytes(32).toString('base64url');
      sessions.set(token, { csrfToken, created: now, lastUsed: now });
      return { csrfToken, cookie: cookie(token) };
    },
    logout(session) { if (session) sessions.delete(session.token); return cookie('', true); },
  };
}
