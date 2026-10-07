// Only a login name is remembered here. Passwords belong to the browser's password manager.
const KEY = 'nestlet.remembered-account';
export function readRememberedAccount() {
  try { const value=window.localStorage.getItem(KEY); return /^[a-z0-9][a-z0-9_.-]{2,63}$/i.test(value||'')?value:''; } catch { return ''; }
}
export function rememberAccount(username, enabled) {
  try { if(enabled)window.localStorage.setItem(KEY,username);else window.localStorage.removeItem(KEY); } catch { /* Private browsing may disable storage. */ }
}
