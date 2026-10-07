/** Owner and named-trial authentication; immutable server-side session identities. */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
const COOKIE = 'nestlet_session';
const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 8 * 60 * 60 * 1000;

export function createOperatorAuth({ passwordHash = '', publicOrigin = '', host = '127.0.0.1', findTrialUser = () => null, findTrialUserById = () => null, createTrialUser = null } = {}) {
  const fingerprint = value => createHash('sha256').update(value).digest('hex');
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
    if (session.role === 'trial') {
      const current = findTrialUserById(session.userId);
      if (!current || current.role !== 'trial' || typeof current.passwordHash !== 'string' || fingerprint(current.passwordHash) !== session.credentialFingerprint) { sessions.delete(token); return null; }
    }
    session.lastUsed = Date.now();
    return { token, csrfToken: session.csrfToken, userId: session.userId, username: session.username, role: session.role };
  };
  const csrfValid = (request, session) => {
    const token = request.headers['x-csrf-token'];
    return Boolean(session && typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(token) &&
      timingSafeEqual(Buffer.from(token), Buffer.from(session.csrfToken)));
  };
  const issueSession = (target, now = Date.now()) => {
    prune();
    const ownSessions = [...sessions].filter(([, session]) => session.userId === target.id);
    while (ownSessions.length >= 5) sessions.delete(ownSessions.shift()[0]);
    // 100 ordinary accounts plus the owner, five sessions each, remain below this bound.
    if (sessions.size >= 512) return { error: 'LOGIN_RATE_LIMITED' };
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    sessions.set(token, { csrfToken, created: now, lastUsed: now, userId: target.id, username: target.username, role: target.role, credentialFingerprint: fingerprint(target.passwordHash) });
    return { csrfToken, cookie: cookie(token), userId: target.id, username: target.username, role: target.role };
  };
  return {
    configured, secure, localTransportAllowed: !publicOrigin && ['127.0.0.1', 'localhost', '::1'].includes(host), setupInvalid: Boolean(passwordHash && !configured),
    getSession, csrfValid,
    async login(password, username = '') {
      if (!configured) return { error: 'OPERATOR_SETUP_REQUIRED' };
      const now = Date.now();
      while (attempts.length && now - attempts[0] > 60000) attempts.shift();
      if (attempts.length >= 10) return { error: 'LOGIN_RATE_LIMITED' };
      attempts.push(now);
      if (typeof password !== 'string' || password.length < 12 || password.length > 256 || typeof username !== 'string' || username.length > 64) return { error: 'INVALID_CREDENTIALS' };
      const normalizedUsername = username.trim().toLowerCase() || 'owner';
      const identity = normalizedUsername === 'owner'
        ? { id: 'owner', username: 'owner', role: 'owner', passwordHash }
        : findTrialUser(normalizedUsername);
      const target = identity?.role === 'trial' || (normalizedUsername === 'owner' && identity?.role === 'owner' && identity.id === 'owner') ? identity : null;
      const targetMatch = target && /^scrypt\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/u.exec(target.passwordHash || '');
      // Unknown identities still perform the same KDF before returning the generic failure.
      const comparison = targetMatch || match;
      const actual = await derive(password, Buffer.from(comparison[1], 'base64url'), 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
      const matches = timingSafeEqual(actual, Buffer.from(comparison[2], 'base64url'));
      if (!targetMatch || !matches) return { error: 'INVALID_CREDENTIALS' };
      return issueSession(target, now);
    },
    async register({ username, password, passwordConfirmation }) {
      if (!configured || typeof createTrialUser !== 'function') return { error: 'OPERATOR_SETUP_REQUIRED' };
      if (typeof username !== 'string' || !/^[a-z0-9][a-z0-9_.-]{2,63}$/u.test(username.trim().toLowerCase()) || username.trim().toLowerCase() === 'owner' ||
          typeof password !== 'string' || password.length < 12 || password.length > 256 || /[\u0000-\u001f\u007f]/u.test(password) || password !== passwordConfirmation) return { error: 'REGISTRATION_INVALID' };
      const salt = randomBytes(16);
      const key = await derive(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
      const newHash = `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
      const user = createTrialUser({ username: username.trim().toLowerCase(), passwordHash: newHash });
      // The storage method is create-only and assigns trial itself; callers cannot choose a role.
      return issueSession({ id: user.id, username: user.username, role: 'trial', passwordHash: newHash });
    },
    logout(session) { if (session) sessions.delete(session.token); return cookie('', true); },
  };
}
