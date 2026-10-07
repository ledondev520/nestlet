// Only an explicitly opted-in legacy username is persisted. Email addresses,
// passwords, tokens, and other account data stay out of browser storage.
const KEY = 'nestlet.remembered-account';
const valid = value => typeof value === 'string' && /^[a-z0-9][a-z0-9_.-]{2,63}$/i.test(value);
export function readRememberedAccount() {
  try { const value = window.localStorage.getItem(KEY); return valid(value) ? value : ''; } catch { return ''; }
}
export function rememberAccount(username, enabled) {
  try { if (enabled && valid(username)) window.localStorage.setItem(KEY, username); else window.localStorage.removeItem(KEY); } catch { /* Storage can be disabled. */ }
}
