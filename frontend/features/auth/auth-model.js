// Only the currently delivered username contract is enabled. No invented email endpoints.
export const AUTH_METHOD = 'username';
export const MODEL = 'deepseek-flash';
const failure = (code, field) => ({ ok: false, code, field });

export function authPayload(mode, fields = {}) {
  if (!['login','register'].includes(mode)) return failure('REQUEST_FAILED');
  const username = typeof fields.username === 'string' ? fields.username.trim() : '';
  if (!username) return failure('AUTH_USERNAME_REQUIRED','username');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,63}$/u.test(username)) return failure('AUTH_USERNAME_INVALID','username');
  if (mode === 'register' && username.toLowerCase() === 'owner') return failure('AUTH_USERNAME_RESERVED','username');
  const password = fields.password;
  if (typeof password !== 'string' || password.length < 6 || password.length > 256) return failure('PASSWORD_LENGTH','password');
  if (/[\u0000-\u001f\u007f]/u.test(password)) return failure('PASSWORD_CONTROL','password');
  if (mode === 'register' && password !== fields.passwordConfirmation) return failure('PASSWORD_MISMATCH','passwordConfirmation');
  return { ok:true, payload:{ username,password,...(mode === 'register' ? {passwordConfirmation:fields.passwordConfirmation} : {}) } };
}

export function canManageProvider(status) {
  return status?.authenticated === true && status.role === 'owner' && status.canManageSettings === true;
}
export function providerStatus(status = {}) {
  const at = typeof status.connectionVerifiedAt === 'string' ? new Date(status.connectionVerifiedAt) : null;
  return { configured:status.configured === true, liveEnabled:status.liveEnabled === true,
    secureSettings:status.secureSettings === true, model:MODEL,
    keyStorage:['server-memory','server-environment'].includes(status.keyStorage) ? status.keyStorage : 'none',
    verifiedAt:at && Number.isFinite(at.valueOf()) ? at.toISOString() : null };
}
export function settingsPayload({apiKey='',enableLive,configured=false} = {}) {
  if (typeof enableLive !== 'boolean' || typeof apiKey !== 'string') return failure('INVALID_SETTINGS');
  const key = apiKey.trim();
  if (key && !/^[A-Za-z0-9_.-]{16,256}$/u.test(key)) return failure('API_KEY_INVALID','apiKey');
  if (enableLive && !key && !configured) return failure('API_KEY_REQUIRED','apiKey');
  return {ok:true,payload:{enableLive,...(key ? {apiKey:key} : {})}};
}
