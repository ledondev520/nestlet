// Email-first enrollment; usernames remain a login-only compatibility path.
export const AUTH_METHOD = 'email';
export const MODEL = 'deepseek-flash';
const failure = (code, field) => ({ ok: false, code, field });
export function emailPayload(email) {
  const trimmed = typeof email === 'string' ? email.trim() : '';
  if (trimmed && !/^[\x21-\x7e]+$/u.test(trimmed)) return failure('AUTH_EMAIL_INVALID', 'email');
  const normalized = trimmed.toLowerCase();
  if (!normalized) return failure('AUTH_EMAIL_REQUIRED', 'email');
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) return failure('AUTH_EMAIL_INVALID', 'email');
  return { ok: true, payload: { email: normalized } };
}
export function passwordPayload(password, confirmation, confirm = true) {
  if (typeof password !== 'string' || password.length < 6 || password.length > 256) return failure('PASSWORD_LENGTH', 'password');
  if (/[\u0000-\u001f\u007f]/u.test(password)) return failure('PASSWORD_CONTROL', 'password');
  if (confirm && password !== confirmation) return failure('PASSWORD_MISMATCH', 'passwordConfirmation');
  return { ok: true, payload: { password, ...(confirm ? { passwordConfirmation: confirmation } : {}) } };
}
export function authPayload(mode, fields = {}) {
  if (!['login', 'register'].includes(mode)) return failure('REQUEST_FAILED');
  let identity;
  if (mode === 'register' || fields.email !== undefined) identity = emailPayload(fields.email);
  else {
    const username = typeof fields.username === 'string' ? fields.username.trim() : '';
    identity = !username ? failure('AUTH_IDENTITY_REQUIRED', 'username') : !/^[A-Za-z0-9][A-Za-z0-9_.-]{2,63}$/u.test(username) ? failure('AUTH_IDENTITY_INVALID', 'username') : { ok: true, payload: { username } };
  }
  if (!identity.ok) return identity;
  const password = passwordPayload(fields.password, fields.passwordConfirmation, mode === 'register');
  if (!password.ok) return password;
  return { ok: true, payload: { ...identity.payload, ...password.payload } };
}
export function acceptedEmailRequest(result) {
  if (result?.accepted !== true || result.authenticated !== false || result.next !== 'check-email-if-eligible') throw { code: 'INVALID_RESPONSE' };
  return Math.max(60, Math.min(3600, Number.isFinite(result.retryAfter) ? result.retryAfter : 60));
}

export function canManageProvider(status) {
  return status?.authenticated === true && status.role === 'owner' && status.canManageSettings === true;
}
export function providerStatus(status = {}) {
  const at = typeof status.connectionVerifiedAt === 'string' ? new Date(status.connectionVerifiedAt) : null;
  return { configured:status.configured === true, liveEnabled:status.liveEnabled === true,
    secureSettings:status.secureSettings === true, persistentSettingsAvailable:status.persistentSettingsAvailable === true, model:MODEL,
    keyStorage:['server-memory','server-environment','encrypted-database'].includes(status.keyStorage) ? status.keyStorage : 'none',
    verifiedAt:at && Number.isFinite(at.valueOf()) ? at.toISOString() : null };
}
export function settingsPayload({apiKey='',enableLive,configured=false} = {}) {
  if (typeof enableLive !== 'boolean' || typeof apiKey !== 'string') return failure('INVALID_SETTINGS');
  const key = apiKey.trim();
  if (key && !/^[A-Za-z0-9_.-]{16,256}$/u.test(key)) return failure('API_KEY_INVALID','apiKey');
  if (enableLive && !key && !configured) return failure('API_KEY_REQUIRED','apiKey');
  return {ok:true,payload:{enableLive,...(key ? {apiKey:key} : {})}};
}
