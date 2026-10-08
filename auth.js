/** Owner and named-trial authentication; immutable server-side session identities. */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { normalizeEmail } from './email-auth-domain.js';
import { accountPermissions } from './account-administration.js';
const derive = promisify(scrypt);
const COOKIE = 'nestlet_session';
const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 8 * 60 * 60 * 1000;

function normalizeLoginUsername(value, allowEmpty = false) {
  // Check ASCII before case folding: Unicode characters such as the Kelvin sign
  // must never normalize into another account's otherwise-valid ASCII name.
  if (typeof value !== 'string' || value.length > 128 || /[^\x20-\x7e]/u.test(value)) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized && allowEmpty) return 'owner';
  return /^[a-z0-9][a-z0-9_.-]{2,63}$/u.test(normalized) ? normalized : null;
}

/** An optional login alias, never a replacement for the immutable owner identity. */
export const normalizeOperatorUsername = (value = 'owner') => normalizeLoginUsername(value, true);

export function createOperatorAuth({ passwordHash = '', operatorUsername = 'owner', publicOrigin = '', host = '127.0.0.1', findTrialUser = () => null, findTrialUserById = () => null, findUserByEmail = () => null, hasAdministratorCapability = () => false } = {}) {
  const fingerprint = value => createHash('sha256').update(value).digest('hex');
  const sessions = new Map();
  const attempts = [];
  const match = /^scrypt\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/u.exec(passwordHash);
  const operatorLogin = normalizeOperatorUsername(operatorUsername);
  const aliasCollision = () => Boolean(operatorLogin && operatorLogin !== 'owner' && findTrialUser(operatorLogin));
  const isConfigured = () => {
    const valid = Boolean(match && operatorLogin && !aliasCollision());
    if (!valid) sessions.clear();
    return valid;
  };
  const secure = /^https:\/\//u.test(publicOrigin);
  let loopbackOrigin = !publicOrigin;
  try { const origin = new URL(publicOrigin); loopbackOrigin = origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname); } catch {}
  const cookie = (token, clear = false) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : ABSOLUTE_MS / 1000}${secure ? '; Secure' : ''}`;
  const prune = () => {
    const now = Date.now();
    for (const [id, session] of sessions) if (now - session.lastUsed > (session.rememberMe ? ABSOLUTE_MS : IDLE_MS) || now - session.created > ABSOLUTE_MS) sessions.delete(id);
  };
  const getSession = request => {
    if (!isConfigured()) return null;
    prune();
    const token = (request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
    if (!token || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return null;
    const session = sessions.get(token);
    if (!session) return null;
    const current = session.role === 'owner' ? { role: 'owner', passwordHash } : findTrialUserById(session.userId);
    if (!current || current.role !== session.role || typeof current.passwordHash !== 'string' || fingerprint(current.passwordHash) !== session.credentialFingerprint) { sessions.delete(token); return null; }
    session.lastUsed = Date.now();
    return { token, csrfToken: session.csrfToken, userId: session.userId, username: session.username, role: session.role, ...accountPermissions(session, hasAdministratorCapability(session.userId)) };
  };
  const csrfValid = (request, session) => {
    const token = request.headers['x-csrf-token'];
    return Boolean(session && typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(token) &&
      timingSafeEqual(Buffer.from(token), Buffer.from(session.csrfToken)));
  };
  const issueSession = (target, now = Date.now(), rememberMe = false, staged = false) => {
    // A private account helper could create a collision during an asynchronous KDF.
    // Never promote, overwrite, or sign in as that ordinary identity.
    if (!isConfigured()) return { error: 'OPERATOR_SETUP_REQUIRED' };
    prune();
    const ownSessions = [...sessions].filter(([, session]) => session.userId === target.id);
    while (ownSessions.length >= 5) sessions.delete(ownSessions.shift()[0]);
    // 100 ordinary accounts plus the owner, five sessions each, remain below this bound.
    if (sessions.size >= 512) return { error: 'LOGIN_RATE_LIMITED' };
    const token = randomBytes(32).toString('base64url');
    const csrfToken = randomBytes(32).toString('base64url');
    const record = { rememberMe, csrfToken, created: now, lastUsed: now, userId: target.id, username: target.username, role: target.role, credentialFingerprint: fingerprint(target.passwordHash) };
    const result = { csrfToken, cookie: cookie(token), userId: target.id, username: target.username, role: target.role, ...accountPermissions({ userId: target.id, role: target.role }, hasAdministratorCapability(target.id)) };
    if (staged) return { result, commit() { sessions.set(token, record); } };
    sessions.set(token, record);
    return result;
  };
  return {
    get configured() { return isConfigured(); },
    get setupInvalid() { return Boolean((passwordHash && !match) || !operatorLogin || aliasCollision()); },
    secure, localTransportAllowed: loopbackOrigin && ['127.0.0.1', 'localhost', '::1'].includes(host),
    getSession, csrfValid,
    async login(password, username = '', rememberMe = false) {
      if (!isConfigured()) return { error: 'OPERATOR_SETUP_REQUIRED' };
      const now = Date.now();
      while (attempts.length && now - attempts[0] > 60000) attempts.shift();
      if (attempts.length >= 10) return { error: 'LOGIN_RATE_LIMITED' };
      attempts.push(now);
      const email = normalizeEmail(username);
      const normalizedUsername = email || normalizeLoginUsername(username, true);
      if (typeof password !== 'string' || password.length < 6 || password.length > 256 || !normalizedUsername) return { error: 'INVALID_CREDENTIALS' };
      const emailIdentity = email ? findUserByEmail(email) : null;
      const ownerLogin = email ? emailIdentity?.id === 'owner' && emailIdentity?.role === 'owner' : normalizedUsername === 'owner' || normalizedUsername === operatorLogin;
      const identity = ownerLogin
        ? { id: 'owner', username: 'owner', role: 'owner', passwordHash }
        : email ? emailIdentity : findTrialUser(normalizedUsername);
      const target = (identity?.role === 'trial' && identity.id !== 'owner') || (ownerLogin && identity?.role === 'owner' && identity.id === 'owner') ? identity : null;
      const targetMatch = target && /^scrypt\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/u.exec(target.passwordHash || '');
      // Unknown identities still perform the same KDF before returning the generic failure.
      const comparison = targetMatch || match;
      const actual = await derive(password, Buffer.from(comparison[1], 'base64url'), 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
      const matches = timingSafeEqual(actual, Buffer.from(comparison[2], 'base64url'));
      if (!targetMatch || !matches) return { error: 'INVALID_CREDENTIALS' };
      // A reset/helper rotation during the asynchronous KDF must not create a stale session.
      const current = ownerLogin ? { passwordHash } : findTrialUserById(target.id);
      if (!current || current.passwordHash !== target.passwordHash) return { error: 'INVALID_CREDENTIALS' };
      return issueSession(target, now, rememberMe === true);
    },
    establishRegistrationSession(target, previousSession = null) {
      // Internal-only entrypoint called from the newly-created registration row.
      // No HTTP caller can supply this identity or use binding/reset as login proof.
      const current = target?.id && findTrialUserById(target.id);
      if (!current || current.id === 'owner' || current.role !== 'trial' || current.passwordHash !== target.passwordHash) return { error: 'INVALID_CREDENTIALS' };
      const staged = issueSession(current, Date.now(), false, true);
      if (staged.error) return staged;
      // Called synchronously only after SQLite COMMIT succeeds. A failed commit
      // leaves both the prior session and the unconsumed proof untouched.
      return { result: staged.result, commit() {
        staged.commit();
        if (previousSession) sessions.delete(previousSession.token);
      } };
    },
    logout(session) { if (session) sessions.delete(session.token); return cookie('', true); },
  };
}
