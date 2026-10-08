/** Email-first enrollment/recovery. Requests never reveal whether a mailbox has an account. */
import { EmailAuthError, assertFields, normalizeEmail, validPassword, validToken, hashPassword, checkPassword, digest } from './email-auth-domain.js';
export { EmailAuthError } from './email-auth-domain.js';
const accepted = () => ({ accepted: true, authenticated: false, next: 'check-email-if-eligible', retryAfter: 60 });
export function createEmailAuth({ storage, delivery, publicOrigin = '', currentCredential, establishRegistrationSession, now = Date.now }) {
  let linkOrigin = '';
  try {
    const origin = new URL(publicOrigin);
    if (origin.origin === publicOrigin && !origin.username && !origin.password && (origin.protocol === 'https:' || (origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)))) linkOrigin = origin.origin;
  } catch {}
  const configured = () => Boolean(linkOrigin && delivery.configured);
  const requireDelivery = () => { if (!configured()) throw new EmailAuthError('EMAIL_DELIVERY_UNAVAILABLE', 503); };
  const emailInput = value => { const email = normalizeEmail(value); if (!email) throw new EmailAuthError(); return email; };
  const passwords = body => { if (!validPassword(body.password) || body.password !== body.passwordConfirmation) throw new EmailAuthError(); };
  const reserve = (email, ip) => {
    const result = storage.reserveRequest(email, ip, now());
    if (result === 'rate-limited') throw new EmailAuthError('EMAIL_AUTH_RATE_LIMITED', 429);
    return result === 'allowed';
  };
  const claim = (token, ip) => {
    if (!storage.reserveClaim(ip, now())) throw new EmailAuthError('EMAIL_AUTH_RATE_LIMITED', 429);
    if (!validToken(token)) throw new EmailAuthError('EMAIL_TOKEN_INVALID');
    return digest(token);
  };
  const pendingSends = new Set();
  function sendAction(options) {
    const action = storage.createAction({ ...options, now: now() });
    if (!action) return;
    const link = new URL('/', linkOrigin);
    link.hash = new URLSearchParams({ auth: options.kind === 'reset' ? 'reset' : 'verify', token: action.token }).toString();
    // Do not make eligible-address request latency depend on the mail provider.
    // The one-time secret exists only in this bounded in-memory send; restart requires resend.
    const pending = new Promise(resolve => setImmediate(resolve)).then(async () => {
      try {
        const receipt = await delivery.send({ email: options.email, link: link.href, purpose: options.kind === 'reset' ? 'reset' : 'verify' });
        if (receipt?.accepted !== true) throw new Error('Unconfirmed send');
        storage.markAccepted(action.tokenHash, now());
      } catch {
        // Uniform public response; owner-only diagnostics distinguish provider outcomes.
        // Keep an unready registration hash until expiry so the email-only resend
        // flow can recover a transient send failure without retaining a raw token.
        if (options.kind !== 'register') try { storage.cancel(action.tokenHash); } catch { /* Closing database: unready action expires. */ }
      }
    }).finally(() => pendingSends.delete(pending));
    pendingSends.add(pending);
  }
  return {
    get configured() { return configured(); },
    status(userId, role) {
      const identity = userId ? storage.identity(userId) : null;
      return { emailDeliveryConfigured: configured(), ...(userId ? {
        email: identity?.email ?? null, emailVerified: Boolean(identity), emailBindingRequired: !identity,
        passwordRecoveryMethod: role === 'owner' ? 'private-bootstrap' : identity ? 'email' : 'bind-email',
      } : {}) };
    },
    deliveryStatus() { return delivery.status(); },
    whenIdle() { return Promise.all([...pendingSends]); },
    async register(body, ip) {
      try { assertFields(body, ['email', 'password', 'passwordConfirmation']); passwords(body); emailInput(body.email); }
      catch { throw new EmailAuthError('REGISTRATION_INVALID'); }
      requireDelivery();
      const email = emailInput(body.email);
      if (!reserve(email, ip)) return accepted();
      // Even an existing email incurs the same password KDF. No user exists until verification.
      const passwordHash = await hashPassword(body.password);
      await sendAction({ kind: 'register', email, passwordHash });
      return accepted();
    },
    async resend(body, ip) {
      assertFields(body, ['email']); const email = emailInput(body.email); requireDelivery();
      if (!reserve(email, ip)) return accepted();
      const pending = storage.pendingRegistration(email, now());
      if (pending) await sendAction({ kind: 'register', email, passwordHash: pending.passwordHash });
      return accepted();
    },
    async forgot(body, ip) {
      assertFields(body, ['email']); const email = emailInput(body.email); requireDelivery();
      if (!reserve(email, ip)) return accepted();
      const user = storage.findByEmail(email);
      // Bootstrap owner credentials remain ENV-owned. Do not claim to reset them in SQLite.
      if (user?.role === 'trial') await sendAction({ kind: 'reset', email, userId: user.id, credentialFingerprint: digest(user.passwordHash) });
      return accepted();
    },
    async bind(body, session, ip) {
      assertFields(body, ['email', 'currentPassword']); const email = emailInput(body.email); requireDelivery();
      if (!reserve(email, ip)) return accepted();
      const credential = currentCredential(session.userId);
      if (!await checkPassword(body.currentPassword, credential) || currentCredential(session.userId) !== credential) throw new EmailAuthError('INVALID_CREDENTIALS', 401);
      if (storage.identity(session.userId)) throw new EmailAuthError('EMAIL_ALREADY_BOUND', 409);
      await sendAction({ kind: 'bind', email, userId: session.userId, credentialFingerprint: digest(credential) });
      return accepted();
    },
    verify(body, ip, previousSession = null) {
      assertFields(body, ['token']);
      const tokenHash = claim(body.token, ip);
      const ownerHash = currentCredential('owner');
      let staged;
      if (!storage.verify(tokenHash, { now: now(), ownerFingerprint: ownerHash ? digest(ownerHash) : null,
        onRegistration(target) {
          staged = establishRegistrationSession?.(target, previousSession);
          if (!staged?.result || typeof staged.commit !== 'function' || staged.error) throw new EmailAuthError(staged?.error || 'OPERATOR_SETUP_REQUIRED', staged?.error === 'LOGIN_RATE_LIMITED' ? 429 : 503);
        }
      })) throw new EmailAuthError('EMAIL_TOKEN_INVALID');
      // No asynchronous work may separate successful SQLite commit from activation.
      staged?.commit();
      return staged ? { verified: true, authenticated: true, ...staged.result } : { verified: true, authenticated: false };
    },
    async reset(body, ip) {
      assertFields(body, ['token', 'password', 'passwordConfirmation']); passwords(body);
      const tokenHash = claim(body.token, ip);
      const passwordHash = await hashPassword(body.password);
      if (!storage.reset(tokenHash, passwordHash, now())) throw new EmailAuthError('EMAIL_TOKEN_INVALID');
      return { reset: true, authenticated: false };
    },
  };
}
